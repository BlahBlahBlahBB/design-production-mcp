import test from "node:test";
import assert from "node:assert/strict";
import type { IllustratorBridge, IllustratorStatus, ScriptResult } from "../src/executor/bridge.js";
import { IllustratorProductionSession } from "../src/production/session/illustrator-session.js";

class RecordingBridge implements IllustratorBridge {
  readonly id = "recording";
  scripts: string[] = [];

  async detect(): Promise<IllustratorStatus> {
    return { installed: true, running: true, capabilities: {} };
  }

  async execute<T = unknown>(script: string): Promise<ScriptResult<T>> {
    this.scripts.push(script);
    return { ok: true, value: {} as T };
  }
}

test("saveWorkCopy rejects MASTER overwrite before calling Illustrator", async () => {
  const bridge = new RecordingBridge();
  const session = new IllustratorProductionSession(bridge);
  await assert.rejects(
    () => session.saveWorkCopy({ masterPath: "/tmp/master.ai", workPath: "/tmp/master.ai" }),
    /overwrite MASTER/,
  );
  assert.equal(bridge.scripts.length, 0);
});

test("replaceNamedText targets object names instead of indexes", async () => {
  const bridge = new RecordingBridge();
  const session = new IllustratorProductionSession(bridge);
  await session.replaceNamedText("@text:name", "王小明");
  assert.equal(bridge.scripts.length, 1);
  assert.match(bridge.scripts[0], /t\.name === targetName/);
  assert.match(bridge.scripts[0], /TARGET_TEXT_NOT_FOUND/);
});

test("exportOutputs rejects exporting over MASTER", async () => {
  const bridge = new RecordingBridge();
  const session = new IllustratorProductionSession(bridge);
  await assert.rejects(
    () => session.exportOutputs({
      masterPath: "/tmp/master.ai",
      workPath: "/tmp/work.ai",
      pdfPath: "/tmp/master.ai",
    }),
    /overwrite MASTER/,
  );
  assert.equal(bridge.scripts.length, 0);
});
