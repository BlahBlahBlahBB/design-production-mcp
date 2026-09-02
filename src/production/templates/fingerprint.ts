import { createHash } from "node:crypto";

export interface TemplateStructure {
  documentName: string;
  artboards: Array<{ name: string; width: number; height: number }>;
  dynamicObjects: Array<{ name: string; kind: string; layer: string }>;
  protectedLayers: string[];
}

export function templateFingerprint(structure: TemplateStructure): string {
  const normalized = {
    ...structure,
    artboards: [...structure.artboards].sort((a, b) => a.name.localeCompare(b.name)),
    dynamicObjects: [...structure.dynamicObjects].sort((a, b) => a.name.localeCompare(b.name)),
    protectedLayers: [...structure.protectedLayers].sort(),
  };
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}
