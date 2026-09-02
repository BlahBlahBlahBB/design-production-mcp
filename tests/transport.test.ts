import test from "node:test";
import assert from "node:assert/strict";
import { resolveLocalTransport } from "../src/executor/local-transport.js";

test("resolveLocalTransport selects osascript on macOS", () => {
  assert.equal(resolveLocalTransport("darwin"), "osascript");
});

test("resolveLocalTransport selects PowerShell on Windows", () => {
  assert.equal(resolveLocalTransport("win32"), "powershell");
});

test("resolveLocalTransport rejects unsupported platforms", () => {
  assert.throws(() => resolveLocalTransport("linux"), /Unsupported platform/);
});
