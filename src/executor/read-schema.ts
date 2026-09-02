export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface DocumentInfo {
  name: string;
  path: string | null;
  saved: boolean;
  modified: boolean | null;
  modifiedSupported: boolean;
  colorSpace: string;
  width: number | null;
  height: number | null;
  rulerUnits: string | null;
  artboardCount: number;
  layerCount: number;
  textFrameCount: number;
  placedImageCount: number;
  activeArtboardIndex: number | null;
}

export interface ArtboardInfo {
  index: number;
  name: string;
  rect: [number, number, number, number];
  width: number;
  height: number;
  active: boolean;
}

export interface LayerInfo {
  index: number;
  path: string;
  name: string;
  visible: boolean | null;
  locked: boolean | null;
  printable: boolean | null;
  objectCount: number | null;
  childLayers: LayerInfo[];
}

export interface SelectionItemInfo {
  index: number;
  typename: string;
  name: string | null;
  bounds: Bounds | null;
  locked: boolean | null;
  hidden: boolean | null;
}

export interface SelectionInfo {
  selectionCount: number;
  items: SelectionItemInfo[];
}

export interface TextFrameSummary {
  index: number;
  name: string;
  contents: string;
  typename: string;
  locked: boolean | null;
  hidden: boolean | null;
  position: Point | null;
  bounds: Bounds | null;
  textKind: string | null;
  fontFamily: string | null;
  fontName: string | null;
  fontSize: number | null;
  overflow: boolean | null;
  overflowSupported: boolean;
}

export interface TextFrameTypography {
  fontFamily: string | null;
  fontName: string | null;
  fontStyle: string | null;
  fontSize: number | null;
  tracking: number | null;
  leading: number | null;
  justification: string | null;
  paragraphCount: number | null;
}

export interface TextFrameDetail extends TextFrameSummary {
  typography: TextFrameTypography;
}

export type TextFrameTarget =
  | { index: number; name?: never }
  | { name: string; index?: never };

/** A document/session structural reference; it is deliberately not a persistent object ID. */
export interface ObjectLocator {
  kind: "document-session-structural";
  typename: string;
  name: string | null;
  layerPath: string;
  ancestry: string[];
  collectionPath: string;
}

export interface ObjectSummary {
  typename: string;
  name: string | null;
  locator: ObjectLocator;
  layerPath: string;
  ancestry: string[];
  collectionPath: string;
  locked: boolean | null;
  hidden: boolean | null;
  bounds: Bounds | null;
  contentsPreview: string | null;
  contentsLength: number | null;
}

export interface GroupInfo extends ObjectSummary {
  parentGroupPath: string | null;
  clipped: boolean | null;
  clippedSupported: boolean;
  clippingMask: boolean | null;
  clippingMaskSupported: boolean;
  childObjectCount: number | null;
  childGroupCount: number | null;
}

export interface TraversalOptions {
  maxDepth?: number;
  maxObjects?: number;
}

export interface GroupsResult {
  groups: GroupInfo[];
  objectCount: number;
  truncated: boolean;
  truncationReason: string | null;
}

export interface StructureNode extends ObjectSummary {
  nodeType: "layer" | "object";
  children: StructureNode[];
  truncated: boolean;
}

export interface DocumentStructure {
  document: { name: string; path: string | null };
  layers: StructureNode[];
  objectCount: number;
  truncated: boolean;
  truncationReason: string | null;
}

export interface StringMatch {
  value: string;
  mode: "exact" | "contains";
}

export interface FindObjectsCriteria {
  name?: StringMatch;
  typename?: string | string[];
  layerName?: string;
  layerPath?: string;
  text?: StringMatch;
  locked?: boolean;
  hidden?: boolean;
}

export interface FindObjectsOptions extends TraversalOptions {
  maxResults?: number;
}

export interface FindObjectsResult {
  matchedCount: number;
  results: ObjectSummary[];
  truncated: boolean;
  truncationReason: string | null;
  criteriaApplied: FindObjectsCriteria;
}

export type CoordinateDirection = "artboard-to-document" | "document-to-artboard";

export interface ConvertCoordinateRequest {
  x: number;
  y: number;
  direction: CoordinateDirection;
  artboardIndex?: number;
}

export interface CoordinateConversion {
  input: { x: number; y: number; space: "artboard" | "document" };
  output: { x: number; y: number; space: "artboard" | "document" };
  artboardIndex: number;
  artboardRect: [number, number, number, number];
}
