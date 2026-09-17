import test from "node:test";
import assert from "node:assert/strict";
import type { IllustratorBridge, IllustratorStatus, ScriptResult } from "../src/executor/bridge.js";
import { DEFAULT_SAVE_WORK_COPY_TIMEOUT_MS, IllustratorProductionSession } from "../src/production/session/illustrator-session.js";

class RecordingBridge implements IllustratorBridge {
  readonly id = "recording";
  scripts: string[] = [];
  timeouts: Array<number | undefined> = [];

  async detect(): Promise<IllustratorStatus> {
    return { installed: true, running: true, capabilities: {} };
  }

  async execute<T = unknown>(script: string, timeoutMs?: number): Promise<ScriptResult<T>> {
    this.scripts.push(script);
    this.timeouts.push(timeoutMs);
    if (script.includes("source.saveAs")) return { ok: true, value: { path: "/tmp/work.ai" } as T };
    if (script.includes("mutationFailure")) {
      return { ok: true, value: { ok: true, value: { mutatedCount: 1, targets: [] } } as T };
    }
    return { ok: true, value: {} as T };
  }
}

test("saveWorkCopy uses the persistence-specific timeout without retrying", async () => {
  const bridge = new RecordingBridge();
  const session = new IllustratorProductionSession(bridge);
  await session.saveWorkCopy({ masterPath: "/tmp/master.ai", workPath: "/tmp/work.ai" });
  assert.deepEqual(bridge.timeouts, [DEFAULT_SAVE_WORK_COPY_TIMEOUT_MS]);
  assert.equal(bridge.scripts.length, 1);
});

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
  await session.saveWorkCopy({ masterPath: "/tmp/master.ai", workPath: "/tmp/work.ai" });
  await session.replaceNamedText("/tmp/work.ai", "@text:name", "王小明", "旧值");
  assert.equal(bridge.scripts.length, 2);
  assert.match(bridge.scripts[1], /ACTIVE_DOCUMENT_MISMATCH/);
  assert.match(bridge.scripts[1], /TARGET_AMBIGUOUS/);
  assert.match(bridge.scripts[1], /expected\.contents/);
});

test("replaceTextFrameByIndex supports unnamed legacy text frames with guards", async () => {
  const bridge = new RecordingBridge();
  const session = new IllustratorProductionSession(bridge);
  await session.saveWorkCopy({ masterPath: "/tmp/master.ai", workPath: "/tmp/work.ai" });
  await session.replaceTextFrameByIndex("/tmp/work.ai", 0, "DPM_QA_TEST", "xx-xx-xxxxxx");
  assert.equal(bridge.scripts.length, 2);
  assert.match(bridge.scripts[1], /TARGET_NOT_FOUND/);
  assert.match(bridge.scripts[1], /EXPECTED_STATE_MISMATCH/);
  assert.match(bridge.scripts[1], /target\.index/);
});

test("replaceTextFrameByIndex rejects invalid indexes before calling Illustrator", async () => {
  const bridge = new RecordingBridge();
  const session = new IllustratorProductionSession(bridge);
  await session.saveWorkCopy({ masterPath: "/tmp/master.ai", workPath: "/tmp/work.ai" });
  const result = await session.replaceTextFrameByIndex("/tmp/work.ai", -1, "DPM_QA_TEST", "旧值");
  assert.equal(result.ok, false);
  assert.equal(result.ok ? undefined : result.error.code, "MUTATION_SCOPE_VIOLATION");
  assert.equal(bridge.scripts.length, 1);
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
