import type {
  AutoFlowContext,
  AutoFlowDiscoveryResult,
  LayoutBlock,
  LayoutBounds,
  LayoutItemSnapshot,
  LayoutMutation,
} from './types.js';

const EPSILON = 0.0001;
/** A candidate must share at least half of the narrower block's width with the source lane. */
export const MIN_NARROWER_HORIZONTAL_OVERLAP_RATIO = 0.5;
/** An artboard fallback treats an item spanning 95% of both axes as a background. */
export const ARTBOARD_BACKGROUND_COVERAGE_RATIO = 0.95;
/** In fallback mode, an item wider than two source lanes is too broad to infer as content. */
export const MAX_FALLBACK_LANE_WIDTH_MULTIPLIER = 2;

type OwnerResolution =
  | { ok: true; owner: LayoutItemSnapshot }
  | { ok: false; status: 'AUTO_FLOW_CONTEXT_UNRESOLVED' | 'AUTO_FLOW_UNSUPPORTED_HIERARCHY'; reason: string };

export interface AutoFlowDiscoveryInput {
  context: AutoFlowContext | null | undefined;
  items: readonly LayoutItemSnapshot[];
  mutations: readonly LayoutMutation[];
  /** Available only when ARTBOARD background classification is needed. */
  artboardBounds?: LayoutBounds;
}

function validBounds(bounds: LayoutBounds): boolean {
  return Number.isFinite(bounds.left) && Number.isFinite(bounds.top) && Number.isFinite(bounds.right) && Number.isFinite(bounds.bottom) &&
    Number.isFinite(bounds.width) && Number.isFinite(bounds.height) && bounds.right > bounds.left && bounds.top > bounds.bottom &&
    Math.abs(bounds.width - (bounds.right - bounds.left)) <= EPSILON && Math.abs(bounds.height - (bounds.top - bounds.bottom)) <= EPSILON;
}

function copyBounds(bounds: LayoutBounds): LayoutBounds {
  return { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom, width: bounds.width, height: bounds.height };
}

function isUnsafe(item: LayoutItemSnapshot): boolean {
  return item.locked === true || item.hidden === true || item.clipped === true || item.isClippingGroup === true;
}

function hasAncestor(item: LayoutItemSnapshot, uuid: string): boolean {
  return item.parentGroupUuids.includes(uuid);
}

function isInContext(item: LayoutItemSnapshot, context: AutoFlowContext): boolean {
  if (context.artboardIndex !== undefined && item.artboardIndex !== context.artboardIndex) return false;
  switch (context.kind) {
    case 'ARTBOARD':
      return item.artboardIndex === context.artboardIndex;
    case 'EXPLICIT_CONTAINER':
      return item.uuid === context.containerUuid || hasAncestor(item, context.containerUuid);
    case 'CONTAINING_GROUP':
      return item.uuid === context.groupUuid || hasAncestor(item, context.groupUuid);
    case 'EXPLICIT_TARGET_SET':
      return context.targetUuids.includes(item.uuid);
    case 'SELECTION':
      return context.selectedUuids.includes(item.uuid);
  }
}

function contextOwnerAllowed(owner: LayoutItemSnapshot, context: AutoFlowContext): boolean {
  switch (context.kind) {
    case 'EXPLICIT_TARGET_SET':
      return context.targetUuids.includes(owner.uuid);
    case 'SELECTION':
      return context.selectedUuids.includes(owner.uuid);
    default:
      return isInContext(owner, context);
  }
}

/**
 * Picks the nearest group only when that group is inside the explicit bounded
 * context. This avoids a blanket walk to an unrelated outer card or document group.
 */
export function resolveLayoutOwner(
  item: LayoutItemSnapshot,
  itemsByUuid: ReadonlyMap<string, LayoutItemSnapshot>,
  context: AutoFlowContext | null | undefined,
): OwnerResolution {
  if (!context || !isInContext(item, context)) {
    return { ok: false, status: 'AUTO_FLOW_CONTEXT_UNRESOLVED', reason: `item ${item.uuid} is outside the bounded context` };
  }
  if (isUnsafe(item)) return { ok: false, status: 'AUTO_FLOW_UNSUPPORTED_HIERARCHY', reason: `item ${item.uuid} is locked, hidden, or clipped` };
  if (item.type === 'GROUP') return { ok: true, owner: item };

  for (const parentUuid of item.parentGroupUuids) {
    const parent = itemsByUuid.get(parentUuid);
    if (!parent || parent.type !== 'GROUP' || !contextOwnerAllowed(parent, context)) continue;
    if (isUnsafe(parent)) return { ok: false, status: 'AUTO_FLOW_UNSUPPORTED_HIERARCHY', reason: `group owner ${parent.uuid} is locked, hidden, or clipped` };
    return { ok: true, owner: parent };
  }
  return { ok: true, owner: item };
}

