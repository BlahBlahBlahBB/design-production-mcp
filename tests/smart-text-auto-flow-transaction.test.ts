import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { AreaTextSnapshot, AsyncAreaTextMeasurementAdapter } from '../src/illustrator/core/ie3jp/tools/modify/area-text-measurement.js';
import type { AsyncVerticalFlowExecutorAdapter, VerticalFlowItemSnapshot } from '../src/illustrator/core/ie3jp/tools/modify/vertical-flow-executor.js';
import { executeSmartTextMutation, type SmartTextAutoFlowAdapter, type SmartTextMutationSnapshot } from '../src/illustrator/core/smart-text-auto-flow/transaction.js';
import { mutationsForModifyOperations, mutationsForTypography, mutationForTextStyle, mutationsForFormattedReplacement } from '../src/illustrator/core/smart-text-auto-flow/mutation-descriptors.js';
import { createSmartTextAutoFlowIllustratorAdapter } from '../src/illustrator/core/smart-text-auto-flow/illustrator-adapter.js';
import type { LayoutItemSnapshot, LayoutMutation } from '../src/illustrator/core/smart-text-auto-flow/types.js';

type Item = {
  uuid: string;
  type: LayoutItemSnapshot['type'];
  top: number;
  left: number;
  width: number;
  height: number;
  originalHeight: number;
  fitAt: number;
  contents: string;
  fontSize: number;
  fontFamily: string;
  fontStyle: string;
  tracking: number;
  leading: number;
  autoLeading: boolean;
  paragraph: { justification: string; spaceBefore: number; spaceAfter: number };
  parentGroupUuids: string[];
  artboardIndex: number;
  locked?: boolean;
  hidden?: boolean;
  isClippingGroup?: boolean;
};

type HarnessOptions = {
  throwMeasure?: boolean;
  throwTranslateUuid?: string;
  verifyMismatch?: boolean;
  restoreFails?: boolean;
  staleFinalOverset?: boolean;
  finalAtomicOverset?: boolean;
  finalProbeHeightMismatch?: boolean;
  throwFinalProbe?: boolean;
  observedFitAt?: number;
  unstableObservedState?: boolean;
  observedHeightMismatch?: boolean;
  rejectConfirmation?: boolean;
  throwCandidateRestore?: boolean;
};

function area(uuid: string, top: number, height: number, fitAt: number, options: Partial<Item> = {}): Item {
  return { uuid, type: 'AREA_TEXT', top, left: 10, width: 100, height, originalHeight: height, fitAt, contents: uuid,
    fontSize: 18, fontFamily: 'Test Family', fontStyle: 'Regular', tracking: 0, leading: 21.6, autoLeading: true,
    paragraph: { justification: 'left', spaceBefore: 0, spaceAfter: 0 }, parentGroupUuids: [], artboardIndex: 0, ...options };
}

function fixed(uuid: string, top: number, height = 20, options: Partial<Item> = {}): Item {
  return { uuid, type: 'PATH', top, left: 10, width: 100, height, originalHeight: height, fitAt: height, contents: '',
    fontSize: 0, fontFamily: '', fontStyle: '', tracking: 0, leading: 0, autoLeading: false,
    paragraph: { justification: 'left', spaceBefore: 0, spaceAfter: 0 }, parentGroupUuids: [], artboardIndex: 0, ...options };
}

function bounds(item: Item) {
  return { left: item.left, top: item.top, right: item.left + item.width, bottom: item.top - item.height };
}

function layoutItem(item: Item): LayoutItemSnapshot {
  const b = bounds(item);
  return { uuid: item.uuid, type: item.type, bounds: { ...b, width: item.width, height: item.height }, artboardIndex: item.artboardIndex, parentGroupUuids: [...item.parentGroupUuids], locked: item.locked, hidden: item.hidden, isClippingGroup: item.isClippingGroup, role: 'CONTENT' };
}

function formatting(item: Item): AreaTextSnapshot['formatting'] {
  return { fontSizes: [item.fontSize], leading: [item.leading], autoLeading: [item.autoLeading], tracking: [item.tracking], paragraphs: [{ ...item.paragraph }] };
}

