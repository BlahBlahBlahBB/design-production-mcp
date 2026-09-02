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
