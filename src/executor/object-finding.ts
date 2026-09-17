import type { FindObjectsCriteria, ObjectSummary, StringMatch } from "./read-schema.js";

export interface FindCandidate {
  typename: string;
  name: string | null;
  layerName: string | null;
  layerPath: string;
  contents: string | null;
  locked: boolean | null;
  hidden: boolean | null;
}

function matchesString(actual: string, expected: StringMatch): boolean {
  return expected.mode === "exact" ? actual === expected.value : actual.indexOf(expected.value) >= 0;
}

export function validateFindCriteria(criteria: FindObjectsCriteria): string | null {
  if (Object.keys(criteria).length === 0) return "INVALID_FIND_CRITERIA";
  for (const value of [criteria.name, criteria.text]) {
    if (value && (value.value.length === 0 || (value.mode !== "exact" && value.mode !== "contains"))) {
      return "INVALID_FIND_CRITERIA";
    }
  }
  const types = criteria.typename === undefined ? [] : Array.isArray(criteria.typename) ? criteria.typename : [criteria.typename];
  if ((criteria.typename !== undefined && types.length === 0) || types.some((type) => type.length === 0)) return "INVALID_FIND_CRITERIA";
  if (criteria.layerName === "" || criteria.layerPath === "") return "INVALID_FIND_CRITERIA";
  return null;
}

export function matchesFindCriteria(candidate: FindCandidate, criteria: FindObjectsCriteria): boolean {
  if (criteria.name && !matchesString(candidate.name ?? "", criteria.name)) return false;
  if (criteria.text && (candidate.typename !== "TextFrame" || !matchesString(candidate.contents ?? "", criteria.text))) return false;
  const types = criteria.typename === undefined ? undefined : Array.isArray(criteria.typename) ? criteria.typename : [criteria.typename];
  if (types && types.indexOf(candidate.typename) < 0) return false;
  if (criteria.layerName !== undefined && candidate.layerName !== criteria.layerName) return false;
  if (criteria.layerPath !== undefined && candidate.layerPath !== criteria.layerPath) return false;
  if (criteria.locked !== undefined && candidate.locked !== criteria.locked) return false;
  if (criteria.hidden !== undefined && candidate.hidden !== criteria.hidden) return false;
  return true;
}

export function asFindResult(
  candidates: Array<{ candidate: FindCandidate; summary: ObjectSummary }>,
  criteria: FindObjectsCriteria,
  maxResults: number,
) {
  const matches = candidates.filter(({ candidate }) => matchesFindCriteria(candidate, criteria));
  return {
    matchedCount: matches.length,
    results: matches.slice(0, maxResults).map(({ summary }) => summary),
    truncated: matches.length > maxResults,
  };
}
