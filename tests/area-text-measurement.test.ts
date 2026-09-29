import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AREA_TEXT_THREADING_STATE_UNAVAILABLE_REASON,
  MAX_AREA_TEXT_GROWTH_FACTOR,
  MAX_AREA_TEXT_MEASUREMENT_ITERATIONS,
  measureAreaTextRequiredHeight,
  checkAreaTextThreadingEligibility,
  THREADED_AREA_TEXT_UNSUPPORTED_REASON,
  type AreaTextMeasurementAdapter,
  type AreaTextSnapshot,
} from '../src/illustrator/core/ie3jp/tools/modify/area-text-measurement.js';

type Mock = {
  height: number;
  originalHeight: number;
  fitAt: number;
  overset: boolean;
  top: number;
  left: number;
  width: number;
  contents: string;
  formatting: AreaTextSnapshot['formatting'];
  eligible?: boolean;
  reason?: string;
  drift?: 'top' | 'width';
  throwOnHeight?: boolean;
  throwOnProbe?: boolean;
  throwOnRestore?: boolean;
  restoreUnverifiable?: boolean;
  iterations: number;
};

function mock(overrides: Partial<Mock> = {}): Mock {
  return {
    height: 100, originalHeight: 100, fitAt: 180, overset: true, top: 500, left: 20, width: 240,
    contents: 'unchanged', formatting: { fontSizes: [18, 16], leading: [22, 22], autoLeading: [false, false], tracking: [10, 0], paragraphs: [{ justification: 'left', spaceBefore: 3, spaceAfter: 4 }] },
    iterations: 0, ...overrides,
  };
}

function adapter(): AreaTextMeasurementAdapter<Mock> {
  return {
    checkEligibility: (target) => ({ eligible: target.eligible !== false, reason: target.reason }),
    snapshot: (target) => ({ uuid: 'mock', top: target.drift === 'top' && target.height !== target.originalHeight ? target.top + 1 : target.restoreUnverifiable && target.height === target.originalHeight && target.iterations > 0 ? target.top + 1 : target.top, left: target.left, width: target.drift === 'width' && target.height !== target.originalHeight ? target.width + 1 : target.width, height: target.height, contents: target.contents, formatting: target.formatting }),
    isOverset: (target) => target.overset = target.height < target.fitAt,
    setHeight: (target, height) => { if (target.throwOnHeight || target.throwOnProbe && height !== target.originalHeight) throw new Error('height assignment failed'); if (height === target.originalHeight && target.throwOnRestore) throw new Error('restore failed'); target.height = height; target.iterations += 1; },
  };
}

type ThreadingMock = Mock & {
  story?: { textFrames?: { length?: unknown } };
  nextFrame?: object | null;
};

function threadingAdapter(): AreaTextMeasurementAdapter<ThreadingMock> {
  const base = adapter();
  return {
    checkEligibility: checkAreaTextThreadingEligibility,
    snapshot: (target) => base.snapshot(target),
    isOverset: (target) => base.isOverset(target),
    setHeight: (target, height) => base.setHeight(target, height),
  };
}

function threadingMock(count: unknown, nextFrame: object | null = null): ThreadingMock {
  return { ...mock(), story: { textFrames: { length: count } }, nextFrame };
}

test('already-fit returns original height without mutation', () => {
  const target = mock({ overset: false, fitAt: 80 });
  const result = measureAreaTextRequiredHeight(target, adapter());
  assert.deepEqual(result, { status: 'SUCCESS', originalHeight: 100, measuredHeight: 100, growthDelta: 0, alreadyFit: true, measurementIterations: 0 });
  assert.equal(target.iterations, 0);
});

test('finds a fitting height with exponential growth and binary refinement', () => {
  const target = mock({ fitAt: 230 });
  const result = measureAreaTextRequiredHeight(target, adapter());
  assert.equal(result.status, 'SUCCESS');
  if (result.status === 'SUCCESS') {
    assert.ok(result.measuredHeight >= 230);
    assert.equal(result.alreadyFit, false);
    assert.ok(result.measurementIterations > 1);
  }
  assert.equal(target.height, 100);
});

