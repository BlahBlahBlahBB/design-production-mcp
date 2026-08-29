declare module "node:crypto" {
  export function createHash(algorithm: string): { update(data: string): { digest(encoding: "hex"): string } };
}
declare module "node:path" {
  const path: { resolve(...paths: string[]): string };
  export default path;
}
declare module "node:test" {
  const test: (name: string, fn: () => void | Promise<void>) => void;
  export default test;
}
declare module "node:assert/strict" {
  const assert: {
    equal(actual: unknown, expected: unknown): void;
    deepEqual(actual: unknown, expected: unknown): void;
    throws(fn: () => unknown, expected?: RegExp): void;
  };
  export default assert;
}
