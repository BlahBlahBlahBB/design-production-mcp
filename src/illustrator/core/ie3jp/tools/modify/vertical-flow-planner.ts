export interface FlowBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface FlowPlannerItem {
  uuid: string;
  originalBounds: FlowBounds;
  resizable: boolean;
  measuredHeight?: number;
}

export interface VerticalFlowPlanItem {
  uuid: string;
  originalBounds: FlowBounds;
  targetBounds: FlowBounds;
  originalHeight: number;
  targetHeight: number;
  deltaY: number;
  resized: boolean;
}

const MAX_FLOW_ITEMS = 50;

function finite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
}

function copyBounds(bounds: FlowBounds): FlowBounds {
  return { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom };
}

function validateBounds(bounds: FlowBounds, label: string): number {
  if (!bounds || typeof bounds !== 'object') throw new Error(`${label} must be provided`);
  for (const key of ['left', 'top', 'right', 'bottom'] as const) finite(bounds[key], `${label}.${key}`);
  const width = bounds.right - bounds.left;
  const height = bounds.top - bounds.bottom;
  if (width <= 0 || height <= 0) throw new Error(`${label} must have positive width and height`);
  return height;
}

function targetBounds(original: FlowBounds, top: number, height: number): FlowBounds {
  return { left: original.left, top, right: original.right, bottom: top - height };
}

export function planVerticalFlow(items: FlowPlannerItem[]): VerticalFlowPlanItem[] {
  if (!Array.isArray(items) || items.length < 1) throw new Error('items must contain at least one item');
  if (items.length > MAX_FLOW_ITEMS) throw new Error(`items must contain at most ${MAX_FLOW_ITEMS} items`);

  const uuids = new Set<string>();
  const heights: number[] = [];
  const gaps: number[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!item || typeof item.uuid !== 'string' || item.uuid.length === 0) throw new Error(`items[${index}].uuid must be non-empty`);
    if (uuids.has(item.uuid)) throw new Error(`duplicate uuid: ${item.uuid}`);
    uuids.add(item.uuid);
    if (typeof item.resizable !== 'boolean') throw new Error(`items[${index}].resizable must be boolean`);
    const height = validateBounds(item.originalBounds, `items[${index}].originalBounds`);
    heights.push(height);
    if (item.resizable) {
      finite(item.measuredHeight as number, `items[${index}].measuredHeight`);
      if ((item.measuredHeight as number) <= 0) throw new Error(`items[${index}].measuredHeight must be positive`);
    }
    if (index > 0) {
      const gap = items[index - 1].originalBounds.bottom - item.originalBounds.top;
      finite(gap, `gap[${index - 1}]`);
      if (gap < 0) throw new Error(`gap[${index - 1}] must be non-negative`);
      gaps.push(gap);
    }
  }

  const plan: VerticalFlowPlanItem[] = [];
  let previousBottom: number | null = null;
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const original = item.originalBounds;
    const originalHeight = heights[index];
    const targetHeight = item.resizable ? Math.max(originalHeight, item.measuredHeight as number) : originalHeight;
    const top = index === 0 ? original.top : (previousBottom as number) - gaps[index - 1];
    const target = targetBounds(original, top, targetHeight);
    plan.push({
      uuid: item.uuid,
      originalBounds: copyBounds(original),
      targetBounds: target,
      originalHeight,
      targetHeight,
      deltaY: top - original.top,
      resized: targetHeight !== originalHeight,
    });
    previousBottom = target.bottom;
  }
  return plan;
}

export { MAX_FLOW_ITEMS };