function horizontalOverlap(first: LayoutBounds, second: LayoutBounds): number {
  return Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left));
}

function narrowerOverlapRatio(first: LayoutBounds, second: LayoutBounds): number {
  const narrower = Math.min(first.width, second.width);
  return narrower <= 0 ? 0 : horizontalOverlap(first, second) / narrower;
}

function unionBounds(items: readonly LayoutBlock[]): LayoutBounds {
  const left = Math.min(...items.map((item) => item.bounds.left));
  const right = Math.max(...items.map((item) => item.bounds.right));
  const top = Math.max(...items.map((item) => item.bounds.top));
  const bottom = Math.min(...items.map((item) => item.bounds.bottom));
  return { left, right, top, bottom, width: right - left, height: top - bottom };
}

function isArtboardBackground(item: LayoutItemSnapshot, artboardBounds: LayoutBounds | undefined): boolean {
  if (item.role === 'BACKGROUND' || item.role === 'DECORATIVE') return true;
  if (!artboardBounds) return false;
  return item.bounds.width >= artboardBounds.width * ARTBOARD_BACKGROUND_COVERAGE_RATIO &&
    item.bounds.height >= artboardBounds.height * ARTBOARD_BACKGROUND_COVERAGE_RATIO;
}

function blockFrom(owner: LayoutItemSnapshot, sourceUuids: readonly string[]): LayoutBlock {
  return {
    ownerUuid: owner.uuid,
    ownerType: owner.type,
    bounds: copyBounds(owner.bounds),
    sourceUuids: [...sourceUuids].sort(),
    artboardIndex: owner.artboardIndex,
    parentGroupUuid: owner.parentGroupUuids[0],
  };
}

/** Stable ordering primitive; discovery additionally rejects non-linear rows. */
export function orderLayoutBlocks(blocks: readonly LayoutBlock[]): LayoutBlock[] {
  return [...blocks].sort((first, second) =>
    second.bounds.top - first.bounds.top || first.bounds.left - second.bounds.left || first.ownerUuid.localeCompare(second.ownerUuid));
}

function preferOuterOwner(context: AutoFlowContext, owner: LayoutItemSnapshot): boolean {
  if (context.kind === 'EXPLICIT_CONTAINER' || context.kind === 'CONTAINING_GROUP') return true;
  if (context.kind === 'EXPLICIT_TARGET_SET') return context.targetUuids.includes(owner.uuid);
  if (context.kind === 'SELECTION') return context.selectedUuids.includes(owner.uuid);
  return false;
}

/**
 * A nested group pair cannot remain as two physical movers. In a deliberately
 * bounded container (or when an outer group was explicitly supplied), preserve
 * that outer owner. Artboard fallback instead preserves the nearer group so it
 * cannot accidentally promote content to an unrelated outer card.
 */
function deduplicateNestedOwners(
  owners: Map<string, { owner: LayoutItemSnapshot; sources: Set<string> }>,
  context: AutoFlowContext,
): void {
  const values = [...owners.values()];
  for (const outer of values) {
    if (!owners.has(outer.owner.uuid)) continue;
    for (const inner of values) {
      if (outer.owner.uuid === inner.owner.uuid || !owners.has(inner.owner.uuid) || !inner.owner.parentGroupUuids.includes(outer.owner.uuid)) continue;
      const keepOuter = preferOuterOwner(context, outer.owner);
      const kept = keepOuter ? outer : inner;
      const removed = keepOuter ? inner : outer;
      for (const sourceUuid of removed.sources) kept.sources.add(sourceUuid);
      owners.delete(removed.owner.uuid);
    }
  }
}

function failure(status: AutoFlowDiscoveryResult['status'], reason: string): AutoFlowDiscoveryResult {
  return { status, orderedBlocks: [], reason };
}

