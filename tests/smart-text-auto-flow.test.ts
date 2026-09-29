import test from 'node:test';
import assert from 'node:assert/strict';
import {
  discoverAutoFlow,
  isLayoutAffectingMutation,
  normalizeLayoutMutation,
  orderLayoutBlocks,
  planCumulativeDownwardDisplacement,
  type AutoFlowContext,
  type LayoutBounds,
  type LayoutItemSnapshot,
  type LayoutMutation,
} from '../src/illustrator/core/smart-text-auto-flow/index.js';

function bounds(left: number, top: number, width = 100, height = 20): LayoutBounds {
  return { left, top, right: left + width, bottom: top - height, width, height };
}

function item(uuid: string, type: LayoutItemSnapshot['type'], top: number, options: Partial<LayoutItemSnapshot> = {}): LayoutItemSnapshot {
  return {
    uuid,
    type,
    bounds: bounds(10, top),
    artboardIndex: 0,
    parentGroupUuids: [],
    role: 'CONTENT',
    ...options,
  };
}

function source(targetUuid = 'a', changedProperties = ['contents']): LayoutMutation {
  const normalized = normalizeLayoutMutation({ targetUuid, changedProperties });
  assert.ok(normalized);
  return normalized;
}

const artboard: AutoFlowContext = { kind: 'ARTBOARD', artboardIndex: 0 };

function owners(result: ReturnType<typeof discoverAutoFlow>): string[] {
  return result.orderedBlocks.map((block) => block.ownerUuid);
}

test('classifies only explicit layout-affecting text and typography mutations', () => {
  for (const property of ['contents', 'font_family', 'font_style', 'font_size', 'tracking', 'leading', 'auto_leading', 'paragraph_alignment', 'space_after']) {
    assert.equal(isLayoutAffectingMutation({ changedProperties: [property] }), true, property);
  }
  assert.equal(isLayoutAffectingMutation({ changedProperties: ['fill', 'stroke', 'opacity'] }), false);
  assert.equal(isLayoutAffectingMutation({ changedProperties: ['new_future_property'] }), false);
  assert.equal(isLayoutAffectingMutation({ changedProperties: 'contents' }), false);
  assert.equal(normalizeLayoutMutation({ targetUuid: 'a', changedProperties: ['fill'] })?.layoutAffecting, false);
});

test('discovers a simple ungrouped vertical stack in planner order', () => {
  const result = discoverAutoFlow({ context: artboard, items: [item('a', 'AREA_TEXT', 300), item('b', 'PATH', 260), item('c', 'PATH', 220)], mutations: [source()] });
  assert.equal(result.status, 'SUCCESS');
  assert.deepEqual(owners(result), ['a', 'b', 'c']);
});

test('uses a downstream GroupItem as one atomic block', () => {
  const result = discoverAutoFlow({ context: artboard, items: [item('a', 'AREA_TEXT', 300), item('group', 'GROUP', 260), item('button', 'PATH', 250, { parentGroupUuids: ['group'] }), item('c', 'PATH', 220)], mutations: [source()] });
  assert.equal(result.status, 'SUCCESS');
  assert.deepEqual(owners(result), ['a', 'group', 'c']);
});

test('multiple children and a supplied group normalize to one move owner', () => {
  const context: AutoFlowContext = { kind: 'EXPLICIT_TARGET_SET', targetUuids: ['a', 'group', 'child-1', 'child-2', 'c'], artboardIndex: 0 };
  const result = discoverAutoFlow({ context, items: [item('a', 'AREA_TEXT', 300), item('group', 'GROUP', 260), item('child-1', 'PATH', 255, { parentGroupUuids: ['group'] }), item('child-2', 'PATH', 250, { parentGroupUuids: ['group'] }), item('c', 'PATH', 220)], mutations: [source()] });
  assert.equal(result.status, 'SUCCESS');
  assert.deepEqual(owners(result), ['a', 'group', 'c']);
});

