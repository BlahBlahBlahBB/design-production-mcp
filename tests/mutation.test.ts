import test from "node:test";
import assert from "node:assert/strict";
import type { IllustratorBridge, IllustratorStatus, ScriptResult } from "../src/executor/bridge.js";
import { createWorkCopyIdentity, SafeMutationContext, type MutationError } from "../src/production/mutation/context.js";
import { executeTextCanary } from "../src/production/mutation/text-canary.js";
import { IllustratorProductionSession } from "../src/production/session/illustrator-session.js";

const identity = createWorkCopyIdentity("/tmp/master.ai", "/tmp/work.ai");
assert.equal(identity.ok, true);
if (!identity.ok) throw new Error("test identity setup failed");

function failure(code: MutationError["code"], partialMutationPossible = false): { ok: true; value: unknown } {
  return {
    ok: true,
    value: {
      ok: false,
      error: { code, stage: "preflight", operation: "canary", message: code, partialMutationPossible, recovery: "manual recovery" },
    },
  };
}

class ScriptBridge implements IllustratorBridge {
  readonly id = "mutation-test";
  scripts: string[] = [];
  constructor(private result: ScriptResult<unknown>) {}

  async detect(): Promise<IllustratorStatus> {
    return { installed: true, running: true, capabilities: {} };
  }

  async execute<T = unknown>(script: string): Promise<ScriptResult<T>> {
    this.scripts.push(script);
    return this.result as ScriptResult<T>;
  }
}

function request(overrides: Partial<Parameters<typeof executeTextCanary>[2]> = {}) {
  return {
    operation: "canary",
    workPath: "/tmp/work.ai",
    nextContents: "after",
    targets: [{ kind: "index" as const, index: 0, expected: { typename: "TextFrame", contents: "before" } }],
    ...overrides,
  };
}

test("B0 rejects MASTER == WORK before Illustrator is called", () => {
  const result = createWorkCopyIdentity("/tmp/master.ai", "/tmp/master.ai");
  assert.equal(result.ok, false);
  assert.equal(result.ok ? undefined : result.error.code, "MASTER_WRITE_FORBIDDEN");
});

test("B0 rejects a text write without a verified work-copy identity", async () => {
  const bridge = new ScriptBridge({ ok: true, value: {} });
  const session = new IllustratorProductionSession(bridge);
  const result = await session.replaceTextFrameByIndex("/tmp/work.ai", 0, "after", "before");
  assert.equal(result.ok, false);
  assert.equal(result.ok ? undefined : result.error.code, "WORK_COPY_REQUIRED");
  assert.equal(bridge.scripts.length, 0);
});

test("B0 valid unique text target reports a verified post-condition", async () => {
  const bridge = new ScriptBridge({ ok: true, value: { ok: true, value: { mutatedCount: 1, targets: [{ index: 0, name: "", contents: "after" }] } } });
  const context = new SafeMutationContext(identity.value);
  const result = await executeTextCanary(bridge, context, request());
  assert.equal(result.ok, true);
  assert.equal(result.ok ? result.value.mutatedCount : 0, 1);
  assert.equal(result.contextState, "READY");
  assert.match(bridge.scripts[0], /Resolve and validate every target before the first document mutation/);
  assert.match(bridge.scripts[0], /POST_CONDITION_FAILED/);
  assert.match(bridge.scripts[0], /effectiveEditable/);
});

test("B0 emits the Phase 1-proven ES3 path-normalization expression", async () => {
  const bridge = new ScriptBridge({ ok: true, value: { ok: true, value: { mutatedCount: 1, targets: [] } } });
  const context = new SafeMutationContext(identity.value);
  await executeTextCanary(bridge, context, request());
  assert.ok(bridge.scripts[0].includes("d.fullName.fsName.replace(/\\\\/g, '/')"));
  assert.ok(!bridge.scripts[0].includes("d.fullName.fsName.replace(/\\/g, '/')"));
});

test("B0 accepts a dirty but path-verified work copy for a follow-up mutation", async () => {
  const bridge = new ScriptBridge({ ok: true, value: { ok: true, value: { mutatedCount: 1, targets: [] } } });
  const context = new SafeMutationContext(identity.value);
  await executeTextCanary(bridge, context, request());
  assert.ok(bridge.scripts[0].includes("Active document must be path-backed."));
  assert.ok(!bridge.scripts[0].includes("if (!d.saved)"));
  assert.match(bridge.scripts[0], /activePath !==/);
});