function harness(items: Item[], options: HarnessOptions = {}) {
  const byUuid = new Map(items.map((item) => [item.uuid, item]));
  const original = new Map(items.map((item) => [item.uuid, { contents: item.contents, height: item.height, top: item.top }]));
  const translations: Array<{ uuid: string; deltaY: number }> = [];
  let snapshotCalls = 0;
  let translateFailuresRemaining = options.throwTranslateUuid ? 1 : 0;
  let finalApplyStarted = false;
  let separateOversetCalls = 0;
  let observedCalls = 0;
  const probeEvents: Array<Record<string, unknown>> = [];
  const childrenOf = (uuid: string) => items.filter((candidate) => candidate.parentGroupUuids.includes(uuid));
  const adjustParentHeight = (target: Item, delta: number) => {
    const parentUuid = target.parentGroupUuids[0];
    if (!parentUuid) return;
    const parent = byUuid.get(parentUuid);
    if (parent) parent.height += delta;
  };
  const adapter: SmartTextAutoFlowAdapter<Item> = {
    async resolve(uuid) { return byUuid.get(uuid) ?? null; },
    async snapshotItem(target): Promise<VerticalFlowItemSnapshot> {
      const b = bounds(target);
      if (options.verifyMismatch && finalApplyStarted && target.uuid === 'd') return { uuid: target.uuid, bounds: { ...b, top: b.top + 1, bottom: b.bottom + 1 }, kind: target.type === 'AREA_TEXT' ? 'AREA_TEXT' : 'FIXED', editable: true, movable: true, ancestorUuids: [...target.parentGroupUuids] };
      return { uuid: target.uuid, bounds: b, kind: target.type === 'AREA_TEXT' ? 'AREA_TEXT' : 'FIXED', editable: true, movable: true, ancestorUuids: [...target.parentGroupUuids] };
    },
    async observeSetHeight(target, height) {
      observedCalls += 1;
      const delta = height - target.height;
      target.height = height;
      adjustParentHeight(target, delta);
      if (options.unstableObservedState) throw new Error('AreaText overset observation did not stabilize');
      if (options.observedHeightMismatch) throw new Error('observe_set_height did not verify requested height');
      const overset = options.rejectConfirmation && observedCalls >= 3
        ? true
        : height < (options.observedFitAt ?? target.fitAt);
      return { requestedHeight: height, actualHeight: height, overset };
    },
    areaText: {
      async checkEligibility() { return { eligible: true }; },
      async snapshot(target) { return { uuid: target.uuid, top: target.top, left: target.left, width: target.width, height: target.height, contents: target.contents, formatting: formatting(target) }; },
      async probeHeight(target, height) {
        if (options.throwMeasure) throw new Error('measurement failed');
        if (options.throwFinalProbe && finalApplyStarted) throw new Error('final atomic probe failed');
        const delta = height - target.height; target.height = height; adjustParentHeight(target, delta);
        const actualHeight = finalApplyStarted && options.finalProbeHeightMismatch ? height + 1 : height;
        const overset = finalApplyStarted && options.finalAtomicOverset ? true : height < target.fitAt;
        probeEvents.push({ phase: finalApplyStarted ? 'final' : 'measurement', uuid: target.uuid, requestedHeight: height, actualHeight,
          overset, contents: target.contents, width: target.width, top: target.top, left: target.left, fontSize: target.fontSize,
          fontFamily: target.fontFamily, fontStyle: target.fontStyle, tracking: target.tracking, leading: target.leading,
          autoLeading: target.autoLeading, paragraph: { ...target.paragraph } });
        return { requestedHeight: height, actualHeight, overset };
      },
      async setHeight(target, height) {
        if (options.throwCandidateRestore && observedCalls > 0) throw new Error('candidate restoration failed');
        const delta = height - target.height; target.height = height; adjustParentHeight(target, delta);
      },
      async isOverset(target) { separateOversetCalls += 1; return options.staleFinalOverset && finalApplyStarted ? true : target.height < target.fitAt; },
    } as AsyncAreaTextMeasurementAdapter<Item>,
    async translateY(target, deltaY) {
      if (target.uuid === options.throwTranslateUuid && translateFailuresRemaining > 0) { translateFailuresRemaining -= 1; throw new Error('translation failed'); }
      target.top += deltaY;
      for (const child of childrenOf(target.uuid)) child.top += deltaY;
      translations.push({ uuid: target.uuid, deltaY });
      finalApplyStarted = true;
    },
    async snapshotMutation(targetUuids): Promise<SmartTextMutationSnapshot> {
      snapshotCalls += 1;
      return {
        items: items.map(layoutItem),
        textStates: targetUuids.map((uuid) => {
          const target = byUuid.get(uuid);
          if (!target) throw new Error('missing target');
          return { uuid, height: target.height, contents: target.contents, formatting: {} };
        }),
      };
    },
    async restoreTextStates(states) {
      for (const state of states) {
        const target = byUuid.get(state.uuid);
        if (!target) throw new Error('missing restore target');
        const delta = state.height - target.height;
        target.height = state.height; adjustParentHeight(target, delta); target.contents = state.contents;
      }
    },
    async verifyTextStates(states) {
      if (options.restoreFails) return false;
      return states.every((state) => {
        const target = byUuid.get(state.uuid);
        return target?.contents === state.contents && target.height === state.height;
      });
    },
  } satisfies SmartTextAutoFlowAdapter<Item>;
  const mutate = (updates: Array<{ uuid: string; fitAt?: number; contents?: string; fontSize?: number }>) => async () => {
    for (const update of updates) {
      const target = byUuid.get(update.uuid);
      if (!target) throw new Error('missing mutation target');
      if (update.fitAt !== undefined) target.fitAt = update.fitAt;
      if (update.contents !== undefined) target.contents = update.contents;
      if (update.fontSize !== undefined) target.fontSize = update.fontSize;
    }
    return { success: true };
  };
  return { adapter, byUuid, original, translations, mutate, probeEvents, getSnapshotCalls: () => snapshotCalls, getSeparateOversetCalls: () => separateOversetCalls, getObservedCalls: () => observedCalls };
}

