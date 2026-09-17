import test from "node:test";
import assert from "node:assert/strict";
import type { IllustratorBridge, IllustratorStatus, ScriptResult } from "../src/executor/bridge.js";
import { SafeMutationContext, createWorkCopyIdentity } from "../src/production/mutation/context.js";
import { executeSafeDonorOperation } from "../src/illustrator/legacy/adapters/safe-donor-operation.js";
import { buildExpandAction, buildPathfinderAction } from "../src/illustrator/legacy/donor-backed/actions.js";
import { buildPlaceImageJsx } from "../src/illustrator/legacy/donor-backed/links.js";
import { buildBacklogOperationJsx, executeBacklogOperation } from "../src/illustrator/legacy/donor-backed/backlog-operations.js";

const identity = createWorkCopyIdentity("/tmp/master.ai", "/tmp/work.ai");
assert.equal(identity.ok, true);
if (!identity.ok) throw new Error("test identity setup failed");

class Bridge implements IllustratorBridge {
  readonly id = "donor-fusion-test";
  scripts: string[] = [];
  constructor(private readonly result: ScriptResult<unknown>) {}
  async detect(): Promise<IllustratorStatus> { return { installed: true, running: true, capabilities: {} }; }
  async execute<T = unknown>(script: string): Promise<ScriptResult<T>> { this.scripts.push(script); return this.result as ScriptResult<T>; }
}

test("fusion adapter proves a work-copy path before imported JSX", async () => {
  const bridge = new Bridge({ ok: true, value: { ok: true, value: { didRun: true } } });
  const context = new SafeMutationContext(identity.value);
  const result = await executeSafeDonorOperation(bridge, context, {
    operation: "donor-test", workPath: "/tmp/work.ai", jsx: "return { ok: true, value: { didRun: true } };",
    classification: { access: "DOCUMENT_WRITE", impact: "STRUCTURE", destructive: true },
  });
  assert.equal(result.ok, true);
  assert.equal(context.state, "REFRESH_REQUIRED");
  assert.match(bridge.scripts[0], /ACTIVE_DOCUMENT_MISMATCH/);
  assert.match(bridge.scripts[0], /__dpmDonorDocument\.fullName\.fsName\.replace/);
  assert.match(bridge.scripts[0], /return \{ ok: true, value: \{ didRun: true \} \}/);
});

test("fusion adapter quarantines on an unproven donor transport outcome", async () => {
  const bridge = new Bridge({ ok: false, error: "ILLUSTRATOR_TIMEOUT: timed out" });
  const context = new SafeMutationContext(identity.value);
  const result = await executeSafeDonorOperation(bridge, context, {
    operation: "donor-test", workPath: "/tmp/work.ai", jsx: "return { ok: true, value: {} };",
    classification: { access: "DOCUMENT_WRITE", impact: "STRUCTURE", destructive: true },
  });
  assert.equal(result.ok, false);
  assert.equal(result.ok ? undefined : result.error.code, "MUTATION_OUTCOME_UNKNOWN");
  assert.equal(context.state, "QUARANTINED");
});

test("Alexander action payload retains donor plugin identifiers and controls", () => {
  const expand = buildExpandAction({ object: true, fill: false, stroke: true, gradient: true });
  assert.match(expand, /ai_plugin_expand/);
  assert.match(expand, /key 1868720756/);
  assert.match(expand, /key 1936553064/);
  assert.match(expand, /value 1/);
  const pathfinder = buildPathfinderAction("minus_front");
  assert.match(pathfinder, /ai_plugin_pathfinder/);
  // The donor's .aia name payloads are UTF-8 bytes, not UTF-16 code units.
  assert.match(pathfinder, /5375627472616374/);
  assert.match(pathfinder, /value 3/);
  assert.match(expand, /DPMExpandSet_[A-Za-z0-9_]+/);
  assert.match(expand, /DPMExpand_[A-Za-z0-9_]+/);
  assert.match(expand, /app\.doScript\(__dpmActionName, __dpmActionSet\)/);
  assert.match(expand, /app\.unloadAction\(__dpmActionSet, ''\)/);
});

test("IE3JP placement builder retains the embed replacement lookup", () => {
  const jsx = buildPlaceImageJsx({ filePath: "/tmp/image.png", embed: true, name: "hero" });
  assert.match(jsx, /placedItems\.add/);
  assert.match(jsx, /\.embed\(\)/);
  assert.match(jsx, /rasterItems/);
  assert.match(jsx, /POST_CONDITION_FAILED/);
});

test("backlog builders remain fixed-operation donor JSX, never caller-provided commands", () => {
  assert.match(buildBacklogOperationJsx({ operation: "convert_text_to_outlines" }), /createOutline/);
  assert.match(buildBacklogOperationJsx({ operation: "import_svg_editable", filePath: "/tmp/a.svg" }), /app\.open/);
  assert.match(buildBacklogOperationJsx({ operation: "export_document", filePath: "/tmp/a.png", format: "png" }), /ExportOptionsPNG24/);
  assert.match(buildBacklogOperationJsx({ operation: "preflight_summary" }), /missingLinks/);
  assert.match(buildBacklogOperationJsx({ operation: "offset_selected_paths", offset: 12 }), /Adobe Offset Path/);
  assert.match(buildBacklogOperationJsx({ operation: "create_crop_marks" }), /TrimMark v25/);
});

test("backlog operations are registered through the work-copy safety adapter", async () => {
  const bridge = new Bridge({ ok: true, value: { ok: true, value: { converted: 1 } } });
  const context = new SafeMutationContext(identity.value);
  const result = await executeBacklogOperation(bridge, context, "/tmp/work.ai", { operation: "convert_text_to_outlines" });
  assert.equal(result.ok, true);
  assert.equal(context.state, "REFRESH_REQUIRED");
  assert.match(bridge.scripts[0], /createOutline/);
  assert.match(bridge.scripts[0], /ACTIVE_DOCUMENT_MISMATCH/);
});