test("B0 returns deterministic no-write preflight errors", async () => {
  for (const code of ["ACTIVE_DOCUMENT_MISMATCH", "NO_DOCUMENT", "TARGET_NOT_FOUND", "TARGET_AMBIGUOUS", "TARGET_STALE", "EXPECTED_STATE_MISMATCH", "TARGET_NOT_EDITABLE"] as const) {
    const bridge = new ScriptBridge(failure(code));
    const context: SafeMutationContext = new SafeMutationContext(identity.value);
    const result = await executeTextCanary(bridge, context, request());
    assert.equal(result.ok, false);
    assert.equal(result.ok ? undefined : result.error.code, code);
    assert.equal(result.ok ? undefined : result.error.partialMutationPossible, false);
    assert.equal(context.state, "READY");
    assert.equal(bridge.scripts.length, 1);
    assert.match(bridge.scripts[0], /activePath !==/);
    assert.match(bridge.scripts[0], /return mutationFailure\('NO_DOCUMENT'/);
    assert.ok(bridge.scripts[0].indexOf("return mutationFailure('NO_DOCUMENT'") < bridge.scripts[0].indexOf(".item.contents ="));
  }
});

test("B0 post-condition failure quarantines the context", async () => {
  const bridge = new ScriptBridge({
    ok: true,
    value: { ok: false, error: { code: "POST_CONDITION_FAILED", stage: "post-condition", operation: "canary", message: "verification failed", partialMutationPossible: true, recovery: "quarantine" } },
  });
  const context = new SafeMutationContext(identity.value);
  const result = await executeTextCanary(bridge, context, request());
  assert.equal(result.ok, false);
  assert.equal(result.ok ? undefined : result.error.code, "POST_CONDITION_FAILED");
  assert.equal(result.ok ? undefined : result.error.stage, "post-condition");
  assert.equal(context.state, "QUARANTINED");
});

test("B0 timeout never retries and quarantines the work-copy context", async () => {
  const bridge = new ScriptBridge({ ok: false, error: "ILLUSTRATOR_TIMEOUT: timed out" });
  const context = new SafeMutationContext(identity.value);
  const first = await executeTextCanary(bridge, context, request());
  assert.equal(first.ok, false);
  assert.equal(first.ok ? undefined : first.error.code, "MUTATION_OUTCOME_UNKNOWN");
  assert.equal(first.ok ? undefined : first.error.partialMutationPossible, true);
  const second = await executeTextCanary(bridge, context, request());
  assert.equal(second.ok, false);
  assert.equal(second.ok ? undefined : second.error.code, "MUTATION_OUTCOME_UNKNOWN");
  assert.equal(bridge.scripts.length, 1);
});

test("B0 structural invalidation blocks follow-up writes until targets are refreshed", async () => {
  const bridge = new ScriptBridge({ ok: true, value: { ok: true, value: { mutatedCount: 1, targets: [] } } });
  const context = new SafeMutationContext(identity.value);
  context.markStructuralMutation();
  const result = await executeTextCanary(bridge, context, request());
  assert.equal(result.ok, false);
  assert.equal(result.ok ? undefined : result.error.code, "MUTATION_SCOPE_VIOLATION");
  assert.equal(bridge.scripts.length, 0);
});

test("B0 locator resolution and serializer result are structural/plain-data only", async () => {
  const bridge = new ScriptBridge({ ok: true, value: { ok: true, value: { mutatedCount: 1, targets: [] } } });
  const context = new SafeMutationContext(identity.value);
  await executeTextCanary(bridge, context, request({
    targets: [{
      kind: "locator",
      locator: { kind: "document-session-structural", typename: "TextFrame", name: "", layerPath: "0", ancestry: ["layer:0"], collectionPath: "layers/0/pageItems/0" },
      expected: { typename: "TextFrame", name: "", layerPath: "0", contents: "before" },
    }],
  }));
  assert.match(bridge.scripts[0], /resolveLocator/);
  assert.match(bridge.scripts[0], /TARGET_STALE/);
  assert.match(bridge.scripts[0], /current\.parent/);
  assert.match(bridge.scripts[0], /current\.typename === 'Layer' && current\.visible === false/);
  assert.match(bridge.scripts[0], /out\.push\(\{ index:/);
  assert.doesNotMatch(bridge.scripts[0], /return \{ item:|return resolved/);
});
