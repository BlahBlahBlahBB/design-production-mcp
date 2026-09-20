import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as XLSX from 'xlsx';
import os from 'node:os';
import path from 'node:path';
import { unlink } from 'node:fs/promises';
import { executeJsx } from '../../executor/jsx-runner.js';
import { executeToolJsx } from '../tool-executor.js';
import { WRITE_ANNOTATIONS } from './shared.js';
import { SCRIPT_CLASSIFIER_JSX } from '../typography-script-rules.js';

const fontRuleSchema = z.object({
  font_name: z.string().min(1).optional().describe('Exact Illustrator textFont name.'),
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
  source_uuid: z.string().optional().describe('UUID of a source TextFrame inside the template artboard. If omitted and there is exactly one binding, the tool auto-binds the only editable TextFrame centered on the source artboard.'),
  values: z.array(z.string()).min(1).max(200).optional().describe('One text value per generated variant, in output order. Omit when data_source is supplied.'),
  data_column: z.string().optional().describe('Spreadsheet/CSV header to use for this binding when data_source is supplied. Omit for single-binding name lists when a unique name-like column can be auto-detected.'),
  script_rules: z.object({
    han: fontRuleSchema.optional(),
    latin: fontRuleSchema.optional(),
  }).optional().describe('Optional per-script font/font-size rules applied while generating each variant. Fonts are preflighted before mutation.'),
  conditional_font_sizes: z.array(conditionalSizeSchema).max(20).optional().describe('Optional whole-name size overrides, e.g. han_characters=4 -> 83 pt. Later matching rules override earlier ones.'),
  paragraph_alignment: z.enum(['left', 'center', 'right']).optional(),
  center_in_artboard: z.enum(['none', 'horizontal', 'vertical', 'both']).optional().default('none').describe('Recenter this TextFrame after text/typography changes.'),
});

const dataSourceSchema = z.object({
  file_path: z.string().min(1).optional().describe('Optional XLSX/XLS/CSV path. Omit to auto-discover exactly one sibling spreadsheet next to the active Illustrator document.'),
  auto_discover_sibling: z.boolean().optional().default(true).describe('When file_path is omitted, discover exactly one XLSX/XLS/CSV in the active Illustrator document folder.'),
  sheet_name: z.string().min(1).optional(),
  header_row: z.number().int().min(1).optional().default(1),
  column_name: z.string().min(1).optional().describe('Default column header for bindings that omit data_column.'),
  column_index: z.number().int().min(0).optional().describe('Zero-based default column index; use only when headers are absent or ambiguous.'),
  drop_blank_rows: z.boolean().optional().default(true),
}).refine((value) => !(value.column_name && value.column_index !== undefined), {
  message: 'Specify column_name or column_index, not both.',
});

type VariantBindingInput = z.infer<typeof bindingSchema>;
type VariantDataSourceInput = z.infer<typeof dataSourceSchema>;

function normalizedHeader(value: unknown): string {
  return String(value ?? '').trim();
}

function pickColumnIndex(
  rows: unknown[][],
  headerRowIndex: number,
  binding: VariantBindingInput,
  dataSource: VariantDataSourceInput,
  bindingCount: number,
): number {
  const headers = (rows[headerRowIndex] ?? []).map(normalizedHeader);
  const requested = binding.data_column ?? dataSource.column_name;
  if (requested) {
    const exact = headers.findIndex((header) => header === requested);
    if (exact >= 0) return exact;
    const folded = requested.trim().toLowerCase();
    const insensitive = headers.findIndex((header) => header.toLowerCase() === folded);
    if (insensitive >= 0) return insensitive;
    throw new Error(`Spreadsheet column not found: ${requested}. Available headers: ${headers.filter(Boolean).join(', ')}`);
  }
  if (dataSource.column_index !== undefined) return dataSource.column_index;
  if (bindingCount !== 1) {
    throw new Error('Each binding needs data_column when data_source is used with multiple bindings.');
  }

  const nameLike = headers
    .map((header, index) => ({ header, index }))
    .filter(({ header }) => /^(姓名|名字|名称|name|full\s*name)$/i.test(header));
  if (nameLike.length === 1) return nameLike[0].index;

  const nonEmptyColumns: number[] = [];
  const maxColumns = rows.reduce((max, row) => Math.max(max, row.length), 0);
  for (let ci = 0; ci < maxColumns; ci += 1) {
    let hasValue = false;
    for (let ri = headerRowIndex + 1; ri < rows.length; ri += 1) {
      if (normalizedHeader(rows[ri]?.[ci])) {
        hasValue = true;
        break;
      }
    }
    if (hasValue) nonEmptyColumns.push(ci);
  }
  if (nonEmptyColumns.length === 1) return nonEmptyColumns[0];

  throw new Error(`Unable to auto-detect one data column. Available headers: ${headers.filter(Boolean).join(', ')}`);
}

