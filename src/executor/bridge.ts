import type {
  ArtboardInfo,
  DocumentInfo,
  LayerInfo,
  SelectionInfo,
  TextFrameDetail,
  TextFrameSummary,
  TextFrameTarget,
} from "./read-schema.js";

export type IllustratorCapability =
  | "status"
  | "document.read"
  | "text.read"
  | "text.write"
  | "save.copy"
  | "export.pdf"
  | "export.png";

export interface IllustratorStatus {
  installed: boolean;
  running: boolean;
  version?: string;
  capabilities: Partial<Record<IllustratorCapability, boolean>>;
}

export interface ScriptResult<T = unknown> {
  ok: boolean;
  value?: T;
  error?: string;
}

export interface IllustratorBridge {
  readonly id: string;
  detect(): Promise<IllustratorStatus>;
  execute<T = unknown>(script: string, timeoutMs?: number): Promise<ScriptResult<T>>;
}

export interface IllustratorReadBridge extends IllustratorBridge {
  getDocumentInfo(): Promise<ScriptResult<DocumentInfo>>;
  getArtboards(): Promise<ScriptResult<ArtboardInfo[]>>;
  getLayers(): Promise<ScriptResult<LayerInfo[]>>;
  getSelection(): Promise<ScriptResult<SelectionInfo>>;
  listTextFrames(): Promise<ScriptResult<TextFrameSummary[]>>;
  getTextFrameDetail(target: TextFrameTarget): Promise<ScriptResult<TextFrameDetail>>;
}
