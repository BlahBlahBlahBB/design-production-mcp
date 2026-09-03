import test from "node:test";
import assert from "node:assert/strict";
import { appleScriptFor, preferWrappedTransportResult, resolveLocalTransport } from "../src/executor/local-transport.js";

test("resolveLocalTransport selects osascript on macOS", () => {
  assert.equal(resolveLocalTransport("darwin"), "osascript");
});

test("resolveLocalTransport selects PowerShell on Windows", () => {
  assert.equal(resolveLocalTransport("win32"), "powershell");
});

test("resolveLocalTransport rejects unsupported platforms", () => {
  assert.throws(() => resolveLocalTransport("linux"), /Unsupported platform/);
});

test("AppleScript transport forwards an operation timeout to its AppleEvent", () => {
  const script = appleScriptFor("/tmp/dpm-qa.jsx", { timeoutMs: 300_000 });
  assert.match(script, /^with timeout of 300 seconds/m);
  assert.match(script, /do javascript of file "\/tmp\/dpm-qa\.jsx"/);
  assert.match(script, /end timeout$/m);
});

test("structured JSX error takes priority over a later shell transport failure", () => {
  const fallback = { ok: false, error: { code: "ILLUSTRATOR_EXECUTION_FAILED", message: "osascript: execution error" } };
  const result = preferWrappedTransportResult(
    JSON.stringify({ ok: false, error: { code: "JSX_ERROR", message: "Error 4: syntax error; Line: 139" } }),
    fallback,
  );
  assert.deepEqual(result, { ok: false, error: { code: "JSX_ERROR", message: "Error 4: syntax error; Line: 139" } });
});