function mutation(uuid: string, property = 'contents'): LayoutMutation {
  return { targetUuid: uuid, changedProperties: [property], layoutAffecting: true };
}

function request(run: ReturnType<typeof harness>, mutations: LayoutMutation[], updates: Array<{ uuid: string; fitAt?: number; contents?: string; fontSize?: number }>) {
  return executeSmartTextMutation({ mutations, adapter: run.adapter, executeMutation: run.mutate(updates), mutationSucceeded: (result) => result.success, failure: (reason, status) => ({ success: false, reason, status }) });
}

test('contents, font, tracking, and leading mutations share one positive-growth transaction', async () => {
  for (const property of ['contents', 'font_name', 'tracking', 'leading', 'auto_leading']) {
    const run = harness([area('a', 300, 20, 20), fixed('b', 270), fixed('c', 240)]);
    const outcome = await request(run, [mutation('a', property)], [{ uuid: 'a', fitAt: 50, contents: property }]);
    assert.equal(outcome.status, 'SUCCESS');
    assert.equal(run.byUuid.get('a')?.height, 50);
    assert.equal(run.byUuid.get('b')?.top, 240);
    assert.equal(run.byUuid.get('c')?.top, 210);
  }
});

test('no-growth commits and non-layout mutations bypass snapshot and flow', async () => {
  const run = harness([area('a', 300, 20, 20), fixed('b', 270)]);
  const noGrowth = await request(run, [mutation('a')], [{ uuid: 'a', contents: 'fit' }]);
  assert.equal(noGrowth.status, 'SUCCESS_NO_GROWTH');
  assert.equal(run.byUuid.get('b')?.top, 270);
  const bypass = await executeSmartTextMutation({ mutations: [{ targetUuid: 'a', changedProperties: ['fill'], layoutAffecting: false }], adapter: run.adapter, executeMutation: run.mutate([{ uuid: 'a', contents: 'color' }]), mutationSucceeded: (result) => result.success, failure: () => ({ success: false }) });
  assert.equal(bypass.status, 'BYPASSED_NON_LAYOUT');
  assert.equal(run.getSnapshotCalls(), 1);
});

