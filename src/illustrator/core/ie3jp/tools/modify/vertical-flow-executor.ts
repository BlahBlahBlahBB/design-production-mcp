import {
  AREA_TEXT_GEOMETRY_TOLERANCE,
  measureAreaTextRequiredHeight,
  type AreaTextMeasurementAdapter,
  type AreaTextSnapshot,
} from './area-text-measurement.js';
import {
  MAX_FLOW_ITEMS,
  planVerticalFlow,
  type FlowBounds,
  type FlowPlannerItem,
  type VerticalFlowPlanItem,
} from './vertical-flow-planner.js';

export type VerticalFlowItemKind = 'AREA_TEXT' | 'FIXED';

/**
 * The concrete Illustrator binding must provide planner-coordinate bounds.
 * For AreaText, these must describe the same TextPath geometry mutated by the
 * C3 AreaText adapter; the executor does not translate or transform them.
 */
export interface VerticalFlowItemSnapshot {
  uuid: string;
  bounds: FlowBounds;
  kind: VerticalFlowItemKind;
  editable: boolean;
  movable: boolean;
  /** UUIDs of every ancestor, nearest first. Used only to reject double moves. */
  ancestorUuids: string[];
}

export interface VerticalFlowExecutorAdapter<T> {
  /** Must return a fresh current object wrapper for the supplied UUID. */
  resolve(uuid: string): T | null;
  /** Must return a stable UUID, safe-editability state, and planner-coordinate bounds. */
  snapshotItem(target: T): VerticalFlowItemSnapshot;
  /** Frozen C3 adapter. Its setHeight implementation must use TextPath.height. */
  areaText: AreaTextMeasurementAdapter<T>;
  /** Applies the planner's native Illustrator deltaY exactly; no sign conversion occurs here. */
  translateY(target: T, deltaY: number): void;
}

export type VerticalFlowExecutorStatus =
  | 'SUCCESS'
  | 'PRECHECK_FAILED'
  | 'MEASUREMENT_UNSUPPORTED'
  | 'MEASUREMENT_FAILED_RESTORED'
  | 'MEASUREMENT_RESTORE_FAILED'
  | 'MEASUREMENT_RESTORE_UNVERIFIED'
  | 'PLAN_FAILED'
  | 'APPLY_FAILED_ROLLED_BACK'
  | 'VERIFY_FAILED_ROLLED_BACK'
  | 'ROLLBACK_FAILED';

export interface VerticalFlowGeometrySummary {
  uuid: string;
  bounds: FlowBounds;
  kind: VerticalFlowItemKind;
}

export interface VerticalFlowVerification {
  verified: boolean;
  reason?: string;
}

export interface VerticalFlowRollback {
  attempted: boolean;
  verified: boolean;
  restoredMutationCount: number;
  reason?: string;
}

export interface VerticalFlowExecutionResult {
  status: VerticalFlowExecutorStatus;
  orderedItemCount: number;
  measuredAreaTextCount: number;
  originalGeometry: VerticalFlowGeometrySummary[];
  plannedGeometry: VerticalFlowPlanItem[];
  appliedMutationCount: number;
  verification: VerticalFlowVerification;
  rollback: VerticalFlowRollback;
  reason?: string;
}

interface PreparedItem<T> {
  target: T;
  original: VerticalFlowItemSnapshot;
  originalAreaText: AreaTextSnapshot | null;
  measuredHeight: number | null;
}

interface AppliedMutation {
  uuid: string;
  kind: 'HEIGHT' | 'TRANSLATE';
  value: number;
  originalHeight: number | null;
}

function closeEnough(first: number, second: number): boolean {
  return Math.abs(first - second) <= AREA_TEXT_GEOMETRY_TOLERANCE;
}

function copyBounds(bounds: FlowBounds): FlowBounds {
  return { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom };
}

function sameBounds(first: FlowBounds, second: FlowBounds): boolean {
  return closeEnough(first.left, second.left) && closeEnough(first.top, second.top) &&
    closeEnough(first.right, second.right) && closeEnough(first.bottom, second.bottom);
}

function samePlain(first: unknown, second: unknown): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

function sameAreaTextSnapshot(first: AreaTextSnapshot, second: AreaTextSnapshot): boolean {
  return (first.uuid === null || second.uuid === null || first.uuid === second.uuid) &&
    closeEnough(first.top, second.top) && closeEnough(first.left, second.left) &&
    closeEnough(first.width, second.width) && closeEnough(first.height, second.height) &&
    first.contents === second.contents && samePlain(first.formatting, second.formatting);
}

