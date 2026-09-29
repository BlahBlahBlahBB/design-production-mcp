import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDesignProductionMcpServer } from '../src/mcp/server.js';
import { modifyPropertiesSchema } from '../src/illustrator/core/ie3jp/tools/modify/modify-object.js';

function source(relative: string): string {
  return readFileSync(new URL(relative, import.meta.url), 'utf8');
}

test('layout-affecting modify_objects uses an internal-only bounded completion mode', () => {
  const handler = source('../src/illustrator/core/ie3jp/tools/modify/modify-objects.js');
  assert.match(handler, /const internalSmartTextCompletionOnly = mutations\.some/);
  assert.match(handler, /internal_smart_text_completion_only: internalSmartTextCompletionOnly/);
  assert.match(handler, /params\.internal_smart_text_completion_only === true/);
  const schemaLine = handler.split('\n').find((line) => line.includes('inputSchema:'));
  assert.ok(schemaLine);
  assert.doesNotMatch(schemaLine, /internal_smart_text_completion_only/);
});

test('bounded completion reads requested text writes directly before success and skips full appearance traversal', () => {
  const core = source('../src/illustrator/core/ie3jp/tools/modify/batch-object-core.js');
  assert.match(core, /function mutationCompletionForItem/);
  assert.match(core, /String\(item\.contents\) !== expected/);
  assert.match(core, /actualFont\.name !== props\.font_name/);
  assert.match(core, /Math\.abs\(actualSize - props\.font_size\) > 0\.01/);
  assert.match(core, /if \(smartTextCompletionOnly\)[\s\S]*completion: completion/);
  assert.match(core, /return \{ success: errors\.length === 0, uuid: uuid, errors: errors, verified: visualAppearanceForItem/);
  assert.match(core, /readTextAppearance/);
});

test('public modify_objects schema and tool count remain unchanged', () => {
  assert.deepEqual(Object.keys(modifyPropertiesSchema.shape), [
    'position', 'size', 'fill', 'stroke', 'opacity', 'rotation', 'rotation_mode',
    'name', 'hidden', 'locked', 'contents', 'font_name', 'font_size',
  ]);
  const registered = (createDesignProductionMcpServer() as unknown as { _registeredTools: Record<string, unknown> })._registeredTools;
  assert.equal(Object.keys(registered).length, 94);
  assert.ok(registered.modify_objects);
});

test('the Smart Transaction ordering and frozen C3/C4/C5 dependencies stay unchanged', () => {
  const transaction = source('../src/illustrator/core/smart-text-auto-flow/transaction.js');
  const snapshot = transaction.indexOf('snapshot = await request.adapter.snapshotMutation');
  const discovery = transaction.indexOf('const discovery = discoverAutoFlow');
  const mutation = transaction.indexOf('result = await request.executeMutation', discovery);
  const measurement = transaction.indexOf('const measurement = await measureSources');
  assert.ok(snapshot < discovery);
  assert.ok(discovery < mutation);
  assert.ok(mutation < measurement);
  const plan = transaction.indexOf('plan = planVerticalFlow');
  const verification = transaction.indexOf('verification = await verifyFinal(request.adapter, discovery.orderedBlocks', plan);
  assert.ok(measurement < plan);
  assert.ok(plan < verification);
});