test('portable H1 takes the fast path, while a stable H1 overset uses bounded refinement', async () => {
  const fast = harness([area('a', 300, 20, 20), fixed('d', 250)]);
  assert.equal((await request(fast, [mutation('a')], [{ uuid: 'a', fitAt: 50 }])).status, 'SUCCESS');
  assert.equal(fast.getObservedCalls(), 1);

  const searched = harness([area('a', 300, 20, 20), fixed('d', 250)], { observedFitAt: 55 });
  const outcome = await request(searched, [mutation('a')], [{ uuid: 'a', fitAt: 50 }]);
  assert.equal(outcome.status, 'SUCCESS');
  assert.ok(searched.getObservedCalls() > 3);
  assert.ok((searched.byUuid.get('a')?.height ?? 0) >= 55);
});

test('portable-height observation, restore, confirmation, and bounded-search failures roll back', async () => {
  const cases: Array<[HarnessOptions, string]> = [
    [{ unstableObservedState: true }, 'AreaText overset observation did not stabilize'],
    [{ observedHeightMismatch: true }, 'observe_set_height did not verify requested height'],
    [{ observedFitAt: 100000 }, 'AreaText remained non-portable at maximum height'],
    [{ throwCandidateRestore: true }, 'candidate restoration failed'],
    [{ observedFitAt: 55, rejectConfirmation: true }, 'selected portable height failed confirmation'],
  ];
  for (const [options, reason] of cases) {
    const run = harness([area('a', 300, 20, 20), fixed('d', 250)], options);
    const outcome = await request(run, [mutation('a')], [{ uuid: 'a', fitAt: 50 }]);
    assert.equal(outcome.status, 'MEASUREMENT_FAILED_ROLLED_BACK');
    assert.match(outcome.reason ?? '', new RegExp(reason));
    assert.equal(run.byUuid.get('a')?.height, 20);
    assert.equal(run.byUuid.get('d')?.top, 250);
  }
});

test('final verification accepts atomic height and fit despite a stale separate overset reader', async () => {
  const run = harness([area('a', 300, 20, 20), fixed('d', 250)], { staleFinalOverset: true });
  const outcome = await request(run, [mutation('a', 'font_size')], [{ uuid: 'a', fitAt: 50 }]);
  assert.equal(outcome.status, 'SUCCESS');
  assert.equal(run.byUuid.get('a')?.height, 50);
  assert.equal(run.byUuid.get('d')?.top, 220);
  assert.equal(run.getSeparateOversetCalls(), 0);
});

test('atomic final overset and actual-height mismatch still fail with rollback', async () => {
  for (const options of [{ finalAtomicOverset: true }, { finalProbeHeightMismatch: true }]) {
    const run = harness([area('a', 300, 20, 20), fixed('d', 250)], options);
    const outcome = await request(run, [mutation('a', 'font_size')], [{ uuid: 'a', fitAt: 50 }]);
    assert.equal(outcome.status, 'VERIFY_FAILED_ROLLED_BACK');
    assert.equal(outcome.reason, options.finalAtomicOverset ? 'source a remains overset' : 'source a height mismatch');
    assert.equal(run.byUuid.get('a')?.height, 20);
    assert.equal(run.byUuid.get('d')?.top, 250);
    assert.equal(run.getSeparateOversetCalls(), 0);
  }
});

