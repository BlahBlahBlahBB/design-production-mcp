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
