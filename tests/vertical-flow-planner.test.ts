import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_FLOW_ITEMS, planVerticalFlow, type FlowPlannerItem } from '../src/illustrator/core/ie3jp/tools/modify/vertical-flow-planner.js';

function item(uuid: string, top: number, height: number, options: Partial<FlowPlannerItem> = {}): FlowPlannerItem {
  return {
    uuid,
    originalBounds: { left: 10, top, right: 110, bottom: top - height },
    resizable: false,
    ...options,
  };
}

function gap(plan: ReturnType<typeof planVerticalFlow>, index: number): number {
  return plan[index].targetBounds.bottom - plan[index + 1].targetBounds.top;
}

test('keeps one fixed-size item unchanged', () => {
  const [planned] = planVerticalFlow([item('a', 100, 20)]);
  assert.deepEqual(planned.targetBounds, { left: 10, top: 100, right: 110, bottom: 80 });
  assert.equal(planned.deltaY, 0);
  assert.equal(planned.resized, false);
});

test('grows a resizable item downward from a fixed top', () => {
  const [planned] = planVerticalFlow([item('a', 100, 20, { resizable: true, measuredHeight: 35 })]);
  assert.equal(planned.targetBounds.top, 100);
  assert.equal(planned.targetBounds.bottom, 65);
  assert.equal(planned.deltaY, 0);
  assert.equal(planned.resized, true);
});

test('growth-only planning never shrinks below original height', () => {
  const [planned] = planVerticalFlow([item('a', 100, 20, { resizable: true, measuredHeight: 10 })]);
  assert.equal(planned.targetHeight, 20);
  assert.equal(planned.resized, false);
});

test('preserves independent gaps while pushing downstream items', () => {
  const input = [
    item('title', 300, 30),
    item('p1', 218, 40, { resizable: true, measuredHeight: 80 }),
    item('p2', 154, 25),
  ];
  const plan = planVerticalFlow(input);
  assert.equal(plan[0].deltaY, 0);
  assert.equal(plan[1].targetBounds.top, 218);
  assert.equal(plan[1].targetBounds.bottom, 138);
  assert.equal(plan[2].deltaY, -40);
  assert.equal(gap(plan, 0), 52);
  assert.equal(gap(plan, 1), 24);
});

test('accumulates growth from multiple resizable items', () => {
  const plan = planVerticalFlow([
    item('a', 300, 20, { resizable: true, measuredHeight: 40 }),
    item('b', 270, 20, { resizable: true, measuredHeight: 50 }),
    item('c', 240, 20),
  ]);
  assert.equal(plan[1].deltaY, -20);
  assert.equal(plan[2].deltaY, -50);
  assert.equal(gap(plan, 0), 10);
  assert.equal(gap(plan, 1), 10);
});

test('moves fixed participants without resizing them', () => {
  const plan = planVerticalFlow([
    item('area', 300, 20, { resizable: true, measuredHeight: 40 }),
    item('point', 270, 12),
    item('area-2', 248, 20, { resizable: true, measuredHeight: 30 }),
  ]);
  assert.equal(plan[1].targetHeight, 12);
  assert.equal(plan[1].deltaY, -20);
  assert.equal(plan[2].targetHeight, 30);
});

test('accepts zero gaps and preserves widths and invariants', () => {
  const plan = planVerticalFlow([item('a', 100, 20), item('b', 80, 20)]);
  assert.equal(gap(plan, 0), 0);
  for (const planned of plan) {
    assert.equal(planned.targetBounds.right - planned.targetBounds.left, 100);
    assert.equal(planned.targetHeight, planned.originalHeight);
  }
});

test('rejects invalid order, duplicate UUIDs, invalid bounds, and negative gaps', () => {
  assert.throws(() => planVerticalFlow([item('a', 100, 20), item('b', 90, 20)]), /gap/);
  assert.throws(() => planVerticalFlow([item('a', 100, 20), item('a', 70, 20)]), /duplicate uuid/);
  assert.throws(() => planVerticalFlow([item('a', 100, 0)]), /positive/);
  assert.throws(() => planVerticalFlow([item('', 100, 20)]), /non-empty/);
  assert.throws(() => planVerticalFlow([item('a', 100, 20, { resizable: true, measuredHeight: Number.NaN })]), /finite/);
  assert.throws(() => planVerticalFlow([item('a', 100, 20, { resizable: true, measuredHeight: Number.POSITIVE_INFINITY })]), /finite/);
  assert.throws(() => planVerticalFlow([item('a', 100, 20, { resizable: true, measuredHeight: 0 })]), /positive/);
});

test('accepts 50 items and rejects 51 without artboard constraints', () => {
  const fifty = Array.from({ length: MAX_FLOW_ITEMS }, (_, index) => item(String(index), 100 - index * 20, 20));
  assert.equal(planVerticalFlow(fifty).length, MAX_FLOW_ITEMS);
  assert.throws(() => planVerticalFlow([...fifty, item('fifty-one', -900, 20)]), /at most 50/);
  const outside = planVerticalFlow([item('a', 100, 20, { resizable: true, measuredHeight: 500 })]);
  assert.equal(outside[0].targetBounds.bottom, -400);
});

test('downward movement has a negative deltaY', () => {
  const plan = planVerticalFlow([item('a', 100, 20, { resizable: true, measuredHeight: 40 }), item('b', 70, 20)]);
  assert.equal(plan[1].deltaY, -20);
  assert.ok(plan.every((planned) => planned.deltaY <= 0));
});

test('is deterministic and does not mutate input bounds', () => {
  const input = [item('a', 100, 20, { resizable: true, measuredHeight: 40 }), item('b', 70, 20)];
  const before = JSON.stringify(input);
  assert.deepEqual(planVerticalFlow(input), planVerticalFlow(input));
  assert.equal(JSON.stringify(input), before);
});
