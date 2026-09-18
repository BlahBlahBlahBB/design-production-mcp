import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { executeToolJsx } from '../tool-executor.js';
import { DESTRUCTIVE_ANNOTATIONS, WRITE_IDEMPOTENT_ANNOTATIONS } from './shared.js';

const commonPrefix = `
var preflight = preflightChecks();
if (preflight) writeResultFile(RESULT_PATH, preflight);
else { try { var params = readParamsFile(PARAMS_PATH), succeeded = [], failed = [], skipped = [];
  function target(uuid) { var item = findItemByUUID(uuid); if (!item) { failed.push({ uuid: uuid, reason: "No object found matching UUID" }); return null; } if (item.locked || item.hidden) { skipped.push({ uuid: uuid, reason: item.locked ? "locked" : "hidden" }); return null; } return item; }
`;
const commonSuffix = `
  writeResultFile(RESULT_PATH, { success: failed.length === 0 && skipped.length === 0, success_count: succeeded.length, fail_count: failed.length, failed_objects: failed, skipped_count: skipped.length, skipped_objects: skipped, uuids: succeeded });
} catch (e) { writeResultFile(RESULT_PATH, { error: true, message: e.message, line: e.line }); } }
`;

const moveJsx = `${commonPrefix}
  for (var i = 0; i < params.uuids.length; i++) { var item = target(params.uuids[i]); if (!item) continue; try { item.translate(params.x || 0, -(params.y || 0)); succeeded.push(params.uuids[i]); } catch (e) { failed.push({ uuid: params.uuids[i], reason: e.message }); } }
${commonSuffix}`;
const rotateJsx = `${commonPrefix}
  for (var i = 0; i < params.uuids.length; i++) { var item = target(params.uuids[i]); if (!item) continue; try { item.rotate(params.angle); succeeded.push(params.uuids[i]); } catch (e) { failed.push({ uuid: params.uuids[i], reason: e.message }); } }
${commonSuffix}`;
const scaleJsx = `${commonPrefix}
  var sx = params.scale_x * 100, sy = (params.scale_y === undefined ? params.scale_x : params.scale_y) * 100;
  for (var i = 0; i < params.uuids.length; i++) { var item = target(params.uuids[i]); if (!item) continue; try { item.resize(sx, sy, true, true, true, true, sx); succeeded.push(params.uuids[i]); } catch (e) { failed.push({ uuid: params.uuids[i], reason: e.message }); } }
${commonSuffix}`;
const renameJsx = `${commonPrefix}
  if (params.uuids.length !== params.names.length) { writeResultFile(RESULT_PATH, { error: true, message: "uuids and names must have matching lengths" }); }
  else { for (var i = 0; i < params.uuids.length; i++) { var item = target(params.uuids[i]); if (!item) continue; try { item.name = params.names[i]; succeeded.push(params.uuids[i]); } catch (e) { failed.push({ uuid: params.uuids[i], reason: e.message }); } } ${commonSuffix.replace(/^\n/, '')}
`;

const uuids = z.array(z.string()).min(1).describe('UUID array; pass every target in one call, including a one-object operation.');

export function register(server: McpServer): void {
  server.registerTool('move_objects', {
    title: 'Move Objects',
    description: 'Move one or more explicit UUIDs by the same relative offset in one background JSX execution. Positive y moves down in artboard/web coordinates. For selected artwork, read selection once then pass every UUID here. Do not loop object moves. Locked/hidden objects are skipped and never changed.',
    inputSchema: { uuids, x: z.number().optional().default(0), y: z.number().optional().default(0) }, annotations: WRITE_IDEMPOTENT_ANNOTATIONS,
  }, async (params) => executeToolJsx(moveJsx, params));
  server.registerTool('rotate_objects', {
    title: 'Rotate Objects',
    description: 'Rotate one or more explicit UUIDs by the same angle in one background JSX execution. Pass all UUIDs together; do not loop. Locked/hidden objects are skipped and never changed.',
    inputSchema: { uuids, angle: z.number().describe('Degrees; positive is Illustrator clockwise rotation.') }, annotations: DESTRUCTIVE_ANNOTATIONS,
  }, async (params) => executeToolJsx(rotateJsx, params));
  server.registerTool('scale_objects', {
    title: 'Scale Objects',
    description: 'Scale one or more explicit UUIDs in one background JSX execution. scale_x and scale_y are factors (2 doubles, 0.5 halves); omitting scale_y preserves aspect ratio. Pass all UUIDs together; do not loop. Locked/hidden objects are skipped and never changed.',
    inputSchema: { uuids, scale_x: z.number().positive(), scale_y: z.number().positive().optional() }, annotations: DESTRUCTIVE_ANNOTATIONS,
  }, async (params) => executeToolJsx(scaleJsx, params));
  server.registerTool('rename_objects', {
    title: 'Rename Objects',
    description: 'Rename one or more explicit UUIDs in one background JSX execution. uuids and names are parallel arrays of equal length, including for a single object. Do not loop single-object mutations. Locked/hidden objects are skipped and never changed.',
    inputSchema: { uuids, names: z.array(z.string()).min(1).describe('Parallel names array matching uuids length.') }, annotations: WRITE_IDEMPOTENT_ANNOTATIONS,
  }, async (params) => executeToolJsx(renameJsx, params));
}
