import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { executeToolJsx } from '../tool-executor.js';
import { colorSchema, strokeSchema, DESTRUCTIVE_ANNOTATIONS } from './shared.js';
import { BATCH_OBJECT_CORE_JSX } from './batch-object-core.js';

const jsxCode = `
var preflight = preflightChecks();
if (preflight) writeResultFile(RESULT_PATH, preflight);
else { try { var params = readParamsFile(PARAMS_PATH); ${BATCH_OBJECT_CORE_JSX}
  var appearance = {};
  if (typeof params.fill !== "undefined") appearance.fill = params.fill;
  if (typeof params.stroke !== "undefined") appearance.stroke = params.stroke;
  if (typeof params.opacity !== "undefined") appearance.opacity = params.opacity;
  if (typeof params.hidden !== "undefined") appearance.hidden = params.hidden;
  if (typeof params.locked !== "undefined") appearance.locked = params.locked;
  var operations = []; for (var i = 0; i < params.uuids.length; i++) operations.push({ uuid: params.uuids[i], properties: appearance });
  writeResultFile(RESULT_PATH, modifyObjectOperations(operations, "artboard-web"));
} catch(e) { writeResultFile(RESULT_PATH, { error: true, message: "Failed to set appearance: " + e.message, line: e.line }); } }
`;

export function register(server: McpServer): void {
  server.registerTool('set_appearance', {
    title: 'Set Appearance',
    description: 'Apply one shared fill, stroke, opacity, hidden, or locked value to many objects in one background JSX execution. Only supplied fields change.',
    inputSchema: { uuids: z.array(z.string()).min(1), fill: colorSchema, stroke: strokeSchema, opacity: z.number().optional(), hidden: z.boolean().optional(), locked: z.boolean().optional() },
    annotations: DESTRUCTIVE_ANNOTATIONS,
  }, async (params) => executeToolJsx(jsxCode, params));
}
