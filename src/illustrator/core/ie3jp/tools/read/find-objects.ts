import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { executeToolJsx } from '../tool-executor.js';
import { coordinateSystemSchema } from '../session.js';
import { COLOR_HELPERS_JSX, TEXT_APPEARANCE_HELPERS_JSX, WRITE_IDEMPOTENT_ANNOTATIONS, colorSchema } from '../modify/shared.js';

/** One call, one transport, one JSX execution for document-wide conditional work. */
const jsxCode = `
var preflight = preflightChecks();
if (preflight) writeResultFile(RESULT_PATH, preflight);
else { try {
  var params = readParamsFile(PARAMS_PATH), doc = app.activeDocument;
  var coordSystem = params.coordinate_system || "artboard-web";
  ${COLOR_HELPERS_JSX}
  ${TEXT_APPEARANCE_HELPERS_JSX}
  var matched = [], results = [], seen = {}, failures = [], skipped = [];
  function colorsMatch(actual, expected) {
    var tol = expected.tolerance !== undefined ? expected.tolerance : 5;
    if (!actual || !expected) return false;
    if (expected.type === "cmyk") { try { return actual.typename === "CMYKColor" && Math.abs(actual.cyan - expected.c) <= tol && Math.abs(actual.magenta - expected.m) <= tol && Math.abs(actual.yellow - expected.y) <= tol && Math.abs(actual.black - expected.k) <= tol; } catch (e) { return false; } }
    if (expected.type === "rgb") { try { return actual.typename === "RGBColor" && Math.abs(actual.red - expected.r) <= tol && Math.abs(actual.green - expected.g) <= tol && Math.abs(actual.blue - expected.b) <= tol; } catch (e2) { return false; } }
    return false;
  }
  function itemFillColor(item) { try { return item.typename === "TextFrame" ? item.textRange.characterAttributes.fillColor : (item.filled ? item.fillColor : null); } catch (e) { return null; } }
  function itemStrokeColor(item) { try { return item.typename === "TextFrame" ? item.textRange.characterAttributes.strokeColor : (item.stroked ? item.strokeColor : null); } catch (e) { return null; } }
  function typeMatches(item) {
    var wanted = params.object_types || (params.type ? [params.type] : null);
    if (!wanted || wanted.length === 0) return true;
    var actual = getItemType(item); for (var i = 0; i < wanted.length; i++) if (wanted[i] === actual) return true;
    return false;
  }
  function matches(item) {
    if (!typeMatches(item)) return false;
    if (params.name) { try { if ((item.name || "").indexOf(params.name) < 0) return false; } catch (e) { return false; } }
    if (params.text_content) { if (item.typename !== "TextFrame") return false; try { if ((item.contents || "").indexOf(params.text_content) < 0) return false; } catch (e2) { return false; } }
    if (params.layer_name && getParentLayerName(item) !== params.layer_name) return false;
    if (params.artboard_index !== undefined && getArtboardIndexForItem(item) !== params.artboard_index) return false;
    if (params.fill_color && !colorsMatch(itemFillColor(item), params.fill_color)) return false;
    if (params.stroke_color && !colorsMatch(itemStrokeColor(item), params.stroke_color)) return false;
    if (params.font_name) { if (item.typename !== "TextFrame") return false; try { var found = false; for (var tr = 0; tr < item.textRanges.length; tr++) { var font = item.textRanges[tr].characterAttributes.textFont; if ((font.family || "").indexOf(params.font_name) >= 0 || (font.name || "").indexOf(params.font_name) >= 0) { found = true; break; } } if (!found) return false; } catch (e3) { return false; } }
    if (params.font_size) { if (item.typename !== "TextFrame") return false; try { var size = item.textRanges[0].characterAttributes.size; if (params.font_size.min !== undefined && size < params.font_size.min) return false; if (params.font_size.max !== undefined && size > params.font_size.max) return false; } catch (e4) { return false; } }
    return true;
  }
  function applyProperties(item, uuid) {
    var props = params.set_properties; if (!props) return true;
    if (item.locked || item.hidden) { skipped.push({ uuid: uuid, reason: item.locked ? "locked" : "hidden" }); return false; }
    try {
      if (typeof props.fill !== "undefined") { if (item.typename === "TextFrame") applyTextAppearance(item, props.fill, void 0); else if (!props.fill || props.fill.type === "none") item.filled = false; else { item.fillColor = createColor(props.fill); item.filled = true; } }
      if (typeof props.stroke !== "undefined" || typeof props.stroke_width === "number") {
        var stroke = {}; if (typeof props.stroke !== "undefined") stroke.color = props.stroke; if (typeof props.stroke_width === "number") stroke.width = props.stroke_width;
        if (item.typename === "TextFrame") applyTextAppearance(item, void 0, stroke);
        else { if (typeof stroke.width === "number") item.strokeWidth = stroke.width; if (stroke.color && stroke.color.type === "none") item.stroked = false; else if (stroke.color) { item.strokeColor = createColor(stroke.color); item.stroked = true; } }
      }
      return true;
    } catch (e) { failures.push({ uuid: uuid, reason: e.message }); return false; }
  }
  function resultFor(item, uuid) {
    var fields = params.return_fields || ["uuid", "type", "name", "bounds"], result = {};
    for (var fi = 0; fi < fields.length; fi++) {
      var field = fields[fi];
      if (field === "uuid") result.uuid = uuid;
      else if (field === "type") result.type = getItemType(item);
      else if (field === "name") { try { result.name = item.name || ""; } catch (ignoreName) {} }
      else if (field === "bounds") result.bounds = getBounds(item, coordSystem, getArtboardRectByIndex(getArtboardIndexForItem(item)));
      else if (field === "text_content" && item.typename === "TextFrame") { try { result.text_content = item.contents; } catch (ignoreText) {} }
      else if (field === "font" && item.typename === "TextFrame") { try { var f = item.textRanges[0].characterAttributes.textFont; result.font = { name: f.name, family: f.family }; } catch (ignoreFont) {} }
      else if (field === "appearance") result.appearance = { fill: colorToObject(itemFillColor(item)), stroke: colorToObject(itemStrokeColor(item)) };
      else if (field === "layer") result.layer = getParentLayerName(item);
    }
    return result;
  }
  function collect(container) { for (var i = 0; i < container.pageItems.length; i++) { var item = container.pageItems[i], uuid = ensureUUID(item); if (seen[uuid]) continue; seen[uuid] = true; if (matches(item)) matched.push({ item: item, uuid: uuid }); } }
  for (var li = 0; li < doc.layers.length; li++) collect(doc.layers[li]);
  var updated = 0; for (var mi = 0; mi < matched.length; mi++) if (applyProperties(matched[mi].item, matched[mi].uuid)) updated++;
  for (var ri = 0; ri < matched.length; ri++) results.push(resultFor(matched[ri].item, matched[ri].uuid));
  var failed = failures.concat(skipped);
  writeResultFile(RESULT_PATH, { success: failed.length === 0, matched_count: matched.length, success_count: params.set_properties ? updated : matched.length, fail_count: failures.length, failed_objects: failures, skipped_count: skipped.length, skipped_objects: skipped, objects: results, coordinateSystem: coordSystem });
} catch (e) { writeResultFile(RESULT_PATH, { error: true, message: "find_objects: " + e.message, line: e.line }); } }
`;

