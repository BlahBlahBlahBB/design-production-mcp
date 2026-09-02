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

test("replaceNamedText requires the active document to be the work copy", async () => {
  const bridge = new RecordingBridge();
  const session = new IllustratorProductionSession(bridge);
  await session.replaceNamedText("/tmp/work.ai", "@text:name", "王小明");
  assert.equal(bridge.scripts.length, 1);
  assert.match(bridge.scripts[0], /ACTIVE_DOCUMENT_IS_NOT_WORK_COPY/);
  assert.match(bridge.scripts[0], /t\.name === targetName/);
  assert.match(bridge.scripts[0], /TARGET_TEXT_NOT_FOUND/);
});

test("replaceTextFrameByIndex supports unnamed legacy text frames with guards", async () => {
  const bridge = new RecordingBridge();
  const session = new IllustratorProductionSession(bridge);
  await session.replaceTextFrameByIndex("/tmp/work.ai", 0, "DPM_QA_TEST", "xx-xx-xxxxxx");
  assert.equal(bridge.scripts.length, 1);
  assert.match(bridge.scripts[0], /ACTIVE_DOCUMENT_IS_NOT_WORK_COPY/);
  assert.match(bridge.scripts[0], /TARGET_TEXT_INDEX_OUT_OF_RANGE/);
  assert.match(bridge.scripts[0], /TARGET_TEXT_CONTENT_CHANGED/);
  assert.match(bridge.scripts[0], /targetIndex = 0/);
});

test("replaceTextFrameByIndex rejects invalid indexes before calling Illustrator", async () => {
  const bridge = new RecordingBridge();
  const session = new IllustratorProductionSession(bridge);
  await assert.rejects(
    () => session.replaceTextFrameByIndex("/tmp/work.ai", -1, "DPM_QA_TEST"),
    /non-negative integer/,
  );
  assert.equal(bridge.scripts.length, 0);
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
