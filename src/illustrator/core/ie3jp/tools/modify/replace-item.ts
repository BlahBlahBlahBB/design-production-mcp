import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { executeToolJsx } from '../tool-executor.js';
import { DESTRUCTIVE_ANNOTATIONS } from './shared.js';

/** Replace one supported PageItem with a position-only duplicate of another. */
export const replaceItemSchema = z.object({
  target_uuid: z.string().min(1),
  replacement_uuid: z.string().min(1),
}).strict();

const jsxCode = `
var preflight = preflightChecks();
if (preflight) {
  writeResultFile(RESULT_PATH, { status:"FAILED_NO_MUTATION", message:"replace_item preflight failed", preflight:preflight });
} else {
  var params = null;
  var target = null;
  var source = null;
  var copy = null;
  var targetDeleted = false;
  var commitBoundaryCrossed = false;
  var resultWritten = false;

  function fail(message) { throw new Error(message); }
  function normalizeBounds(raw) {
    if (!raw || raw.length !== 4) fail("Geometric bounds are unavailable or malformed");
    var x1 = Number(raw[0]), y1 = Number(raw[1]), x2 = Number(raw[2]), y2 = Number(raw[3]);
    if (!isFinite(x1) || !isFinite(y1) || !isFinite(x2) || !isFinite(y2)) fail("Geometric bounds contain non-finite values");
    var bounds = { left:Math.min(x1, x2), top:Math.max(y1, y2), right:Math.max(x1, x2), bottom:Math.min(y1, y2) };
    bounds.width = bounds.right - bounds.left;
    bounds.height = bounds.top - bounds.bottom;
    if (!(bounds.width > 0) || !(bounds.height > 0)) fail("Geometric bounds must have positive dimensions");
    return bounds;
  }
  function readBounds(item) { return normalizeBounds(item.geometricBounds); }
  function center(bounds) { return { x:(bounds.left + bounds.right) / 2, y:(bounds.top + bounds.bottom) / 2 }; }
  function close(a, b) { return Math.abs(a - b) <= 0.01; }
  function sameBounds(first, second) {
    return close(first.left, second.left) && close(first.top, second.top) && close(first.right, second.right) && close(first.bottom, second.bottom);
  }
  function sameDimensions(first, second) { return close(first.width, second.width) && close(first.height, second.height); }
  function sameCenter(first, second) {
    var a = center(first), b = center(second);
    return close(a.x, b.x) && close(a.y, b.y);
  }
  function itemType(item) { try { return item && item.typename ? item.typename : ""; } catch (_) { return ""; } }
  function isSupported(item) {
    var type = itemType(item);
    return type === "PathItem" || type === "TextFrame" || type === "GroupItem" || type === "PlacedItem";
  }
  function storedUuid(item) {
    var nativeUuid = _getNativeUUID(item);
    if (nativeUuid) return nativeUuid;
    try { return extractUUIDFromNote(item.note || ""); } catch (_) { return ""; }
  }
  function snapshotParent(parent) {
    if (!parent) fail("Immediate parent is unavailable");
    var type = itemType(parent);
    if (!type) fail("Immediate parent type is unavailable");
    var name = "";
    try { name = parent.name || ""; } catch (_) {}
    var uuid = "";
    if (type === "GroupItem") {
      uuid = storedUuid(parent);
      if (!uuid) fail("GroupItem parent has no stable observable identity");
    }
    // This is intentionally plain data. The target PageItem and its parent
    // wrappers must never be retained as post-delete verification state.
    return { type:type, name:name, uuid:uuid };
  }
  function parentMatches(item, expected) {
    try {
      var actual = item.parent;
      if (!actual || itemType(actual) !== expected.type) return false;
      if (expected.type === "Layer") return String(actual.name || "") === expected.name;
      return expected.type === "GroupItem" && expected.uuid !== "" && storedUuid(actual) === expected.uuid;
    } catch (_) { return false; }
  }
  function safeImmediateParent(parent) {
    var type = itemType(parent);
    if (type !== "Layer" && type !== "GroupItem") return false;
    if (type === "GroupItem") {
      try { if (parent.clipped === true) return false; } catch (_) { return false; }
    }
    return true;
  }
  function sameAliasParent(first, second) {
    try {
      var firstType = itemType(first), secondType = itemType(second);
      if (firstType !== secondType) return false;
      if (firstType === "Layer") return String(first.name || "") === String(second.name || "");
      if (firstType === "GroupItem") {
        var firstUuid = storedUuid(first), secondUuid = storedUuid(second);
        return !!firstUuid && firstUuid === secondUuid;
      }
    } catch (_) {}
    return false;
  }
  function placedAliasForBrokenGroupWrapper(wrapper, uuid) {
    // Stable Illustrator can expose one placed artwork through a GroupItem
    // wrapper from getPageItemFromUuid and a PlacedItem from placedItems. Do
    // not make an unreadable real GroupItem safe: rebind only a uniquely
    // proven alias with identical observable identity and geometry.
    if (itemType(wrapper) !== "GroupItem" || _getNativeUUID(wrapper) !== uuid) return null;
    try { if (wrapper.clipped === true || wrapper.clipped === false) return null; } catch (_) {}
    try { if (wrapper.pageItems.length !== 0) return null; } catch (_) { return null; }
    var candidate = null;
    try {
      var placedItems = app.activeDocument.placedItems;
      for (var i = 0; i < placedItems.length; i++) {
        var placed = placedItems[i];
        if (_getNativeUUID(placed) !== uuid) continue;
        if (candidate) return null;
        candidate = placed;
      }
      if (!candidate || itemType(candidate) !== "PlacedItem") return null;
      if (String(wrapper.name || "") !== String(candidate.name || "")) return null;
      if (!sameAliasParent(wrapper.parent, candidate.parent)) return null;
      if (!sameBounds(readBounds(wrapper), readBounds(candidate))) return null;
      return candidate;
    } catch (_) { return null; }
  }
  function resolveReplacementItem(uuid) {
    var resolved = findItemByUUID(uuid);
    if (!resolved) return null;
    return placedAliasForBrokenGroupWrapper(resolved, uuid) || resolved;
  }
  function unsafeAncestry(item) {
    var node = item, steps = 0;
    while (node && steps++ < 100) {
      var type = itemType(node);
      if (!type) return true;
      if (type === "CompoundPathItem") return true;
      try { if (node.locked === true || node.hidden === true) return true; } catch (_) { return true; }
      if (type === "PathItem") {
        try { if (node.clipping === true) return true; } catch (_) { return true; }
      }
      if (type === "GroupItem") {
        try { if (node.clipped === true) return true; } catch (_) { return true; }
      }
      try { node = node.parent; } catch (_) { return true; }
      if (itemType(node) === "Document") return false;
    }
    return true;
  }
  function containsUnsupportedStructure(item, seen) {
    if (!item) return true;
    var type = itemType(item);
    if (type === "CompoundPathItem") return true;
    if (type === "PathItem") {
      try { if (item.clipping === true) return true; } catch (_) { return true; }
    }
    if (type !== "GroupItem") return false;
    try { if (item.clipped === true) return true; } catch (_) { return true; }
    seen = seen || [];
    for (var si = 0; si < seen.length; si++) if (seen[si] === item) return true;
    seen.push(item);
    try {
      for (var i = 0; i < item.pageItems.length; i++) {
        if (containsUnsupportedStructure(item.pageItems[i], seen)) return true;
      }
    } catch (_) { return true; }
    seen.pop();
    return false;
  }
  function existsState(item) {
    // A removed Illustrator PageItem normally rejects both parent and bounds access.
    // Return null rather than guessing if the host offers no conclusive observation.
    try {
      if (!item || !item.parent || !itemType(item)) return false;
      var raw = item.geometricBounds;
      return raw && raw.length === 4 ? true : null;
    } catch (_) { return false; }
  }
  function freshTargetExists() {
    // Rebuild the existing repository UUID index from the document so a legacy
    // fallback UUID cannot be answered from a stale in-memory PageItem wrapper.
    // This path never receives or dereferences the removed target reference.
    try {
      _uuidIndex = null;
      return findItemByUUID(params.target_uuid) ? true : false;
    } catch (_) { return null; }
  }
  function freshCopyExists() {
    // A removed copy wrapper can be permanently invalid even when remove() has
    // completed. Verify from its pre-removal UUID through a rebuilt document index.
    try {
      if (!copyUuid) return null;
      _uuidIndex = null;
      return findItemByUUID(copyUuid) ? true : false;
    } catch (_) { return null; }
  }
  function sourceUnchanged(snapshot) {
    try {
      return existsState(source) === true && storedUuid(source) === snapshot.uuid &&
        sameBounds(readBounds(source), snapshot.bounds) && parentMatches(source, snapshot.parent);
    } catch (_) { return false; }
  }
  function rollback(message, details) {
    var cleanupVerified = false;
    var cleanupError = "";
    var copyExistsAfterCleanup = null;
    if (copy) {
      try {
        copy.remove();
      } catch (error) { cleanupError = error.message || String(error); }
      // Never dereference copy after removal: Illustrator may invalidate the
      // wrapper even when deletion succeeded and the host reports an error.
      copyExistsAfterCleanup = freshCopyExists();
      cleanupVerified = copyExistsAfterCleanup === false;
    }
    var intact = freshTargetExists() === true && sourceUnchanged(sourceSnapshot);
    var rollbackDetails = details || null;
    if (cleanupError) {
      rollbackDetails = { rollback_error:details || null, cleanup_remove_error:cleanupError, copy_exists_after_cleanup:copyExistsAfterCleanup };
    }
    if (cleanupVerified && intact) {
      writeResultFile(RESULT_PATH, { status:"ROLLED_BACK", target_uuid:params.target_uuid, replacement_source_uuid:params.replacement_uuid,
        target_removed:false, source_unchanged:true, rollback_status:"CLEANUP_VERIFIED", message:message, details:rollbackDetails });
    } else {
      writeResultFile(RESULT_PATH, { status:"ROLLBACK_FAILED", target_uuid:params.target_uuid, replacement_source_uuid:params.replacement_uuid,
        target_removed:false, source_unchanged:sourceUnchanged(sourceSnapshot), rollback_status:"CLEANUP_UNVERIFIED",
        message:message, cleanup_error:cleanupError || "Created copy cleanup could not be verified", details:rollbackDetails });
    }
    resultWritten = true;
  }
  function commitPartial(message, details) {
    writeResultFile(RESULT_PATH, { status:"COMMIT_PARTIAL", target_uuid:params.target_uuid, replacement_source_uuid:params.replacement_uuid,
      new_uuid:copyUuid || null, target_removed:targetDeleted, source_unchanged:sourceUnchanged(sourceSnapshot),
      rollback_status:"NOT_ATTEMPTED_AFTER_COMMIT", message:message, details:details || null });
    resultWritten = true;
  }

  var sourceSnapshot = null;
  var targetSnapshot = null;
  var targetParent = null;
  var copyUuid = "";
  try {
    params = readParamsFile(PARAMS_PATH);
    if (params.target_uuid === params.replacement_uuid) fail("target_uuid and replacement_uuid must differ");
    target = resolveReplacementItem(params.target_uuid);
    if (!target) fail("Target object not found: " + params.target_uuid);
    source = resolveReplacementItem(params.replacement_uuid);
    if (!source) fail("Replacement source object not found: " + params.replacement_uuid);
    if (!isSupported(target) || !isSupported(source)) fail("Only PathItem, TextFrame, GroupItem, and PlacedItem are supported");
    if (itemType(target) !== itemType(source)) fail("Replacement requires matching PageItem types");
    if (unsafeAncestry(target) || unsafeAncestry(source) || containsUnsupportedStructure(target) || containsUnsupportedStructure(source)) {
      fail("Locked, hidden, clipping, or compound item structures are unsupported");
    }
    var targetParentItem = target.parent;
    if (!safeImmediateParent(targetParentItem)) fail("Target immediate parent is unsupported or unsafe");
    targetParent = snapshotParent(targetParentItem);
    var sourceParentItem = source.parent;
    if (!safeImmediateParent(sourceParentItem)) fail("Replacement source immediate parent is unsupported or unsafe");
    var sourceParent = snapshotParent(sourceParentItem);
    targetSnapshot = { uuid:params.target_uuid, bounds:readBounds(target), parent:targetParent, type:itemType(target) };
    sourceSnapshot = { uuid:params.replacement_uuid, bounds:readBounds(source), parent:sourceParent, type:itemType(source) };

    // PREPARE: this is the first mutation. The original source is never moved or altered.
    copy = source.duplicate();

    // PLACE: relative placement moves the duplicate into target's immediate parent.
    copy.move(target, ElementPlacement.PLACEBEFORE);
    if (!parentMatches(copy, targetParent)) fail("Replacement copy did not enter the target immediate parent");

    // POSITION: translate only; resizing is intentionally not part of this V1 contract.
    var copyBeforePosition = readBounds(copy);
    var targetCenter = center(targetSnapshot.bounds), copyCenter = center(copyBeforePosition);
    copy.translate(targetCenter.x - copyCenter.x, targetCenter.y - copyCenter.y);

    // UUID: native identity is preferred; legacy fallback may touch only this new copy.
    copyUuid = _getNativeUUID(copy) || ensureUUID(copy, true);
    if (!copyUuid) fail("Unable to establish replacement copy UUID");

    var copyBeforeDelete = readBounds(copy);
    if (!isSupported(copy) || itemType(copy) !== targetSnapshot.type) fail("Replacement copy type verification failed");
    if (!parentMatches(copy, targetParent)) fail("Replacement copy parent verification failed");
    if (!sameCenter(copyBeforeDelete, targetSnapshot.bounds)) fail("Replacement copy center verification failed");
    if (!sameDimensions(copyBeforeDelete, sourceSnapshot.bounds)) fail("Replacement copy dimensions changed");
    if (!sourceUnchanged(sourceSnapshot)) fail("Replacement source changed during replacement");
    if (existsState(target) !== true) fail("Target disappeared before the commit boundary");

    // COMMIT BOUNDARY: no target removal occurs until every pre-delete invariant holds.
    try {
      commitBoundaryCrossed = true;
      target.remove();
      var targetExistsAfterDelete = freshTargetExists();
      targetDeleted = targetExistsAfterDelete === false;
      if (!targetDeleted) commitPartial("Target removal returned without a conclusive deleted state", { target_exists:targetExistsAfterDelete });
    } catch (removeError) {
      var targetExistsAfterRemoveError = freshTargetExists();
      if (targetExistsAfterRemoveError === true) {
        rollback("Target removal failed before commit", { remove_error:removeError.message || String(removeError) });
      } else {
        targetDeleted = targetExistsAfterRemoveError === false;
        commitPartial("Target removal threw after an indeterminate or crossed commit boundary", { remove_error:removeError.message || String(removeError), target_exists:targetExistsAfterRemoveError });
      }
    }

    if (!resultWritten) {
      // VERIFY_AFTER_DELETE: verification is deliberately read-only after commit.
      var copyAfterDelete = readBounds(copy);
      if (existsState(copy) !== true || !copyUuid || !parentMatches(copy, targetParent) ||
          !sameCenter(copyAfterDelete, targetSnapshot.bounds) || !sameDimensions(copyAfterDelete, sourceSnapshot.bounds) ||
          !sourceUnchanged(sourceSnapshot)) {
        commitPartial("Post-delete verification failed", { new_bounds:copyAfterDelete });
      }
      if (!resultWritten) {
        writeResultFile(RESULT_PATH, { status:"SUCCESS", target_uuid:params.target_uuid, replacement_source_uuid:params.replacement_uuid,
          new_uuid:copyUuid, target_bounds:targetSnapshot.bounds, new_bounds:copyAfterDelete, target_removed:true,
          parent_preserved:true, source_unchanged:true, rollback_status:"NOT_NEEDED" });
      }
    }
  } catch (error) {
    if (!copy) {
      writeResultFile(RESULT_PATH, { status:"FAILED_NO_MUTATION", target_uuid:params && params.target_uuid || null,
        replacement_source_uuid:params && params.replacement_uuid || null, target_removed:false, source_unchanged:sourceSnapshot ? sourceUnchanged(sourceSnapshot) : null,
        rollback_status:"NOT_NEEDED", message:"replace_item failed: " + (error.message || String(error)) });
    } else if (commitBoundaryCrossed) {
      commitPartial("replace_item failed after target deletion", { error:error.message || String(error) });
    } else {
      rollback("replace_item failed before target deletion", { error:error.message || String(error) });
    }
  }
}
`;

export function register(server: McpServer): void {
  server.registerTool('replace_item', {
    title: 'Replace Item',
    description: 'Replace a supported PageItem with an unchanged-size duplicate of another same-type PageItem, centered on the original target.',
    inputSchema: replaceItemSchema,
    annotations: DESTRUCTIVE_ANNOTATIONS,
  }, async (params) => executeToolJsx(jsxCode, params, { timeoutMs: 180_000, includeTiming: true }));
}

export { jsxCode as replaceItemJsxCode };
