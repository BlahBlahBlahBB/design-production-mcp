export type FitMode = "none" | "shrink_to_fit";

export interface TemplateField {
  objectName: string;
  kind: "text" | "image";
  required?: boolean;
  fit?: FitMode;
  minFontSize?: number;
  maxFontSize?: number;
}

export interface TemplateProfile {
  id: string;
  templatePath: string;
  fields: Record<string, TemplateField>;
  protectedLayers?: string[];
  output: {
    formats: Array<"pdf" | "png" | "jpg" | "ai">;
    filenamePattern: string;
  };
}

export function validateTemplateProfile(profile: TemplateProfile): string[] {
  const errors: string[] = [];
  if (!profile.id.trim()) errors.push("profile.id is required");
  if (!profile.templatePath.trim()) errors.push("profile.templatePath is required");
  if (!profile.output.filenamePattern.trim()) errors.push("output.filenamePattern is required");
  if (profile.output.formats.length === 0) errors.push("at least one output format is required");

  const objectOwners = new Map<string, string>();
  for (const [fieldName, field] of Object.entries(profile.fields)) {
    if (!field.objectName.trim()) errors.push(`field ${fieldName} requires objectName`);
    const owner = objectOwners.get(field.objectName);
    if (owner) errors.push(`object ${field.objectName} is mapped by both ${owner} and ${fieldName}`);
    objectOwners.set(field.objectName, fieldName);
    if (field.fit === "shrink_to_fit" && field.minFontSize && field.maxFontSize && field.minFontSize > field.maxFontSize) {
      errors.push(`field ${fieldName} minFontSize cannot exceed maxFontSize`);
    }
  }
  return errors;
}
