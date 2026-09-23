import test from 'node:test';
import assert from 'node:assert/strict';
import { createDesignProductionMcpServer } from '../src/mcp/server.js';
import { repeatLayoutSchema, repeatLayoutJsxCode } from '../src/illustrator/core/ie3jp/tools/modify/repeat-layout.js';
import { planRepeatLayout } from '../src/illustrator/core/ie3jp/tools/repeat-layout-planner.js';

const source = repeatLayoutJsxCode;

test('repeat_layout is registered exactly once with the five-field V1 schema', () => {
  const registered = (createDesignProductionMcpServer() as unknown as { _registeredTools: Record<string, unknown> })._registeredTools;
  assert.ok(registered.repeat_layout);
  assert.deepEqual(Object.keys(repeatLayoutSchema.shape), ['target_uuid', 'rows', 'columns', 'horizontal_spacing', 'vertical_spacing']);
  assert.equal(repeatLayoutSchema.safeParse({ target_uuid:'x', rows:1, columns:1, horizontal_spacing:0, vertical_spacing:0 }).success, true);
  assert.equal(repeatLayoutSchema.safeParse({ target_uuid:'', rows:1, columns:1, horizontal_spacing:0, vertical_spacing:0 }).success, false);
  assert.equal(repeatLayoutSchema.safeParse({ target_uuid:'x', rows:1, columns:201, horizontal_spacing:0, vertical_spacing:0 }).success, false);
  assert.equal(repeatLayoutSchema.safeParse({ target_uuid:'x', rows:1, columns:1, horizontal_spacing:-1, vertical_spacing:0 }).success, false);
  assert.equal(repeatLayoutSchema.safeParse({ target_uuid:'x', rows:1, columns:1, horizontal_spacing:0, vertical_spacing:Number.NaN }).success, false);
});

test('1x1 returns only the original and creates no duplicate', () => {
  const plan = planRepeatLayout({ sourceBounds:{ left:0, top:20, right:10, bottom:0 }, rows:1, columns:1, horizontalSpacing:0, verticalSpacing:0 });
  assert.equal(plan.length, 1);
  assert.equal(plan[0].is_original, true);
  assert.match(source, /for \(var ci = 1; ci < cells\.length; ci\+\+\)/, 'the loop boundary must be generated-cell-only');
  assert.match(source, /generated_count:generated\.length/);
});

test('planner and executor preserve 1xN, Nx1, and 2x3 row-major semantics', () => {
  assert.equal(planRepeatLayout({ sourceBounds:{ left:0, top:20, right:10, bottom:0 }, rows:1, columns:3, horizontalSpacing:2, verticalSpacing:3 }).length, 3);
  assert.equal(planRepeatLayout({ sourceBounds:{ left:0, top:20, right:10, bottom:0 }, rows:3, columns:1, horizontalSpacing:2, verticalSpacing:3 }).length, 3);
  const plan = planRepeatLayout({ sourceBounds:{ left:0, top:20, right:10, bottom:0 }, rows:2, columns:3, horizontalSpacing:2, verticalSpacing:3 });
  assert.deepEqual(plan.map((cell) => [cell.row, cell.column]), [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2]]);
  assert.match(source, /var horizontalStep = sourceBounds\.width \+ hGap/);
  assert.match(source, /var verticalStep = sourceBounds\.height \+ vGap/);
});

test('executor uses duplicate, relative translate, and existing Y-axis convention', () => {
  assert.match(source, /var duplicate = source\.duplicate\(\)/);
  assert.match(source, /createdRefs\.push\(duplicate\)/);
  assert.match(source, /duplicate\.translate\(cell\.offset_x, -cell\.offset_y\)/);
  assert.match(source, /top-left, positive-Y-down; Illustrator translate is native Y-up/);
});

test('UUID fallback is limited to new duplicates and generated UUIDs are unique', () => {
  assert.match(source, /ensureUUID\(duplicate, true\)/);
  assert.doesNotMatch(source, /ensureUUID\(source/);
  assert.match(source, /duplicateUuid === params\.target_uuid \|\| generatedUuids\[duplicateUuid\]/);
  assert.match(source, /uuid:params\.target_uuid, bounds:sourceAfter, is_original:true/);
});

test('bounds and source invariants use 0.01 tolerance', () => {
  assert.match(source, /Math\.abs\(a - b\) <= 0\.01/);
  assert.match(source, /Source bounds changed during repeat layout/);
  assert.match(source, /Generated bounds verification failed/);
});

test('rollback attempts all created references in reverse order with explicit states', () => {
  assert.match(source, /for \(var ri = createdRefs\.length - 1; ri >= 0; ri--\)/);
  assert.match(source, /status:"ROLLED_BACK"/);
  assert.match(source, /status:"ROLLBACK_FAILED", partial_mutation:true/);
  assert.match(source, /status:"FAILED_NO_MUTATION"/);
});

test('V1 does not promise exact z-order or introduce a transaction framework', () => {
  assert.doesNotMatch(source, /z.order|z_order|setZOrder|set_z_order/);
  assert.doesNotMatch(source, /transaction|Transaction/);
});
