import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { executeToolJsx } from '../tool-executor.js';
import { WRITE_ANNOTATIONS } from './shared.js';

const bindingSchema = z.object({
  source_uuid: z.string().describe('UUID of a source TextFrame inside the template artboard. Only its contents are changed; formatting is preserved.'),
  values: z.array(z.string()).min(1).max(200).describe('One text value per generated variant, in output order.'),
});

const jsxCode = `
var preflight = preflightChecks();
if (preflight) writeResultFile(RESULT_PATH, preflight);
else {
  var params = null;
  var doc = null;
  var addedArtboardIndices = [];
  var createdRoots = [];
  var sourceOriginalTexts = [];
  var sourceBindingItems = [];
  var sourceBindingPaths = [];
  var sourceRoots = [];
  var sourceRootUuids = [];
  var mutationStarted = false;
  var sourceArtboardOriginalName = null;
  var timingStart = (new Date()).getTime();
  var preflightMs = 0, artboardMs = 0, duplicateMs = 0, textMs = 0, verificationMs = 0;

  function nowMs() { return (new Date()).getTime(); }

  function timingSummary() {
    var elapsed = nowMs() - timingStart;
    var accounted = preflightMs + artboardMs + duplicateMs + textMs + verificationMs;
    return {
      elapsed_ms: elapsed,
      preflight_ms: preflightMs,
      artboard_ms: artboardMs,
      duplicate_ms: duplicateMs,
      text_ms: textMs,
      verification_ms: verificationMs,
      unaccounted_ms: Math.max(0, elapsed - accounted)
    };
  }

  function itemBounds(item) {
    try { return item.visibleBounds; } catch (_) {}
    try { return item.geometricBounds; } catch (_) {}
    return null;
  }

  function centerInsideArtboard(item, rect) {
    var b = itemBounds(item);
    if (!b || b.length < 4) return false;
    var cx = (b[0] + b[2]) / 2;
    var cy = (b[1] + b[3]) / 2;
    return cx >= rect[0] && cx <= rect[2] && cy <= rect[1] && cy >= rect[3];
  }

  function isTopLevelPageItem(item) {
    try { return item.parent && item.parent.typename === "Layer"; } catch (_) { return false; }
  }

  function collectSourceRoots(rect, explicitUuids) {
    var roots = [];
    if (explicitUuids && explicitUuids.length) {
      for (var ei = 0; ei < explicitUuids.length; ei++) {
        var explicitItem = findItemByUUID(explicitUuids[ei]);
        if (!explicitItem) throw new Error("Source artwork UUID not found: " + explicitUuids[ei]);
        roots.push(explicitItem);
      }
      return roots;
    }

    for (var pi = 0; pi < doc.pageItems.length; pi++) {
      var item = doc.pageItems[pi];
      if (!isTopLevelPageItem(item)) continue;
      if (!centerInsideArtboard(item, rect)) continue;
      roots.push(item);
    }
    return roots;
  }

  function indexOfChild(parent, child) {
    var childUuid = ensureUUID(child);
    for (var ci = 0; ci < parent.pageItems.length; ci++) {
      if (ensureUUID(parent.pageItems[ci]) === childUuid) return ci;
    }
    return -1;
  }

  function bindingPathToRoot(item) {
    var path = [];
    var node = item;
    while (node && node.parent && node.parent.typename !== "Layer") {
      var parent = node.parent;
      if (!parent.pageItems) throw new Error("Unsupported text parent type: " + parent.typename);
      var childIndex = indexOfChild(parent, node);
      if (childIndex < 0) throw new Error("Unable to locate TextFrame inside its template parent");
      path.unshift(childIndex);
      node = parent;
    }
    if (!node || !node.parent || node.parent.typename !== "Layer") {
      throw new Error("TextFrame does not resolve to a top-level template PageItem");
    }

    var rootUuid = ensureUUID(node);
    var rootIndex = -1;
    for (var ri = 0; ri < sourceRootUuids.length; ri++) {
      if (sourceRootUuids[ri] === rootUuid) { rootIndex = ri; break; }
    }
    if (rootIndex < 0) throw new Error("TextFrame root is not included in source template artwork");

    return { root_index: rootIndex, child_path: path };
  }

  function resolvePath(root, path) {
    var node = root;
    for (var i = 0; i < path.length; i++) {
      if (!node.pageItems || path[i] >= node.pageItems.length) {
        throw new Error("Duplicated template structure does not match source structure");
      }
      node = node.pageItems[path[i]];
    }
    return node;
  }

  function readContents(tf) {
    try { return String(tf.contents || ""); } catch (_) { return ""; }
  }

  function writeContents(tf, value) {
    var normalized = String(value).split(String.fromCharCode(10)).join(String.fromCharCode(13));
    tf.contents = normalized;
    if (readContents(tf) !== normalized) throw new Error("Text readback mismatch");
  }

  function removeCreatedArtwork() {
    for (var i = createdRoots.length - 1; i >= 0; i--) {
      try { createdRoots[i].remove(); } catch (_) {}
    }
  }

  function removeAddedArtboards() {
    for (var i = addedArtboardIndices.length - 1; i >= 0; i--) {
      try {
        if (doc.artboards.length > 1 && addedArtboardIndices[i] < doc.artboards.length) {
          doc.artboards.remove(addedArtboardIndices[i]);
        }
      } catch (_) {}
    }
    try { invalidateArtboardCache(); } catch (_) {}
  }

  function restoreSourceText() {
    for (var i = 0; i < sourceBindingItems.length; i++) {
      try { sourceBindingItems[i].contents = sourceOriginalTexts[i]; } catch (_) {}
    }
  }

  try {
    params = readParamsFile(PARAMS_PATH);
    doc = app.activeDocument;

    var preflightStart = nowMs();
    var sourceIndex = (typeof params.source_artboard_index === "number") ? params.source_artboard_index : doc.artboards.getActiveArtboardIndex();
    if (sourceIndex < 0 || sourceIndex >= doc.artboards.length) throw new Error("source_artboard_index is out of range");

    if (params.require_single_source_artboard !== false && doc.artboards.length !== 1) {
      throw new Error("Template generation expects exactly one source artboard; set require_single_source_artboard=false only when intentionally using a multi-artboard source document");
    }

    if (!params.text_bindings || !params.text_bindings.length) throw new Error("At least one text binding is required");
    var variantCount = params.text_bindings[0].values.length;
    if (variantCount < 1 || variantCount > 200) throw new Error("Variant count must be between 1 and 200");
    for (var bi = 0; bi < params.text_bindings.length; bi++) {
      if (params.text_bindings[bi].values.length !== variantCount) {
        throw new Error("All text binding value arrays must have the same length");
      }
    }

    var sourceRect = doc.artboards[sourceIndex].artboardRect;
    sourceArtboardOriginalName = doc.artboards[sourceIndex].name;
    var sourceWidth = sourceRect[2] - sourceRect[0];
    var sourceHeight = sourceRect[1] - sourceRect[3];
    if (!(sourceWidth > 0) || !(sourceHeight > 0)) throw new Error("Source artboard has invalid dimensions");

    sourceRoots = collectSourceRoots(sourceRect, params.source_item_uuids || []);
    if (!sourceRoots.length) throw new Error("No source template artwork found on the source artboard");
    for (var sri = 0; sri < sourceRoots.length; sri++) {
      sourceRootUuids.push(ensureUUID(sourceRoots[sri]));
    }

    for (var b = 0; b < params.text_bindings.length; b++) {
      var tf = findItemByUUID(params.text_bindings[b].source_uuid);
      if (!tf) throw new Error("Text binding source UUID not found: " + params.text_bindings[b].source_uuid);
      if (tf.typename !== "TextFrame") throw new Error("Text binding source UUID must resolve to a TextFrame");
      if (!centerInsideArtboard(tf, sourceRect)) throw new Error("Text binding source is outside the source artboard");
      sourceBindingItems.push(tf);
      sourceOriginalTexts.push(readContents(tf));
      sourceBindingPaths.push(bindingPathToRoot(tf));
    }

    var columns = params.layout && params.layout.columns ? params.layout.columns : Math.ceil(Math.sqrt(variantCount));
    if (columns < 1) columns = 1;
    if (columns > variantCount) columns = variantCount;
    var rows = Math.ceil(variantCount / columns);
    var gapMm = params.layout && typeof params.layout.gap_mm === "number" ? params.layout.gap_mm : 5;
    var gapXmm = params.layout && typeof params.layout.gap_x_mm === "number" ? params.layout.gap_x_mm : gapMm;
    var gapYmm = params.layout && typeof params.layout.gap_y_mm === "number" ? params.layout.gap_y_mm : gapMm;
    var gapX = gapXmm * 72 / 25.4;
    var gapY = gapYmm * 72 / 25.4;

    preflightMs = nowMs() - preflightStart;

    var variantArtboardIndices = [sourceIndex];
    var artboardStart = nowMs();
    mutationStarted = true;
    for (var vi = 1; vi < variantCount; vi++) {
      var row = Math.floor(vi / columns);
      var col = vi % columns;
      var left = sourceRect[0] + col * (sourceWidth + gapX);
      var top = sourceRect[1] - row * (sourceHeight + gapY);
      var newRect = [left, top, left + sourceWidth, top - sourceHeight];
      var ab = doc.artboards.add(newRect);
      invalidateArtboardCache();
      var newIndex = doc.artboards.length - 1;
      addedArtboardIndices.push(newIndex);
      variantArtboardIndices.push(newIndex);
      if (params.name_artboards === true) {
        ab.name = String(params.text_bindings[0].values[vi]);
      }
    }
    artboardMs = nowMs() - artboardStart;

    var duplicateStart = nowMs();
    var duplicatedRootsByVariant = [];
    duplicatedRootsByVariant[0] = sourceRoots;

    for (var dv = 1; dv < variantCount; dv++) {
      var drow = Math.floor(dv / columns);
      var dcol = dv % columns;
      var dx = dcol * (sourceWidth + gapX);
      var dy = -drow * (sourceHeight + gapY);
      var variantRoots = [];

      for (var rr = 0; rr < sourceRoots.length; rr++) {
        var sourceRoot = sourceRoots[rr];
        var dup = sourceRoot.duplicate();
        createdRoots.push(dup);

        var originalLocked = false, originalHidden = false;
        try { originalLocked = dup.locked; dup.locked = false; } catch (_) {}
        try { originalHidden = dup.hidden; dup.hidden = false; } catch (_) {}

        dup.translate(dx, dy);

        try { dup.hidden = originalHidden; } catch (_) {}
        try { dup.locked = originalLocked; } catch (_) {}
        variantRoots.push(dup);
      }
      duplicatedRootsByVariant[dv] = variantRoots;
    }
    duplicateMs = nowMs() - duplicateStart;

    var textStart = nowMs();
    for (var tv = 1; tv < variantCount; tv++) {
      for (var tb = 0; tb < params.text_bindings.length; tb++) {
        var pathInfo = sourceBindingPaths[tb];
        var targetRoot = duplicatedRootsByVariant[tv][pathInfo.root_index];
        var duplicateText = resolvePath(targetRoot, pathInfo.child_path);
        if (!duplicateText || duplicateText.typename !== "TextFrame") {
          throw new Error("Duplicated text binding did not resolve to a TextFrame");
        }
        writeContents(duplicateText, params.text_bindings[tb].values[tv]);
      }
    }

    for (var sb = 0; sb < params.text_bindings.length; sb++) {
      writeContents(sourceBindingItems[sb], params.text_bindings[sb].values[0]);
    }
    if (params.name_artboards === true) {
      doc.artboards[sourceIndex].name = String(params.text_bindings[0].values[0]);
    }
    textMs = nowMs() - textStart;

    var verificationStart = nowMs();
    var mismatches = [];
    for (var vv = 0; vv < variantCount; vv++) {
      for (var vb = 0; vb < params.text_bindings.length; vb++) {
        var actualTextItem;
        if (vv === 0) {
          actualTextItem = sourceBindingItems[vb];
        } else {
          var pinfo = sourceBindingPaths[vb];
          actualTextItem = resolvePath(duplicatedRootsByVariant[vv][pinfo.root_index], pinfo.child_path);
        }
        var expected = String(params.text_bindings[vb].values[vv]).split(String.fromCharCode(10)).join(String.fromCharCode(13));
        var actual = readContents(actualTextItem);
        if (actual !== expected) mismatches.push({ variant_index:vv, binding_index:vb, expected:expected, actual:actual });
      }
    }
    verificationMs = nowMs() - verificationStart;

    writeResultFile(RESULT_PATH, {
      success: mismatches.length === 0,
      requested_count: variantCount,
      success_count: mismatches.length === 0 ? variantCount : variantCount - 1,
      source_artboard_index: sourceIndex,
      created_artboard_count: variantCount - 1,
      final_artboard_count: doc.artboards.length,
      source_root_count: sourceRoots.length,
      text_binding_count: params.text_bindings.length,
      layout: {
        columns: columns,
        rows: rows,
        gap_x_mm: gapXmm,
        gap_y_mm: gapYmm
      },
      verification: {
        verified_variants: mismatches.length === 0 ? variantCount : null,
        mismatch_count: mismatches.length,
        mismatches: mismatches
      },
      timing: timingSummary()
    });
  } catch (e) {
    if (mutationStarted) {
      restoreSourceText();
      try {
        if (sourceArtboardOriginalName !== null && doc && params && params.name_artboards === true) {
          var rollbackSourceIndex = (typeof params.source_artboard_index === "number") ? params.source_artboard_index : doc.artboards.getActiveArtboardIndex();
          if (rollbackSourceIndex >= 0 && rollbackSourceIndex < doc.artboards.length) doc.artboards[rollbackSourceIndex].name = sourceArtboardOriginalName;
        }
      } catch (_) {}
      removeCreatedArtwork();
      removeAddedArtboards();
    }
    writeResultFile(RESULT_PATH, {
      success:false,
      preflight: mutationStarted ? "ROLLBACK_ATTEMPTED" : "FAILED_NO_MUTATION",
      message:"generate_template_variants failed: " + e.message,
      line:e.line,
      timing:timingSummary()
    });
  }
}
`;

