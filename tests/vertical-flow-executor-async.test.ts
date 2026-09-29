import test from 'node:test';
import assert from 'node:assert/strict';
import type { AreaTextSnapshot } from '../src/illustrator/core/ie3jp/tools/modify/area-text-measurement.js';
import {
  executeVerticalFlow,
  executeVerticalFlowAsync,
  type AsyncVerticalFlowExecutorAdapter,
  type VerticalFlowExecutorAdapter,
  type VerticalFlowItemKind,
} from '../src/illustrator/core/ie3jp/tools/modify/vertical-flow-executor.js';

type Item = {
  uuid: string;
  kind: VerticalFlowItemKind;
  top: number;
  left: number;
  width: number;
  height: number;
  originalHeight: number;
  fitAt: number;
  editable: boolean;
  movable: boolean;
  ancestorUuids: string[];
  eligible: boolean;
  contents: string;
  formatting: AreaTextSnapshot['formatting'];
  throwOnProbe?: boolean;
  throwOnRestore?: boolean;
  failRollbackHeight?: boolean;
};

type Options = { failTranslateUuid?: string; verifyMismatchOnce?: boolean; throwVerificationSnapshotOnce?: boolean; delay?: boolean };

function area(uuid: string, top: number, height: number, fitAt: number, options: Partial<Item> = {}): Item {
  return {
    uuid, kind: 'AREA_TEXT', top, left: 10, width: 100, height, originalHeight: height, fitAt,
    editable: true, movable: true, ancestorUuids: [], eligible: true, contents: 'AreaText content',
    formatting: { fontSizes: [12], leading: [14.4], autoLeading: [true], tracking: [0], paragraphs: [{ justification: 'left', spaceBefore: 0, spaceAfter: 0 }] },
    ...options,
  };
}

function fixed(uuid: string, top: number, height = 20, options: Partial<Item> = {}): Item {
  return {
    uuid, kind: 'FIXED', top, left: 10, width: 100, height, originalHeight: height, fitAt: height,
    editable: true, movable: true, ancestorUuids: [], eligible: true, contents: '',
    formatting: { fontSizes: [], leading: [], autoLeading: [], tracking: [], paragraphs: [] }, ...options,
  };
}

function snapshot(target: Item, mismatch: () => boolean) {
  const bounds = { left: target.left, top: target.top, right: target.left + target.width, bottom: target.top - target.height };
  if (mismatch()) { bounds.top += 1; bounds.bottom += 1; }
  return { uuid: target.uuid, bounds, kind: target.kind, editable: target.editable, movable: target.movable, ancestorUuids: [...target.ancestorUuids] };
}

function areaSnapshot(target: Item): AreaTextSnapshot {
  return { uuid: target.uuid, top: target.top, left: target.left, width: target.width, height: target.height, contents: target.contents, formatting: target.formatting };
}

function syncHarness(items: Item[], options: Options = {}) {
  const byUuid = new Map(items.map((item) => [item.uuid, item]));
  let translateFailure = options.failTranslateUuid ? 1 : 0;
  let verifyMismatch = options.verifyMismatchOnce ? 1 : 0;
  let finalTranslation = false;
  let forwardFailure = false;
  const adapter: VerticalFlowExecutorAdapter<Item> = {
    resolve: (uuid) => byUuid.get(uuid) ?? null,
    snapshotItem: (target) => snapshot(target, () => {
      if (verifyMismatch > 0 && finalTranslation) { verifyMismatch -= 1; return true; }
      return false;
    }),
    areaText: {
      checkEligibility: (target) => target.eligible ? { eligible: true } : { eligible: false, reason: 'unsupported' },
      snapshot: areaSnapshot,
      isOverset: (target) => target.height < target.fitAt,
      setHeight: (target, height) => {
        if (target.throwOnProbe && height !== target.originalHeight) throw new Error('probe failed');
        if (target.throwOnRestore && height === target.originalHeight && target.height !== target.originalHeight) throw new Error('restore failed');
        if (target.failRollbackHeight && forwardFailure && height === target.originalHeight) throw new Error('rollback failed');
        target.height = height;
      },
    },
    translateY: (target, deltaY) => {
      if (target.uuid === options.failTranslateUuid && translateFailure > 0) { translateFailure -= 1; forwardFailure = true; throw new Error('translation failed'); }
      target.top += deltaY; finalTranslation = true;
    },
  };
  return { adapter, byUuid };
}