function areaTextProtectedStateMatches(original: AreaTextSnapshot, current: AreaTextSnapshot, expectedHeight: number): boolean {
  return (original.uuid === null || current.uuid === null || original.uuid === current.uuid) &&
    closeEnough(original.left, current.left) && closeEnough(original.width, current.width) &&
    closeEnough(current.height, expectedHeight) && original.contents === current.contents &&
    samePlain(original.formatting, current.formatting);
}

function noRollback(): VerticalFlowRollback {
  return { attempted: false, verified: false, restoredMutationCount: 0 };
}

function geometrySummary<T>(items: PreparedItem<T>[]): VerticalFlowGeometrySummary[] {
  return items.map((item) => ({
    uuid: item.original.uuid,
    bounds: copyBounds(item.original.bounds),
    kind: item.original.kind,
  }));
}

function result<T>(
  status: VerticalFlowExecutorStatus,
  items: PreparedItem<T>[],
  measuredAreaTextCount: number,
  plannedGeometry: VerticalFlowPlanItem[] = [],
  appliedMutationCount = 0,
  verification: VerticalFlowVerification = { verified: false },
  rollback: VerticalFlowRollback = noRollback(),
  reason?: string,
): VerticalFlowExecutionResult {
  return {
    status,
    orderedItemCount: items.length,
    measuredAreaTextCount,
    originalGeometry: geometrySummary(items),
    plannedGeometry,
    appliedMutationCount,
    verification,
    rollback,
    reason,
  };
}

function validateOrderedUuids(uuids: string[]): void {
  if (!Array.isArray(uuids) || uuids.length === 0) throw new Error('ordered UUIDs must contain at least one item');
  if (uuids.length > MAX_FLOW_ITEMS) throw new Error(`ordered UUIDs must contain at most ${MAX_FLOW_ITEMS} items`);
  const seen = new Set<string>();
  for (const uuid of uuids) {
    if (typeof uuid !== 'string' || uuid.length === 0) throw new Error('ordered UUIDs must be non-empty strings');
    if (seen.has(uuid)) throw new Error(`duplicate uuid: ${uuid}`);
    seen.add(uuid);
  }
}

function detectOverlappingTargets<T>(items: PreparedItem<T>[]): void {
  const selected = new Set(items.map((item) => item.original.uuid));
  for (const item of items) {
    if (!Array.isArray(item.original.ancestorUuids)) throw new Error(`ancestor UUIDs are unreadable for ${item.original.uuid}`);
    for (const ancestorUuid of item.original.ancestorUuids) {
      if (selected.has(ancestorUuid)) {
        throw new Error(`ancestor/descendant targets are unsupported: ${ancestorUuid} and ${item.original.uuid}`);
      }
    }
  }
}

function plannerInput<T>(items: PreparedItem<T>[], measured: boolean): FlowPlannerItem[] {
  return items.map((item) => ({
    uuid: item.original.uuid,
    originalBounds: copyBounds(item.original.bounds),
    resizable: measured && item.original.kind === 'AREA_TEXT',
    measuredHeight: measured && item.original.kind === 'AREA_TEXT' ? item.measuredHeight ?? undefined : undefined,
  }));
}

