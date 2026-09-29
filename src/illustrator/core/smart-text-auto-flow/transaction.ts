import {
  measureAreaTextRequiredHeightAsync,
  type AsyncAreaTextMeasurementAdapter,
} from '../ie3jp/tools/modify/area-text-measurement.js';
import { planVerticalFlow, type FlowBounds } from '../ie3jp/tools/modify/vertical-flow-planner.js';
import type { AsyncVerticalFlowExecutorAdapter, VerticalFlowItemSnapshot } from '../ie3jp/tools/modify/vertical-flow-executor.js';
import { discoverAutoFlow } from './discovery.js';
import type { AutoFlowContext, LayoutBlock, LayoutItemSnapshot, LayoutMutation } from './types.js';

const TOLERANCE = 0.01;
const PORTABLE_HEIGHT_GEOMETRY_TOLERANCE = 0.01;
const PORTABLE_HEIGHT_MAX_GROWTH_FACTOR = 64;
const PORTABLE_HEIGHT_MAX_CANDIDATES = 16;

export interface SmartTextState {
  uuid: string;
  height: number;
  contents: string;
  /** Opaque adapter-owned formatting state, captured before the mutation. */
  formatting: unknown;
}

export interface SmartTextMutationSnapshot {
  items: readonly LayoutItemSnapshot[];
  textStates: readonly SmartTextState[];
}

/**
 * The production adapter combines a bounded read/restore surface with the
 * existing frozen C3/C4.1 adapter contract. It never changes C3/C4/C5 logic.
 */
export interface SmartTextAutoFlowAdapter<T> extends AsyncVerticalFlowExecutorAdapter<T> {
  /** Private Wave 3.6 observed setter for post-C3 portability certification. */
  observeSetHeight(
    target: T,
    height: number,
  ): Promise<{
    requestedHeight: number;
    actualHeight: number;
    overset: boolean;
  }>;

  snapshotMutation(targetUuids: readonly string[]): Promise<SmartTextMutationSnapshot>;
  restoreTextStates(states: readonly SmartTextState[]): Promise<void>;
  verifyTextStates(states: readonly SmartTextState[]): Promise<boolean>;
}

export type SmartTextMutationStatus =
  | 'BYPASSED_NON_LAYOUT'
  | 'SUCCESS_NO_GROWTH'
  | 'SUCCESS'
  | 'PRECHECK_FAILED'
  | 'MUTATION_FAILED_ROLLED_BACK'
  | 'AUTO_FLOW_AMBIGUOUS_ROLLED_BACK'
  | 'MEASUREMENT_FAILED_ROLLED_BACK'
  | 'APPLY_FAILED_ROLLED_BACK'
  | 'VERIFY_FAILED_ROLLED_BACK'
  | 'ROLLBACK_FAILED';

export interface SmartTextMutationOutcome<R> {
  result: R;
  status: SmartTextMutationStatus;
  reason?: string;
  rolledBack: boolean;
  measuredSourceCount: number;
  appliedMoveCount: number;
}

export interface SmartTextMutationRequest<R, T> {
  mutations: readonly LayoutMutation[];
  /** The existing handler JSX remains the sole mutation implementation. */
  executeMutation(): Promise<R>;
  mutationSucceeded(result: NoInfer<R>): boolean;
  failure(reason: string, status: SmartTextMutationStatus): R;
  adapter: SmartTextAutoFlowAdapter<T>;
  context?: AutoFlowContext;
}

function sameNumber(first: number, second: number): boolean {
  return Math.abs(first - second) <= TOLERANCE;
}

function boundsFor(snapshot: VerticalFlowItemSnapshot): FlowBounds {
  return { ...snapshot.bounds };
}

function contextFor(snapshot: SmartTextMutationSnapshot, mutations: readonly LayoutMutation[], supplied?: AutoFlowContext): AutoFlowContext | null {
  if (supplied) return supplied;
  const source = mutations.find((mutation) => mutation.layoutAffecting);
  const item = source ? snapshot.items.find((candidate) => candidate.uuid === source.targetUuid) : undefined;
  return typeof item?.artboardIndex === 'number' ? { kind: 'ARTBOARD', artboardIndex: item.artboardIndex } : null;
}