function asyncHarness(items: Item[], options: Options = {}) {
  const byUuid = new Map(items.map((item) => [item.uuid, item]));
  const events: string[] = [];
  const pause = async () => { if (options.delay) await new Promise<void>((resolve) => setTimeout(resolve, 0)); };
  let translateFailure = options.failTranslateUuid ? 1 : 0;
  let verifyMismatch = options.verifyMismatchOnce ? 1 : 0;
  let verificationSnapshotFailure = options.throwVerificationSnapshotOnce ? 1 : 0;
  let finalTranslation = false;
  let forwardFailure = false;
  const adapter: AsyncVerticalFlowExecutorAdapter<Item> = {
    resolve: async (uuid) => { await pause(); return byUuid.get(uuid) ?? null; },
    snapshotItem: async (target) => {
      await pause(); events.push(`snapshot:${target.uuid}:${target.top}:${target.height}`);
      if (finalTranslation && verificationSnapshotFailure > 0) {
        verificationSnapshotFailure -= 1;
        throw new Error('verification snapshot rejected');
      }
      return snapshot(target, () => {
        if (verifyMismatch > 0 && finalTranslation) { verifyMismatch -= 1; return true; }
        return false;
      });
    },
    areaText: {
      checkEligibility: async (target) => { await pause(); return target.eligible ? { eligible: true } : { eligible: false, reason: 'unsupported' }; },
      snapshot: async (target) => { await pause(); events.push(`area-snapshot:${target.uuid}:${target.height}`); return areaSnapshot(target); },
      isOverset: async (target) => { await pause(); return target.height < target.fitAt; },
      probeHeight: async (target, height) => {
        await pause(); events.push(`probe:${target.uuid}:${height}`);
        if (target.throwOnProbe && height !== target.originalHeight) throw new Error('probe failed');
        target.height = height;
        return { requestedHeight: height, actualHeight: target.height, overset: target.height < target.fitAt };
      },
      setHeight: async (target, height) => {
        await pause(); events.push(`height:${target.uuid}:${height}`);
        if (target.throwOnProbe && height !== target.originalHeight) throw new Error('probe failed');
        if (target.throwOnRestore && height === target.originalHeight && target.height !== target.originalHeight) throw new Error('restore failed');
        if (target.failRollbackHeight && forwardFailure && height === target.originalHeight) throw new Error('rollback failed');
        target.height = height;
      },
    },
    translateY: async (target, deltaY) => {
      await pause(); events.push(`translate:${target.uuid}:${deltaY}`);
      if (target.uuid === options.failTranslateUuid && translateFailure > 0) { translateFailure -= 1; forwardFailure = true; throw new Error('translation failed'); }
      target.top += deltaY; finalTranslation = true;
    },
  };
  return { adapter, byUuid, events };
}

function sameCoreResult(sync: Awaited<ReturnType<typeof executeVerticalFlow>>, asyncResult: Awaited<ReturnType<typeof executeVerticalFlowAsync>>) {
  assert.equal(asyncResult.status, sync.status);
  assert.equal(asyncResult.appliedMutationCount, sync.appliedMutationCount);
  assert.deepEqual(asyncResult.verification, sync.verification);
  assert.deepEqual(asyncResult.plannedGeometry.map((item) => ({ uuid: item.uuid, targetBounds: item.targetBounds, targetHeight: item.targetHeight, deltaY: item.deltaY })), sync.plannedGeometry.map((item) => ({ uuid: item.uuid, targetBounds: item.targetBounds, targetHeight: item.targetHeight, deltaY: item.deltaY })));
}

test('async golden-path three-item fixture matches sync geometry and preserves pairwise gaps', async () => {
  const syncItems = [area('first', 160, 20, 60), fixed('second', 120, 25), fixed('third', 80, 15)];
  const asyncItems = [area('first', 160, 20, 60), fixed('second', 120, 25), fixed('third', 80, 15)];
  const sync = executeVerticalFlow(syncItems.map((item) => item.uuid), syncHarness(syncItems).adapter);
  const run = asyncHarness(asyncItems);
  const actual = await executeVerticalFlowAsync(asyncItems.map((item) => item.uuid), run.adapter);
  sameCoreResult(sync, actual);
  assert.equal((asyncItems[0].top - asyncItems[0].height) - asyncItems[1].top, 20);
  assert.equal((asyncItems[1].top - asyncItems[1].height) - asyncItems[2].top, 15);
});

test('async first and middle AreaText growth match sync displacement', async () => {
  for (const items of [
    [area('first', 100, 20, 50), fixed('last', 70)],
    [area('first', 200, 20, 50), area('middle', 160, 20, 55), fixed('last', 120)],
  ]) {
    const syncItems = structuredClone(items);
    const asyncItems = structuredClone(items);
    const sync = executeVerticalFlow(syncItems.map((item) => item.uuid), syncHarness(syncItems).adapter);
    const actual = await executeVerticalFlowAsync(asyncItems.map((item) => item.uuid), asyncHarness(asyncItems).adapter);
    sameCoreResult(sync, actual);
  }
});

test('async first AreaText growth moves the downstream item by planned growth', async () => {
  const items = [area('first', 100, 20, 50), fixed('second', 70)];
  const result = await executeVerticalFlowAsync(['first', 'second'], asyncHarness(items).adapter);
  assert.equal(result.status, 'SUCCESS');
  assert.equal(items[1].top, result.plannedGeometry[1].targetBounds.top);
  assert.ok(result.plannedGeometry[1].deltaY < 0);
});

