import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDesignProductionMcpServer } from '../src/mcp/server.js';
import {
  executeLayoutVerticalFlow,
  layoutVerticalFlowSchema,
  type LayoutVerticalFlowExecutor,
} from '../src/illustrator/core/ie3jp/tools/modify/layout-vertical-flow.js';
import type { AsyncVerticalFlowExecutorAdapter, VerticalFlowExecutionResult } from '../src/illustrator/core/ie3jp/tools/modify/vertical-flow-executor.js';
import type { VerticalFlowIllustratorItem } from '../src/illustrator/core/ie3jp/tools/modify/vertical-flow-illustrator-adapter.js';

const adapter = {} as AsyncVerticalFlowExecutorAdapter<VerticalFlowIllustratorItem>;

function result(status: VerticalFlowExecutionResult['status']): VerticalFlowExecutionResult {
  return {
    status, orderedItemCount: 2, measuredAreaTextCount: 1, originalGeometry: [], plannedGeometry: [], appliedMutationCount: 3,
    verification: { verified: status === 'SUCCESS' },
    rollback: status === 'ROLLBACK_FAILED'
      ? { attempted: true, verified: false, restoredMutationCount: 1, reason: 'rollback failed' }
      : { attempted: false, verified: false, restoredMutationCount: 0 },
    ...(status === 'SUCCESS' ? {} : { reason: 'safe failure' }),
  };
}

test('layout_vertical_flow is registered exactly once, raises the public count to 94, and has the locked V1 schema', () => {
  const registered = (createDesignProductionMcpServer() as unknown as { _registeredTools: Record<string, unknown> })._registeredTools;
  assert.ok(registered.layout_vertical_flow);
  assert.equal(Object.keys(registered).filter((name) => name === 'layout_vertical_flow').length, 1);
  assert.equal(Object.keys(registered).length, 94);
  assert.deepEqual(Object.keys(layoutVerticalFlowSchema.shape), ['item_uuids']);
  assert.equal(layoutVerticalFlowSchema.safeParse({ item_uuids: ['first'] }).success, true);
});

test('public schema rejects empty, oversized, duplicate, and invalid UUID input at the boundary', () => {
  assert.equal(layoutVerticalFlowSchema.safeParse({}).success, false);
  assert.equal(layoutVerticalFlowSchema.safeParse({ item_uuids: [] }).success, false);
  assert.equal(layoutVerticalFlowSchema.safeParse({ item_uuids: Array.from({ length: 51 }, (_, index) => `id-${index}`) }).success, false);
  assert.equal(layoutVerticalFlowSchema.safeParse({ item_uuids: ['same', 'same'] }).success, false);
  assert.equal(layoutVerticalFlowSchema.safeParse({ item_uuids: ['valid', ''] }).success, false);
  assert.equal(layoutVerticalFlowSchema.safeParse({ item_uuids: ['valid', 2] }).success, false);
  assert.equal(layoutVerticalFlowSchema.safeParse({ item_uuids: 'not-an-array' }).success, false);
});

test('thin public wrapper preserves authoritative UUID order and reaches the async executor', async () => {
  let received: string[] | undefined;
  const executor: LayoutVerticalFlowExecutor = async (uuids) => {
    received = uuids;
    return result('SUCCESS');
  };
  const serialized = await executeLayoutVerticalFlow(['third', 'first'], adapter, executor);
  assert.deepEqual(received, ['third', 'first']);
  assert.deepEqual(serialized, {
    status: 'SUCCESS', orderedItemCount: 2, measuredAreaTextCount: 1, appliedMutationCount: 3,
    verification: { verified: true }, rollback: { attempted: false, verified: false, restoredMutationCount: 0 },
  });
});

test('safe executor failures and ROLLBACK_FAILED remain distinguishable in the public result', async () => {
  const safeFailure: LayoutVerticalFlowExecutor = async () => result('MEASUREMENT_FAILED_RESTORED');
  const rollbackFailure: LayoutVerticalFlowExecutor = async () => result('ROLLBACK_FAILED');
  assert.equal((await executeLayoutVerticalFlow(['one'], adapter, safeFailure)).status, 'MEASUREMENT_FAILED_RESTORED');
  const serialized = await executeLayoutVerticalFlow(['one'], adapter, rollbackFailure);
  assert.equal(serialized.status, 'ROLLBACK_FAILED');
  assert.deepEqual(serialized.rollback, { attempted: true, verified: false, restoredMutationCount: 1, reason: 'rollback failed' });
});

test('public handler delegates only to the frozen async executor and does not duplicate planner or measurement logic', () => {
  const source = readFileSync(new URL('../src/illustrator/core/ie3jp/tools/modify/layout-vertical-flow.js', import.meta.url), 'utf8');
  assert.match(source, /await executor\(itemUuids, adapter\)/);
  assert.match(source, /createVerticalFlowIllustratorAdapter/);
  assert.doesNotMatch(source, /planVerticalFlow|measureAreaTextRequiredHeight|textPath\.height|translate\(/);
});
