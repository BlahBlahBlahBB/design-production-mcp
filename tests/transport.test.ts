import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appleScriptFor, preferWrappedTransportResult, resolveLocalTransport } from "../src/executor/local-transport.js";
import { resolveDefaultStableAppPath } from "../src/illustrator/core/ie3jp/executor/jsx-runner.js";

test("resolveLocalTransport selects osascript on macOS", () => {
  assert.equal(resolveLocalTransport("darwin"), "osascript");
});

test("resolveLocalTransport selects PowerShell on Windows", () => {
  assert.equal(resolveLocalTransport("win32"), "powershell");
});

test("resolveLocalTransport rejects unsupported platforms", () => {
  assert.throws(() => resolveLocalTransport("linux"), /Unsupported platform/);
});

test("default Illustrator routing detects the newest installed Stable target from 2022–2026", () => {
  const root = mkdtempSync(join(tmpdir(), "dpm-stable-path-"));
  try {
    const older = join(root, "Adobe Illustrator 2023", "Adobe Illustrator.app");
    const newer = join(root, "Adobe Illustrator 2025", "Adobe Illustrator.app");
    mkdirSync(older, { recursive: true });
    mkdirSync(newer, { recursive: true });
    assert.equal(resolveDefaultStableAppPath("darwin", root), newer);
    assert.equal(resolveDefaultStableAppPath("win32", root), undefined);
    assert.equal(resolveDefaultStableAppPath("darwin", join(root, "missing")), undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
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
