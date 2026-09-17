#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const SERVER_NAME = "design-production-illustrator";
const TABLE_HEADER = `[mcp_servers.${SERVER_NAME}]`;

function usage() {
  console.error("Usage: configure-codex.mjs <install|uninstall> [node-path server-entrypoint]");
  process.exit(2);
}

function nodeMajor() {
  return Number.parseInt(process.versions.node.split(".")[0], 10);
}

function stripServerTable(content) {
  const lines = content.split(/\r?\n/);
  const kept = [];
  let removed = false;

  for (let index = 0; index < lines.length;) {
    if (new RegExp(`^\\s*\\[mcp_servers\\.${SERVER_NAME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]\\s*(?:#.*)?$`).test(lines[index])) {
      removed = true;
      index += 1;
      while (index < lines.length && !/^\s*\[/.test(lines[index])) index += 1;
      continue;
    }
    kept.push(lines[index]);
    index += 1;
  }

  return { content: kept.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n", removed };
}

function tomlString(value) {
  return JSON.stringify(value);
}

async function writeWithBackup(configPath, content) {
  const original = existsSync(configPath) ? await readFile(configPath, "utf8") : "";
  await mkdir(path.dirname(configPath), { recursive: true });
  if (existsSync(configPath)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = `${configPath}.backup-${stamp}`;
    await writeFile(backupPath, original, "utf8");
    console.log(`Backed up Codex configuration to ${backupPath}`);
  }
  const temporaryPath = `${configPath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, content, "utf8");
  await rename(temporaryPath, configPath);
}

const [operation, nodePath, entrypoint] = process.argv.slice(2);
if (operation !== "install" && operation !== "uninstall") usage();

const configPath = path.join(os.homedir(), ".codex", "config.toml");
const current = existsSync(configPath) ? await readFile(configPath, "utf8") : "";
const stripped = stripServerTable(current);

if (operation === "uninstall") {
  if (!stripped.removed) {
    console.log(`${TABLE_HEADER} is not present; nothing to remove.`);
    process.exit(0);
  }
  await writeWithBackup(configPath, stripped.content);
  console.log(`Removed ${TABLE_HEADER} from ${configPath}`);
  process.exit(0);
}

if (!nodePath || !entrypoint || !path.isAbsolute(nodePath) || !path.isAbsolute(entrypoint)) usage();
if (nodeMajor() < 20) {
  console.error(`Node ${process.versions.node} is unsupported. Node 20 or later is required.`);
  process.exit(1);
}
if (!existsSync(nodePath)) throw new Error(`Node executable does not exist: ${nodePath}`);
if (!existsSync(entrypoint)) throw new Error(`Compiled MCP server does not exist: ${entrypoint}`);

const serverBlock = `${TABLE_HEADER}\ncommand = ${tomlString(nodePath)}\nargs = [${tomlString(entrypoint)}]\n`;
const next = `${stripped.content.trimEnd()}${stripped.content.trimEnd() ? "\n\n" : ""}${serverBlock}`;
await writeWithBackup(configPath, next);
console.log(`Configured ${TABLE_HEADER} in ${configPath}`);
