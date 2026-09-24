import test from 'node:test';
import assert from 'node:assert/strict';
import { createDesignProductionMcpServer } from '../src/mcp/server.js';
import { replaceItemSchema, replaceItemJsxCode } from '../src/illustrator/core/ie3jp/tools/modify/replace-item.js';

const source = replaceItemJsxCode;

type MockItem = {
  typename: string;
  uuid: string;
  name: string;
  parent: MockParent;
  geometricBounds: number[];
  locked?: boolean;
  hidden?: boolean;
  clipping?: boolean;
  duplicate?: () => MockItem;
  move?: (relative: MockItem, placement: string) => void;
  translate?: (dx: number, dy: number) => void;
  remove?: () => void;
};

type MockParent = { typename: string; name: string; parent: { typename: string }; uuid?: string; locked?: boolean; hidden?: boolean; clipping?: boolean; clipped?: boolean };

function executeWithInvalidatingTarget(options: {
  failCopyAfterDelete?: boolean;
  itemType?: 'PathItem' | 'PlacedItem';
  clippingThrows?: boolean;
  targetLocked?: boolean;
  targetHidden?: boolean;
  targetClipping?: boolean;
  parentType?: 'Layer' | 'GroupItem' | 'CompoundPathItem';
  parentClipped?: boolean;
  forcePreDeleteFailure?: boolean;
  copyRemoveThrowsAfterDelete?: boolean;
  copyRemoveThrowsWithoutDelete?: boolean;
  copyLookupThrows?: boolean;
} = {}) {
  const documentParent = { typename: 'Document' };
  const type = options.itemType ?? 'PathItem';
  const layer: MockParent = {
    typename: options.parentType ?? 'Layer', name: 'QA', uuid: 'parent', parent: documentParent,
    clipped: options.parentClipped ?? false,
  };
  let targetAlive = true;
  let copyAlive = true;
  let copy: MockItem | null = null;
  const results: unknown[] = [];
  const assertTargetAlive = () => {
    if (!targetAlive) throw new Error('Invalid Illustrator PageItem');
  };
  const target = Object.defineProperties({
    remove() { targetAlive = false; },
  } as Record<string, unknown>, {
    typename: { get: () => { assertTargetAlive(); return type; } },
    uuid: { get: () => { assertTargetAlive(); return 'target'; } },
    name: { get: () => { assertTargetAlive(); return 'target'; } },
    parent: { get: () => { assertTargetAlive(); return layer; } },
    geometricBounds: { get: () => { assertTargetAlive(); return [100, 500, 180, 460]; } },
    locked: { get: () => { assertTargetAlive(); return options.targetLocked ?? false; } },
    hidden: { get: () => { assertTargetAlive(); return options.targetHidden ?? false; } },
    clipping: { get: () => { assertTargetAlive(); if (options.clippingThrows) throw new Error('PlacedItem clipping is unsupported'); return options.targetClipping ?? false; } },
  }) as unknown as MockItem;
  const sourceItem: MockItem = {
    typename: type, uuid: 'source', name: 'source', parent: layer,
    geometricBounds: [500, 200, 620, 130], locked: false, hidden: false, clipping: false,
    duplicate() {
      let copyParent = layer;
      let copyBounds = [500, 200, 620, 130];
      const copyObject = Object.defineProperties({
        move(relative: MockItem) { copyParent = relative.parent; },
        translate(dx: number, dy: number) {
          copyBounds = [copyBounds[0] + dx, copyBounds[1] + dy, copyBounds[2] + dx, copyBounds[3] + dy];
        },
        remove() {
          if (options.copyRemoveThrowsWithoutDelete) throw new Error('Copy removal failed');
          copyAlive = false;
          if (options.copyRemoveThrowsAfterDelete) throw new Error('Invalid Illustrator PageItem');
        },
      } as Record<string, unknown>, {
        typename: { get: () => { if (!copyAlive) throw new Error('Invalid Illustrator PageItem'); return type; } },
        uuid: { get: () => { if (!copyAlive) throw new Error('Invalid Illustrator PageItem'); return 'copy'; } },
        name: { get: () => { if (!copyAlive) throw new Error('Invalid Illustrator PageItem'); return 'source'; } },
        parent: { get: () => { if (!copyAlive) throw new Error('Invalid Illustrator PageItem'); return copyParent; }, set(value: MockParent) { copyParent = value; } },
        geometricBounds: { configurable:true, get: () => { if (!copyAlive) throw new Error('Invalid Illustrator PageItem'); return copyBounds; }, set(value: number[]) { copyBounds = value; } },
        locked: { get: () => { if (!copyAlive) throw new Error('Invalid Illustrator PageItem'); return false; } },
        hidden: { get: () => { if (!copyAlive) throw new Error('Invalid Illustrator PageItem'); return false; } },
        clipping: { get: () => { if (!copyAlive) throw new Error('Invalid Illustrator PageItem'); return false; } },
      });
      copy = copyObject as unknown as MockItem;
      if (options.failCopyAfterDelete) {
        let copyBounds = [80, 515, 200, 445];
        Object.defineProperty(copy, 'geometricBounds', {
          get() { if (!targetAlive) throw new Error('Real post-delete copy verification failure'); return copyBounds; },
          set(value: number[]) { copyBounds = value; },
        });
      }
      return copy;
    },
  };
  if (options.clippingThrows) {
    Object.defineProperty(sourceItem, 'clipping', { get() { throw new Error('PlacedItem clipping is unsupported'); } });
  }
  const findItemByUUID = (uuid: string) => {
    if (uuid === 'target') return targetAlive ? target : null;
    if (uuid === 'source') return sourceItem;
    if (uuid === 'copy') {
      if (options.copyLookupThrows) throw new Error('Fresh copy lookup unavailable');
      return copyAlive ? copy : null;
    }
    return null;
  };
  const executionSource = options.forcePreDeleteFailure
    ? source.replace('    // COMMIT BOUNDARY: no target removal occurs until every pre-delete invariant holds.', '    // COMMIT BOUNDARY: no target removal occurs until every pre-delete invariant holds.\n    throw new Error("forced pre-delete rollback");')
    : source;
  const runner = new Function('preflightChecks', 'writeResultFile', 'readParamsFile', 'findItemByUUID', '_getNativeUUID', 'ensureUUID', 'extractUUIDFromNote', 'ElementPlacement', '_uuidIndex', 'PARAMS_PATH', 'RESULT_PATH', executionSource);
  runner(
    () => null,
    (_path: unknown, result: unknown) => results.push(result),
    () => ({ target_uuid: 'target', replacement_uuid: 'source' }),
    findItemByUUID,
    (item: MockItem) => item.uuid,
    (item: MockItem) => item.uuid,
    () => '',
    { PLACEBEFORE: 'PLACEBEFORE' },
    null,
    'mock-params.json',
    'mock-result.json',
  );
  return { result: results.at(-1) as Record<string, unknown>, targetAlive, copy, copyAlive };
}