function verifyFinal<T>(
  items: PreparedItem<T>[],
  plan: VerticalFlowPlanItem[],
  adapter: VerticalFlowExecutorAdapter<T>,
): VerticalFlowVerification {
  try {
    if (plan.length !== items.length) return { verified: false, reason: 'planned item count differs from original item count' };
    const current: Array<{ target: T; item: VerticalFlowItemSnapshot }> = [];
    for (let index = 0; index < items.length; index += 1) {
      const prepared = items[index];
      const target = adapter.resolve(prepared.original.uuid);
      if (!target) return { verified: false, reason: `verification could not resolve ${prepared.original.uuid}` };
      const snapshot = adapter.snapshotItem(target);
      const planned = plan[index];
      if (snapshot.uuid !== prepared.original.uuid) return { verified: false, reason: `verification identity mismatch for ${prepared.original.uuid}` };
      if (!sameBounds(snapshot.bounds, planned.targetBounds)) return { verified: false, reason: `verification geometry mismatch for ${prepared.original.uuid}` };
      if (!closeEnough(snapshot.bounds.left, prepared.original.bounds.left) || !closeEnough(snapshot.bounds.right, prepared.original.bounds.right)) {
        return { verified: false, reason: `verification detected X movement for ${prepared.original.uuid}` };
      }
      if (prepared.original.kind === 'AREA_TEXT') {
        const originalAreaText = prepared.originalAreaText;
        if (!originalAreaText) return { verified: false, reason: `missing AreaText snapshot for ${prepared.original.uuid}` };
        const currentAreaText = adapter.areaText.snapshot(target);
        if (!areaTextProtectedStateMatches(originalAreaText, currentAreaText, planned.targetHeight)) {
          return { verified: false, reason: `verification AreaText invariant mismatch for ${prepared.original.uuid}` };
        }
        if (planned.resized && adapter.areaText.isOverset(target) !== false) {
          return { verified: false, reason: `verification AreaText remains overset for ${prepared.original.uuid}` };
        }
      }
      current.push({ target, item: snapshot });
    }
    if (!closeEnough(current[0].item.bounds.top, plan[0].targetBounds.top)) return { verified: false, reason: 'first item top does not match plan' };
    for (let index = 1; index < current.length; index += 1) {
      const originalGap = items[index - 1].original.bounds.bottom - items[index].original.bounds.top;
      const finalGap = current[index - 1].item.bounds.bottom - current[index].item.bounds.top;
      if (!closeEnough(finalGap, originalGap)) return { verified: false, reason: `verification gap mismatch at ${index - 1}` };
    }
    return { verified: true };
  } catch (error) {
    return { verified: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

function verifyRestoration<T>(items: PreparedItem<T>[], adapter: VerticalFlowExecutorAdapter<T>): VerticalFlowVerification {
  try {
    for (const prepared of items) {
      const target = adapter.resolve(prepared.original.uuid);
      if (!target) return { verified: false, reason: `rollback could not resolve ${prepared.original.uuid}` };
      const current = adapter.snapshotItem(target);
      if (current.uuid !== prepared.original.uuid || !sameBounds(current.bounds, prepared.original.bounds)) {
        return { verified: false, reason: `rollback geometry mismatch for ${prepared.original.uuid}` };
      }
      if (prepared.original.kind === 'AREA_TEXT') {
        const originalAreaText = prepared.originalAreaText;
        if (!originalAreaText || !sameAreaTextSnapshot(originalAreaText, adapter.areaText.snapshot(target))) {
          return { verified: false, reason: `rollback AreaText invariant mismatch for ${prepared.original.uuid}` };
        }
      }
    }
    return { verified: true };
  } catch (error) {
    return { verified: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

function rollback<T>(
  mutations: AppliedMutation[],
  itemsByUuid: Map<string, PreparedItem<T>>,
  adapter: VerticalFlowExecutorAdapter<T>,
): VerticalFlowRollback {
  let restoredMutationCount = 0;
  try {
    for (let index = mutations.length - 1; index >= 0; index -= 1) {
      const mutation = mutations[index];
      const prepared = itemsByUuid.get(mutation.uuid);
      const target = adapter.resolve(mutation.uuid);
      if (!prepared || !target) throw new Error(`rollback could not resolve ${mutation.uuid}`);
      if (mutation.kind === 'HEIGHT') {
        if (mutation.originalHeight === null) throw new Error(`rollback original height is missing for ${mutation.uuid}`);
        adapter.areaText.setHeight(target, mutation.originalHeight);
      } else {
        // A host setter can throw after a partial mutation. Re-read the live
        // position and restore the immutable original top rather than blindly
        // negating a possibly unapplied translation.
        const current = adapter.snapshotItem(target);
        adapter.translateY(target, prepared.original.bounds.top - current.bounds.top);
      }
      restoredMutationCount += 1;
    }
    const verification = verifyRestoration([...itemsByUuid.values()], adapter);
    return {
      attempted: true,
      verified: verification.verified,
      restoredMutationCount,
      reason: verification.reason,
    };
  } catch (error) {
    return {
      attempted: true,
      verified: false,
      restoredMutationCount,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Executes only the internal C4 vertical-flow contract. The caller supplies
 * the safe Illustrator binding; this module neither registers nor exposes MCP.
 */
export function executeVerticalFlow<T>(orderedUuids: string[], adapter: VerticalFlowExecutorAdapter<T>): VerticalFlowExecutionResult {
  const prepared: PreparedItem<T>[] = [];
  let measuredAreaTextCount = 0;
  try {
    validateOrderedUuids(orderedUuids);
    for (const uuid of orderedUuids) {
      const target = adapter.resolve(uuid);
      if (!target) throw new Error(`object not found: ${uuid}`);
      const original = adapter.snapshotItem(target);
      if (original.uuid !== uuid) throw new Error(`identity mismatch for ${uuid}`);
      if (!original.editable || !original.movable) throw new Error(`object is unsafe or uneditable: ${uuid}`);
      if (original.kind !== 'AREA_TEXT' && original.kind !== 'FIXED') throw new Error(`unsupported object role for ${uuid}`);
      const originalAreaText = original.kind === 'AREA_TEXT' ? adapter.areaText.snapshot(target) : null;
      const preparedItem = { target, original, originalAreaText, measuredHeight: null };
      prepared.push(preparedItem);
      const eligibility = originalAreaText ? adapter.areaText.checkEligibility(target) : null;
      if (eligibility && !eligibility.eligible) {
        return result('MEASUREMENT_UNSUPPORTED', prepared, measuredAreaTextCount, [], 0, { verified: false }, noRollback(), eligibility.reason ?? `unsupported AreaText: ${uuid}`);
      }
    }
    detectOverlappingTargets(prepared);
    // Frozen planner validates every original geometry and pair-wise gap before C3 measures.
    planVerticalFlow(plannerInput(prepared, false));
  } catch (error) {
    return result('PRECHECK_FAILED', prepared, measuredAreaTextCount, [], 0, { verified: false }, noRollback(), error instanceof Error ? error.message : String(error));
  }

  for (const item of prepared) {
    if (item.original.kind !== 'AREA_TEXT') continue;
    const measurement = measureAreaTextRequiredHeight(item.target, adapter.areaText);
    if (measurement.status === 'UNSUPPORTED') {
      return result('MEASUREMENT_UNSUPPORTED', prepared, measuredAreaTextCount, [], 0, { verified: false }, noRollback(), measurement.reason);
    }
    if (measurement.status === 'MEASUREMENT_FAILED_RESTORED') {
      return result('MEASUREMENT_FAILED_RESTORED', prepared, measuredAreaTextCount, [], 0, { verified: false }, noRollback(), measurement.reason);
    }
    if (measurement.status === 'RESTORE_FAILED') {
      return result('MEASUREMENT_RESTORE_FAILED', prepared, measuredAreaTextCount, [], 0, { verified: false }, noRollback(), measurement.reason);
    }
    const originalAreaText = item.originalAreaText;
    if (!originalAreaText || !sameAreaTextSnapshot(originalAreaText, adapter.areaText.snapshot(item.target))) {
      return result('MEASUREMENT_RESTORE_UNVERIFIED', prepared, measuredAreaTextCount, [], 0, { verified: false }, noRollback(), `AreaText measurement did not restore ${item.original.uuid}`);
    }
    item.measuredHeight = measurement.measuredHeight;
    measuredAreaTextCount += 1;
  }

  let plan: VerticalFlowPlanItem[];
  try {
    plan = planVerticalFlow(plannerInput(prepared, true));
  } catch (error) {
    return result('PLAN_FAILED', prepared, measuredAreaTextCount, [], 0, { verified: false }, noRollback(), error instanceof Error ? error.message : String(error));
  }

  const itemsByUuid = new Map(prepared.map((item) => [item.original.uuid, item]));
  const mutations: AppliedMutation[] = [];
  let appliedMutationCount = 0;
  try {
    for (const planned of plan) {
      const item = itemsByUuid.get(planned.uuid);
      if (!item) throw new Error(`planned UUID is missing from precheck: ${planned.uuid}`);
      // Jev-selected order: height first, then the planner's exact native-Y translation.
      if (planned.resized) {
        mutations.push({ uuid: planned.uuid, kind: 'HEIGHT', value: planned.targetHeight, originalHeight: item.originalAreaText?.height ?? null });
        adapter.areaText.setHeight(item.target, planned.targetHeight);
        appliedMutationCount += 1;
      }
      if (!closeEnough(planned.deltaY, 0)) {
        mutations.push({ uuid: planned.uuid, kind: 'TRANSLATE', value: planned.deltaY, originalHeight: null });
        adapter.translateY(item.target, planned.deltaY);
        appliedMutationCount += 1;
      }
    }
  } catch (error) {
    const restored = rollback(mutations, itemsByUuid, adapter);
    return result(restored.verified ? 'APPLY_FAILED_ROLLED_BACK' : 'ROLLBACK_FAILED', prepared, measuredAreaTextCount, plan, appliedMutationCount, { verified: false }, restored, error instanceof Error ? error.message : String(error));
  }

  const verification = verifyFinal(prepared, plan, adapter);
  if (!verification.verified) {
    const restored = rollback(mutations, itemsByUuid, adapter);
    return result(restored.verified ? 'VERIFY_FAILED_ROLLED_BACK' : 'ROLLBACK_FAILED', prepared, measuredAreaTextCount, plan, appliedMutationCount, verification, restored, verification.reason);
  }
  return result('SUCCESS', prepared, measuredAreaTextCount, plan, appliedMutationCount, verification, noRollback());
}