const matchColorSchema = z.object({ type: z.enum(['cmyk', 'rgb']), c: z.number().optional(), m: z.number().optional(), y: z.number().optional(), k: z.number().optional(), r: z.number().optional(), g: z.number().optional(), b: z.number().optional(), tolerance: z.number().optional() }).optional();
const setPropertiesSchema = z.object({ fill: colorSchema, stroke: colorSchema, stroke_width: z.number().min(0).optional() }).refine((value) => value.fill !== undefined || value.stroke !== undefined || value.stroke_width !== undefined, { message: 'Provide at least one property to update.' });

export function register(server: McpServer): void {
  server.registerTool('find_objects', {
    title: 'Find Objects',
    description: 'Batch query and optional bulk-update tool. Prefer it for document-wide conditional work (for example, all text matching a condition) instead of structural browsing followed by per-object writes. Query using object_types, text_content, fill/stroke, font, name, layer, or artboard. Set set_properties for one safe bulk update in the same JSX execution; TextFrame fill/stroke updates use character attributes. Return only requested return_fields. Do not use it when UUIDs are already known: use set_appearance for a shared change or modify_objects for different changes. Locked and hidden objects are never implicitly changed.',
    inputSchema: {
      object_types: z.array(z.enum(['text', 'path', 'image', 'group', 'compound-path', 'symbol'])).min(1).optional().describe('Object types to match; use ["text"] for all editable text.'),
      type: z.enum(['text', 'path', 'image', 'group', 'compound-path', 'symbol']).optional().describe('Compatibility alias for one object type.'),
      text_content: z.string().optional(), name: z.string().optional(), layer_name: z.string().optional(),
      fill_color: matchColorSchema, stroke_color: matchColorSchema, font_name: z.string().optional(), font_size: z.object({ min: z.number().optional(), max: z.number().optional() }).optional(), artboard_index: z.number().int().min(0).optional(),
      return_fields: z.array(z.enum(['uuid', 'type', 'name', 'bounds', 'appearance', 'text_content', 'font', 'layer'])).min(1).optional().describe('Fields to return. Defaults to uuid, type, name, and bounds.'),
      set_properties: setPropertiesSchema.optional().describe('Optional bulk update for every match: fill, stroke, and/or stroke_width.'), coordinate_system: coordinateSystemSchema,
    }, annotations: WRITE_IDEMPOTENT_ANNOTATIONS,
  }, async (params) => executeToolJsx(jsxCode, params));
}