test('nested group candidates deduplicate to their nearest relevant group', () => {
  const result = discoverAutoFlow({ context: artboard, items: [item('a', 'AREA_TEXT', 300), item('outer', 'GROUP', 260), item('inner', 'GROUP', 255, { parentGroupUuids: ['outer'] }), item('child', 'PATH', 250, { parentGroupUuids: ['inner', 'outer'] }), item('c', 'PATH', 220)], mutations: [source()] });
  assert.equal(result.status, 'SUCCESS');
  assert.deepEqual(owners(result), ['a', 'inner', 'c']);
  assert.ok(!owners(result).includes('outer'));
  assert.ok(!owners(result).includes('child'));
});

test('a source AreaText inside a group retains its resize source while its group is not displaced by its own growth', () => {
  const result = discoverAutoFlow({ context: artboard, items: [item('group', 'GROUP', 300), item('a', 'AREA_TEXT', 300, { parentGroupUuids: ['group'] }), item('c', 'PATH', 240)], mutations: [source()] });
  assert.equal(result.status, 'SUCCESS');
  assert.deepEqual(owners(result), ['group', 'c']);
  assert.deepEqual(result.orderedBlocks[0].sourceUuids, ['a']);
  const plan = planCumulativeDownwardDisplacement(result.orderedBlocks, [{ ownerUuid: 'group', growth: 60 }]);
  assert.deepEqual(plan.map((entry) => entry.downwardDisplacement), [0, 60]);
});

test('two-column candidates are not captured by the source lane', () => {
  const result = discoverAutoFlow({ context: artboard, items: [item('a', 'AREA_TEXT', 300), item('left', 'PATH', 260), item('right', 'PATH', 260, { bounds: bounds(180, 260) }), item('footer', 'PATH', 220)], mutations: [source()] });
  assert.equal(result.status, 'SUCCESS');
  assert.deepEqual(owners(result), ['a', 'left', 'footer']);
});

test('separate cards do not become one artboard flow', () => {
  const result = discoverAutoFlow({ context: artboard, items: [item('a', 'AREA_TEXT', 300), item('card-a-bottom', 'GROUP', 250), item('card-b', 'GROUP', 250, { bounds: bounds(180, 250) }), item('footer', 'PATH', 200)], mutations: [source()] });
  assert.equal(result.status, 'SUCCESS');
  assert.deepEqual(owners(result), ['a', 'card-a-bottom', 'footer']);
});

test('artboard-sized backgrounds and declared decorations are excluded', () => {
  const result = discoverAutoFlow({ context: artboard, artboardBounds: bounds(0, 400, 400, 400), items: [item('a', 'AREA_TEXT', 300), item('background', 'PATH', 300, { bounds: bounds(0, 400, 400, 400), role: 'BACKGROUND' }), item('decoration', 'PATH', 250, { role: 'DECORATIVE' }), item('c', 'PATH', 220)], mutations: [source()] });
  assert.equal(result.status, 'SUCCESS');
  assert.deepEqual(owners(result), ['a', 'c']);
});

test('locked, hidden, and clipping candidates fail closed when they occupy the source lane', () => {
  for (const unsafe of [
    item('locked', 'PATH', 260, { locked: true }),
    item('hidden', 'PATH', 260, { hidden: true }),
    item('clip', 'GROUP', 260, { isClippingGroup: true }),
  ]) {
    const result = discoverAutoFlow({ context: artboard, items: [item('a', 'AREA_TEXT', 300), unsafe, item('c', 'PATH', 220)], mutations: [source()] });
    assert.equal(result.status, 'AUTO_FLOW_UNSUPPORTED_HIERARCHY');
  }
});

test('partial horizontal overlap fails closed rather than guessing a lane', () => {
  const result = discoverAutoFlow({ context: artboard, items: [item('a', 'AREA_TEXT', 300), item('ambiguous', 'PATH', 260, { bounds: bounds(70, 260) }), item('c', 'PATH', 220)], mutations: [source()] });
  assert.equal(result.status, 'AUTO_FLOW_AMBIGUOUS');
});

