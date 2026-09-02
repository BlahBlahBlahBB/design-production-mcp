import type { IllustratorStatus } from "../executor/bridge.js";

const REQUIRED = [
  "status",
  "document.read",
  "text.read",
  "text.write",
  "save.copy",
  "export.pdf",
  "export.png",
] as const;

export function missingProductionCapabilities(status: IllustratorStatus): string[] {
  if (!status.installed) return ["illustrator.installed"];
  return REQUIRED.filter((capability) => status.capabilities[capability] !== true);
}

export function isProductionReady(status: IllustratorStatus): boolean {
  return status.installed && status.running && missingProductionCapabilities(status).length === 0;
}
