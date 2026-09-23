import test from "node:test";
import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const root = process.cwd();
const node = process.execPath;
const entrypoint = join(root, "dist/src/mcp/stdio.js");
const targetHeader = "[mcp_servers.design-production-illustrator]";

async function fixture(config = "") {
  const home = await mkdtemp(join(tmpdir(), "dpm-configure-codex-"));
  await writeFile(join(home, "config.toml"), config, "utf8");
  const env = { ...process.env, DPM_CODEX_HOME: home };
  const run = (operation: "install" | "uninstall") => execFile(
    node,
    ["scripts/configure-codex.mjs", operation, ...(operation === "install" ? [node, entrypoint] : [])],
    { cwd: root, env },
  );
  const configPath = join(home, "config.toml");
  return { home, run, configPath };
}

test("installer adds the 240-second default and remains idempotent without disturbing unrelated config", async () => {
  const setup = await fixture('[desktop]\nmode = "keep"\n\n[mcp_servers.other]\ncommand = "other"\n');
  await setup.run("install");
  const first = await readFile(setup.configPath, "utf8");
  assert.match(first, /\[desktop\]\nmode = "keep"/);
  assert.match(first, /\[mcp_servers\.other\]\ncommand = "other"/);
  assert.match(first, new RegExp(`${targetHeader.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\ncommand = `));
  assert.match(first, /tool_timeout_sec = 240/);
  assert.equal((first.match(/tool_timeout_sec/g) ?? []).length, 1);
  await setup.run("install");
  assert.equal(await readFile(setup.configPath, "utf8"), first);
});

test("installer adds a missing timeout while preserving safe unknown target-table fields and comments", async () => {
  const setup = await fixture(`${targetHeader}\n# preserve this comment\ncommand = "/old/node"\nargs = ["/old/server"]\ncustom_key = "keep"\n`);
  await setup.run("install");
  const config = await readFile(setup.configPath, "utf8");
  assert.match(config, /# preserve this comment/);
  assert.match(config, /custom_key = "keep"/);
  assert.match(config, new RegExp(`command = ${JSON.stringify(node).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.match(config, /tool_timeout_sec = 240/);
});

test("installer preserves an existing 240-second timeout without duplicating it", async () => {
  const setup = await fixture(`${targetHeader}\ncommand = "/old/node"\nargs = ["/old/server"]\ntool_timeout_sec = 240\n`);
  await setup.run("install");
  const first = await readFile(setup.configPath, "utf8");
  assert.equal((first.match(/tool_timeout_sec/g) ?? []).length, 1);
  await setup.run("install");
  assert.equal(await readFile(setup.configPath, "utf8"), first);
});

test("installer preserves explicit low and high timeout choices, warning only for low values", async () => {
  const low = await fixture(`${targetHeader}\ncommand = "/old/node"\nargs = ["/old/server"]\ntool_timeout_sec = 60\n`);
  const lowResult = await low.run("install");
  assert.match(await readFile(low.configPath, "utf8"), /tool_timeout_sec = 60/);
  assert.match(lowResult.stderr, /WARNING: Existing design-production-illustrator tool_timeout_sec=60 was preserved/);

  const high = await fixture(`${targetHeader}\ncommand = "/old/node"\nargs = ["/old/server"]\ntool_timeout_sec = 300\n`);
  const highResult = await high.run("install");
  assert.match(await readFile(high.configPath, "utf8"), /tool_timeout_sec = 300/);
  assert.doesNotMatch(highResult.stderr, /WARNING:/);
});

test("installer fails closed on duplicate target tables", async () => {
  const original = `${targetHeader}\ncommand = "one"\nargs = ["one"]\n\n${targetHeader}\ncommand = "two"\nargs = ["two"]\n`;
  const setup = await fixture(original);
  await assert.rejects(setup.run("install"), /Duplicate \[mcp_servers\.design-production-illustrator\] entries/);
  assert.equal(await readFile(setup.configPath, "utf8"), original);
});

test("installer fails closed on duplicate or malformed target-table fields", async () => {
  for (const original of [
    `${targetHeader}\ncommand = "node"\nargs = ["server"]\ntool_timeout_sec = 60\ntool_timeout_sec = 240\n`,
    `${targetHeader}\ncommand = "node"\ncommand = "other"\nargs = ["server"]\n`,
    `${targetHeader}\ncommand = "node"\nargs = ["server"]\ntool_timeout_sec = "forever"\n`,
    `${targetHeader}\ncommand = "node"\nargs = ["server"]\nthis cannot be safely parsed\n`,
  ]) {
    const setup = await fixture(original);
    await assert.rejects(setup.run("install"));
    assert.equal(await readFile(setup.configPath, "utf8"), original);
  }
});

test("uninstall removes a timeout-bearing target table while preserving unrelated config", async () => {
  const setup = await fixture(`[mcp_servers.other]\ncommand = "other"\n\n${targetHeader}\ncommand = "node"\nargs = ["server"]\ntool_timeout_sec = 240\ncustom_key = "remove-with-target"\n\n[desktop]\nmode = "keep"\n`);
  await setup.run("uninstall");
  const config = await readFile(setup.configPath, "utf8");
  assert.doesNotMatch(config, /design-production-illustrator|tool_timeout_sec|custom_key/);
  assert.match(config, /\[mcp_servers\.other\]\ncommand = "other"/);
  assert.match(config, /\[desktop\]\nmode = "keep"/);
});
