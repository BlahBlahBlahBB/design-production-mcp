export type AreaTextMeasurementStatus =
  | 'SUCCESS'
  | 'UNSUPPORTED'
  | 'MEASUREMENT_FAILED_RESTORED'
  | 'RESTORE_FAILED';

export interface AreaTextFormattingSnapshot {
  fontSizes: number[];
  leading: Array<number | null>;
  autoLeading: boolean[];
  tracking: Array<number | null>;
  paragraphs: Array<{ justification: unknown; spaceBefore: unknown; spaceAfter: unknown }>;
}

export interface AreaTextSnapshot {
  uuid: string | null;
  top: number;
  left: number;
  width: number;
  height: number;
  contents: string;
  formatting: AreaTextFormattingSnapshot;
}

export interface AreaTextEligibility {
  eligible: boolean;
  reason?: string;
}

export const THREADED_AREA_TEXT_UNSUPPORTED_REASON = 'Threaded AreaText is unsupported';
export const AREA_TEXT_THREADING_STATE_UNAVAILABLE_REASON = 'Unable to determine AreaText threading state';

/**
 * V1 supports an AreaText frame only when its Story contains that one frame.
 * Illustrator's nextFrame may be non-null for a standalone final frame, so it
 * is not a reliable threading predicate.
 */
export function checkAreaTextThreadingEligibility(target: unknown): AreaTextEligibility {
  try {
    if (typeof target !== 'object' || target === null) {
      return { eligible: false, reason: AREA_TEXT_THREADING_STATE_UNAVAILABLE_REASON };
    }
    const story = (target as { story?: unknown }).story;
    if (typeof story !== 'object' || story === null) {
      return { eligible: false, reason: AREA_TEXT_THREADING_STATE_UNAVAILABLE_REASON };
    }
    const textFrames = (story as { textFrames?: unknown }).textFrames;
    if (typeof textFrames !== 'object' || textFrames === null) {
      return { eligible: false, reason: AREA_TEXT_THREADING_STATE_UNAVAILABLE_REASON };
    }
    const count = (textFrames as { length?: unknown }).length;
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) {
      return { eligible: false, reason: AREA_TEXT_THREADING_STATE_UNAVAILABLE_REASON };
    }
    return count === 1
      ? { eligible: true }
      : { eligible: false, reason: THREADED_AREA_TEXT_UNSUPPORTED_REASON };
  } catch {
    return { eligible: false, reason: AREA_TEXT_THREADING_STATE_UNAVAILABLE_REASON };
  }
}

export interface AreaTextMeasurementAdapter<T> {
  checkEligibility(target: T): AreaTextEligibility;
  snapshot(target: T): AreaTextSnapshot;
  isOverset(target: T): boolean;
  setHeight(target: T, height: number): void;
}

/**
 * Feature-local production runtime contract.  The synchronous C3 contract
 * above remains available to in-process callers and existing unit tests.
 */
export interface AsyncAreaTextMeasurementAdapter<T> {
  checkEligibility(target: T): Promise<AreaTextEligibility>;
  snapshot(target: T): Promise<AreaTextSnapshot>;
  isOverset(target: T): Promise<boolean>;
  setHeight(target: T, height: number): Promise<void>;
}

export type AreaTextMeasurementResult =
  | {
      status: 'SUCCESS';
      originalHeight: number;
      measuredHeight: number;
      growthDelta: number;
      alreadyFit: boolean;
      measurementIterations: number;
    }
  | { status: 'UNSUPPORTED'; reason: string }
  | { status: 'MEASUREMENT_FAILED_RESTORED'; reason: string }
  | { status: 'RESTORE_FAILED'; reason: string };

export const MAX_AREA_TEXT_MEASUREMENT_ITERATIONS = 16;
export const MAX_AREA_TEXT_GROWTH_FACTOR = 64;
export const AREA_TEXT_GEOMETRY_TOLERANCE = 0.01;

function finite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
}

function sameNumber(first: number, second: number): boolean {
  return Math.abs(first - second) <= AREA_TEXT_GEOMETRY_TOLERANCE;
}

function samePlain(first: unknown, second: unknown): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

function invariantsMatch(first: AreaTextSnapshot, second: AreaTextSnapshot): boolean {
  return (first.uuid === null || second.uuid === null || first.uuid === second.uuid) &&
    sameNumber(first.top, second.top) && sameNumber(first.left, second.left) &&
    sameNumber(first.width, second.width) && first.contents === second.contents &&
    samePlain(first.formatting, second.formatting);
}