function sourceStates(snapshot: SmartTextMutationSnapshot, mutations: readonly LayoutMutation[]): SmartTextState[] {
  const stateByUuid = new Map(snapshot.textStates.map((state) => [state.uuid, state]));
  return mutations.filter((mutation) => mutation.layoutAffecting).flatMap((mutation) => {
    const state = stateByUuid.get(mutation.targetUuid);
    return state ? [state] : [];
  });
}

async function restore<T>(
  adapter: SmartTextAutoFlowAdapter<T>,
  textStates: readonly SmartTextState[],
  blocks: readonly LayoutBlock[],
): Promise<boolean> {
  try {
    await adapter.restoreTextStates(textStates);
    for (let index = blocks.length - 1; index >= 0; index -= 1) {
      const block = blocks[index];
      const target = await adapter.resolve(block.ownerUuid);
      if (!target) return false;
      const current = await adapter.snapshotItem(target);
      await adapter.translateY(target, block.bounds.top - current.bounds.top);
    }
    if (!await adapter.verifyTextStates(textStates)) return false;
    for (const block of blocks) {
      const target = await adapter.resolve(block.ownerUuid);
      if (!target) return false;
      const current = await adapter.snapshotItem(target);
      if (!sameNumber(current.bounds.top, block.bounds.top) || !sameNumber(current.bounds.bottom, block.bounds.bottom) ||
        !sameNumber(current.bounds.left, block.bounds.left) || !sameNumber(current.bounds.right, block.bounds.right)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function measureSources<T>(
  adapter: SmartTextAutoFlowAdapter<T>,
  states: readonly SmartTextState[],
): Promise<{ ok: true; heights: Map<string, number> } | { ok: false; reason: string }> {
  const heights = new Map<string, number>();
  for (const state of states) {
    const target = await adapter.resolve(state.uuid);
    if (!target) return { ok: false, reason: `measurement source ${state.uuid} could not be resolved` };
    const measurement = await measureAreaTextRequiredHeightAsync(target, adapter.areaText as AsyncAreaTextMeasurementAdapter<T>);
    if (measurement.status !== 'SUCCESS') return { ok: false, reason: measurement.reason ?? `AreaText measurement failed for ${state.uuid}` };
    heights.set(state.uuid, measurement.measuredHeight);
  }
  return { ok: true, heights };
}

/**
 * Certifies C3's restored height at the private Wave 3.6 runtime boundary.
 * H1 is used directly when it is stable; a bounded search runs only when H1
 * remains stably overset after C3 restored the source geometry.
 */
async function certifyPortableHeights<T>(
  adapter: SmartTextAutoFlowAdapter<T>,
  states: readonly SmartTextState[],
  firstMeasuredHeights: ReadonlyMap<string, number>,
): Promise<{ ok: true; heights: Map<string, number> } | { ok: false; reason: string }> {
  const portableHeights = new Map<string, number>();

  try {
    for (const state of states) {
      const h1 = firstMeasuredHeights.get(state.uuid);
      if (typeof h1 !== 'number' || !Number.isFinite(h1)) {
        return { ok: false, reason: `portable-height certification is missing H1 for ${state.uuid}` };
      }
      if (h1 <= state.height + TOLERANCE) {
        portableHeights.set(state.uuid, h1);
        continue;
      }

      const target = await adapter.resolve(state.uuid);
      if (!target) return { ok: false, reason: `portable-height certification could not resolve ${state.uuid}` };

      // C3 has restored this exact post-mutation baseline.
      const base = await adapter.areaText.snapshot(target);
      const maximumHeight = base.height * PORTABLE_HEIGHT_MAX_GROWTH_FACTOR;
      if (!Number.isFinite(maximumHeight) || maximumHeight <= base.height) {
        return { ok: false, reason: `portable-height maximum is invalid for ${state.uuid}` };
      }

      let candidateCount = 0;
      const verifyBase = async (): Promise<void> => {
        const current = await adapter.areaText.snapshot(target);
        const geometrySame =
          sameNumber(current.top, base.top) &&
          sameNumber(current.left, base.left) &&
          sameNumber(current.width, base.width) &&
          sameNumber(current.height, base.height);
        if (
          !geometrySame ||
          current.contents !== base.contents ||
          JSON.stringify(current.formatting) !== JSON.stringify(base.formatting)
        ) {
          throw new Error(`portable-height certification failed to restore baseline for ${state.uuid}`);
        }
      };

      const testCandidate = async (height: number, countAgainstBudget: boolean) => {
        if (!Number.isFinite(height) || height <= 0) throw new Error('portable-height candidate is invalid');
        if (countAgainstBudget) {
          if (candidateCount >= PORTABLE_HEIGHT_MAX_CANDIDATES) {
            throw new Error(`no portable fitting region found within bounded budget for ${state.uuid}`);
          }
          candidateCount += 1;
        }
        try {
          return await adapter.observeSetHeight(target, height);
        } finally {
          await adapter.areaText.setHeight(target, base.height);
          await verifyBase();
        }
      };

      const h1Observation = await testCandidate(h1, true);
      if (!h1Observation.overset) {
        portableHeights.set(state.uuid, h1);
        continue;
      }

      let lowerOverset = h1;
      let upperFit: number | null = null;
      let current = h1;
      while (upperFit === null) {
        const candidate = Math.min(current * 2, maximumHeight);
        if (candidate <= current) {
          throw new Error(`AreaText remained non-portable at maximum height for ${state.uuid}`);
        }
        const observation = await testCandidate(candidate, true);
        if (observation.overset) {
          lowerOverset = candidate;
          current = candidate;
        } else {
          upperFit = candidate;
        }
      }

      let portableHeight = upperFit;
      while (
        candidateCount < PORTABLE_HEIGHT_MAX_CANDIDATES &&
        portableHeight - lowerOverset > PORTABLE_HEIGHT_GEOMETRY_TOLERANCE
      ) {
        const candidate = lowerOverset + ((portableHeight - lowerOverset) / 2);
        const observation = await testCandidate(candidate, true);
        if (observation.overset) lowerOverset = candidate;
        else portableHeight = candidate;
      }

      // Two independent restore -> exact selected-height confirmations.
      for (let cycle = 1; cycle <= 2; cycle += 1) {
        const observation = await testCandidate(portableHeight, false);
        if (observation.overset) {
          throw new Error(`selected portable height failed confirmation ${cycle} for ${state.uuid}`);
        }
      }
      portableHeights.set(state.uuid, portableHeight);
    }
    return { ok: true, heights: portableHeights };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Uses final source heights temporarily to observe a grouped move owner's real
 * external extent, then restores each source before any final transaction apply.
 * This is the missing source-vs-owner bridge that frozen public C5 cannot express.
 */
async function projectOwnerGrowth<T>(
  adapter: SmartTextAutoFlowAdapter<T>,
  blocks: readonly LayoutBlock[],
  sourceStateByUuid: ReadonlyMap<string, SmartTextState>,
  measuredHeights: ReadonlyMap<string, number>,
): Promise<{ ok: true; growthByOwner: Map<string, number> } | { ok: false; reason: string }> {
  const projected = new Map<string, VerticalFlowItemSnapshot>();
  try {
    for (const [uuid, height] of measuredHeights) {
      const target = await adapter.resolve(uuid);
      if (!target) throw new Error(`projection could not resolve ${uuid}`);
      await adapter.areaText.setHeight(target, height);
    }
    for (const block of blocks) {
      const target = await adapter.resolve(block.ownerUuid);
      if (!target) throw new Error(`projection could not resolve owner ${block.ownerUuid}`);
      projected.set(block.ownerUuid, await adapter.snapshotItem(target));
    }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  } finally {
    try {
      for (const [uuid] of measuredHeights) {
        const state = sourceStateByUuid.get(uuid);
        const target = await adapter.resolve(uuid);
        if (!state || !target) throw new Error(`projection restoration could not resolve ${uuid}`);
        await adapter.areaText.setHeight(target, state.height);
      }
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : String(error) };
    }
  }
  const growthByOwner = new Map<string, number>();
  for (const block of blocks) {
    const current = projected.get(block.ownerUuid);
    if (!current) return { ok: false, reason: `projection missing owner ${block.ownerUuid}` };
    if (!sameNumber(current.bounds.left, block.bounds.left) || !sameNumber(current.bounds.right, block.bounds.right) || !sameNumber(current.bounds.top, block.bounds.top)) {
      return { ok: false, reason: `owner ${block.ownerUuid} changed X or top during source-height projection` };
    }
    growthByOwner.set(block.ownerUuid, Math.max(0, block.bounds.bottom - current.bounds.bottom));
  }
  return { ok: true, growthByOwner };
}

async function verifyFinal<T>(
  adapter: SmartTextAutoFlowAdapter<T>,
  blocks: readonly LayoutBlock[],
  sourceStates: readonly SmartTextState[],
  measuredHeights: ReadonlyMap<string, number>,
  plan: readonly { uuid: string; targetBounds: FlowBounds }[],
): Promise<string | null> {
  for (const state of sourceStates) {
    const target = await adapter.resolve(state.uuid);
    if (!target) return `verification could not resolve source ${state.uuid}`;
    const expected = measuredHeights.get(state.uuid) ?? state.height;
    const finalProbe = await adapter.areaText.probeHeight(target, expected);
    if (!sameNumber(finalProbe.requestedHeight, expected) || !sameNumber(finalProbe.actualHeight, expected)) return `source ${state.uuid} height mismatch`;
    if (expected > state.height + TOLERANCE && finalProbe.overset) return `source ${state.uuid} remains overset`;
  }
  for (const planned of plan) {
    const target = await adapter.resolve(planned.uuid);
    if (!target) return `verification could not resolve owner ${planned.uuid}`;
    const current = await adapter.snapshotItem(target);
    if (!sameNumber(current.bounds.left, planned.targetBounds.left) || !sameNumber(current.bounds.right, planned.targetBounds.right) ||
      !sameNumber(current.bounds.top, planned.targetBounds.top) || !sameNumber(current.bounds.bottom, planned.targetBounds.bottom)) {
      return `owner ${planned.uuid} geometry mismatch`;
    }
  }
  for (let index = 1; index < blocks.length; index += 1) {
    const previous = await adapter.snapshotItem((await adapter.resolve(blocks[index - 1].ownerUuid)) as T);
    const current = await adapter.snapshotItem((await adapter.resolve(blocks[index].ownerUuid)) as T);
    const originalGap = blocks[index - 1].bounds.bottom - blocks[index].bounds.top;
    const finalGap = previous.bounds.bottom - current.bounds.top;
    if (!sameNumber(originalGap, finalGap)) return `owner gap ${index - 1} changed`;
  }
  return null;
}

/**
 * The sole B2 orchestration lifecycle. Existing public handlers supply their
 * current mutation callback; this transaction owns snapshot, C3 measurement,
 * owner/source projection, Planner use, final application, verification, and
 * restoration. It intentionally exposes no public schema or result fields.
 */
export async function executeSmartTextMutation<R, T>(request: SmartTextMutationRequest<R, T>): Promise<SmartTextMutationOutcome<R>> {
  const layoutMutations = request.mutations.filter((mutation) => mutation.layoutAffecting);
  if (layoutMutations.length === 0) {
    const result = await request.executeMutation();
    return { result, status: 'BYPASSED_NON_LAYOUT', rolledBack: false, measuredSourceCount: 0, appliedMoveCount: 0 };
  }

  let snapshot: SmartTextMutationSnapshot;
  try {
    snapshot = await request.adapter.snapshotMutation(layoutMutations.map((mutation) => mutation.targetUuid));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { result: request.failure(reason, 'PRECHECK_FAILED'), status: 'PRECHECK_FAILED', reason, rolledBack: false, measuredSourceCount: 0, appliedMoveCount: 0 };
  }

  const states = sourceStates(snapshot, layoutMutations);
  if (states.length !== layoutMutations.length || states.some((state) => !snapshot.items.some((item) => item.uuid === state.uuid && item.type === 'AREA_TEXT'))) {
    const result = await request.executeMutation();
    return { result, status: 'BYPASSED_NON_LAYOUT', rolledBack: false, measuredSourceCount: 0, appliedMoveCount: 0 };
  }
  const discovery = discoverAutoFlow({ context: contextFor(snapshot, layoutMutations, request.context), items: snapshot.items, mutations: layoutMutations });
  const stateByUuid = new Map(states.map((state) => [state.uuid, state]));

  let result: R;
  try {
    result = await request.executeMutation();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const restored = await restore(request.adapter, states, []);
    const status: SmartTextMutationStatus = restored ? 'MUTATION_FAILED_ROLLED_BACK' : 'ROLLBACK_FAILED';
    return { result: request.failure(reason, status), status, reason, rolledBack: true, measuredSourceCount: 0, appliedMoveCount: 0 };
  }
  if (!request.mutationSucceeded(result)) {
    const restored = await restore(request.adapter, states, []);
    const status: SmartTextMutationStatus = restored ? 'MUTATION_FAILED_ROLLED_BACK' : 'ROLLBACK_FAILED';
    return { result: request.failure('requested mutation did not verify', status), status, reason: 'requested mutation did not verify', rolledBack: true, measuredSourceCount: 0, appliedMoveCount: 0 };
  }

  const measurement = await measureSources(request.adapter, states);
  if (!measurement.ok) {
    const restored = await restore(request.adapter, states, discovery.orderedBlocks);
    const status: SmartTextMutationStatus = restored ? 'MEASUREMENT_FAILED_ROLLED_BACK' : 'ROLLBACK_FAILED';
    return { result: request.failure(measurement.reason, status), status, reason: measurement.reason, rolledBack: true, measuredSourceCount: 0, appliedMoveCount: 0 };
  }
  const hasPositiveMeasuredGrowth = [...measurement.heights].some(
    ([uuid, height]) => height > (stateByUuid.get(uuid) as SmartTextState).height + TOLERANCE,
  );
  if (!hasPositiveMeasuredGrowth) {
    return {
      result,
      status: 'SUCCESS_NO_GROWTH',
      rolledBack: false,
      measuredSourceCount: states.length,
      appliedMoveCount: 0,
    };
  }

  const portable = await certifyPortableHeights(
    request.adapter,
    states,
    measurement.heights,
  );
  if (!portable.ok) {
    const restored = await restore(
      request.adapter,
      states,
      discovery.orderedBlocks,
    );
    const status: SmartTextMutationStatus = restored
      ? 'MEASUREMENT_FAILED_ROLLED_BACK'
      : 'ROLLBACK_FAILED';
    return {
      result: request.failure(portable.reason, status),
      status,
      reason: portable.reason,
      rolledBack: restored,
      measuredSourceCount: states.length,
      appliedMoveCount: 0,
    };
  }
  const effectiveHeights: ReadonlyMap<string, number> = portable.heights;

  if (discovery.status !== 'SUCCESS') {
    if (discovery.status === 'AUTO_FLOW_NO_DOWNSTREAM_BLOCKS') {
      try {
        for (const [uuid, height] of effectiveHeights) {
          const target = await request.adapter.resolve(uuid);
          if (!target) throw new Error(`could not resolve source ${uuid}`);
          await request.adapter.areaText.setHeight(target, height);
        }
        const verification = await verifyFinal(request.adapter, [], states, effectiveHeights, []);
        if (verification) throw new Error(verification);
        return { result, status: 'SUCCESS', rolledBack: false, measuredSourceCount: states.length, appliedMoveCount: 0 };
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        const restored = await restore(request.adapter, states, []);
        const status: SmartTextMutationStatus = restored ? 'APPLY_FAILED_ROLLED_BACK' : 'ROLLBACK_FAILED';
        return { result: request.failure(reason, status), status, reason, rolledBack: true, measuredSourceCount: states.length, appliedMoveCount: 0 };
      }
    }
    const reason = discovery.reason ?? discovery.status;
    const restored = await restore(request.adapter, states, []);
    const status: SmartTextMutationStatus = restored ? 'AUTO_FLOW_AMBIGUOUS_ROLLED_BACK' : 'ROLLBACK_FAILED';
    return { result: request.failure(reason, status), status, reason, rolledBack: true, measuredSourceCount: states.length, appliedMoveCount: 0 };
  }

  const projection = await projectOwnerGrowth(request.adapter, discovery.orderedBlocks, stateByUuid, effectiveHeights);
  if (!projection.ok) {
    const restored = await restore(request.adapter, states, discovery.orderedBlocks);
    const status: SmartTextMutationStatus = restored ? 'MEASUREMENT_FAILED_ROLLED_BACK' : 'ROLLBACK_FAILED';
    return { result: request.failure(projection.reason, status), status, reason: projection.reason, rolledBack: true, measuredSourceCount: states.length, appliedMoveCount: 0 };
  }

  let plan: ReturnType<typeof planVerticalFlow>;
  try {
    plan = planVerticalFlow(discovery.orderedBlocks.map((block) => ({
      uuid: block.ownerUuid,
      originalBounds: block.bounds,
      resizable: block.sourceUuids.length > 0,
      measuredHeight: block.bounds.height + (projection.growthByOwner.get(block.ownerUuid) ?? 0),
    })));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const restored = await restore(request.adapter, states, discovery.orderedBlocks);
    const status: SmartTextMutationStatus = restored ? 'APPLY_FAILED_ROLLED_BACK' : 'ROLLBACK_FAILED';
    return { result: request.failure(reason, status), status, reason, rolledBack: true, measuredSourceCount: states.length, appliedMoveCount: 0 };
  }

  let appliedMoveCount = 0;
  try {
    // All sources are finalized before any owner receives its one cumulative translation.
    for (const [uuid, height] of effectiveHeights) {
      const target = await request.adapter.resolve(uuid);
      if (!target) throw new Error(`could not resolve source ${uuid}`);
      await request.adapter.areaText.setHeight(target, height);
    }
    for (const planned of plan) {
      if (sameNumber(planned.deltaY, 0)) continue;
      const target = await request.adapter.resolve(planned.uuid);
      if (!target) throw new Error(`could not resolve owner ${planned.uuid}`);
      await request.adapter.translateY(target, planned.deltaY);
      appliedMoveCount += 1;
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const restored = await restore(request.adapter, states, discovery.orderedBlocks);
    const status: SmartTextMutationStatus = restored ? 'APPLY_FAILED_ROLLED_BACK' : 'ROLLBACK_FAILED';
    return { result: request.failure(reason, status), status, reason, rolledBack: true, measuredSourceCount: states.length, appliedMoveCount };
  }
  let verification: string | null;
  try {
    verification = await verifyFinal(request.adapter, discovery.orderedBlocks, states, effectiveHeights, plan);
  } catch (error) {
    verification = error instanceof Error ? error.message : String(error);
  }
  if (verification) {
    const restored = await restore(request.adapter, states, discovery.orderedBlocks);
    const status: SmartTextMutationStatus = restored ? 'VERIFY_FAILED_ROLLED_BACK' : 'ROLLBACK_FAILED';
    return { result: request.failure(verification, status), status, reason: verification, rolledBack: true, measuredSourceCount: states.length, appliedMoveCount };
  }
  return {
    result,
    status: 'SUCCESS',
    rolledBack: false,
    measuredSourceCount: states.length,
    appliedMoveCount,
  };
}
