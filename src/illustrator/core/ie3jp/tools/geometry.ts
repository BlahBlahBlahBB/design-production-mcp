/**
 * Explicit, opt-in bounds helpers for new geometry-aware tools.
 *
 * Existing tools retain their established bounds behavior.  Callers must choose
 * either geometric or visible bounds; this helper never guesses a fallback.
 */
export const EXPLICIT_BOUNDS_JSX = `
function dpmNormalizeBounds(rawBounds) {
  if (!rawBounds || rawBounds.length !== 4) throw new Error("Bounds are unavailable or malformed");
  var x1 = Number(rawBounds[0]), y1 = Number(rawBounds[1]), x2 = Number(rawBounds[2]), y2 = Number(rawBounds[3]);
  if (!isFinite(x1) || !isFinite(y1) || !isFinite(x2) || !isFinite(y2)) throw new Error("Bounds contain non-finite values");
  var left = Math.min(x1, x2), right = Math.max(x1, x2), top = Math.max(y1, y2), bottom = Math.min(y1, y2);
  return { left:left, top:top, right:right, bottom:bottom, width:right-left, height:top-bottom };
}

function dpmReadBounds(item, policy) {
  if (policy !== "geometric" && policy !== "visible") throw new Error("Bounds policy must be geometric or visible");
  return dpmNormalizeBounds(policy === "geometric" ? item.geometricBounds : item.visibleBounds);
}

function dpmBoundsMatch(first, second, tolerance) {
  if (!first || !second) return false;
  var limit = typeof tolerance === "number" ? tolerance : 0.01;
  return Math.abs(first.left-second.left) <= limit && Math.abs(first.top-second.top) <= limit &&
    Math.abs(first.right-second.right) <= limit && Math.abs(first.bottom-second.bottom) <= limit;
}
`;