export function register(server: McpServer): void {
  server.registerTool('generate_template_variants', {
    title: 'Generate Template Variants',
    description: 'Generate many artboard variants from one Illustrator template in one background JSX execution. Use this for name tags, badges, table cards, certificates, labels, SKU cards, numbered designs, or other one-template-plus-many-data jobs. The tool duplicates the source artboard artwork into an automatic multi-row grid, changes only the bound TextFrame contents, preserves source formatting and all other artwork, verifies every bound value, and rolls back created artwork/artboards on failure. Prefer this over repeated duplicate_active_artboard, duplicate_objects, manage_artboards, or modify_objects calls.',
    inputSchema: {
      source_artboard_index: z.number().int().min(0).optional().describe('Source template artboard index. Defaults to the active artboard.'),
      source_item_uuids: z.array(z.string()).min(1).optional().describe('Optional exact top-level source artwork UUIDs. Omit to auto-collect top-level artwork centered on the source artboard.'),
      text_bindings: z.array(bindingSchema).min(1).max(20),
      layout: z.object({
        columns: z.number().int().min(1).max(50).optional().describe('Variants per row. Defaults to ceil(sqrt(count)) to avoid single-row canvas overflow.'),
        gap_mm: z.number().min(0).optional().describe('Default horizontal/vertical artboard gap in millimeters. Defaults to 5 mm.'),
        gap_x_mm: z.number().min(0).optional(),
        gap_y_mm: z.number().min(0).optional(),
      }).optional(),
      name_artboards: z.boolean().optional().default(false).describe('Rename artboards from the first text binding values. Default false so only bound text changes.'),
      require_single_source_artboard: z.boolean().optional().default(true).describe('Fail closed unless the source document has exactly one artboard.'),
    },
    annotations: WRITE_ANNOTATIONS,
  }, async (params) => executeToolJsx(jsxCode, params, { timeoutMs: 180_000, includeTiming: true }));
}