const copyDataSourceJsx = `
var preflight = preflightChecks();
if (preflight) writeResultFile(RESULT_PATH, preflight);
else try {
  var params = readParamsFile(PARAMS_PATH);
  var sourcePath = String(params.source_path || "");
  var source = sourcePath ? new File(sourcePath) : null;

  function isSpreadsheetFile(file) {
    try {
      if (!(file instanceof File)) return false;
      var name = String(file.name || "").toLowerCase();
      return /\\.(xlsx|xls|csv)$/.test(name) && name.charAt(0) !== "." && name.indexOf("~$") !== 0;
    } catch (_) { return false; }
  }

  if ((!source || !source.exists) && app.documents.length > 0) {
    try {
      var doc = app.activeDocument;
      if (doc.saved && doc.path) {
        if (sourcePath) {
          var relative = new File(doc.path.fsName + "/" + sourcePath);
          if (relative.exists) source = relative;
        } else if (params.auto_discover_sibling !== false) {
          var candidates = doc.path.getFiles(isSpreadsheetFile);
          if (candidates.length === 1) source = candidates[0];
          else if (candidates.length === 0) {
            writeResultFile(RESULT_PATH, { error:true, message:"DATA_SOURCE_NOT_FOUND: no XLSX/XLS/CSV next to active Illustrator document" });
            source = null;
          } else {
            var names = [];
            for (var ci = 0; ci < candidates.length; ci++) names.push(candidates[ci].name);
            writeResultFile(RESULT_PATH, { error:true, message:"DATA_SOURCE_AMBIGUOUS: " + names.join(", ") });
            source = null;
          }
        }
      }
    } catch (_) {}
  }

  if (!source || !source.exists) {
    if (sourcePath) writeResultFile(RESULT_PATH, { error:true, message:"DATA_SOURCE_NOT_FOUND: " + sourcePath });
  } else {
    var destination = new File(String(params.destination_path || ""));
    try { if (destination.exists) destination.remove(); } catch (_) {}
    var copied = source.copy(destination.fsName);
    if (!copied || !destination.exists) {
      writeResultFile(RESULT_PATH, { error:true, message:"DATA_SOURCE_COPY_FAILED: " + source.fsName });
    } else {
      writeResultFile(RESULT_PATH, { success:true, source_path:source.fsName, copied_path:destination.fsName });
    }
  }
} catch (e) {
  writeResultFile(RESULT_PATH, { error:true, message:"DATA_SOURCE_COPY_FAILED: " + e.message, line:e.line });
}
`;

async function readWorkbookWithIllustratorFallback(dataSource: VariantDataSourceInput): Promise<XLSX.WorkBook> {
  const filePath = dataSource.file_path;
  if (filePath) {
    try {
      return XLSX.readFile(filePath, { cellDates: false });
    } catch (_) {
      // Continue into the Illustrator-mediated copy path below. This also handles
      // macOS privacy/sandbox cases where the MCP process cannot read Desktop/Documents.
    }
  }

  const extension = filePath ? (path.extname(filePath) || '.xlsx') : '.xlsx';
  const tempPath = path.join(os.tmpdir(), `dpm-template-data-${process.pid}-${Date.now()}${extension}`);
  try {
    await executeJsx(copyDataSourceJsx, {
      source_path: filePath || '',
      auto_discover_sibling: dataSource.auto_discover_sibling !== false,
      destination_path: tempPath,
    }, { timeout: 30_000, activate: false });
    return XLSX.readFile(tempPath, { cellDates: false });
  } catch (copyError) {
    const copyMessage = copyError instanceof Error ? copyError.message : String(copyError);
    throw new Error(`DATA_SOURCE_UNREADABLE: ${copyMessage}`);
  } finally {
    await unlink(tempPath).catch(() => undefined);
  }
}

