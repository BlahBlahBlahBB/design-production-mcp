import test from "node:test";
import assert from "node:assert/strict";
import { planBatch } from "../src/production/batch/chunk.js";
import { assertOutputDoesNotOverwriteMaster } from "../src/production/qa/master-protection.js";
import { isProductionReady } from "../src/compat/capabilities.js";

const capabilities = {
  status: true,
  "document.read": true,
  "text.read": true,
  "text.write": true,
  "save.copy": true,
  "export.pdf": true,
  "export.png": true,
};

test("plans a bounded batch chunk", () => {
  assert.deepEqual(planBatch([1, 2, 3, 4], 1, 2).records, [2, 3]);
});

test("supports resume at end of batch", () => {
  assert.deepEqual(planBatch([1, 2], 2, 10).records, []);
});

test("production readiness requires running Illustrator and capabilities", () => {
  assert.equal(isProductionReady({ installed: true, running: true, capabilities }), true);
  assert.equal(isProductionReady({ installed: true, running: false, capabilities }), false);
});

test("master template cannot be overwritten", () => {
  assert.throws(() => assertOutputDoesNotOverwriteMaster("/tmp/master.ai", "/tmp/master.ai"), /MASTER/);
});
