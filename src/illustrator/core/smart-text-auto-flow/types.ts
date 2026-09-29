/**
 * Read-only planning inputs for Wave 3.6.  These types intentionally do not
 * reference Illustrator DOM wrappers: B1 is pure and is not a mutation path.
 */
export interface LayoutBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export type LayoutItemType = 'AREA_TEXT' | 'POINT_TEXT' | 'GROUP' | 'PATH' | 'COMPOUND_PATH' | 'IMAGE' | 'OTHER';
export type LayoutSemanticRole = 'CONTENT' | 'DECORATIVE' | 'BACKGROUND' | 'UNKNOWN';

/** A normalized, read-only item snapshot collected by a future integration layer. */
export interface LayoutItemSnapshot {
  uuid: string;
  type: LayoutItemType;
  bounds: LayoutBounds;
  artboardIndex?: number;
  /** Group UUIDs nearest-first. The item itself is never included. */
  parentGroupUuids: readonly string[];
  locked?: boolean;
  hidden?: boolean;
  /** True for an item with unsafe clipping ancestry. */
  clipped?: boolean;
  /** True only when this item is itself a clipping GroupItem. */
  isClippingGroup?: boolean;
  role?: LayoutSemanticRole;
}

export interface LayoutMutation {
  targetUuid: string;
  changedProperties: readonly string[];
  layoutAffecting: boolean;
}

/** Every physical move owner occurs once; sourceUuids remain independently resizable. */
export interface LayoutBlock {
  ownerUuid: string;
  ownerType: LayoutItemType;
  bounds: LayoutBounds;
  sourceUuids: readonly string[];
  artboardIndex?: number;
  parentGroupUuid?: string;
}

export type AutoFlowContext =
  | { kind: 'EXPLICIT_CONTAINER'; containerUuid: string; artboardIndex?: number }
  | { kind: 'EXPLICIT_TARGET_SET'; targetUuids: readonly string[]; artboardIndex?: number }
  | { kind: 'SELECTION'; selectedUuids: readonly string[]; artboardIndex?: number }
  | { kind: 'CONTAINING_GROUP'; groupUuid: string; artboardIndex?: number }
  | { kind: 'ARTBOARD'; artboardIndex: number };

export type AutoFlowDiscoveryStatus =
  | 'SUCCESS'
  | 'AUTO_FLOW_CONTEXT_UNRESOLVED'
  | 'AUTO_FLOW_AMBIGUOUS'
  | 'AUTO_FLOW_UNSUPPORTED_HIERARCHY'
  | 'AUTO_FLOW_NO_DOWNSTREAM_BLOCKS';

export interface AutoFlowDiscoveryResult {
  status: AutoFlowDiscoveryStatus;
  orderedBlocks: readonly LayoutBlock[];
  reason?: string;
}

export interface LayoutGrowth {
  ownerUuid: string;
  /** The measured external height delta. Negative values are intentionally ignored. */
  growth: number;
}

export interface CumulativeLayoutDisplacement {
  ownerUuid: string;
  /** Positive logical downward distance. An Illustrator adapter converts its sign at apply time. */
  downwardDisplacement: number;
  positiveGrowth: number;
}