function geometryMatch(first: AreaTextSnapshot, second: AreaTextSnapshot): boolean {
  return sameNumber(first.height, second.height) && invariantsMatch(first, second);
}

export function measureAreaTextRequiredHeight<T>(
  target: T,
  adapter: AreaTextMeasurementAdapter<T>,
): AreaTextMeasurementResult {
  const eligibility = adapter.checkEligibility(target);
  if (!eligibility.eligible) return { status: 'UNSUPPORTED', reason: eligibility.reason ?? 'AreaText is outside the supported V1 scope' };

  let original: AreaTextSnapshot;
  try {
    original = adapter.snapshot(target);
    finite(original.height, 'original height');
    finite(original.top, 'original top');
    finite(original.left, 'original left');
    finite(original.width, 'original width');
    if (original.height <= 0 || original.width <= 0) return { status: 'UNSUPPORTED', reason: 'AreaText geometry must have positive dimensions' };
  } catch (error) {
    return { status: 'UNSUPPORTED', reason: error instanceof Error ? error.message : String(error) };
  }

  let iterations = 0;
  const maximumHeight = original.height * MAX_AREA_TEXT_GROWTH_FACTOR;
  if (!Number.isFinite(maximumHeight) || maximumHeight <= 0) {
    return { status: 'UNSUPPORTED', reason: 'AreaText maximum measurement height is invalid' };
  }

  const restore = (): AreaTextMeasurementResult | null => {
    try {
      adapter.setHeight(target, original.height);
      const restored = adapter.snapshot(target);
      if (!geometryMatch(restored, original)) return { status: 'RESTORE_FAILED', reason: 'Original AreaText state could not be verified after restoration' };
      return null;
    } catch (error) {
      return { status: 'RESTORE_FAILED', reason: error instanceof Error ? error.message : String(error) };
    }
  };

  let overset: boolean;
  try {
    overset = adapter.isOverset(target);
  } catch (error) {
    const restored = restore();
    return restored ?? { status: 'MEASUREMENT_FAILED_RESTORED', reason: error instanceof Error ? error.message : String(error) };
  }
  if (!overset) {
    return { status: 'SUCCESS', originalHeight: original.height, measuredHeight: original.height, growthDelta: 0, alreadyFit: true, measurementIterations: 0 };
  }

  const probe = (height: number): boolean => {
    if (iterations >= MAX_AREA_TEXT_MEASUREMENT_ITERATIONS) throw new Error('AreaText measurement iteration limit reached');
    if (!Number.isFinite(height) || height <= 0) throw new Error('AreaText probe height is invalid');
    adapter.setHeight(target, height);
    iterations += 1;
    const state = adapter.snapshot(target);
    if (!invariantsMatch(state, original)) throw new Error('AreaText invariant drift detected during measurement');
    return adapter.isOverset(target);
  };

  let measuredHeight = original.height;
  try {
    let lowerBound = original.height;
    let upperBound: number | null = null;
    let current = original.height;
    while (upperBound === null) {
      const candidate = Math.min(current * 2, maximumHeight);
      if (candidate <= current) throw new Error('AreaText remained overset at the maximum measurement height');
      if (!probe(candidate)) upperBound = candidate;
      else { lowerBound = candidate; current = candidate; }
    }

    let fittingHeight = upperBound as number;

    while (iterations < MAX_AREA_TEXT_MEASUREMENT_ITERATIONS - 1 && fittingHeight - lowerBound > AREA_TEXT_GEOMETRY_TOLERANCE) {
      const candidate = lowerBound + ((fittingHeight - lowerBound) / 2);
      if (probe(candidate)) lowerBound = candidate;
      else { fittingHeight = candidate; }
    }
    measuredHeight = fittingHeight;
    if (probe(measuredHeight)) throw new Error('Final AreaText measurement remained overset');
    const restored = restore();
    if (restored) return restored;
    return { status: 'SUCCESS', originalHeight: original.height, measuredHeight, growthDelta: measuredHeight - original.height, alreadyFit: false, measurementIterations: iterations };
  } catch (error) {
    const restored = restore();
    return restored ?? { status: 'MEASUREMENT_FAILED_RESTORED', reason: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Async-runtime equivalent of the frozen C3 measurement contract.  It keeps
 * the same bounded growth/refinement and restoration semantics while allowing
 * each Illustrator-backed adapter operation to be awaited.
 */
export async function measureAreaTextRequiredHeightAsync<T>(
  target: T,
  adapter: AsyncAreaTextMeasurementAdapter<T>,
): Promise<AreaTextMeasurementResult> {
  let eligibility: AreaTextEligibility;
  try {
    eligibility = await adapter.checkEligibility(target);
  } catch (error) {
    return { status: 'UNSUPPORTED', reason: error instanceof Error ? error.message : String(error) };
  }
  if (!eligibility.eligible) return { status: 'UNSUPPORTED', reason: eligibility.reason ?? 'AreaText is outside the supported V1 scope' };

  let original: AreaTextSnapshot;
  try {
    original = await adapter.snapshot(target);
    finite(original.height, 'original height');
    finite(original.top, 'original top');
    finite(original.left, 'original left');
    finite(original.width, 'original width');
    if (original.height <= 0 || original.width <= 0) return { status: 'UNSUPPORTED', reason: 'AreaText geometry must have positive dimensions' };
  } catch (error) {
    return { status: 'UNSUPPORTED', reason: error instanceof Error ? error.message : String(error) };
  }

  let iterations = 0;
  const maximumHeight = original.height * MAX_AREA_TEXT_GROWTH_FACTOR;
  if (!Number.isFinite(maximumHeight) || maximumHeight <= 0) {
    return { status: 'UNSUPPORTED', reason: 'AreaText maximum measurement height is invalid' };
  }

  const restore = async (): Promise<AreaTextMeasurementResult | null> => {
    try {
      await adapter.setHeight(target, original.height);
      const restored = await adapter.snapshot(target);
      if (!geometryMatch(restored, original)) return { status: 'RESTORE_FAILED', reason: 'Original AreaText state could not be verified after restoration' };
      return null;
    } catch (error) {
      return { status: 'RESTORE_FAILED', reason: error instanceof Error ? error.message : String(error) };
    }
  };

  let overset: boolean;
  try {
    overset = await adapter.isOverset(target);
  } catch (error) {
    const restored = await restore();
    return restored ?? { status: 'MEASUREMENT_FAILED_RESTORED', reason: error instanceof Error ? error.message : String(error) };
  }
  if (!overset) {
    return { status: 'SUCCESS', originalHeight: original.height, measuredHeight: original.height, growthDelta: 0, alreadyFit: true, measurementIterations: 0 };
  }

  const probe = async (height: number): Promise<boolean> => {
    if (iterations >= MAX_AREA_TEXT_MEASUREMENT_ITERATIONS) throw new Error('AreaText measurement iteration limit reached');
    if (!Number.isFinite(height) || height <= 0) throw new Error('AreaText probe height is invalid');
    await adapter.setHeight(target, height);
    iterations += 1;
    const state = await adapter.snapshot(target);
    if (!invariantsMatch(state, original)) throw new Error('AreaText invariant drift detected during measurement');
    return adapter.isOverset(target);
  };

  let measuredHeight = original.height;
  try {
    let lowerBound = original.height;
    let upperBound: number | null = null;
    let current = original.height;
    while (upperBound === null) {
      const candidate = Math.min(current * 2, maximumHeight);
      if (candidate <= current) throw new Error('AreaText remained overset at the maximum measurement height');
      if (!(await probe(candidate))) upperBound = candidate;
      else { lowerBound = candidate; current = candidate; }
    }

    let fittingHeight = upperBound;
    while (iterations < MAX_AREA_TEXT_MEASUREMENT_ITERATIONS - 1 && fittingHeight - lowerBound > AREA_TEXT_GEOMETRY_TOLERANCE) {
      const candidate = lowerBound + ((fittingHeight - lowerBound) / 2);
      if (await probe(candidate)) lowerBound = candidate;
      else { fittingHeight = candidate; }
    }
    measuredHeight = fittingHeight;
    if (await probe(measuredHeight)) throw new Error('Final AreaText measurement remained overset');
    const restored = await restore();
    if (restored) return restored;
    return { status: 'SUCCESS', originalHeight: original.height, measuredHeight, growthDelta: measuredHeight - original.height, alreadyFit: false, measurementIterations: iterations };
  } catch (error) {
    const restored = await restore();
    return restored ?? { status: 'MEASUREMENT_FAILED_RESTORED', reason: error instanceof Error ? error.message : String(error) };
  }
}
