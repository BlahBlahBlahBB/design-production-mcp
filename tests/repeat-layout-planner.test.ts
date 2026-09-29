import test from 'node:test';
import assert from 'node:assert/strict';
import { planRepeatLayout } from '../src/illustrator/core/ie3jp/tools/repeat-layout-planner.js';

const bounds = { left: 10, top: 50, right: 110, bottom: 30 };

test('plans 1x1 with the source as the original cell', () => {
  assert.deepEqual(planRepeatLayout({ sourceBounds: bounds, rows: 1, columns: 1, horizontalSpacing: 0, verticalSpacing: 0 }), [{
    row: 0, column: 0, offset_x: 0, offset_y: 0, targetBounds: bounds, is_original: true,
  }]);
});

test('plans 1xN and Nx1 grids', () => {
  assert.equal(planRepeatLayout({ sourceBounds: bounds, rows: 1, columns: 3, horizontalSpacing: 5, verticalSpacing: 7 }).length, 3);
  assert.equal(planRepeatLayout({ sourceBounds: bounds, rows: 3, columns: 1, horizontalSpacing: 5, verticalSpacing: 7 }).length, 3);
});

test('plans 2x3 in deterministic row-major order', () => {
  const plan = planRepeatLayout({ sourceBounds: bounds, rows: 2, columns: 3, horizontalSpacing: 5, verticalSpacing: 7 });
  assert.deepEqual(plan.map(({ row, column }) => [row, column]), [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]]);
  assert.deepEqual(plan[1].targetBounds, { left: 115, top: 50, right: 215, bottom: 30 });
  assert.deepEqual(plan[3].targetBounds, { left: 10, top: 77, right: 110, bottom: 57 });
  assert.equal(plan[0].is_original, true);
  assert.ok(plan.slice(1).every((cell) => cell.is_original === false));
});

test('zero spacing makes adjacent cells touch edges', () => {
  const plan = planRepeatLayout({ sourceBounds: bounds, rows: 1, columns: 2, horizontalSpacing: 0, verticalSpacing: 0 });
  assert.equal(plan[1].targetBounds.left, bounds.right);
  assert.equal(plan[1].targetBounds.right, bounds.right + (bounds.right - bounds.left));
});

test('accepts the 199 and 200 cell boundaries', () => {
  assert.equal(planRepeatLayout({ sourceBounds: bounds, rows: 1, columns: 199, horizontalSpacing: 0, verticalSpacing: 0 }).length, 199);
  assert.equal(planRepeatLayout({ sourceBounds: bounds, rows: 10, columns: 20, horizontalSpacing: 0, verticalSpacing: 0 }).length, 200);
});

test('rejects over-limit, invalid dimensions, negative spacing, and non-finite values', () => {
  const valid = { sourceBounds: bounds, rows: 1, columns: 1, horizontalSpacing: 0, verticalSpacing: 0 };
  assert.throws(() => planRepeatLayout({ ...valid, rows: 201 }), />= 1|<= 200/);
  assert.throws(() => planRepeatLayout({ ...valid, rows: 2, columns: 101 }), /<= 200/);
  assert.throws(() => planRepeatLayout({ ...valid, rows: 1.5 }), /integer/);
  assert.throws(() => planRepeatLayout({ ...valid, columns: 0 }), /integer/);
  assert.throws(() => planRepeatLayout({ ...valid, horizontalSpacing: -1 }), />= 0/);
  assert.throws(() => planRepeatLayout({ ...valid, verticalSpacing: Number.NaN }), /finite/);
  assert.throws(() => planRepeatLayout({ ...valid, sourceBounds: { ...bounds, right: Number.POSITIVE_INFINITY } }), /finite/);
  assert.throws(() => planRepeatLayout({ ...valid, sourceBounds: { ...bounds, right: 10 } }), /positive/);
});

test('is deterministic for identical input', () => {
  const input = { sourceBounds: bounds, rows: 4, columns: 5, horizontalSpacing: 3, verticalSpacing: 4 };
  assert.deepEqual(planRepeatLayout(input), planRepeatLayout(input));
});