test('identical visible typography and geometry can diverge only after a hidden reflow phase transition', async () => {
  const run = harness([area('a', 300, 20, 20, { contents: 'same source' }), fixed('d', 250)], { finalAtomicOverset: true });
  const outcome = await request(run, [mutation('a', 'font_size')], [{ uuid: 'a', fitAt: 50, fontSize: 24 }]);
  assert.equal(outcome.status, 'VERIFY_FAILED_ROLLED_BACK');
  const measurement = run.probeEvents.filter((event) => event.phase === 'measurement' && event.overset === false).at(-1);
  const final = run.probeEvents.find((event) => event.phase === 'final');
  assert.ok(measurement && final);
  const visibleKeys = ['uuid', 'requestedHeight', 'actualHeight', 'contents', 'width', 'top', 'left', 'fontSize', 'fontFamily', 'fontStyle', 'tracking', 'leading', 'autoLeading', 'paragraph'];
  assert.deepEqual(Object.fromEntries(visibleKeys.map((key) => [key, final[key]])), Object.fromEntries(visibleKeys.map((key) => [key, measurement[key]])));
  assert.equal(measurement.overset, false);
  assert.equal(final.overset, true);
});

test('final atomic probe error rolls back instead of escaping the transaction', async () => {
  const run = harness([area('a', 300, 20, 20), fixed('d', 250)], { throwFinalProbe: true });
  const outcome = await request(run, [mutation('a', 'font_size')], [{ uuid: 'a', fitAt: 50 }]);
  assert.equal(outcome.status, 'VERIFY_FAILED_ROLLED_BACK');
  assert.equal(outcome.reason, 'final atomic probe failed');
  assert.equal(run.byUuid.get('a')?.height, 20);
  assert.equal(run.byUuid.get('d')?.top, 250);
});

test('explicit UUID tracking accepts the production snapshot identity and reaches discovery before no-growth', async () => {
  const rawSnapshot = {
    items: [
      { uuid: '436', type: 'AREA_TEXT', bounds: { left: 10, top: 300, right: 110, bottom: 280, width: 100, height: 20 }, artboardIndex: 0, parentGroupUuids: [], locked: false, hidden: false, clipped: false, isClippingGroup: false, role: 'CONTENT' },
      { uuid: '439', type: 'PATH', bounds: { left: 10, top: 250, right: 110, bottom: 230, width: 100, height: 20 }, artboardIndex: 0, parentGroupUuids: [], locked: false, hidden: false, clipped: false, isClippingGroup: false, role: 'CONTENT' },
    ],
    textStates: [{ uuid: '436', height: 20, contents: 'source', formatting: {} }],
  };
  const productionAdapter = createSmartTextAutoFlowIllustratorAdapter(async (_code, params) => {
    assert.deepEqual(params, { operation: 'snapshot', uuids: ['436'] });
    return rawSnapshot;
  });
  const snapshot = await productionAdapter.snapshotMutation(['436']);
  assert.equal(snapshot.items.find((item) => item.uuid === '436')?.type, 'AREA_TEXT');
  assert.equal(snapshot.textStates[0]?.uuid, '436');

  const run = harness([area('436', 300, 20, 20, { contents: 'source' }), fixed('439', 250)]);
  const outcome = await executeSmartTextMutation({
    mutations: mutationsForTypography(['436'], { tracking: 150 }, undefined, undefined),
    adapter: { ...run.adapter, snapshotMutation: async () => snapshot },
    executeMutation: run.mutate([{ uuid: '436', contents: 'tracking-only' }]),
    mutationSucceeded: (result) => result.success,
    failure: (reason, status) => ({ success: false, reason, status }),
  });
  assert.equal(outcome.status, 'SUCCESS_NO_GROWTH');
  assert.equal(outcome.measuredSourceCount, 1);
  assert.equal(run.byUuid.get('439')?.top, 250);
});

