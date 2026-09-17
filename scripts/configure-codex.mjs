#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const SERVER_NAME = "design-production-illustrator";
const TABLE_HEADER = `[mcp_servers.${SERVER_NAME}]`;
const ROUTING_START = "<!-- design-production-illustrator:routing:start -->";
const ROUTING_END = "<!-- design-production-illustrator:routing:end -->";
const ROUTING_BLOCK = `${ROUTING_START}
## Illustrator MCP routing

For Adobe Illustrator tasks:

- Use the \`design-production-illustrator\` MCP as the primary interface whenever the requested operation is supported by this MCP.
- Prefer MCP read/write tools over Computer Use, browser automation, Adobe Illustrator Beta integrations, or UI inspection.
- Do not use \`Com.adobe.illustratorbeta\`, Adobe Illustrator Beta, browser automation, or Computer Use for Illustrator document inspection or editing when the MCP can perform the task.
- Target Adobe Illustrator Stable by default. Do not launch Illustrator Beta unless the user explicitly asks for Beta.
- For read-only requests, use MCP read tools directly.
- For important production files where the MASTER must be protected, use the DPM Production work-copy flow.
- If the MCP is unavailable, fails, or lacks a required capability, stop and explain the gap. Do not silently fall back to Computer Use or Illustrator Beta; only use a fallback after explicit user approval.
${ROUTING_END}`;

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

function stripRoutingBlock(content) {
  const start = content.indexOf(ROUTING_START);
  if (start < 0) return { content, removed: false };
  const end = content.indexOf(ROUTING_END, start);
  if (end < 0) {
    throw new Error(`Found ${ROUTING_START} without matching ${ROUTING_END}; refusing to modify AGENTS.md automatically.`);
  }
  const after = end + ROUTING_END.length;
  const next = `${content.slice(0, start)}${content.slice(after)}`
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
  return { content: next ? `${next}\n` : "", removed: true };
}

function tomlString(value) {
  return JSON.stringify(value);
}

async function writeWithBackup(targetPath, content, label = "Codex configuration") {
  const original = existsSync(targetPath) ? await readFile(targetPath, "utf8") : "";
  await mkdir(path.dirname(targetPath), { recursive: true });
  if (existsSync(targetPath)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = `${targetPath}.backup-${stamp}`;
    await writeFile(backupPath, original, "utf8");
    console.log(`Backed up ${label} to ${backupPath}`);
  }
  const temporaryPath = `${targetPath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, content, "utf8");
  await rename(temporaryPath, targetPath);
}

const [operation, nodePath, entrypoint] = process.argv.slice(2);
if (operation !== "install" && operation !== "uninstall") usage();

const codexHome = path.join(os.homedir(), ".codex");
const configPath = path.join(codexHome, "config.toml");
const agentsPath = path.join(codexHome, "AGENTS.md");

const currentConfig = existsSync(configPath) ? await readFile(configPath, "utf8") : "";
const strippedConfig = stripServerTable(currentConfig);
const currentAgents = existsSync(agentsPath) ? await readFile(agentsPath, "utf8") : "";
const strippedAgents = stripRoutingBlock(currentAgents);

if (operation === "uninstall") {
  let changed = false;

  if (strippedConfig.removed) {
    await writeWithBackup(configPath, strippedConfig.content, "Codex configuration");
    console.log(`Removed ${TABLE_HEADER} from ${configPath}`);
    changed = true;
  }

  if (strippedAgents.removed) {
    await writeWithBackup(agentsPath, strippedAgents.content, "Codex global instructions");
    console.log(`Removed Illustrator MCP routing instructions from ${agentsPath}`);
    changed = true;
  }

  if (!changed) {
    console.log("Illustrator MCP configuration and routing instructions are not present; nothing to remove.");
  }
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
const nextConfig = `${strippedConfig.content.trimEnd()}${strippedConfig.content.trimEnd() ? "\n\n" : ""}${serverBlock}`;
await writeWithBackup(configPath, nextConfig, "Codex configuration");
console.log(`Configured ${TABLE_HEADER} in ${configPath}`);

const nextAgents = `${strippedAgents.content.trimEnd()}${strippedAgents.content.trimEnd() ? "\n\n" : ""}${ROUTING_BLOCK}\n`;
await writeWithBackup(agentsPath, nextAgents, "Codex global instructions");
console.log(`Configured Illustrator MCP routing instructions in ${agentsPath}`);