async function hydrateBindingsFromDataSource(
  bindings: VariantBindingInput[],
  dataSource?: VariantDataSourceInput,
): Promise<VariantBindingInput[]> {
  if (!dataSource) {
    const needsValues = bindings.some((binding) => !binding.values?.length);
    if (!needsValues) return bindings;
    dataSource = { auto_discover_sibling: true, header_row: 1, drop_blank_rows: true };
  }

  const workbook = await readWorkbookWithIllustratorFallback(dataSource);
  const sheetName = dataSource.sheet_name ?? workbook.SheetNames[0];
  if (!sheetName) throw new Error('Spreadsheet has no worksheets.');
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Spreadsheet sheet not found: ${sheetName}`);

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '' });
  const headerRowIndex = (dataSource.header_row ?? 1) - 1;
  if (headerRowIndex < 0 || headerRowIndex >= rows.length) throw new Error('header_row is outside the spreadsheet data.');

  return bindings.map((binding) => {
    if (binding.values?.length) return binding;
    const columnIndex = pickColumnIndex(rows, headerRowIndex, binding, dataSource, bindings.length);
    const values: string[] = [];
    for (let ri = headerRowIndex + 1; ri < rows.length; ri += 1) {
      const value = normalizedHeader(rows[ri]?.[columnIndex]);
      if (!value && dataSource.drop_blank_rows !== false) continue;
      values.push(value);
    }
    if (!values.length) throw new Error(`Spreadsheet column ${columnIndex} produced no values.`);
    if (values.length > 200) throw new Error(`Spreadsheet column produced ${values.length} values; maximum is 200.`);
    return { ...binding, values };
  });
}

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
    var candidates = [];
    var requestedName = rule.font_name || "";
    var requestedFamily = rule.font_family || "";
    var requestedStyle = rule.font_style || "";

    for (var fi = 0; fi < app.textFonts.length; fi++) {
      var f = app.textFonts[fi];
      if (requestedName && f.name === requestedName) return f;
      if (!requestedName && f.family === requestedFamily && f.style === requestedStyle) return f;
    }

    var requestedKey = normalizeFontKey(requestedName || (requestedFamily + requestedStyle));
    for (var ni = 0; ni < app.textFonts.length; ni++) {
      var nf = app.textFonts[ni];
      var keys = [
        normalizeFontKey(nf.name),
        normalizeFontKey(nf.family + nf.style),
        normalizeFontKey(nf.family + " " + nf.style)
      ];
      for (var ki = 0; ki < keys.length; ki++) {
        if (keys[ki] === requestedKey) {
          candidates.push(nf);
          break;
        }
      }
    }

    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1) {
      var names = [];
      for (var ci = 0; ci < candidates.length; ci++) names.push(candidates[ci].name);
      throw new Error("FONT_AMBIGUOUS: " + (requestedName || (requestedFamily + " / " + requestedStyle)) + " -> " + names.join(", "));
    }
    throw new Error("FONT_NOT_FOUND: " + (requestedName || (requestedFamily + " / " + requestedStyle)));
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
      var b = itemBounds(tf);
      if (!b) throw new Error("Unable to read TextFrame bounds for artboard centering");
      var itemCx = (b[0] + b[2]) / 2;
      var itemCy = (b[1] + b[3]) / 2;
      var artCx = (artboardRect[0] + artboardRect[2]) / 2;
      var artCy = (artboardRect[1] + artboardRect[3]) / 2;
      var dx = (centerMode === "horizontal" || centerMode === "both") ? artCx - itemCx : 0;
      var dy = (centerMode === "vertical" || centerMode === "both") ? artCy - itemCy : 0;
      tf.translate(dx, dy);
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
      if (binding.source_uuid) tf = findItemByUUID(binding.source_uuid);
      else {
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
      timing: (function(){ var t = timingSummary(); t.data_source_ms = params._dpm_data_source_ms || 0; return t; })()
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
      timing:(function(){ var t = timingSummary(); t.data_source_ms = params && params._dpm_data_source_ms ? params._dpm_data_source_ms : 0; return t; })()
    });
  }
}
`;

export function register(server: McpServer): void {
  server.registerTool('generate_template_variants', {
    title: 'Generate Template Variants',
    description: 'Generate many artboard variants from one Illustrator template in one background JSX execution. For ordinary “folder contains one AI template + one spreadsheet” requests, call this tool FIRST against the already-open Illustrator template: omit source_uuid and omit data_source.file_path, and the tool auto-binds the only editable TextFrame and auto-discovers exactly one sibling XLSX/XLS/CSV next to the active Illustrator document. Do not use shell, file search, Spreadsheet skill, Python, Computer Use, document-structure reads, text-frame inspection, or artboard probes before this call. It can also parse an explicit XLSX/XLS/CSV data_source path when supplied. Use this for name tags, badges, table cards, certificates, labels, SKU cards, numbered designs, or other one-template-plus-many-data jobs. In the same call it can apply per-script fonts, conditional font-size rules, paragraph alignment, and TextFrame-to-artboard centering, so do not follow it with list_fonts, set_typography, list_text_frames, or modify_objects when these binding options can express the requested result. Fonts are preflighted before mutation. The tool preserves unbound template artwork, verifies every bound value, and rolls back created artwork/artboards on failure.',
    inputSchema: {
      source_artboard_index: z.number().int().min(0).optional().describe('Source template artboard index. Defaults to the active artboard.'),
      source_item_uuids: z.array(z.string()).min(1).optional().describe('Optional exact top-level source artwork UUIDs. Omit to auto-collect top-level artwork centered on the source artboard.'),
      text_bindings: z.array(bindingSchema).min(1).max(20),
      data_source: dataSourceSchema.optional().describe('Optional XLSX/XLS/CSV data source parsed once inside the MCP process. Use this instead of external spreadsheet skill/Python parsing for template variants.'),
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
  }, async (params) => {
    const dataSourceStartedAt = Date.now();
    const hydratedBindings = await hydrateBindingsFromDataSource(params.text_bindings, params.data_source);
    const hydrated = {
      ...params,
      text_bindings: hydratedBindings,
      _dpm_data_source_ms: Date.now() - dataSourceStartedAt,
    };
    return executeToolJsx(jsxCode, hydrated, { timeoutMs: 180_000, includeTiming: true });
  });
}