test('async middle AreaText growth preserves later planned geometry', async () => {
  const items = [area('first', 200, 20, 50), area('middle', 160, 20, 55), fixed('last', 120)];
  const result = await executeVerticalFlowAsync(['first', 'middle', 'last'], asyncHarness(items).adapter);
  assert.equal(result.status, 'SUCCESS');
  assert.ok(result.plannedGeometry[1].resized);
  assert.equal(items[2].top, result.plannedGeometry[2].targetBounds.top);
});

test('async measurement completes and restores before final APPLY', async () => {
  const items = [area('first', 200, 20, 50), area('second', 150, 20, 55), fixed('third', 100)];
  const run = asyncHarness(items, { delay: true });
  const result = await executeVerticalFlowAsync(items.map((item) => item.uuid), run.adapter);
  assert.equal(result.status, 'SUCCESS');
  const firstTranslate = run.events.findIndex((event) => event.startsWith('translate:'));
  assert.ok(firstTranslate > 0);
  assert.ok(run.events.slice(0, firstTranslate).some((event) => event === 'height:first:20'));
  assert.ok(run.events.slice(0, firstTranslate).some((event) => event === 'height:second:20'));
});

test('async unsupported measurement performs zero final mutations', async () => {
  const items = [area('text', 100, 20, 50, { eligible: false })];
  const run = asyncHarness(items);
  const result = await executeVerticalFlowAsync(['text'], run.adapter);
  assert.equal(result.status, 'MEASUREMENT_UNSUPPORTED');
  assert.equal(result.appliedMutationCount, 0);
  assert.equal(run.events.some((event) => event.startsWith('translate:')), false);
});

test('async zero gap remains accepted and preserved', async () => {
  const items = [area('first', 100, 20, 40), fixed('second', 80)];
  const result = await executeVerticalFlowAsync(['first', 'second'], asyncHarness(items).adapter);
  assert.equal(result.status, 'SUCCESS');
  assert.equal((items[0].top - items[0].height) - items[1].top, 0);
});

test('async duplicate and missing UUIDs fail before mutation', async () => {
  const duplicateItems = [fixed('one', 100)];
  const duplicate = await executeVerticalFlowAsync(['one', 'one'], asyncHarness(duplicateItems).adapter);
  assert.equal(duplicate.status, 'PRECHECK_FAILED');
  assert.equal(duplicate.appliedMutationCount, 0);
  const missing = await executeVerticalFlowAsync(['missing'], asyncHarness([]).adapter);
  assert.equal(missing.status, 'PRECHECK_FAILED');
  assert.equal(missing.appliedMutationCount, 0);
});

test('async measurement failure restores before final layout', async () => {
  const items = [area('text', 100, 20, 50, { throwOnProbe: true })];
  const result = await executeVerticalFlowAsync(['text'], asyncHarness(items).adapter);
  assert.equal(result.status, 'MEASUREMENT_FAILED_RESTORED');
  assert.equal(result.appliedMutationCount, 0);
  assert.equal(items[0].height, 20);
});

test('async APPLY failure rolls back in reverse application order', async () => {
  const items = [area('text', 100, 20, 50), fixed('second', 70)];
  const result = await executeVerticalFlowAsync(['text', 'second'], asyncHarness(items, { failTranslateUuid: 'second' }).adapter);
  assert.equal(result.status, 'APPLY_FAILED_ROLLED_BACK');
  assert.equal(result.rollback.verified, true);
  assert.equal(items[0].height, 20);
  assert.equal(items[1].top, 70);
});

test('async VERIFY Promise rejection rolls back', async () => {
  const verifiedItems = [area('text', 100, 20, 50), fixed('second', 70)];
  const verified = await executeVerticalFlowAsync(['text', 'second'], asyncHarness(verifiedItems, { throwVerificationSnapshotOnce: true }).adapter);
  assert.equal(verified.status, 'VERIFY_FAILED_ROLLED_BACK');
  assert.equal(verified.rollback.verified, true);
});

test('async rollback failure remains distinct', async () => {
  const failedItems = [area('text', 100, 20, 50, { failRollbackHeight: true }), fixed('second', 70)];
  const failed = await executeVerticalFlowAsync(['text', 'second'], asyncHarness(failedItems, { failTranslateUuid: 'second' }).adapter);
  assert.equal(failed.status, 'ROLLBACK_FAILED');
  assert.equal(failed.rollback.verified, false);
});

test('async execution never moves X and retains sync applied-mutation count', async () => {
  const syncItems = [area('text', 100, 20, 50), fixed('second', 70)];
  const asyncItems = [area('text', 100, 20, 50), fixed('second', 70)];
  const expected = executeVerticalFlow(['text', 'second'], syncHarness(syncItems).adapter);
  const actual = await executeVerticalFlowAsync(['text', 'second'], asyncHarness(asyncItems, { delay: true }).adapter);
  sameCoreResult(expected, actual);
  assert.equal(asyncItems[0].left, 10);
  assert.equal(asyncItems[1].left, 10);
});
