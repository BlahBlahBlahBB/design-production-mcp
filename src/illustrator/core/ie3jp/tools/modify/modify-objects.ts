import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { executeToolJsx } from '../tool-executor.js';
import { coordinateSystemSchema } from '../session.js';
import { DESTRUCTIVE_ANNOTATIONS } from './shared.js';
import { BATCH_OBJECT_CORE_JSX } from './batch-object-core.js';
import { modifyPropertiesSchema } from './modify-object.js';
import { createSmartTextAutoFlowIllustratorAdapter, SMART_TEXT_OPERATION_TIMEOUT_MS } from '../../../smart-text-auto-flow/illustrator-adapter.js';
import { mutationsForModifyOperations, formattedMutationSucceeded } from '../../../smart-text-auto-flow/mutation-descriptors.js';
import { executeSmartTextMutation } from '../../../smart-text-auto-flow/transaction.js';
import { formatToolResult } from '../tool-executor.js';

const jsxCode = `
var preflight = preflightChecks();
if (preflight) writeResultFile(RESULT_PATH, preflight);
else { try { var params = readParamsFile(PARAMS_PATH); ${BATCH_OBJECT_CORE_JSX}
  writeResultFile(RESULT_PATH, modifyObjectOperations(params.operations, params.coordinate_system || "artboard-web", params.internal_smart_text_completion_only === true));
} catch(e) { writeResultFile(RESULT_PATH, { error: true, message: "Failed to modify objects: " + e.message, line: e.line }); } }
`;

export function register(server: McpServer): void {
  server.registerTool('modify_objects', {
    title: 'Modify Objects',
    description: 'Modify different properties on multiple explicit UUIDs in one background JSX execution. Prefer this over repeated modify_object calls. Reuse UUIDs already returned in the current turn; do not probe again just to modify them.',
    inputSchema: { operations: z.array(z.object({ uuid: z.string(), properties: modifyPropertiesSchema })).min(1), coordinate_system: coordinateSystemSchema },
    annotations: DESTRUCTIVE_ANNOTATIONS,
  }, async (params) => {
    const mutations = mutationsForModifyOperations(params.operations);
    const internalSmartTextCompletionOnly = mutations.some((mutation) => mutation.layoutAffecting);
    return (await executeSmartTextMutation({
    mutations,
    executeMutation: () => executeToolJsx(jsxCode, { ...params, internal_smart_text_completion_only: internalSmartTextCompletionOnly }, { resolveCoordinate: true, timeoutMs: SMART_TEXT_OPERATION_TIMEOUT_MS }),
    mutationSucceeded: formattedMutationSucceeded,
    failure: (reason, status) => formatToolResult({ success: false, error: true, message: `modify_objects smart auto flow ${status}: ${reason}` }),
    adapter: createSmartTextAutoFlowIllustratorAdapter(),
    })).result;
  });
}
