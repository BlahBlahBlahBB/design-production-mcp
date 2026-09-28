import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { formatToolResult } from '../tool-executor.js';
import { WRITE_ANNOTATIONS } from './shared.js';
import { createVerticalFlowIllustratorAdapter, type VerticalFlowIllustratorItem } from './vertical-flow-illustrator-adapter.js';
import { executeVerticalFlowAsync, type AsyncVerticalFlowExecutorAdapter, type VerticalFlowExecutionResult } from './vertical-flow-executor.js';

export const layoutVerticalFlowSchema = z.object({
  item_uuids: z.array(z.string().min(1)).min(1).max(50),
}).strict().superRefine((value, context) => {
  const seen = new Set<string>();
  for (const uuid of value.item_uuids) {
    if (seen.has(uuid)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'item_uuids must be unique', path: ['item_uuids'] });
    seen.add(uuid);
  }
});

export type LayoutVerticalFlowExecutor = (
  itemUuids: string[],
  adapter: AsyncVerticalFlowExecutorAdapter<VerticalFlowIllustratorItem>,
) => Promise<VerticalFlowExecutionResult>;

export function serializeLayoutVerticalFlowResult(result: VerticalFlowExecutionResult): Record<string, unknown> {
  return {
    status: result.status,
    orderedItemCount: result.orderedItemCount,
    measuredAreaTextCount: result.measuredAreaTextCount,
    appliedMutationCount: result.appliedMutationCount,
    verification: result.verification,
    rollback: result.rollback,
    ...(result.reason ? { reason: result.reason } : {}),
  };
}

export async function executeLayoutVerticalFlow(
  itemUuids: string[],
  adapter: AsyncVerticalFlowExecutorAdapter<VerticalFlowIllustratorItem> = createVerticalFlowIllustratorAdapter(),
  executor: LayoutVerticalFlowExecutor = executeVerticalFlowAsync,
): Promise<Record<string, unknown>> {
  return serializeLayoutVerticalFlowResult(await executor(itemUuids, adapter));
}

export function register(server: McpServer): void {
  server.registerTool('layout_vertical_flow', {
    title: 'Layout Vertical Flow',
    description: 'Automatically grows eligible AreaText downward and moves later explicitly ordered objects downward while preserving their original vertical gaps. UUID order is authoritative. V1 is vertical-only and AreaText never shrinks.',
    inputSchema: layoutVerticalFlowSchema,
    annotations: WRITE_ANNOTATIONS,
  }, async (params) => formatToolResult(await executeLayoutVerticalFlow(params.item_uuids)));
}
