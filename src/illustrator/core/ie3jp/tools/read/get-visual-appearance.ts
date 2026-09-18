import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { executeToolJsx } from '../tool-executor.js';
import { READ_ANNOTATIONS, COLOR_HELPERS_JSX, TEXT_APPEARANCE_HELPERS_JSX } from '../modify/shared.js';

const jsxCode = `
var preflight = preflightChecks();
if (preflight) writeResultFile(RESULT_PATH, preflight);
else { try { var params = readParamsFile(PARAMS_PATH); ${COLOR_HELPERS_JSX} ${TEXT_APPEARANCE_HELPERS_JSX}
  var results = [], failed = [];
  for (var i = 0; i < params.uuids.length; i++) { var uuid = params.uuids[i], item = findItemByUUID(uuid);
    if (!item) { var failure = { success: false, uuid: uuid, error: "No object found matching UUID: " + uuid }; results.push(failure); failed.push(failure); continue; }
    var result = { success: true, uuid: ensureUUID(item), type: item.typename, opacity: item.opacity, hidden: item.hidden, locked: item.locked };
    if (item.typename === "TextFrame") { var text = readTextAppearance(item); result.fill = text.fill; result.stroke = text.stroke; result.character_count = text.character_count; result.fill_mixed = text.fill_mixed; result.stroke_mixed = text.stroke_mixed; }
    else { try { result.fill = item.filled ? colorToObject(item.fillColor) : { type: "none" }; } catch(e1) { result.fill = { type: "unknown" }; } try { result.stroke = item.stroked ? colorToObject(item.strokeColor) : { type: "none" }; } catch(e2) { result.stroke = { type: "unknown" }; } }
    results.push(result);
  }
  writeResultFile(RESULT_PATH, { success: failed.length === 0, success_count: results.length - failed.length, fail_count: failed.length, failed_objects: failed, results: results });
} catch(e) { writeResultFile(RESULT_PATH, { error: true, message: "Failed to get visual appearance: " + e.message, line: e.line }); } }
`;

export function register(server: McpServer): void {
  server.registerTool('get_visual_appearance', {
    title: 'Get Visual Appearance', description: 'Use only when visual/appearance confirmation is actually needed after a write. Read one or more UUIDs in one batch; do not repeat structural browsing or verification after this call. TextFrame values come from character attributes and explicitly report mixed runs. Returns success_count, fail_count, and failed_objects.',
    inputSchema: { uuids: z.array(z.string()).min(1) }, annotations: READ_ANNOTATIONS,
  }, async (params) => executeToolJsx(jsxCode, params));
}
