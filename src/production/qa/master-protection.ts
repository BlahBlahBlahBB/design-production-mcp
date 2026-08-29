import path from "node:path";

export function assertOutputDoesNotOverwriteMaster(masterPath: string, outputPath: string): void {
  const master = path.resolve(masterPath);
  const output = path.resolve(outputPath);
  if (master === output) throw new Error("output path would overwrite MASTER template");
}
