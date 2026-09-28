import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeAppleScript } from '../src/illustrator/core/ie3jp/executor/file-transport.js';
import {
  createVerticalFlowIllustratorAdapter,
  verticalFlowAdapterJsxCode,
  type VerticalFlowJsxRunner,
} from '../src/illustrator/core/ie3jp/tools/modify/vertical-flow-illustrator-adapter.js';

const formatting = {
  fontSizes: [12], leading: [14.4], autoLeading: [true], tracking: [0],
  paragraphs: [{ justification: 'left', spaceBefore: 0, spaceAfter: 0 }],
};

test('production vertical-flow adapter routes every operation through awaited executeJsx semantics', async () => {
  const calls: Array<{ operation: string; params: Record<string, unknown>; timeout?: number }> = [];
  const runner: VerticalFlowJsxRunner = async (_jsx, params, options) => {
    const request = params as Record<string, unknown>;
    calls.push({ operation: request.operation as string, params: request, timeout: options?.timeout });
    switch (request.operation) {
      case 'resolve': return { found: true };
      case 'snapshot_item': return { uuid: 'a', bounds: { left: 10, top: 100, right: 110, bottom: 60 }, kind: 'AREA_TEXT', editable: true, movable: true, ancestorUuids: [] };
      case 'check_eligibility': return { eligible: true };
      case 'snapshot_area_text': return { uuid: 'a', top: 100, left: 10, width: 100, height: 40, contents: 'text', formatting };
      case 'is_overset': return { overset: true, observationCount: 2, actualHeight: 80 };
      case 'probe_height': return { requestedHeight: 80, actualHeight: 80, overset: false };
      case 'set_height': return { applied: true };
      case 'translate_y': return { applied: true };
      default: throw new Error('unexpected operation');
    }
  };
  const adapter = createVerticalFlowIllustratorAdapter(runner);
  const target = await adapter.resolve('a');
  assert.deepEqual(target, { uuid: 'a' });
  assert.deepEqual(await adapter.snapshotItem(target!), { uuid: 'a', bounds: { left: 10, top: 100, right: 110, bottom: 60 }, kind: 'AREA_TEXT', editable: true, movable: true, ancestorUuids: [] });
  assert.deepEqual(await adapter.areaText.checkEligibility(target!), { eligible: true });
  assert.equal((await adapter.areaText.snapshot(target!)).height, 40);
  assert.deepEqual(await adapter.areaText.probeHeight(target!, 80), { requestedHeight: 80, actualHeight: 80, overset: false });
  assert.equal(await adapter.areaText.isOverset(target!), true);
  await adapter.areaText.setHeight(target!, 80);
  await adapter.translateY(target!, -40);
  assert.deepEqual(calls.map((call) => call.operation), ['resolve', 'snapshot_item', 'check_eligibility', 'snapshot_area_text', 'probe_height', 'is_overset', 'set_height', 'translate_y']);
  assert.ok(calls.every((call) => call.timeout === 60_000));
  assert.deepEqual(calls.at(-2)?.params, { operation: 'set_height', uuid: 'a', height: 80 });
  assert.deepEqual(calls.at(-1)?.params, { operation: 'translate_y', uuid: 'a', delta_y: -40 });
});

test('adapter preserves safe ineligible and missing-target outcomes', async () => {
  const adapter = createVerticalFlowIllustratorAdapter(async (_jsx, params) => {
    const request = params as Record<string, unknown>;
    if (request.operation === 'resolve') return { found: false };
    if (request.operation === 'check_eligibility') return { eligible: false, reason: 'Threaded AreaText is unsupported' };
    return { uuid: 'a', bounds: { left: 0, top: 1, right: 1, bottom: 0 }, kind: 'AREA_TEXT', editable: true, movable: true, ancestorUuids: [] };
  });
  assert.equal(await adapter.resolve('missing'), null);
  assert.deepEqual(await adapter.areaText.checkEligibility({ uuid: 'a' }), { eligible: false, reason: 'Threaded AreaText is unsupported' });
});

