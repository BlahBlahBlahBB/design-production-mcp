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

async function fixture(config: string | ((home: string) => string) = "", tmpdirValue?: string | null) {
  const home = await mkdtemp(join(tmpdir(), "dpm-configure-codex-"));
  await writeFile(join(home, "config.toml"), typeof config === "function" ? config(home) : config, "utf8");
  const env: NodeJS.ProcessEnv = { ...process.env, DPM_CODEX_HOME: home };
  if (tmpdirValue === null) delete env.TMPDIR;
  else env.TMPDIR = tmpdirValue ?? home;
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
  assert.match(first, /env_vars = \["TMPDIR"\]/);
  assert.equal((first.match(/tool_timeout_sec/g) ?? []).length, 1);
  await setup.run("install");
  assert.equal(await readFile(setup.configPath, "utf8"), first);
});

test("installer forwards TMPDIR dynamically and preserves an existing env_vars list", async () => {
  const setup = await fixture(`${targetHeader}\ncommand = "/old/node"\nargs = ["/old/server"]\nenv_vars = ["OTHER"] # keep ] comment\n`);
  await setup.run("install");
  const first = await readFile(setup.configPath, "utf8");
  assert.match(first, /env_vars = \["OTHER", "TMPDIR"\] # keep \] comment/);
  assert.match(first, /tool_timeout_sec = 240/);
  await setup.run("install");
  assert.equal(await readFile(setup.configPath, "utf8"), first);
});

test("installer appends TMPDIR after a valid env_vars trailing comma", async () => {
  const setup = await fixture(`${targetHeader}\ncommand = "/old/node"\nargs = ["/old/server"]\nenv_vars = ["OTHER",] # keep\n`);
  await setup.run("install");
  const first = await readFile(setup.configPath, "utf8");
  assert.match(first, /env_vars = \["OTHER","TMPDIR"\] # keep/);
  await setup.run("install");
  assert.equal(await readFile(setup.configPath, "utf8"), first);
});

test("installer preserves valid explicit TMPDIR in a nested env table and other servers", async () => {
  const setup = await fixture((home) => `[mcp_servers.other]\ncommand = "other"\n\n${targetHeader}\n# keep target comment\ncommand = "/old/node"\nargs = ["/old/server"]\ntool_timeout_sec = 240\ncustom_key = "keep"\n\n[mcp_servers.design-production-illustrator.env]\n# keep env comment\nTMPDIR = ${JSON.stringify(home)}\nOTHER = "keep"\n`);
  await setup.run("install");
  const first = await readFile(setup.configPath, "utf8");
  assert.match(first, /\[mcp_servers\.other\]\ncommand = "other"/);
  assert.match(first, /# keep target comment/);
  assert.match(first, /# keep env comment/);
  assert.match(first, /custom_key = "keep"/);
  assert.match(first, /OTHER = "keep"/);
  assert.doesNotMatch(first, /env_vars =/);
  assert.equal((first.match(/TMPDIR = /g) ?? []).length, 1);
  assert.equal((first.match(/tool_timeout_sec/g) ?? []).length, 1);
  await setup.run("install");
  assert.equal(await readFile(setup.configPath, "utf8"), first);
});

test("installer preserves valid explicit inline TMPDIR", async () => {
  const setup = await fixture((home) => `${targetHeader}\ncommand = "/old/node"\nargs = ["/old/server"]\nenv = { TMPDIR = ${JSON.stringify(home)}, OTHER = "keep" }\n`);
  await setup.run("install");
  const config = await readFile(setup.configPath, "utf8");
  assert.match(config, /env = \{ TMPDIR = /);
  assert.doesNotMatch(config, /env_vars =/);
  assert.match(config, /tool_timeout_sec = 240/);
});

test("installer preserves existing dynamic TMPDIR forwarding", async () => {
  const setup = await fixture(`${targetHeader}\ncommand = "/old/node"\nargs = ["/old/server"]\nenv_vars = ["TMPDIR", "OTHER"]\n`);
  await setup.run("install");
  const config = await readFile(setup.configPath, "utf8");
  assert.equal((config.match(/TMPDIR/g) ?? []).length, 1);
  assert.match(config, /tool_timeout_sec = 240/);
});

test("missing or invalid process TMPDIR adds no invented path and warns", async () => {
  for (const value of [null, "", "relative/tmpdir", "/no-such-dpm-tmpdir"] as const) {
    const setup = await fixture("", value);
    const result = await setup.run("install");
    const config = await readFile(setup.configPath, "utf8");
    assert.doesNotMatch(config, /TMPDIR/);
    assert.match(config, /tool_timeout_sec = 240/);
    assert.match(result.stderr, /WARNING: Current TMPDIR is unavailable or invalid/);
  }
});

test("duplicate or malformed TMPDIR declarations fail closed without rewriting config", async () => {
  for (const config of [
    `${targetHeader}\ncommand = "node"\nargs = ["server"]\nenv_vars = ["TMPDIR", "TMPDIR"]\n`,
    `${targetHeader}\ncommand = "node"\nargs = ["server"]\nenv_vars = ["TMPDIR"]\nenv_vars = ["OTHER"]\n`,
    `${targetHeader}\ncommand = "node"\nargs = ["server"]\nenv_vars = ["TMPDIR"]\n[mcp_servers.design-production-illustrator.env]\nTMPDIR = "/tmp"\n`,
    `${targetHeader}\ncommand = "node"\nargs = ["server"]\n[mcp_servers.design-production-illustrator.env]\nTMPDIR = ""\n`,
    `${targetHeader}\ncommand = "node"\nargs = ["server"]\n[mcp_servers.design-production-illustrator.env]\nTMPDIR = "relative"\n`,
    `${targetHeader}\ncommand = "node"\nargs = ["server"]\n[mcp_servers.design-production-illustrator.env]\nTMPDIR = "one"\nTMPDIR = "two"\n`,
    `${targetHeader}\ncommand = "node"\nargs = ["server"]\n[mcp_servers.design-production-illustrator.env]\nTMPDIR = ["wrong type"]\n`,
    `${targetHeader}\ncommand = "node"\nargs = ["server"]\nenv_vars = not-an-array\n`,
    `${targetHeader}\ncommand = "node"\nargs = ["server"]\n[mcp_servers.design-production-illustrator.env]\nthis is malformed\n`,
    `${targetHeader}\ncommand = "node"\nargs = ["server"]\n[mcp_servers.design-production-illustrator.env]\nTMPDIR = "/tmp"\n[mcp_servers.design-production-illustrator.env]\nTMPDIR = "/tmp"\n`,
  ]) {
    const setup = await fixture(config);
    await assert.rejects(setup.run("install"));
    assert.equal(await readFile(setup.configPath, "utf8"), config);
  }
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
