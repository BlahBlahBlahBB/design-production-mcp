import test from 'node:test';
import assert from 'node:assert/strict';
import type { AreaTextSnapshot } from '../src/illustrator/core/ie3jp/tools/modify/area-text-measurement.js';
import {
  executeVerticalFlow,
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

type HarnessOptions = {
  failTranslateUuid?: string;
  verifyMismatchOnce?: boolean;
};

function area(uuid: string, top: number, height: number, fitAt: number, options: Partial<Item> = {}): Item {
  return {
    uuid,
    kind: 'AREA_TEXT',
    top,
    left: 10,
    width: 100,
    height,
    originalHeight: height,
    fitAt,
    editable: true,
    movable: true,
    ancestorUuids: [],
    eligible: true,
    contents: 'AreaText content',
    formatting: {
      fontSizes: [12],
      leading: [14.4],
      autoLeading: [true],
      tracking: [0],
      paragraphs: [{ justification: 'left', spaceBefore: 0, spaceAfter: 0 }],
    },
    ...options,
  };
}

function fixed(uuid: string, top: number, height = 20, options: Partial<Item> = {}): Item {
  return {
    uuid,
    kind: 'FIXED',
    top,
    left: 10,
    width: 100,
    height,
    originalHeight: height,
    fitAt: height,
    editable: true,
    movable: true,
    ancestorUuids: [],
    eligible: true,
    contents: '',
    formatting: {
      fontSizes: [],
      leading: [],
      autoLeading: [],
      tracking: [],
      paragraphs: [],
    },
    ...options,
  };
}

function closeEnough(first: number, second: number): boolean {
  return Math.abs(first - second) <= 0.01;
}

function gap(first: Item, second: Item): number {
  return (first.top - first.height) - second.top;
}

function harness(items: Item[], options: HarnessOptions = {}) {
  const byUuid = new Map(items.map((item) => [item.uuid, item]));
  const heightSemantics: string[] = [];
  const translationCalls: Array<{ uuid: string; deltaY: number }> = [];
  let translateFailureRemaining = options.failTranslateUuid ? 1 : 0;
  let verificationMismatchRemaining = options.verifyMismatchOnce ? 1 : 0;
  let finalTranslationOccurred = false;
  let forwardFailureOccurred = false;

  const adapter: VerticalFlowExecutorAdapter<Item> = {
    resolve: (uuid) => byUuid.get(uuid) ?? null,
    snapshotItem: (target) => {
      const bounds = { left: target.left, top: target.top, right: target.left + target.width, bottom: target.top - target.height };
      if (verificationMismatchRemaining > 0 && finalTranslationOccurred) {
        verificationMismatchRemaining -= 1;
        bounds.top += 1;
        bounds.bottom += 1;
      }
      return {
        uuid: target.uuid,
        bounds,
        kind: target.kind,
        editable: target.editable,
        movable: target.movable,
        ancestorUuids: [...target.ancestorUuids],
      };
    },
    areaText: {
      checkEligibility: (target) => target.eligible ? { eligible: true } : { eligible: false, reason: 'AreaText is unsupported' },
      snapshot: (target) => ({
        uuid: target.uuid,
        top: target.top,
        left: target.left,
        width: target.width,
        height: target.height,
        contents: target.contents,
        formatting: target.formatting,
      }),
      isOverset: (target) => target.height < target.fitAt,
      setHeight: (target, height) => {
        heightSemantics.push('textPath.height');
        if (target.throwOnProbe && height !== target.originalHeight) throw new Error('measurement probe failed');
        if (target.throwOnRestore && height === target.originalHeight && target.height !== target.originalHeight) throw new Error('measurement restore failed');
        if (target.failRollbackHeight && forwardFailureOccurred && height === target.originalHeight) throw new Error('rollback height restore failed');
        target.height = height;
      },
    },
    translateY: (target, deltaY) => {
      if (target.uuid === options.failTranslateUuid && translateFailureRemaining > 0) {
        translateFailureRemaining -= 1;
        forwardFailureOccurred = true;
        throw new Error('planned translation failed');
      }
      target.top += deltaY;
      finalTranslationOccurred = true;
      translationCalls.push({ uuid: target.uuid, deltaY });
    },
  };
  return { adapter, byUuid, heightSemantics, translationCalls };
}

test('two fixed items remain a planned no-op', () => {
  const first = fixed('first', 100);
  const second = fixed('second', 70);
  const run = harness([first, second]);
  const result = executeVerticalFlow(['first', 'second'], run.adapter);
  assert.equal(result.status, 'SUCCESS');
  assert.equal(result.appliedMutationCount, 0);
  assert.equal(first.top, 100);
  assert.equal(second.top, 70);
});

test('first AreaText growth moves the second item down by the measured growth', () => {
  const first = area('first', 100, 20, 50);
  const second = fixed('second', 70);
  const result = executeVerticalFlow(['first', 'second'], harness([first, second]).adapter);
  assert.equal(result.status, 'SUCCESS');
  const growth = result.plannedGeometry[0].targetHeight - 20;
  assert.ok(growth > 0);
  assert.ok(closeEnough(second.top, 70 - growth));
  assert.ok(closeEnough(gap(first, second), 10));
});

test('three items preserve every original pair-wise gap after upstream growth', () => {
  const first = area('first', 160, 20, 60);
  const second = fixed('second', 120, 25);
  const third = fixed('third', 80, 15);
  const initial = [gap(first, second), gap(second, third)];
  const result = executeVerticalFlow(['first', 'second', 'third'], harness([first, second, third]).adapter);
  assert.equal(result.status, 'SUCCESS');
  assert.ok(closeEnough(gap(first, second), initial[0]));
  assert.ok(closeEnough(gap(second, third), initial[1]));
});

test('a middle AreaText receives upstream movement, grows downward, and moves later items', () => {
  const first = area('first', 200, 20, 50);
  const middle = area('middle', 160, 20, 55);
  const last = fixed('last', 120, 20);
  const result = executeVerticalFlow(['first', 'middle', 'last'], harness([first, middle, last]).adapter);
  assert.equal(result.status, 'SUCCESS');
  assert.ok(result.plannedGeometry[1].deltaY < 0);
  assert.ok(result.plannedGeometry[1].targetHeight > 20);
  assert.ok(closeEnough(middle.top, result.plannedGeometry[1].targetBounds.top));
  assert.ok(closeEnough(last.top, result.plannedGeometry[2].targetBounds.top));
});

test('already-fitting AreaText never shrinks', () => {
  const text = area('text', 100, 40, 20);
  const result = executeVerticalFlow(['text'], harness([text]).adapter);
  assert.equal(result.status, 'SUCCESS');
  assert.equal(text.height, 40);
  assert.equal(result.plannedGeometry[0].resized, false);
});

test('zero vertical gap is accepted and preserved', () => {
  const first = area('first', 100, 20, 40);
  const second = fixed('second', 80);
  const result = executeVerticalFlow(['first', 'second'], harness([first, second]).adapter);
  assert.equal(result.status, 'SUCCESS');
  assert.ok(closeEnough(gap(first, second), 0));
});

test('negative original gap is rejected before measurement or final mutation', () => {
  const first = fixed('first', 100, 20);
  const second = fixed('second', 90, 20);
  const result = executeVerticalFlow(['first', 'second'], harness([first, second]).adapter);
  assert.equal(result.status, 'PRECHECK_FAILED');
  assert.equal(result.appliedMutationCount, 0);
});

test('UNSUPPORTED AreaText measurement causes zero final mutations', () => {
  const text = area('text', 100, 20, 50, { eligible: false });
  const result = executeVerticalFlow(['text'], harness([text]).adapter);
  assert.equal(result.status, 'MEASUREMENT_UNSUPPORTED');
  assert.equal(result.appliedMutationCount, 0);
});

test('MEASUREMENT_FAILED_RESTORED causes zero final layout mutations', () => {
  const text = area('text', 100, 20, 50, { throwOnProbe: true });
  const result = executeVerticalFlow(['text'], harness([text]).adapter);
  assert.equal(result.status, 'MEASUREMENT_FAILED_RESTORED');
  assert.equal(result.appliedMutationCount, 0);
  assert.equal(text.height, 20);
});

test('RESTORE_FAILED is a hard failure before final layout mutations', () => {
  const text = area('text', 100, 20, 50, { throwOnRestore: true });
  const result = executeVerticalFlow(['text'], harness([text]).adapter);
  assert.equal(result.status, 'MEASUREMENT_RESTORE_FAILED');
  assert.equal(result.appliedMutationCount, 0);
});

test('an APPLY failure after one mutation rolls back in reverse application order', () => {
  const text = area('text', 100, 20, 50);
  const second = fixed('second', 70);
  const result = executeVerticalFlow(['text', 'second'], harness([text, second], { failTranslateUuid: 'second' }).adapter);
  assert.equal(result.status, 'APPLY_FAILED_ROLLED_BACK');
  assert.equal(result.rollback.verified, true);
  assert.equal(text.height, 20);
  assert.equal(second.top, 70);
});

test('a final verification failure rolls back all final mutations', () => {
  const text = area('text', 100, 20, 50);
  const second = fixed('second', 70);
  const result = executeVerticalFlow(['text', 'second'], harness([text, second], { verifyMismatchOnce: true }).adapter);
  assert.equal(result.status, 'VERIFY_FAILED_ROLLED_BACK');
  assert.equal(result.rollback.verified, true);
  assert.equal(text.height, 20);
  assert.equal(second.top, 70);
});

test('a rollback failure is reported distinctly', () => {
  const text = area('text', 100, 20, 50, { failRollbackHeight: true });
  const second = fixed('second', 70);
  const result = executeVerticalFlow(['text', 'second'], harness([text, second], { failTranslateUuid: 'second' }).adapter);
  assert.equal(result.status, 'ROLLBACK_FAILED');
  assert.equal(result.rollback.verified, false);
});

test('duplicate UUID input is rejected before mutation', () => {
  const first = fixed('first', 100);
  const result = executeVerticalFlow(['first', 'first'], harness([first]).adapter);
  assert.equal(result.status, 'PRECHECK_FAILED');
  assert.equal(result.appliedMutationCount, 0);
});

test('missing UUID input is rejected before mutation', () => {
  const result = executeVerticalFlow(['missing'], harness([]).adapter);
  assert.equal(result.status, 'PRECHECK_FAILED');
  assert.equal(result.appliedMutationCount, 0);
});

test('ancestor descendant targets are rejected before mutation', () => {
  const parent = fixed('parent', 100);
  const child = fixed('child', 70, 20, { ancestorUuids: ['parent'] });
  const result = executeVerticalFlow(['parent', 'child'], harness([parent, child]).adapter);
  assert.equal(result.status, 'PRECHECK_FAILED');
  assert.equal(result.appliedMutationCount, 0);
});

test('final execution performs no X movement', () => {
  const first = area('first', 100, 20, 50);
  const second = fixed('second', 70);
  const result = executeVerticalFlow(['first', 'second'], harness([first, second]).adapter);
  assert.equal(result.status, 'SUCCESS');
  assert.equal(first.left, 10);
  assert.equal(second.left, 10);
});

test('AreaText height writes use the frozen TextPath-height adapter semantic', () => {
  const text = area('text', 100, 20, 50);
  const run = harness([text]);
  const result = executeVerticalFlow(['text'], run.adapter);
  assert.equal(result.status, 'SUCCESS');
  assert.ok(run.heightSemantics.length > 0);
  assert.ok(run.heightSemantics.every((semantic) => semantic === 'textPath.height'));
});