test('private Smart Text observed setter owns one redraw-bound stable fit observation', async () => {
  const calls: Record<string, unknown>[] = [];
  const adapter = createSmartTextAutoFlowIllustratorAdapter(async (_jsx, params) => {
    calls.push(params as Record<string, unknown>);
    return { requestedHeight: 80, actualHeight: 80, overset: false };
  });
  assert.deepEqual(
    await adapter.observeSetHeight({ uuid: 'a' }, 80),
    { requestedHeight: 80, actualHeight: 80, overset: false },
  );
  assert.deepEqual(calls, [{ operation: 'observe_set_height', uuid: 'a', height: 80 }]);
  const source = readFileSync(new URL('../src/illustrator/core/smart-text-auto-flow/illustrator-adapter.js', import.meta.url), 'utf8');
  assert.match(source, /function singleOversetObservation\(frame\)/);
  assert.match(source, /observed\.textPath\.height=requestedHeight;/);
  assert.match(source, /var first=singleOversetObservation\(observed\), second=singleOversetObservation\(observed\)/);
  assert.match(source, /if \(first !== second\) fail\("AreaText overset observation did not stabilize"\)/);
  const mismatch = createSmartTextAutoFlowIllustratorAdapter(async () => (
    { requestedHeight: 80, actualHeight: 79, overset: false }
  ));
  await assert.rejects(
    mismatch.observeSetHeight({ uuid: 'a' }, 80),
    /did not verify requested height/,
  );
});

test('a downstream group moves once and its children do not move independently', async () => {
  const run = harness([area('a', 300, 20, 20), fixed('group', 270, 20, { type: 'GROUP' }), fixed('child-1', 265, 10, { parentGroupUuids: ['group'] }), fixed('child-2', 255, 10, { parentGroupUuids: ['group'] }), fixed('d', 230)]);
  const outcome = await request(run, [mutation('a')], [{ uuid: 'a', fitAt: 50 }]);
  assert.equal(outcome.status, 'SUCCESS');
  assert.deepEqual(run.translations.map((entry) => entry.uuid), ['group', 'd']);
  assert.equal(run.byUuid.get('child-1')?.top, 235);
});

test('a mutated AreaText inside a downstream group grows while the group receives only upstream displacement', async () => {
  const run = harness([area('a', 350, 20, 20), fixed('group', 310, 30, { type: 'GROUP' }), area('b', 310, 20, 20, { parentGroupUuids: ['group'] }), fixed('d', 260)]);
  const outcome = await request(run, [mutation('a'), mutation('b')], [{ uuid: 'a', fitAt: 100 }, { uuid: 'b', fitAt: 60 }]);
  assert.equal(outcome.status, 'SUCCESS');
  assert.equal(run.byUuid.get('a')?.height, 100);
  assert.equal(run.byUuid.get('b')?.height, 60);
  assert.equal(run.translations.find((entry) => entry.uuid === 'group')?.deltaY, -80);
  assert.equal(run.translations.find((entry) => entry.uuid === 'd')?.deltaY, -120);
});

test('a source AreaText inside its own group does not translate that group for its own growth', async () => {
  const run = harness([fixed('group', 300, 30, { type: 'GROUP' }), area('a', 300, 20, 20, { parentGroupUuids: ['group'] }), fixed('d', 250)]);
  const outcome = await request(run, [mutation('a')], [{ uuid: 'a', fitAt: 60 }]);
  assert.equal(outcome.status, 'SUCCESS');
  assert.equal(run.translations.find((entry) => entry.uuid === 'group'), undefined);
  assert.equal(run.translations.find((entry) => entry.uuid === 'd')?.deltaY, -40);
});

test('multiple mutations are measured before one cumulative final movement', async () => {
  const run = harness([area('a', 400, 20, 20), area('b', 350, 20, 20), area('c', 300, 20, 20), fixed('d', 250)]);
  const outcome = await request(run, [mutation('a'), mutation('b'), mutation('c')], [{ uuid: 'a', fitAt: 100 }, { uuid: 'b', fitAt: 60 }, { uuid: 'c', fitAt: 45 }]);
  assert.equal(outcome.status, 'SUCCESS');
  assert.deepEqual(run.translations.map((entry) => [entry.uuid, entry.deltaY]), [['b', -80], ['c', -120], ['d', -145]]);
});

