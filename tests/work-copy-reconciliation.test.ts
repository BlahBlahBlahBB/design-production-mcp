import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { IllustratorReadBridge, IllustratorStatus, ScriptResult } from "../src/executor/bridge.js";
import type { DocumentInfo, FindObjectsCriteria, FindObjectsOptions, FindObjectsResult } from "../src/executor/read-schema.js";
import { createDesignProductionMcpServer } from "../src/mcp/server.js";
import { ManagedSessionRegistry } from "../src/production/session/managed-sessions.js";

class DelayedOpenBridge implements IllustratorReadBridge {
  readonly id = "delayed-open-test";
  scripts: string[] = [];
  timeouts: Array<number | undefined> = [];
  openCalls = 0;
  delayWorkOpen = false;
  activePath = "";
  activeSaved = true;
  activeError: string | null = null;

  async detect(): Promise<IllustratorStatus> { return { installed: true, running: true, version: "test", capabilities: {} }; }
  async execute<T>(script: string, timeoutMs?: number): Promise<ScriptResult<T>> {
    this.scripts.push(script); this.timeouts.push(timeoutMs);
    if (script.includes("app.open(file)")) {
      this.openCalls += 1;
      const expected = /var expected = ("(?:[^"\\]|\\.)*")/.exec(script)?.[1];
      const documentPath = expected ? JSON.parse(expected) : "";
      if (this.delayWorkOpen && this.openCalls === 2) return { ok: false, error: "ILLUSTRATOR_TIMEOUT: simulated delayed open" };
      this.activePath = documentPath;
      return { ok: true, value: { name: path.basename(documentPath), path: documentPath, saved: true, version: "test" } as T };
    }
    if (script.includes("ACTIVE_DOCUMENT_NOT_PATH_BACKED")) {
      if (this.activeError) return { ok: false, error: this.activeError };
      return { ok: true, value: { name: path.basename(this.activePath), path: this.activePath, saved: this.activeSaved, version: "test" } as T };
    }
    if (script.includes("return {ok:true,value:after}")) return { ok: true, value: { ok: true, value: { typename: "PathItem", name: "", layerPath: "0", ancestry: ["layer:0"], collectionPath: "layers/0/pageItems/0", locator: { kind: "document-session-structural", typename: "PathItem", name: "", layerPath: "0", ancestry: ["layer:0"], collectionPath: "layers/0/pageItems/0" }, locked: false, hidden: false, bounds: null, contentsPreview: null, contentsLength: null } } as T };
    return { ok: true, value: {} as T };
  }
  async getDocumentInfo(): Promise<ScriptResult<DocumentInfo>> { throw new Error("not used"); }
  async findObjects(_criteria: FindObjectsCriteria, _options?: FindObjectsOptions): Promise<ScriptResult<FindObjectsResult>> { throw new Error("not used"); }
  async getArtboards(): Promise<never> { throw new Error("not used"); } async getLayers(): Promise<never> { throw new Error("not used"); } async getSelection(): Promise<never> { throw new Error("not used"); } async listTextFrames(): Promise<never> { throw new Error("not used"); } async getTextFrameDetail(): Promise<never> { throw new Error("not used"); } async getGroups(): Promise<never> { throw new Error("not used"); } async getDocumentStructure(): Promise<never> { throw new Error("not used"); } async convertCoordinate(): Promise<never> { throw new Error("not used"); } async getColors(): Promise<never> { throw new Error("not used"); } async getImages(): Promise<never> { throw new Error("not used"); } async listFonts(): Promise<never> { throw new Error("not used"); }
}

async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), "dpm-reconcile-"));
  const master = path.join(directory, "master.ai");
  const work = path.join(directory, "work.ai");
  await writeFile(master, "verified-master-bytes");
  return { directory, master, work };
}

async function pendingFixture() {
  const source = await fixture();
  const bridge = new DelayedOpenBridge(); bridge.delayWorkOpen = true;
  const registry = new ManagedSessionRegistry(bridge);
  const created = await registry.createWorkCopy(source.master, source.work);
  assert.equal(created.ok, false);
  if (created.ok || !('value' in created)) throw new Error("expected pending attempt");
  assert.equal(created.error.code, "WORK_COPY_OPEN_PENDING");
  assert.equal(created.value.code, "WORK_COPY_OPEN_PENDING");
  assert.equal("sessionId" in created.value, false);
  return { ...source, bridge, registry, attemptId: created.value.attemptId };
}

test("fast create_work_copy still returns a managed session", async () => {
  const source = await fixture();
  try {
    const registry = new ManagedSessionRegistry(new DelayedOpenBridge());
    const result = await registry.createWorkCopy(source.master, source.work);
    assert.equal(result.ok, true);
    if (result.ok) assert.match(result.value.sessionId, /^[0-9a-f-]{36}$/);
  } finally { await rm(source.directory, { recursive: true, force: true }); }
});

