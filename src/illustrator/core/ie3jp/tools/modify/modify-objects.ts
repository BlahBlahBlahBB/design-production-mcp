import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { executeToolJsx } from '../tool-executor.js';
import { coordinateSystemSchema } from '../session.js';
import { DESTRUCTIVE_ANNOTATIONS } from './shared.js';
import { BATCH_OBJECT_CORE_JSX } from './batch-object-core.js';
import { modifyPropertiesSchema } from './modify-object.js';

const jsxCode = `
var preflight = preflightChecks();
if (preflight) writeResultFile(RESULT_PATH, preflight);
else { try { var params = readParamsFile(PARAMS_PATH); ${BATCH_OBJECT_CORE_JSX}
  writeResultFile(RESULT_PATH, modifyObjectOperations(params.operations, params.coordinate_system || "artboard-web"));
} catch(e) { writeResultFile(RESULT_PATH, { error: true, message: "Failed to modify objects: " + e.message, line: e.line }); } }
`;

export function register(server: McpServer): void {
  server.registerTool('modify_objects', {
    title: 'Modify Objects',
    description: 'Modify different properties on multiple explicit UUIDs in one background JSX execution. Prefer this over repeated modify_object calls. Reuse UUIDs already returned in the current turn; do not probe again just to modify them.',
    inputSchema: { operations: z.array(z.object({ uuid: z.string(), properties: modifyPropertiesSchema })).min(1), coordinate_system: coordinateSystemSchema },
    annotations: DESTRUCTIVE_ANNOTATIONS,
  }, async (params) => executeToolJsx(jsxCode, params, { resolveCoordinate: true }));
}