test('same-Y ordering is deterministic by X then UUID, while same-row flow discovery fails closed', () => {
  const sameRow = [
    { ownerUuid: 'right', ownerType: 'PATH' as const, bounds: bounds(60, 260), sourceUuids: [] },
    { ownerUuid: 'left', ownerType: 'PATH' as const, bounds: bounds(10, 260), sourceUuids: [] },
  ];
  assert.deepEqual(orderLayoutBlocks(sameRow).map((block) => block.ownerUuid), ['left', 'right']);
  assert.deepEqual(orderLayoutBlocks(sameRow), orderLayoutBlocks(sameRow));
  const result = discoverAutoFlow({ context: artboard, items: [item('a', 'AREA_TEXT', 300), item('right', 'PATH', 260, { bounds: bounds(60, 260) }), item('left', 'PATH', 260, { bounds: bounds(10, 260) }), item('c', 'PATH', 220)], mutations: [source()] });
  assert.equal(result.status, 'AUTO_FLOW_AMBIGUOUS');
});

test('overlapping vertical owners fail closed', () => {
  const result = discoverAutoFlow({ context: artboard, items: [item('a', 'AREA_TEXT', 300), item('overlap', 'PATH', 290), item('c', 'PATH', 220)], mutations: [source()] });
  assert.equal(result.status, 'AUTO_FLOW_AMBIGUOUS');
});

test('missing context and empty downstream contexts return explicit non-success statuses', () => {
  assert.equal(discoverAutoFlow({ context: null, items: [item('a', 'AREA_TEXT', 300)], mutations: [source()] }).status, 'AUTO_FLOW_CONTEXT_UNRESOLVED');
  assert.equal(discoverAutoFlow({ context: artboard, items: [item('a', 'AREA_TEXT', 300)], mutations: [source()] }).status, 'AUTO_FLOW_NO_DOWNSTREAM_BLOCKS');
});

test('multiple mutations use one cumulative positive-growth planning model', () => {
  const blocks = ['a', 'b', 'c', 'd'].map((ownerUuid, index) => ({ ownerUuid, ownerType: index < 3 ? 'AREA_TEXT' as const : 'PATH' as const, bounds: bounds(10, 300 - index * 40), sourceUuids: index < 3 ? [ownerUuid] : [] }));
  const plan = planCumulativeDownwardDisplacement(blocks, [{ ownerUuid: 'a', growth: 80 }, { ownerUuid: 'b', growth: 40 }, { ownerUuid: 'c', growth: 25 }]);
  assert.deepEqual(plan.map((entry) => entry.downwardDisplacement), [0, 80, 120, 145]);
  assert.deepEqual(plan.map((entry) => entry.positiveGrowth), [80, 40, 25, 0]);
});

test('negative growth never creates an upward pull', () => {
  const blocks = ['a', 'b', 'c'].map((ownerUuid, index) => ({ ownerUuid, ownerType: 'AREA_TEXT' as const, bounds: bounds(10, 300 - index * 40), sourceUuids: [ownerUuid] }));
  const plan = planCumulativeDownwardDisplacement(blocks, [{ ownerUuid: 'a', growth: -20 }, { ownerUuid: 'b', growth: 40 }]);
  assert.deepEqual(plan.map((entry) => entry.downwardDisplacement), [0, 0, 40]);
  assert.equal(plan[0].positiveGrowth, 0);
});

test('the cumulative planner rejects duplicate physical owners', () => {
  const duplicate = { ownerUuid: 'group', ownerType: 'GROUP' as const, bounds: bounds(10, 300), sourceUuids: [] };
  assert.throws(() => planCumulativeDownwardDisplacement([duplicate, duplicate], []), /duplicate layout owner/);
});