test("timed-out WORK COPY open returns one opaque pending attempt without a session or a second open", async () => {
  const source = await pendingFixture();
  try {
    assert.equal(source.bridge.openCalls, 2, "one MASTER open and one WORK COPY open only");
    assert.equal(source.bridge.scripts.filter((script) => script.includes("app.open(file)")).length, 2);
    assert.equal(source.bridge.scripts.some((script) => script.includes("ACTIVE_DOCUMENT_NOT_PATH_BACKED")), false);
  } finally { await rm(source.directory, { recursive: true, force: true }); }
});

test("unknown pending attempt is rejected", async () => {
  const registry = new ManagedSessionRegistry(new DelayedOpenBridge());
  const result = await registry.reconcileWorkCopy("00000000-0000-4000-8000-000000000000");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "WORK_COPY_PENDING_ATTEMPT_NOT_FOUND");
});

test("read timeout during reconciliation stays recoverable and performs no document write", async () => {
  const source = await pendingFixture();
  try {
    source.bridge.activeError = "ILLUSTRATOR_TIMEOUT: still opening";
    const first = await source.registry.reconcileWorkCopy(source.attemptId);
    assert.equal(first.ok, false);
    if (!first.ok) assert.equal(first.error.code, "WORK_COPY_OPEN_STILL_PENDING");
    const reconciliationScript = source.bridge.scripts.at(-1) ?? "";
    assert.match(reconciliationScript, /ACTIVE_DOCUMENT_NOT_PATH_BACKED/);
    assert.doesNotMatch(reconciliationScript, /app\.open|\.save\(|pathItems\.rectangle|textFrames\.add/);
    source.bridge.activeError = null; source.bridge.activePath = source.work;
    const second = await source.registry.reconcileWorkCopy(source.attemptId);
    assert.equal(second.ok, true);
  } finally { await rm(source.directory, { recursive: true, force: true }); }
});

test("exact active saved WORK COPY with unchanged hashes authorizes one managed session", async () => {
  const source = await pendingFixture();
  try {
    source.bridge.activePath = source.work;
    const result = await source.registry.reconcileWorkCopy(source.attemptId);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const duplicate = await source.registry.reconcileWorkCopy(source.attemptId);
    assert.equal(duplicate.ok, false);
    if (!duplicate.ok) assert.equal(duplicate.error.code, "WORK_COPY_PENDING_ALREADY_AUTHORIZED");
  } finally { await rm(source.directory, { recursive: true, force: true }); }
});

test("wrong active document never issues a session", async () => {
  const source = await pendingFixture();
  try {
    source.bridge.activePath = source.master;
    const result = await source.registry.reconcileWorkCopy(source.attemptId);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "WORK_COPY_IDENTITY_MISMATCH");
  } finally { await rm(source.directory, { recursive: true, force: true }); }
});

test("changed MASTER or WORK COPY bytes invalidate the pending attempt", async (t) => {
  await t.test("MASTER SHA", async () => {
    const source = await pendingFixture();
    try {
      await writeFile(source.master, "changed-master-bytes"); source.bridge.activePath = source.work;
      const result = await source.registry.reconcileWorkCopy(source.attemptId);
      assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, "WORK_COPY_PENDING_INVALIDATED");
    } finally { await rm(source.directory, { recursive: true, force: true }); }
  });
  await t.test("WORK COPY SHA", async () => {
    const source = await pendingFixture();
    try {
      await writeFile(source.work, "changed-work-bytes"); source.bridge.activePath = source.work;
      const result = await source.registry.reconcileWorkCopy(source.attemptId);
      assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, "WORK_COPY_PENDING_INVALIDATED");
    } finally { await rm(source.directory, { recursive: true, force: true }); }
  });
});

test("MCP exposes reconcile_work_copy with only opaque attemptId and no arbitrary tools", async () => {
  const server = createDesignProductionMcpServer(new ManagedSessionRegistry(new DelayedOpenBridge()));
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "reconciliation-test", version: "1" });
  await server.connect(serverTransport); await client.connect(clientTransport);
  try {
    const tools = await client.listTools();
    const reconcile = tools.tools.find((tool) => tool.name === "reconcile_work_copy");
    assert.ok(reconcile);
    assert.deepEqual(Object.keys(reconcile.inputSchema.properties ?? {}), ["attemptId"]);
    assert.ok(!tools.tools.some((tool) => tool.name.includes("script") || tool.name.includes("copy_file")));
  } finally { await client.close(); await server.close(); }
});