test('never shrinks and preserves plain formatting invariants', () => {
  for (const formatting of [mock().formatting, { ...mock().formatting, autoLeading: [true, true], leading: [21.6, 19.2] }]) {
    const target = mock({ fitAt: 60, overset: false, formatting });
    const result = measureAreaTextRequiredHeight(target, adapter());
    assert.equal(result.status, 'SUCCESS');
    if (result.status === 'SUCCESS') assert.equal(result.measuredHeight, 100);
  }
});

test('drift fails closed and restores', () => {
  for (const drift of ['top', 'width'] as const) {
    const target = mock({ fitAt: 150, drift });
    const result = measureAreaTextRequiredHeight(target, adapter());
    assert.equal(result.status, 'MEASUREMENT_FAILED_RESTORED');
    assert.equal(target.height, 100);
  }
});

test('maximum bound and iteration budget fail closed', () => {
  const maxTarget = mock({ fitAt: 100 * MAX_AREA_TEXT_GROWTH_FACTOR + 1 });
  assert.equal(measureAreaTextRequiredHeight(maxTarget, adapter()).status, 'MEASUREMENT_FAILED_RESTORED');
  const iterationTarget = mock({ fitAt: Number.MAX_SAFE_INTEGER });
  assert.equal(measureAreaTextRequiredHeight(iterationTarget, adapter()).status, 'MEASUREMENT_FAILED_RESTORED');
  assert.ok(MAX_AREA_TEXT_MEASUREMENT_ITERATIONS > 0);
});

test('assignment and restoration failures are distinguished', () => {
  const assignment = mock({ throwOnHeight: true });
  assert.equal(measureAreaTextRequiredHeight(assignment, adapter()).status, 'RESTORE_FAILED');
  const restore = mock({ fitAt: 150, throwOnRestore: true });
  assert.equal(measureAreaTextRequiredHeight(restore, adapter()).status, 'RESTORE_FAILED');
});

test('probe failure with verified restoration is recoverable', () => {
  const target = mock({ fitAt: 150, throwOnProbe: true });
  const result = measureAreaTextRequiredHeight(target, adapter());
  assert.equal(result.status, 'MEASUREMENT_FAILED_RESTORED');
  assert.equal(target.height, 100);
});

test('unverifiable restoration overrides an otherwise recoverable result', () => {
  const target = mock({ fitAt: 150, restoreUnverifiable: true });
  const result = measureAreaTextRequiredHeight(target, adapter());
  assert.equal(result.status, 'RESTORE_FAILED');
  assert.equal(target.height, 100);
});

test('unsupported, threaded, rotated, and invalid geometry fail before mutation', () => {
  for (const reason of ['threaded', 'rotated', 'invalid geometry']) {
    const target = mock({ eligible: false, reason });
    const result = measureAreaTextRequiredHeight(target, adapter());
    assert.equal(result.status, 'UNSUPPORTED');
    assert.equal(target.iterations, 0);
  }
});

test('a single Story TextFrame is eligible even when nextFrame is non-null', () => {
  const target = threadingMock(1, {});
  assert.deepEqual(checkAreaTextThreadingEligibility(target), { eligible: true });
  assert.equal(measureAreaTextRequiredHeight(target, threadingAdapter()).status, 'SUCCESS');
  assert.equal(target.height, target.originalHeight);
});

test('multiple Story TextFrames are unsupported before mutation', () => {
  const target = threadingMock(2);
  assert.deepEqual(checkAreaTextThreadingEligibility(target), {
    eligible: false,
    reason: THREADED_AREA_TEXT_UNSUPPORTED_REASON,
  });
  assert.equal(measureAreaTextRequiredHeight(target, threadingAdapter()).status, 'UNSUPPORTED');
  assert.equal(target.iterations, 0);
});

test('unavailable Story TextFrame count fails closed before mutation', () => {
  const target = threadingMock(undefined);
  assert.deepEqual(checkAreaTextThreadingEligibility(target), {
    eligible: false,
    reason: AREA_TEXT_THREADING_STATE_UNAVAILABLE_REASON,
  });
  assert.equal(measureAreaTextRequiredHeight(target, threadingAdapter()).status, 'UNSUPPORTED');
  assert.equal(target.iterations, 0);
});

test('successful result is plain data only', () => {
  const result = measureAreaTextRequiredHeight(mock({ fitAt: 140 }), adapter());
  assert.equal(result.status, 'SUCCESS');
  assert.equal(Object.values(result).some((value) => typeof value === 'object' && value !== null), false);
});
