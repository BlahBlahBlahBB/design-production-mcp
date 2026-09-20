import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { executeToolJsx } from '../tool-executor.js';
import { WRITE_ANNOTATIONS } from './shared.js';
import { SCRIPT_CLASSIFIER_JSX } from '../typography-script-rules.js';

const fontRuleSchema = z.object({
  font_name: z.string().min(1).optional().describe('Illustrator font name or a unique human-readable family/style form. Exact PostScript name is preferred but not required when the requested name resolves uniquely.'),
  font_family: z.string().min(1).optional(),
  font_style: z.string().min(1).optional(),
  font_size: z.number().positive().optional(),
}).superRefine((rule, context) => {
  const hasFont = Boolean(rule.font_name || rule.font_family || rule.font_style);
  if (hasFont && !rule.font_name && !(rule.font_family && rule.font_style)) {
    context.addIssue({ code: 'custom', message: 'Specify font_name or both font_family and font_style.', path: ['font_family'] });
  }
});

const conditionalSizeSchema = z.object({
  text_length: z.number().int().min(0).optional(),
  han_characters: z.number().int().min(0).optional(),
  latin_characters: z.number().int().min(0).optional(),
  font_size: z.number().positive(),
}).refine((rule) => rule.text_length !== undefined || rule.han_characters !== undefined || rule.latin_characters !== undefined, {
  message: 'A conditional font-size rule needs text_length, han_characters, or latin_characters.',
});

const bindingSchema = z.object({
  source_uuid: z.string().optional().describe('UUID of a source TextFrame inside the template artboard. Omit for a single-binding template when exactly one editable TextFrame exists on the source artboard; the tool will bind it automatically.'),
  values: z.array(z.string()).min(1).max(200).describe('One text value per generated variant, in output order.'),
  script_rules: z.object({
    han: fontRuleSchema.optional(),
    latin: fontRuleSchema.optional(),
  }).optional().describe('Optional per-script font/font-size rules applied while generating each variant. Fonts are preflighted before mutation.'),
  conditional_font_sizes: z.array(conditionalSizeSchema).max(20).optional().describe('Optional whole-name size overrides, e.g. han_characters=4 -> 83 pt. Later matching rules override earlier ones.'),
  paragraph_alignment: z.enum(['left', 'center', 'right']).optional(),
  center_in_artboard: z.enum(['none', 'horizontal', 'vertical', 'both']).optional().default('none').describe('Recenter this TextFrame after text/typography changes.'),
});

