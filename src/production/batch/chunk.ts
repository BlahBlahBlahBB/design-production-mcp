export interface BatchPlan<T> {
  startIndex: number;
  records: T[];
  total: number;
}

export function planBatch<T>(records: T[], startIndex = 0, chunkSize = 20): BatchPlan<T> {
  if (!Number.isInteger(startIndex) || startIndex < 0 || startIndex > records.length) throw new Error("invalid startIndex");
  if (!Number.isInteger(chunkSize) || chunkSize < 1) throw new Error("invalid chunkSize");
  return {
    startIndex,
    records: records.slice(startIndex, startIndex + chunkSize),
    total: records.length,
  };
}
