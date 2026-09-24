import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkAreaTextThreadingEligibility,
  measureAreaTextRequiredHeight,
  measureAreaTextRequiredHeightAsync,
  type AreaTextSnapshot,
  type AsyncAreaTextMeasurementAdapter,
  type AreaTextMeasurementAdapter,
} from '../src/illustrator/core/ie3jp/tools/modify/area-text-measurement.js';

type Mock = {
  height: number;
  originalHeight: number;
  fitAt: number;
  top: number;
  left: number;
  width: number;
  contents: string;
  formatting: AreaTextSnapshot['formatting'];
  eligible?: boolean;
  drift?: boolean;
  formattingDrift?: boolean;
  throwOnEligibility?: boolean;
  throwOnProbe?: boolean;
  throwOnRestore?: boolean;
  iterations: number;
  events: string[];
  story?: { textFrames?: { length?: unknown } };
};

function mock(overrides: Partial<Mock> = {}): Mock {
  return {
    height: 100, originalHeight: 100, fitAt: 180, top: 500, left: 20, width: 240,
    contents: 'unchanged', formatting: {
      fontSizes: [18], leading: [22], autoLeading: [false], tracking: [0],
      paragraphs: [{ justification: 'left', spaceBefore: 0, spaceAfter: 0 }],
    },
    iterations: 0, events: [], ...overrides,
  };
}

function snapshot(target: Mock): AreaTextSnapshot {
  return {
    uuid: 'mock', top: target.drift && target.height !== target.originalHeight ? target.top + 1 : target.top,
    left: target.left, width: target.width, height: target.height, contents: target.contents,
    formatting: target.formattingDrift && target.height !== target.originalHeight
      ? { ...target.formatting, tracking: [99] }
      : target.formatting,
  };
}

function syncAdapter(): AreaTextMeasurementAdapter<Mock> {
  return {
    checkEligibility: (target) => target.eligible === false ? { eligible: false, reason: 'unsupported' } : { eligible: true },
    snapshot,
    isOverset: (target) => target.height < target.fitAt,
    setHeight: (target, height) => {
      if (target.throwOnProbe && height !== target.originalHeight) throw new Error('probe failed');
      if (target.throwOnRestore && height === target.originalHeight && target.height !== target.originalHeight) throw new Error('restore failed');
      target.height = height; target.iterations += 1;
    },
  };
}

function asyncAdapter(delay = false): AsyncAreaTextMeasurementAdapter<Mock> {
  const pause = async () => { if (delay) await new Promise<void>((resolve) => setTimeout(resolve, 0)); };
  return {
    checkEligibility: async (target) => {
      await pause();
      if (target.throwOnEligibility) throw new Error('eligibility rejected');
      return target.eligible === false ? { eligible: false, reason: 'unsupported' } : { eligible: true };
    },
    snapshot: async (target) => { await pause(); target.events.push(`snapshot:${target.height}`); return snapshot(target); },
    isOverset: async (target) => { await pause(); target.events.push(`overset:${target.height}`); return target.height < target.fitAt; },
    setHeight: async (target, height) => {
      await pause();
      if (target.throwOnProbe && height !== target.originalHeight) throw new Error('probe failed');
      if (target.throwOnRestore && height === target.originalHeight && target.height !== target.originalHeight) throw new Error('restore failed');
      target.height = height; target.iterations += 1; target.events.push(`height:${height}`);
    },
  };
}

test('async already-fit result matches sync without mutation', async () => {
  const sync = mock({ fitAt: 80 });
  const asyncTarget = mock({ fitAt: 80 });
  assert.deepEqual(await measureAreaTextRequiredHeightAsync(asyncTarget, asyncAdapter()), measureAreaTextRequiredHeight(sync, syncAdapter()));
  assert.equal(asyncTarget.iterations, 0);
});

test('async growth result matches sync and never shrinks', async () => {
  const sync = mock({ fitAt: 230 });
  const asyncTarget = mock({ fitAt: 230 });
  const expected = measureAreaTextRequiredHeight(sync, syncAdapter());
  const actual = await measureAreaTextRequiredHeightAsync(asyncTarget, asyncAdapter());
  assert.deepEqual(actual, expected);
  assert.equal(asyncTarget.height, asyncTarget.originalHeight);
  if (actual.status === 'SUCCESS') assert.ok(actual.measuredHeight >= asyncTarget.originalHeight);
});

test('async already-fitting AreaText never shrinks', async () => {
  const target = mock({ fitAt: 60 });
  const result = await measureAreaTextRequiredHeightAsync(target, asyncAdapter());
  assert.equal(result.status, 'SUCCESS');
  if (result.status === 'SUCCESS') {
    assert.equal(result.measuredHeight, target.originalHeight);
    assert.equal(result.growthDelta, 0);
  }
  assert.equal(target.iterations, 0);
});

test('async adapter delay preserves the bounded measurement result', async () => {
  const delayed = mock({ fitAt: 180 });
  const immediate = mock({ fitAt: 180 });
  assert.deepEqual(await measureAreaTextRequiredHeightAsync(delayed, asyncAdapter(true)), await measureAreaTextRequiredHeightAsync(immediate, asyncAdapter()));
});

test('async eligibility rejection performs no mutation', async () => {
  const target = mock({ eligible: false });
  const result = await measureAreaTextRequiredHeightAsync(target, asyncAdapter());
  assert.deepEqual(result, { status: 'UNSUPPORTED', reason: 'unsupported' });
  assert.equal(target.iterations, 0);
});

test('async eligibility Promise rejection is safely classified before mutation', async () => {
  const target = mock({ throwOnEligibility: true });
  const result = await measureAreaTextRequiredHeightAsync(target, asyncAdapter());
  assert.deepEqual(result, { status: 'UNSUPPORTED', reason: 'eligibility rejected' });
  assert.equal(target.iterations, 0);
});

test('async probe rejection restores the original height', async () => {
  const target = mock({ fitAt: 150, throwOnProbe: true });
  const result = await measureAreaTextRequiredHeightAsync(target, asyncAdapter());
  assert.equal(result.status, 'MEASUREMENT_FAILED_RESTORED');
  assert.equal(target.height, target.originalHeight);
  assert.ok(target.events.includes('height:100'));
});

test('async restore failure remains distinct', async () => {
  const target = mock({ fitAt: 150, throwOnRestore: true });
  assert.equal((await measureAreaTextRequiredHeightAsync(target, asyncAdapter())).status, 'RESTORE_FAILED');
});

test('async geometry and formatting invariant drift have the same safe failure semantics', async () => {
  for (const target of [mock({ fitAt: 150, drift: true }), mock({ fitAt: 150, formattingDrift: true })]) {
    const result = await measureAreaTextRequiredHeightAsync(target, asyncAdapter());
    assert.equal(result.status, 'MEASUREMENT_FAILED_RESTORED');
    assert.equal(target.height, target.originalHeight);
  }
});

test('async threading eligibility remains fail-closed', async () => {
  const target = mock({ story: { textFrames: { length: 2 } } });
  const adapter = asyncAdapter();
  adapter.checkEligibility = async (item) => checkAreaTextThreadingEligibility(item);
  assert.equal((await measureAreaTextRequiredHeightAsync(target, adapter)).status, 'UNSUPPORTED');
  assert.equal(target.iterations, 0);
});
