import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { executeToolJsx } from '../tool-executor.js';
import { coordinateSystemSchema } from '../session.js';
import { colorSchema, strokeSchema, DESTRUCTIVE_ANNOTATIONS } from './shared.js';
import { BATCH_OBJECT_CORE_JSX } from './batch-object-core.js';

export const modifyPropertiesSchema = z.object({
  position: z.object({ x: z.number(), y: z.number() }).optional(),
  size: z.object({ width: z.number().optional(), height: z.number().optional() }).optional(),
  fill: colorSchema,
  stroke: strokeSchema,
  opacity: z.number().optional(),
  rotation: z.number().optional(),
  rotation_mode: z.enum(['delta', 'absolute']).optional().default('delta'),
  name: z.string().optional(),
  hidden: z.boolean().optional(),
  locked: z.boolean().optional(),
  contents: z.string().optional(),
  font_name: z.string().optional(),
  font_size: z.number().optional(),
});

const jsxCode = `
var preflight = preflightChecks();
if (preflight) writeResultFile(RESULT_PATH, preflight);
else { try {
  var params = readParamsFile(PARAMS_PATH);
  ${BATCH_OBJECT_CORE_JSX}
  var batch = modifyObjectOperations([{ uuid: params.uuid, properties: params.properties }], params.coordinate_system || "artboard-web");
  var result = batch.results[0]; result.coordinateSystem = batch.coordinateSystem;
  writeResultFile(RESULT_PATH, result);
} catch(e) { writeResultFile(RESULT_PATH, { error: true, message: "Failed to modify object: " + e.message, line: e.line }); } }
`;

export function register(server: McpServer): void {
  server.registerTool('modify_object', {
    title: 'Modify Object',
    description: 'Single-object compatibility tool. Do not call it repeatedly for a batch. For different changes on several objects use modify_objects; for shared appearance use set_appearance. Runs in the background.',
    inputSchema: { uuid: z.string(), properties: modifyPropertiesSchema, coordinate_system: coordinateSystemSchema },
    annotations: DESTRUCTIVE_ANNOTATIONS,
  }, async (params) => executeToolJsx(jsxCode, params, { resolveCoordinate: true }));
}