export function discoverAutoFlow(input: AutoFlowDiscoveryInput): AutoFlowDiscoveryResult {
  const { context, items, mutations, artboardBounds } = input;
  if (!context) return failure('AUTO_FLOW_CONTEXT_UNRESOLVED', 'automatic flow requires an explicit bounded context');
  const itemsByUuid = new Map<string, LayoutItemSnapshot>();
  for (const item of items) {
    if (!item || typeof item.uuid !== 'string' || item.uuid.length === 0 || !Array.isArray(item.parentGroupUuids) || !validBounds(item.bounds) || itemsByUuid.has(item.uuid)) {
      return failure('AUTO_FLOW_UNSUPPORTED_HIERARCHY', 'item snapshots must be unique and have valid hierarchy and bounds');
    }
    itemsByUuid.set(item.uuid, item);
  }

  const sourceMutations = mutations.filter((mutation) => mutation.layoutAffecting);
  if (sourceMutations.length === 0) return failure('AUTO_FLOW_NO_DOWNSTREAM_BLOCKS', 'no layout-affecting mutations were supplied');

  const sourceOwners = new Map<string, { owner: LayoutItemSnapshot; sources: Set<string> }>();
  for (const mutation of sourceMutations) {
    const source = itemsByUuid.get(mutation.targetUuid);
    if (!source || source.type !== 'AREA_TEXT') return failure('AUTO_FLOW_UNSUPPORTED_HIERARCHY', `layout source ${mutation.targetUuid} is not a known AreaText`);
    const resolution = resolveLayoutOwner(source, itemsByUuid, context);
    if (!resolution.ok) return failure(resolution.status, resolution.reason);
    const existing = sourceOwners.get(resolution.owner.uuid) ?? { owner: resolution.owner, sources: new Set<string>() };
    existing.sources.add(source.uuid);
    sourceOwners.set(resolution.owner.uuid, existing);
  }
  const sourceBlocks = [...sourceOwners.values()].map(({ owner, sources }) => blockFrom(owner, [...sources]));
  const lane = unionBounds(sourceBlocks);
  for (let index = 1; index < sourceBlocks.length; index += 1) {
    if (narrowerOverlapRatio(sourceBlocks[0].bounds, sourceBlocks[index].bounds) + EPSILON < MIN_NARROWER_HORIZONTAL_OVERLAP_RATIO) {
      return failure('AUTO_FLOW_AMBIGUOUS', 'mutated sources do not share one safe horizontal lane');
    }
  }

  const blocks = new Map<string, { owner: LayoutItemSnapshot; sources: Set<string> }>(sourceOwners);
  const topmostSource = Math.max(...sourceBlocks.map((block) => block.bounds.top));
  for (const item of items) {
    if (!isInContext(item, context) || isArtboardBackground(item, artboardBounds)) continue;
    if (item.bounds.top > topmostSource + EPSILON) continue;
    const overlap = narrowerOverlapRatio(lane, item.bounds);
    if (overlap <= EPSILON) continue; // a separate column is not a member of this flow.
    if (overlap + EPSILON < MIN_NARROWER_HORIZONTAL_OVERLAP_RATIO) {
      return failure('AUTO_FLOW_AMBIGUOUS', `item ${item.uuid} partially overlaps the source lane`);
    }
    if (context.kind === 'ARTBOARD' && item.bounds.width > lane.width * MAX_FALLBACK_LANE_WIDTH_MULTIPLIER) {
      return failure('AUTO_FLOW_AMBIGUOUS', `item ${item.uuid} is too broad for artboard-only flow inference`);
    }
    const resolution = resolveLayoutOwner(item, itemsByUuid, context);
    if (!resolution.ok) return failure(resolution.status, resolution.reason);
    const existing = blocks.get(resolution.owner.uuid) ?? { owner: resolution.owner, sources: new Set<string>() };
    if (sourceMutations.some((mutation) => mutation.targetUuid === item.uuid && mutation.layoutAffecting)) existing.sources.add(item.uuid);
    blocks.set(resolution.owner.uuid, existing);
  }

  deduplicateNestedOwners(blocks, context);

  const result = orderLayoutBlocks([...blocks.values()].map(({ owner, sources }) => blockFrom(owner, [...sources])));
  const normalizedSourceBlockCount = result.filter((block) => block.sourceUuids.length > 0).length;
  if (result.length <= normalizedSourceBlockCount) return failure('AUTO_FLOW_NO_DOWNSTREAM_BLOCKS', 'the bounded context contains no safe downstream block');
  for (let index = 1; index < result.length; index += 1) {
    if (result[index - 1].bounds.bottom < result[index].bounds.top - EPSILON) {
      return failure('AUTO_FLOW_AMBIGUOUS', `layout blocks ${result[index - 1].ownerUuid} and ${result[index].ownerUuid} overlap vertically`);
    }
  }
  return { status: 'SUCCESS', orderedBlocks: result };
}