const jsxCode = `
${SCRIPT_CLASSIFIER_JSX}
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
  var resolvedBindingFonts = [];
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

  function autoResolveSingleTextFrame(rect) {
    var candidates = [];
    for (var pi = 0; pi < doc.pageItems.length; pi++) {
      try {
        var item = doc.pageItems[pi];
        if (!item || item.typename !== "TextFrame") continue;
        if (!centerInsideArtboard(item, rect)) continue;
        if (item.locked || item.hidden) continue;
        candidates.push(item);
      } catch (_) {}
    }
    if (candidates.length !== 1) {
      throw new Error("AUTO_BIND_REQUIRES_ONE_TEXTFRAME: found " + candidates.length + " editable TextFrames on the source artboard");
    }
    return candidates[0];
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

  function normalizedText(value) {
    return String(value).split(String.fromCharCode(10)).join(String.fromCharCode(13));
  }

  function normalizeFontKey(value) {
    return String(value || "").toLowerCase().replace(/[\\s_\\-]+/g, "").replace(/[^a-z0-9\\u3400-\\u9fff]/g, "");
  }

  function resolveFontRule(rule) {
    if (!rule || (!rule.font_name && !rule.font_family)) return null;
    var requested = rule.font_name || (rule.font_family + " " + rule.font_style);

    for (var fi = 0; fi < app.textFonts.length; fi++) {
      var f = app.textFonts[fi];
      if (rule.font_name && f.name === rule.font_name) return f;
      if (rule.font_name && f.family === rule.font_name) return f;
      if (!rule.font_name && f.family === rule.font_family && f.style === rule.font_style) return f;
    }

    var wanted = normalizeFontKey(requested);
    var candidates = [];
    for (var ni = 0; ni < app.textFonts.length; ni++) {
      var nf = app.textFonts[ni];
      var keys = [
        normalizeFontKey(nf.name),
        normalizeFontKey(nf.family),
        normalizeFontKey(nf.family + nf.style),
        normalizeFontKey(nf.family + " " + nf.style)
      ];
      for (var ki = 0; ki < keys.length; ki++) {
        if (keys[ki] === wanted) {
          candidates.push(nf);
          break;
        }
      }
    }

    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1) {
      var names = [];
      for (var ci = 0; ci < candidates.length; ci++) names.push(candidates[ci].name);
      throw new Error("FONT_AMBIGUOUS: " + requested + " -> " + names.join(", "));
    }
    throw new Error("FONT_NOT_FOUND: " + requested);
  }

  function justificationValue(value) {
    if (value === "left") return Justification.LEFT;
    if (value === "right") return Justification.RIGHT;
    return Justification.CENTER;
  }

  function scriptCounts(tf) {
    var counts = { han:0, latin:0 };
    for (var ci = 0; ci < tf.characters.length; ci++) {
      var script = dpmClassifyTextCharacter(tf.characters, ci);
      if (script === "han") counts.han++;
      else if (script === "latin") counts.latin++;
    }
    return counts;
  }

  function matchingConditionalSize(binding, tf) {
    if (!binding.conditional_font_sizes || !binding.conditional_font_sizes.length) return null;
    var contents = readContents(tf);
    var counts = scriptCounts(tf);
    var result = null;
    for (var ri = 0; ri < binding.conditional_font_sizes.length; ri++) {
      var rule = binding.conditional_font_sizes[ri];
      var match = true;
      if (typeof rule.text_length === "number" && contents.length !== rule.text_length) match = false;
      if (typeof rule.han_characters === "number" && counts.han !== rule.han_characters) match = false;
      if (typeof rule.latin_characters === "number" && counts.latin !== rule.latin_characters) match = false;
      if (match) result = rule.font_size;
    }
    return result;
  }

  function applyBindingFormat(tf, binding, resolvedFonts, artboardRect) {
    if (binding.paragraph_alignment) {
      var justification = justificationValue(binding.paragraph_alignment);
      try { tf.textRange.paragraphAttributes.justification = justification; } catch (_) {}
      for (var pi = 0; pi < tf.paragraphs.length; pi++) tf.paragraphs[pi].paragraphAttributes.justification = justification;
    }

    var rules = binding.script_rules || {};
    for (var ci = 0; ci < tf.characters.length; ci++) {
      var script = dpmClassifyTextCharacter(tf.characters, ci);
      var rule = script === "han" ? rules.han : script === "latin" ? rules.latin : null;
      if (!rule) continue;
      var attrs = tf.characters[ci].characterAttributes;
      var font = script === "han" ? resolvedFonts.han : resolvedFonts.latin;
      if (font) attrs.textFont = font;
      if (typeof rule.font_size === "number") attrs.size = rule.font_size;
    }

    var conditionalSize = matchingConditionalSize(binding, tf);
    if (typeof conditionalSize === "number") {
      try { tf.textRange.characterAttributes.size = conditionalSize; } catch (_) {}
      for (var si = 0; si < tf.characters.length; si++) tf.characters[si].characterAttributes.size = conditionalSize;
    }

    var centerMode = binding.center_in_artboard || "none";
    if (centerMode !== "none") {
      centerTextFrame(tf, artboardRect, centerMode);
    }
  }

  function centerOffset(tf, artboardRect, centerMode) {
    var b = itemBounds(tf);
    if (!b) throw new Error("Unable to read TextFrame bounds for artboard centering");
    var itemCx = (b[0] + b[2]) / 2;
    var itemCy = (b[1] + b[3]) / 2;
    var artCx = (artboardRect[0] + artboardRect[2]) / 2;
    var artCy = (artboardRect[1] + artboardRect[3]) / 2;
    return {
      dx: (centerMode === "horizontal" || centerMode === "both") ? artCx - itemCx : 0,
      dy: (centerMode === "vertical" || centerMode === "both") ? artCy - itemCy : 0
    };
  }

  function centerTextFrame(tf, artboardRect, centerMode) {
    var first = centerOffset(tf, artboardRect, centerMode);
    if (first.dx !== 0 || first.dy !== 0) tf.translate(first.dx, first.dy);

    // Illustrator can update point-text bounds lazily after content/font/size changes.
    // Re-read once and apply one bounded correction instead of trusting the first geometry.
    var residual = centerOffset(tf, artboardRect, centerMode);
    if (Math.abs(residual.dx) > 0.1 || Math.abs(residual.dy) > 0.1) {
      tf.translate(residual.dx, residual.dy);
    }
  }

  function fontIdentityKeys(font) {
    var keys = [];
    try { keys.push(normalizeFontKey(font.name)); } catch (_) {}
    try { keys.push(normalizeFontKey(font.family)); } catch (_) {}
    try { keys.push(normalizeFontKey(font.family + font.style)); } catch (_) {}
    try { keys.push(normalizeFontKey(font.family + " " + font.style)); } catch (_) {}
    return keys;
  }

  function fontsEquivalent(actualFont, expectedFont) {
    if (!actualFont || !expectedFont) return false;
    try { if (actualFont === expectedFont) return true; } catch (_) {}
    var actualKeys = fontIdentityKeys(actualFont);
    var expectedKeys = fontIdentityKeys(expectedFont);
    for (var ai = 0; ai < actualKeys.length; ai++) {
      if (!actualKeys[ai]) continue;
      for (var ei = 0; ei < expectedKeys.length; ei++) {
        if (actualKeys[ai] === expectedKeys[ei]) return true;
      }
    }
    return false;
  }

  function verifyBindingFormat(tf, binding, resolvedFonts, artboardRect, variantIndex, bindingIndex, mismatches) {
    if (binding.paragraph_alignment) {
      var expectedJustification = justificationValue(binding.paragraph_alignment);
      for (var pi = 0; pi < tf.paragraphs.length; pi++) {
        try {
          if (tf.paragraphs[pi].paragraphAttributes.justification !== expectedJustification) {
            mismatches.push({ variant_index:variantIndex, binding_index:bindingIndex, kind:"paragraph_alignment", paragraph_index:pi });
          }
        } catch (_) {
          mismatches.push({ variant_index:variantIndex, binding_index:bindingIndex, kind:"paragraph_alignment_unreadable", paragraph_index:pi });
        }
      }
    }

    var centerMode = binding.center_in_artboard || "none";
    if (centerMode !== "none") {
      var offset = centerOffset(tf, artboardRect, centerMode);
      var tolerance = 0.5;
      if (Math.abs(offset.dx) > tolerance || Math.abs(offset.dy) > tolerance) {
        mismatches.push({
          variant_index:variantIndex,
          binding_index:bindingIndex,
          kind:"artboard_centering",
          center_mode:centerMode,
          residual_dx_pt:offset.dx,
          residual_dy_pt:offset.dy
        });
      }
    }

    var rules = binding.script_rules || {};
    if ((rules.han && resolvedFonts.han) || (rules.latin && resolvedFonts.latin)) {
      for (var ci = 0; ci < tf.characters.length; ci++) {
        var script = dpmClassifyTextCharacter(tf.characters, ci);
        var expectedFont = script === "han" ? resolvedFonts.han : script === "latin" ? resolvedFonts.latin : null;
        if (!expectedFont) continue;
        try {
          var actualFont = tf.characters[ci].characterAttributes.textFont;
          if (!fontsEquivalent(actualFont, expectedFont)) {
            mismatches.push({
              variant_index:variantIndex,
              binding_index:bindingIndex,
              kind:"font",
              character_index:ci,
              expected_name:expectedFont.name,
              expected_family:expectedFont.family,
              expected_style:expectedFont.style,
              actual_name:actualFont.name,
              actual_family:actualFont.family,
              actual_style:actualFont.style
            });
            break;
          }
        } catch (_) {
          mismatches.push({ variant_index:variantIndex, binding_index:bindingIndex, kind:"font_unreadable", character_index:ci });
          break;
        }
      }
    }
  }

  function writeAndFormat(tf, value, binding, resolvedFonts, artboardRect) {
    var normalized = normalizedText(value);
    tf.contents = normalized;
    if (readContents(tf) !== normalized) throw new Error("Text readback mismatch");
    applyBindingFormat(tf, binding, resolvedFonts, artboardRect);
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
      var binding = params.text_bindings[b];
      var tf = null;
      if (binding.source_uuid) {
        tf = findItemByUUID(binding.source_uuid);
      } else {
        if (params.text_bindings.length !== 1) throw new Error("source_uuid is required when more than one text binding is supplied");
        tf = autoResolveSingleTextFrame(sourceRect);
      }
      if (!tf) throw new Error("Text binding source UUID not found: " + (binding.source_uuid || "<auto>"));
      if (tf.typename !== "TextFrame") throw new Error("Text binding source UUID must resolve to a TextFrame");
      if (!centerInsideArtboard(tf, sourceRect)) throw new Error("Text binding source is outside the source artboard");
      sourceBindingItems.push(tf);
      sourceOriginalTexts.push(readContents(tf));
      sourceBindingPaths.push(bindingPathToRoot(tf));
      var scriptRules = binding.script_rules || {};
      resolvedBindingFonts.push({
        han: resolveFontRule(scriptRules.han),
        latin: resolveFontRule(scriptRules.latin)
      });
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
        writeAndFormat(
          duplicateText,
          params.text_bindings[tb].values[tv],
          params.text_bindings[tb],
          resolvedBindingFonts[tb],
          doc.artboards[variantArtboardIndices[tv]].artboardRect
        );
      }
    }

    for (var sb = 0; sb < params.text_bindings.length; sb++) {
      writeAndFormat(
        sourceBindingItems[sb],
        params.text_bindings[sb].values[0],
        params.text_bindings[sb],
        resolvedBindingFonts[sb],
        doc.artboards[sourceIndex].artboardRect
      );
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
        if (actual !== expected) mismatches.push({ variant_index:vv, binding_index:vb, kind:"text", expected:expected, actual:actual });
        verifyBindingFormat(
          actualTextItem,
          params.text_bindings[vb],
          resolvedBindingFonts[vb],
          doc.artboards[variantArtboardIndices[vv]].artboardRect,
          vv,
          vb,
          mismatches
        );
      }
    }
    verificationMs = nowMs() - verificationStart;

    var failedVariantMap = {};
    for (var mi = 0; mi < mismatches.length; mi++) failedVariantMap[String(mismatches[mi].variant_index)] = true;
    var failedVariantCount = 0;
    for (var mk in failedVariantMap) if (failedVariantMap.hasOwnProperty(mk)) failedVariantCount++;

    writeResultFile(RESULT_PATH, {
      success: mismatches.length === 0,
      requested_count: variantCount,
      generated_variant_count: variantCount,
      success_count: variantCount - failedVariantCount,
      failed_variant_count: failedVariantCount,
      source_artboard_index: sourceIndex,
      created_artboard_count: variantCount - 1,
      total_variant_artboard_count: variantCount,
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
        verified_variants: variantCount - failedVariantCount,
        failed_variants: failedVariantCount,
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
    description: 'Generate many artboard variants from one Illustrator template in one background JSX execution. Use this for name tags, badges, table cards, certificates, labels, SKU cards, numbered designs, or other one-template-plus-many-data jobs. For a single-binding template with exactly one editable TextFrame on the source artboard, omit source_uuid and let the tool auto-bind it; only fall back to one text-frame lookup if AUTO_BIND_REQUIRES_ONE_TEXTFRAME is returned. Human-readable font names are resolved by exact or unique normalized Illustrator font identity, so do not preflight with list_fonts unless FONT_NOT_FOUND or FONT_AMBIGUOUS is returned. Map “段落居中” to paragraph_alignment=center, “与画板垂直居中” to center_in_artboard=vertical, and “与画板水平/垂直居中” or “画板居中” to center_in_artboard=both. The tool verifies bound text, requested paragraph alignment, requested font application, and requested artboard centering before reporting success. Font verification compares Illustrator font identity by exact object or normalized name/family/style equivalence to avoid false failures from PostScript/display-name aliases. For N variants, created_artboard_count is normally N-1 because the source artboard becomes variant 1; generated_variant_count and total_variant_artboard_count report the full N. On a clean success, save directly instead of running typography/text-frame verification reads. It rolls back created artwork/artboards on failure.',
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