test('replace_item is registered exactly once with its locked two-field V1 schema', () => {
  const registered = (createDesignProductionMcpServer() as unknown as { _registeredTools: Record<string, unknown> })._registeredTools;
  assert.ok(registered.replace_item);
  assert.equal(Object.keys(registered).filter((name) => name === 'replace_item').length, 1);
  assert.deepEqual(Object.keys(replaceItemSchema.shape), ['target_uuid', 'replacement_uuid']);
  assert.equal(replaceItemSchema.safeParse({ target_uuid:'target', replacement_uuid:'source' }).success, true);
  assert.equal(replaceItemSchema.safeParse({ target_uuid:'target', replacement_uuid:'source', scale:true }).success, false);
});

test('precheck is same-type, fail-closed, and performs no UUID writes to inputs', () => {
  assert.match(source, /params\.target_uuid === params\.replacement_uuid/);
  assert.match(source, /Only PathItem, TextFrame, GroupItem, and PlacedItem are supported/);
  assert.match(source, /Replacement requires matching PageItem types/);
  assert.match(source, /unsafeAncestry\(target\).*unsafeAncestry\(source\).*containsUnsupportedStructure\(target\).*containsUnsupportedStructure\(source\)/s);
  assert.match(source, /Target immediate parent is unsupported or unsafe/);
  assert.match(source, /Replacement source immediate parent is unsupported or unsafe/);
  assert.match(source, /type === "CompoundPathItem"/);
  assert.match(source, /node\.clipping === true/);
  assert.match(source, /node\.clipped === true/);
  assert.doesNotMatch(source, /ensureUUID\(target/);
  assert.doesNotMatch(source, /ensureUUID\(source/);
});

test('uses a new duplicate, places it before the target, and preserves source item data', () => {
  assert.match(source, /copy = source\.duplicate\(\)/);
  assert.match(source, /copy\.move\(target, ElementPlacement\.PLACEBEFORE\)/);
  assert.match(source, /parentMatches\(copy, targetParent\)/);
  assert.match(source, /storedUuid\(source\) === snapshot\.uuid/);
  assert.match(source, /sameBounds\(readBounds\(source\), snapshot\.bounds\)/);
  assert.match(source, /parentMatches\(source, snapshot\.parent\)/);
  assert.match(source, /source\.duplicate\(\)/);
  assert.doesNotMatch(source, /source\.(move|translate|resize|remove)\(/);
});

test('PathItem, TextFrame, GroupItem, and PlacedItem are the complete supported same-type matrix', () => {
  for (const type of ['PathItem', 'TextFrame', 'GroupItem', 'PlacedItem']) assert.match(source, new RegExp(`type === "${type}"`));
  assert.match(source, /itemType\(target\) !== itemType\(source\)/);
  assert.doesNotMatch(source, /contents\s*=/);
  assert.doesNotMatch(source, /embed\(/);
  assert.doesNotMatch(source, /relink\(/);
});

test('replacement is position-only: it centers geometric bounds without resizing', () => {
  assert.match(source, /readBounds\(item\) \{ return normalizeBounds\(item\.geometricBounds\); \}/);
  assert.match(source, /copy\.translate\(targetCenter\.x - copyCenter\.x, targetCenter\.y - copyCenter\.y\)/);
  assert.match(source, /sameCenter\(copyBeforeDelete, targetSnapshot\.bounds\)/);
  assert.match(source, /sameDimensions\(copyBeforeDelete, sourceSnapshot\.bounds\)/);
  assert.match(source, /Math\.abs\(a - b\) <= 0\.01/);
  assert.doesNotMatch(source, /\.resize\(/);
});

test('new-copy UUID prefers native identity and legacy fallback is restricted to the duplicate', () => {
  assert.match(source, /copyUuid = _getNativeUUID\(copy\) \|\| ensureUUID\(copy, true\)/);
  assert.doesNotMatch(source, /ensureUUID\((?:target|source)/);
  assert.match(source, /new_uuid:copyUuid/);
});

test('pre-commit failures clean up only the created copy and expose bounded rollback states', () => {
  assert.match(source, /status:"FAILED_NO_MUTATION"/);
  assert.match(source, /copy\.remove\(\)/);
  assert.match(source, /status:"ROLLED_BACK"/);
  assert.match(source, /status:"ROLLBACK_FAILED"/);
  assert.match(source, /target_removed:false/);
  assert.match(source, /function freshCopyExists\(\)/);
  assert.match(source, /findItemByUUID\(copyUuid\)/);
  assert.match(source, /cleanupVerified = copyExistsAfterCleanup === false/);
  assert.doesNotMatch(source, /cleanupVerified = existsState\(copy\) === false/);
});

test('pre-delete rollback verifies an invalidated removed copy through fresh UUID lookup', () => {
  const execution = executeWithInvalidatingTarget({ forcePreDeleteFailure:true, copyRemoveThrowsAfterDelete:true });
  assert.equal(execution.targetAlive, true, JSON.stringify(execution.result));
  assert.equal(execution.copyAlive, false, JSON.stringify(execution.result));
  assert.throws(() => (execution.copy as unknown as MockItem).parent, /Invalid Illustrator PageItem/);
  assert.equal(execution.result.status, 'ROLLED_BACK', JSON.stringify(execution.result));
  assert.equal(execution.result.target_removed, false);
  assert.equal(execution.result.source_unchanged, true);
  assert.equal(execution.result.rollback_status, 'CLEANUP_VERIFIED');
});

test('rollback remains failed when removal fails or fresh copy absence cannot be verified', () => {
  const removalFailure = executeWithInvalidatingTarget({ forcePreDeleteFailure:true, copyRemoveThrowsWithoutDelete:true });
  assert.equal(removalFailure.copyAlive, true, JSON.stringify(removalFailure.result));
  assert.equal(removalFailure.result.status, 'ROLLBACK_FAILED', JSON.stringify(removalFailure.result));
  const unverifiableAbsence = executeWithInvalidatingTarget({ forcePreDeleteFailure:true, copyLookupThrows:true });
  assert.equal(unverifiableAbsence.copyAlive, false, JSON.stringify(unverifiableAbsence.result));
  assert.equal(unverifiableAbsence.result.status, 'ROLLBACK_FAILED', JSON.stringify(unverifiableAbsence.result));
});

test('target deletion is the commit boundary and post-delete failures are never rolled back', () => {
  const removal = source.indexOf('target.remove()');
  const verification = source.indexOf('Replacement copy center verification failed');
  assert.ok(removal > verification, 'target removal must follow pre-delete verification');
  assert.match(source, /COMMIT BOUNDARY/);
  assert.match(source, /status:"COMMIT_PARTIAL"/);
  assert.match(source, /NOT_ATTEMPTED_AFTER_COMMIT/);
  assert.doesNotMatch(source, /target\.duplicate\(/);
});

test('a target mock becomes invalid immediately after remove while final verification succeeds from plain snapshots and fresh lookup', () => {
  const execution = executeWithInvalidatingTarget();
  assert.equal(execution.targetAlive, false, JSON.stringify(execution.result));
  assert.equal(execution.result.status, 'SUCCESS');
  assert.equal(execution.result.target_removed, true);
  assert.equal(execution.result.source_unchanged, true);
  assert.equal(execution.result.new_uuid, 'copy');
  assert.ok(execution.copy);
});

test('a normal linked PlacedItem on a normal Layer passes precheck and duplicates even when clipping is unsupported', () => {
  const execution = executeWithInvalidatingTarget({ itemType: 'PlacedItem', clippingThrows: true });
  assert.equal(execution.result.status, 'SUCCESS', JSON.stringify(execution.result));
  assert.equal(execution.result.target_removed, true);
  assert.equal(execution.result.new_uuid, 'copy');
  assert.equal((execution.copy as MockItem | null)?.typename, 'PlacedItem');
});

test('PlacedItem locked and hidden states remain fail-closed', () => {
  for (const options of [{ targetLocked: true }, { targetHidden: true }]) {
    const execution = executeWithInvalidatingTarget({ itemType: 'PlacedItem', ...options });
    assert.equal(execution.result.status, 'FAILED_NO_MUTATION', JSON.stringify(execution.result));
    assert.equal(execution.targetAlive, true);
    assert.equal(execution.copy, null);
  }
});

test('PlacedItem under clipping or compound parents remains fail-closed', () => {
  for (const options of [
    { parentType: 'GroupItem' as const, parentClipped: true },
    { parentType: 'CompoundPathItem' as const },
  ]) {
    const execution = executeWithInvalidatingTarget({ itemType: 'PlacedItem', ...options });
    assert.equal(execution.result.status, 'FAILED_NO_MUTATION', JSON.stringify(execution.result));
    assert.equal(execution.targetAlive, true);
    assert.equal(execution.copy, null);
  }
});

test('the GroupItem wrapper rebind is limited to a unique, structurally identical PlacedItem alias', () => {
  assert.match(source, /function placedAliasForBrokenGroupWrapper/);
  assert.match(source, /wrapper\.pageItems\.length !== 0/);
  assert.match(source, /_getNativeUUID\(placed\) !== uuid/);
  assert.match(source, /sameAliasParent\(wrapper\.parent, candidate\.parent\)/);
  assert.match(source, /sameBounds\(readBounds\(wrapper\), readBounds\(candidate\)\)/);
  assert.match(source, /return placedAliasForBrokenGroupWrapper\(resolved, uuid\) \|\| resolved/);
});

test('a genuine post-delete copy verification failure still reports COMMIT_PARTIAL without accessing the deleted target', () => {
  const execution = executeWithInvalidatingTarget({ failCopyAfterDelete: true });
  assert.equal(execution.targetAlive, false, JSON.stringify(execution.result));
  assert.equal(execution.result.status, 'COMMIT_PARTIAL');
  assert.equal(execution.result.rollback_status, 'NOT_ATTEMPTED_AFTER_COMMIT');
});

test('post-delete source contains no target DOM dereference and verifies absence via fresh lookup', () => {
  const postDelete = source.slice(source.indexOf('target.remove()'));
  assert.doesNotMatch(postDelete, /existsState\(target\)|target\.(?:parent|typename|uuid|geometricBounds)/);
  assert.match(postDelete, /freshTargetExists\(\)/);
  assert.match(source, /_uuidIndex = null/);
});