test('adapter JSX uses TextPath height, visible-line overset evidence, and no synchronous bridge', () => {
  const source = readFileSync(new URL('../src/illustrator/core/ie3jp/tools/modify/vertical-flow-illustrator-adapter.js', import.meta.url), 'utf8');
  assert.match(source, /executeJsx/);
  assert.doesNotMatch(source, /spawnSync|execSync|worker-process/);
  assert.match(verticalFlowAdapterJsxCode, /frame\.textPath\.height = height/);
  assert.match(verticalFlowAdapterJsxCode, /app\.redraw\(\)/);
  assert.doesNotMatch(verticalFlowAdapterJsxCode, /frame\.height\s*=/);
  assert.match(verticalFlowAdapterJsxCode, /frame\.lines/);
  assert.match(verticalFlowAdapterJsxCode, /function singleOversetObservation\(frame\)/);
  assert.match(verticalFlowAdapterJsxCode, /firstOverset !== secondOverset/);
  assert.match(verticalFlowAdapterJsxCode, /observationCount:2/);
  assert.match(verticalFlowAdapterJsxCode, /function probeHeight\(uuid, requestedHeight\)/);
  assert.match(verticalFlowAdapterJsxCode, /frame\.textPath\.height = height;\n    app\.redraw\(\);\n    var actualHeight/);
  assert.match(verticalFlowAdapterJsxCode, /contents\.charAt\(contents\.length - 1\)/);
  assert.match(verticalFlowAdapterJsxCode, /lastEnd === end - 1/);
  assert.match(verticalFlowAdapterJsxCode, /target\.translate\(0, deltaY\)/);
});

test('atomic probe preserves fitting and overset values and rejects ambiguous or mismatched results', async () => {
  for (const overset of [false, true]) {
    const adapter = createVerticalFlowIllustratorAdapter(async (_jsx, params) => {
      const request = params as Record<string, unknown>;
      if (request.operation === 'probe_height') return { requestedHeight: 80, actualHeight: 80, overset };
      throw new Error('unexpected operation');
    });
    assert.deepEqual(await adapter.areaText.probeHeight({ uuid: 'a' }, 80), { requestedHeight: 80, actualHeight: 80, overset });
  }
  const ambiguous = createVerticalFlowIllustratorAdapter(async () => ({ requestedHeight: 80, actualHeight: 80 }));
  await assert.rejects(ambiguous.areaText.probeHeight({ uuid: 'a' }, 80), /overset/);
  const mismatch = createVerticalFlowIllustratorAdapter(async () => ({ requestedHeight: 80, actualHeight: 79, overset: false }));
  await assert.rejects(mismatch.areaText.probeHeight({ uuid: 'a' }, 80), /did not verify/);
});

test('adapter rejects an unstabilized overset response instead of accepting a stale single observation', async () => {
  const adapter = createVerticalFlowIllustratorAdapter(async (_jsx, params) => {
    const request = params as Record<string, unknown>;
    if (request.operation === 'is_overset') return { overset: false, observationCount: 1, actualHeight: 80 };
    throw new Error('unexpected operation');
  });
  await assert.rejects(adapter.areaText.isOverset({ uuid: 'a' }), /observation count/);
});

test('adapter preserves stable true and false overset values after bounded stabilization', async () => {
  for (const expected of [true, false]) {
    const adapter = createVerticalFlowIllustratorAdapter(async (_jsx, params) => {
      const request = params as Record<string, unknown>;
      if (request.operation === 'is_overset') return { overset: expected, observationCount: 2, actualHeight: 80 };
      throw new Error('unexpected operation');
    });
    assert.equal(await adapter.areaText.isOverset({ uuid: 'a' }), expected);
  }
});

test('height writer request and confirmed application semantics remain unchanged', async () => {
  let request: Record<string, unknown> | undefined;
  const adapter = createVerticalFlowIllustratorAdapter(async (_jsx, params) => {
    request = params as Record<string, unknown>;
    return { applied: true };
  });
  await adapter.areaText.setHeight({ uuid: 'a' }, 80);
  assert.deepEqual(request, { operation: 'set_height', uuid: 'a', height: 80 });
});

test('adapter keeps ExtendScript reserved words out of the generated JSX and passes JSX by file to AppleScript', async () => {
  const helpers = await readFile(new URL('../src/illustrator/core/ie3jp/jsx/helpers/common.jsx', import.meta.url), 'utf8');
  const generatedJsx = `(function() {\n${helpers}\nvar PARAMS_PATH = \"/tmp/params.json\";\nvar RESULT_PATH = \"/tmp/result.json\";\n${verticalFlowAdapterJsxCode}\n})();`;
  assert.match(generatedJsx, /function readBoolean\(value, label\)/);
  assert.doesNotMatch(generatedJsx, /function boolean\(value, label\)/);

  const directory = await mkdtemp(join(tmpdir(), 'vertical-flow-transport-'));
  const scriptPath = join(directory, 'script.jsx');
  const runnerPath = join(directory, 'run.scpt');
  try {
    await writeAppleScript(runnerPath, scriptPath);
    const appleScript = await readFile(runnerPath, 'utf8');
    assert.match(appleScript, /do javascript of file ".*script\.jsx"/);
    assert.doesNotMatch(appleScript, /function readBoolean|function boolean/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
