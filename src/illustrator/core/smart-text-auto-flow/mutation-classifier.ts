import type { LayoutMutation } from './types.js';

/**
 * This is deliberately an allow-list. A new text property cannot start an
 * automatic layout operation until its wrapping or vertical-metric effect is
 * reviewed and added here.
 */
const LAYOUT_AFFECTING_PROPERTIES = new Set([
  'contents',
  'text_style',
  'font_name', 'font_family', 'font_style', 'font_size',
  'tracking', 'leading', 'auto_leading', 'autoLeading',
  'paragraph_alignment', 'first_line_indent', 'left_indent', 'right_indent',
  'space_before', 'space_after', 'hyphenation', 'hyphenate_capitalized_words',
  'hyphenate_limit', 'hyphenation_preference', 'hyphenation_zone',
  'maximum_consecutive_hyphens', 'minimum_before_hyphen', 'minimum_after_hyphen',
  'minimum_word_length', 'single_word_justification',
  'desired_word_spacing', 'minimum_word_spacing', 'maximum_word_spacing',
  'desired_letter_spacing', 'minimum_letter_spacing', 'maximum_letter_spacing',
  'desired_glyph_scaling', 'minimum_glyph_scaling', 'maximum_glyph_scaling',
  'every_line_composer', 'auto_leading_amount', 'leading_type',
  'paragraph.justification', 'paragraph.alignment', 'paragraph.first_line_indent',
  'paragraph.left_indent', 'paragraph.right_indent', 'paragraph.space_before',
  'paragraph.space_after', 'paragraph.hyphenation',
]);

function validPropertyList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((property) => typeof property === 'string' && property.length > 0);
}

/** False for unknown or malformed inputs: classification never guesses. */
export function isLayoutAffectingMutation(input: unknown): boolean {
  if (!input || typeof input !== 'object') return false;
  const candidate = input as { changedProperties?: unknown };
  if (!validPropertyList(candidate.changedProperties)) return false;
  return candidate.changedProperties.some((property) => LAYOUT_AFFECTING_PROPERTIES.has(property));
}

/**
 * Normalizes only a fully specified descriptor. Unknown changed properties are
 * retained for auditability but do not make the mutation layout-affecting.
 */
export function normalizeLayoutMutation(input: unknown): LayoutMutation | null {
  if (!input || typeof input !== 'object') return null;
  const candidate = input as { targetUuid?: unknown; changedProperties?: unknown };
  if (typeof candidate.targetUuid !== 'string' || candidate.targetUuid.length === 0 || !validPropertyList(candidate.changedProperties)) {
    return null;
  }
  const changedProperties = [...new Set(candidate.changedProperties)];
  return {
    targetUuid: candidate.targetUuid,
    changedProperties,
    layoutAffecting: changedProperties.some((property) => LAYOUT_AFFECTING_PROPERTIES.has(property)),
  };
}

export { LAYOUT_AFFECTING_PROPERTIES };