test('ambiguous, measurement, apply, verification, and restore failures fail closed with restoration', async () => {
  const ambiguous = harness([area('a', 300, 20, 20), fixed('ambiguous', 260, 20, { left: 70 }), fixed('d', 220)]);
  const ambiguousOutcome = await request(ambiguous, [mutation('a')], [{ uuid: 'a', fitAt: 50, contents: 'new' }]);
  assert.equal(ambiguousOutcome.status, 'AUTO_FLOW_AMBIGUOUS_ROLLED_BACK');
  assert.equal(ambiguous.byUuid.get('a')?.contents, 'a');

  const cardAmbiguity = harness([area('a', 300, 20, 20), fixed('card-a', 260), fixed('card-b', 260, 20, { left: 70 }), fixed('d', 220)]);
  const cardOutcome = await request(cardAmbiguity, [mutation('a')], [{ uuid: 'a', fitAt: 50, contents: 'card' }]);
  assert.equal(cardOutcome.status, 'AUTO_FLOW_AMBIGUOUS_ROLLED_BACK');
  assert.equal(cardAmbiguity.byUuid.get('a')?.contents, 'a');

  const measurement = harness([area('a', 300, 20, 20), fixed('d', 250)], { throwMeasure: true });
  assert.equal((await request(measurement, [mutation('a')], [{ uuid: 'a', contents: 'new' }])).status, 'MEASUREMENT_FAILED_ROLLED_BACK');

  const apply = harness([area('a', 300, 20, 20), fixed('d', 250)], { throwTranslateUuid: 'd' });
  assert.equal((await request(apply, [mutation('a')], [{ uuid: 'a', fitAt: 50 }])).status, 'APPLY_FAILED_ROLLED_BACK');
  assert.equal(apply.byUuid.get('a')?.height, 20);

  const groupApply = harness([area('a', 300, 20, 20), fixed('group', 260, 20, { type: 'GROUP' }), fixed('child', 255, 10, { parentGroupUuids: ['group'] }), fixed('d', 220)], { throwTranslateUuid: 'group' });
  assert.equal((await request(groupApply, [mutation('a')], [{ uuid: 'a', fitAt: 50 }])).status, 'APPLY_FAILED_ROLLED_BACK');
  assert.equal(groupApply.byUuid.get('child')?.top, 255);

  const verify = harness([area('a', 300, 20, 20), fixed('d', 250)], { verifyMismatch: true });
  assert.equal((await request(verify, [mutation('a')], [{ uuid: 'a', fitAt: 50 }])).status, 'VERIFY_FAILED_ROLLED_BACK');

  const restore = harness([area('a', 300, 20, 20), fixed('d', 250)], { throwMeasure: true, restoreFails: true });
  assert.equal((await request(restore, [mutation('a')], [{ uuid: 'a', contents: 'new' }])).status, 'ROLLBACK_FAILED');
});

test('all integrated handler descriptor paths use the shared classifier without public schema changes', () => {
  assert.equal(mutationsForModifyOperations([{ uuid: 'a', properties: { contents: 'x' } }])[0].layoutAffecting, true);
  assert.equal(mutationsForModifyOperations([{ uuid: 'a', properties: { fill: { type: 'rgb' } } }])[0].layoutAffecting, false);
  assert.equal(mutationsForTypography(['a'], { tracking: 20 }, undefined, undefined)[0].layoutAffecting, true);
  assert.equal(mutationForTextStyle('a').layoutAffecting, true);
  assert.equal(mutationsForFormattedReplacement(['a'])[0].layoutAffecting, true);
});

test('all five production text mutation handlers delegate to the one shared transaction without a new public argument', () => {
  const files = [
    '../../src/illustrator/core/ie3jp/tools/modify/modify-object.ts',
    '../../src/illustrator/core/ie3jp/tools/modify/modify-objects.ts',
    '../../src/illustrator/core/ie3jp/tools/typography-core.ts',
    '../../src/illustrator/core/ie3jp/tools/modify/apply-text-style.ts',
    '../../src/illustrator/core/creold-tools.ts',
  ];
  for (const relative of files) {
    const source = readFileSync(new URL(relative, new URL('.', import.meta.url)), 'utf8');
    assert.match(source, /executeSmartTextMutation/);
    assert.doesNotMatch(source, /auto_flow\s*:/);
  }
});
