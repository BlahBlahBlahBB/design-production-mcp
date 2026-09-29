import { normalizeLayoutMutation } from './mutation-classifier.js';
import type { LayoutMutation } from './types.js';

type RecordValue = Record<string, unknown>;

function definedKeys(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value as RecordValue).flatMap(([key, entry]) => entry === undefined ? [] : [key]);
}

function normalized(targetUuid: string, changedProperties: string[]): LayoutMutation {
  const descriptor = normalizeLayoutMutation({ targetUuid, changedProperties });
  if (!descriptor) throw new Error('smart text mutation descriptors require a UUID and property list');
  return descriptor;
}

/** Shared handler normalization; it does not perform document inspection. */
export function mutationsForModifyOperations(operations: readonly { uuid: string; properties: RecordValue }[]): LayoutMutation[] {
  return operations.map((operation) => normalized(operation.uuid, definedKeys(operation.properties)));
}

export function mutationsForTypography(
  uuids: readonly string[],
  character: unknown,
  paragraph: unknown,
  scriptRules: unknown,
): LayoutMutation[] {
  const changed = [...definedKeys(character), ...definedKeys(paragraph)];
  // A named script rule can include a font or vertical-metric property. It is
  // an explicit known operation, rather than an unknown property guess.
  if (scriptRules && typeof scriptRules === 'object') changed.push('text_style');
  return uuids.map((uuid) => normalized(uuid, changed));
}

export function mutationForTextStyle(uuid: string): LayoutMutation {
  return normalized(uuid, ['text_style']);
}

export function mutationsForFormattedReplacement(uuids: readonly string[]): LayoutMutation[] {
  return uuids.map((uuid) => normalized(uuid, ['contents']));
}

/** Existing formatted MCP results are kept untouched on a committed transaction. */
export function formattedMutationSucceeded(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false;
  const formatted = result as { content?: Array<{ text?: unknown }> };
  const text = formatted.content?.[0]?.text;
  if (typeof text !== 'string') return false;
  try {
    const payload = JSON.parse(text) as { error?: unknown; success?: unknown; ok?: unknown };
    return payload.error !== true && payload.success !== false && payload.ok !== false;
  } catch {
    return false;
  }
}
