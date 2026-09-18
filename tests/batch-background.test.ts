import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { modifyPropertiesSchema } from "../src/illustrator/core/ie3jp/tools/modify/modify-object.js";
import { createDesignProductionMcpServer } from "../src/mcp/server.js";

const root = process.cwd();
const execFile = promisify(execFileCallback);
async function source(relativePath: string) {
  return readFile(`${root}/${relativePath}`, "utf8");
}

test("ordinary Core writes and heavy execution default to background", async () => {
  const runner = await source("src/illustrator/core/ie3jp/executor/jsx-runner.ts");
  const executor = await source("src/illustrator/core/ie3jp/tools/tool-executor.ts");
  const modify = await source("src/illustrator/core/ie3jp/tools/modify/modify-object.ts");
  assert.match(runner, /options\?\.activate \?\? false/);
  assert.match(executor, /executeJsxHeavy\(jsxCode, resolvedParams, \{ activate: options\?\.activate \?\? false \}\)/);
  assert.doesNotMatch(modify, /activate:\s*true/);
});

test("only confirmed Action or menu paths explicitly request foreground", async () => {
  const files = [
    "src/illustrator/core/alexander-tools.ts",
    "src/illustrator/core/creold-tools.ts",
  ];
  const text = (await Promise.all(files.map(source))).join("\n");
  assert.match(text, /buildExpandAction[\s\S]*activate: true/);
  assert.match(text, /buildPathfinderAction[\s\S]*activate: true/);
});

test("batch mutation schemas preserve one-object compatibility and accept batch-safe properties", () => {
  const parsed = modifyPropertiesSchema.parse({ fill: { type: "rgb", r: 255, g: 0, b: 0 }, opacity: 75, locked: false });
  assert.equal(parsed.opacity, 75);
  assert.equal(parsed.locked, false);
  assert.deepEqual(parsed.fill, { type: "rgb", r: 255, g: 0, b: 0 });
});

test("batch JSX shares the mutation core and verifies text character appearance", async () => {
  const core = await source("src/illustrator/core/ie3jp/tools/modify/batch-object-core.ts");
  const appearance = await source("src/illustrator/core/ie3jp/tools/modify/set-appearance.ts");
  const visual = await source("src/illustrator/core/ie3jp/tools/read/get-visual-appearance.ts");
  assert.match(core, /function modifyObjectOperations/);
  assert.match(core, /applyTextAppearance/);
  assert.match(core, /readTextAppearance/);
  assert.match(appearance, /modifyObjectOperations\(operations/);
  assert.match(visual, /readTextAppearance/);
  assert.match(visual, /fill_mixed/);
});

test("installer routing remains batch-first without backend fallback or automatic undo", async () => {
  const installer = await source("scripts/configure-codex.mjs");
  assert.match(installer, /Adobe Illustrator Official MCP/);
  assert.match(installer, /Never automatically invoke Undo/);
  assert.match(installer, /set_appearance/);
  assert.match(installer, /modify_objects/);
  assert.match(installer, /stripRoutingBlock/);
  assert.match(installer, /ONLY when the user explicitly asks to protect\/preserve a MASTER/);
  assert.match(installer, /Without that explicit instruction, never call/);
  assert.match(installer, /Do not ritual-probe with/);
  assert.match(installer, /Stable is the default target/);
});

test("Core routing keeps Production explicit and excludes automatic work-copy or save rituals", async () => {
  const production = await source("src/mcp/dpm-production-tools.ts");
  const appearance = await source("src/illustrator/core/ie3jp/tools/modify/set-appearance.ts");
  const visual = await source("src/illustrator/core/ie3jp/tools/read/get-visual-appearance.ts");
  assert.match(production, /Use ONLY when the user explicitly asks to protect a MASTER/);
  assert.match(production, /Do not call before ordinary document work/);
  assert.match(appearance, /never loop modify_object/);
  assert.match(visual, /only when visual\/appearance confirmation is actually needed/);
});

test("find_objects provides safe one-execution bulk query/update for TextFrame appearance", async () => {
  const find = await source("src/illustrator/core/ie3jp/tools/read/find-objects.ts");
  assert.match(find, /object_types/);
  assert.match(find, /set_properties/);
  assert.match(find, /applyTextAppearance/);
  assert.match(find, /success_count/);
  assert.match(find, /skipped_objects/);
  assert.doesNotMatch(find, /resolveCoordinate: true/);
});

test("common transforms and rename are public batch-first Core tools", () => {
  const registered = (createDesignProductionMcpServer() as unknown as { _registeredTools: Record<string, unknown> })._registeredTools;
  for (const name of ["move_objects", "rotate_objects", "scale_objects", "rename_objects"]) {
    assert.ok(registered[name], `${name} must be registered`);
  }
  for (const productionTool of ["create_work_copy", "reconcile_work_copy", "dpm_save_work_copy"]) {
    assert.ok(registered[productionTool], `${productionTool} must remain registered`);
  }
});

test("Stable AppleScript transport addresses the Stable bundle without a broken POSIX tell target", async () => {
  const transport = await source("src/illustrator/core/ie3jp/executor/file-transport.ts");
  assert.match(transport, /tell application id "com\.adobe\.illustrator"/);
  assert.doesNotMatch(transport, /tell application "\$\{appPathEscaped\}"/);
});

test("installer is idempotent and uninstall/reinstall only manages its own blocks", async () => {
  const sandbox = await mkdtemp(join(tmpdir(), "dpm-installer-"));
  const env = { ...process.env, DPM_CODEX_HOME: sandbox };
  const node = process.execPath;
  const config = join(sandbox, "config.toml");
  const agents = join(sandbox, "AGENTS.md");
  const run = (operation: "install" | "uninstall") => operation === "install"
    ? execFile(node, ["scripts/configure-codex.mjs", operation, node, join(root, "dist/src/mcp/stdio.js")], { cwd: root, env })
    : execFile(node, ["scripts/configure-codex.mjs", operation], { cwd: root, env });
  await run("install");
  await run("install");
  let contents = await readFile(config, "utf8");
  assert.equal((contents.match(/\[mcp_servers\.design-production-illustrator\]/g) ?? []).length, 1);
  let routing = await readFile(agents, "utf8");
  assert.equal((routing.match(/design-production-illustrator:routing:start/g) ?? []).length, 1);
  await run("uninstall");
  contents = await readFile(config, "utf8");
  routing = await readFile(agents, "utf8");
  assert.doesNotMatch(contents, /design-production-illustrator/);
  assert.doesNotMatch(routing, /design-production-illustrator:routing:start/);
  await run("install");
  contents = await readFile(config, "utf8");
  assert.match(contents, /\[mcp_servers\.design-production-illustrator\]/);
});
