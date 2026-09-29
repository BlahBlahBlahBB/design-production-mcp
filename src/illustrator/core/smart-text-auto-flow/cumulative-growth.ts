import type { CumulativeLayoutDisplacement, LayoutBlock, LayoutGrowth } from './types.js';

/**
 * Computes only logical planning inputs. It does not call C3/C4/C5 and does
 * not decide how a grouped source's measured growth is obtained.
 */
export function planCumulativeDownwardDisplacement(
  orderedBlocks: readonly LayoutBlock[],
  growths: readonly LayoutGrowth[],
): CumulativeLayoutDisplacement[] {
  const owners = new Set<string>();
  for (const block of orderedBlocks) {
    if (!block || typeof block.ownerUuid !== 'string' || block.ownerUuid.length === 0) {
      throw new Error('ordered blocks require non-empty owner UUIDs');
    }
    if (owners.has(block.ownerUuid)) throw new Error(`duplicate layout owner: ${block.ownerUuid}`);
    owners.add(block.ownerUuid);
  }

  const growthByOwner = new Map<string, number>();
  for (const entry of growths) {
    if (!entry || typeof entry.ownerUuid !== 'string' || !Number.isFinite(entry.growth)) {
      throw new Error('growth entries require an owner UUID and finite growth');
    }
    if (!owners.has(entry.ownerUuid)) throw new Error(`growth references an unknown layout owner: ${entry.ownerUuid}`);
    if (growthByOwner.has(entry.ownerUuid)) throw new Error(`duplicate growth owner: ${entry.ownerUuid}`);
    growthByOwner.set(entry.ownerUuid, Math.max(0, entry.growth));
  }

  let accumulated = 0;
  return orderedBlocks.map((block) => {
    const positiveGrowth = growthByOwner.get(block.ownerUuid) ?? 0;
    const displacement: CumulativeLayoutDisplacement = {
      ownerUuid: block.ownerUuid,
      downwardDisplacement: accumulated,
      positiveGrowth,
    };
    accumulated += positiveGrowth;
    return displacement;
  });
}
