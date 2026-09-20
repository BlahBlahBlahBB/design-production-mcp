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

- Treat ordinary natural-language requests about the current Illustrator document as Illustrator tasks even when the user does not explicitly say “MCP” or name a tool. In a design-editing context, phrases such as “AI里”, “ai文件”, “Illustrator里”, “当前文件”, and “打开的文件” should route to this MCP.
- Infer the needed \`design-production-illustrator\` tools from the requested result. Do not require the user to restate backend constraints, tool names, UUIDs, or implementation details.
- Use the \`design-production-illustrator\` MCP as the primary interface whenever the requested operation is supported by this MCP.
- HARD ROUTING RULE: when the user refers to an already-open/current Illustrator or AI document and asks for an operation supported by this MCP, the FIRST backend action must be a \`design-production-illustrator\` MCP call. Do not inspect the application UI first.
- Prefer MCP read/write tools over Computer Use, browser automation, Adobe Illustrator Beta integrations, Adobe's official Illustrator MCP, or UI inspection.
- Do not use \`Com.adobe.illustratorbeta\`, Adobe Illustrator Beta, Adobe Illustrator Official MCP, browser automation, or Computer Use for Illustrator document inspection or editing unless the user explicitly asks for that backend.
- Do not use Computer Use to check which Illustrator document is open, whether text is editable, what objects are selected, or which menu/panel command might perform an operation that this MCP already supports. Do not select all objects or navigate menus as a precursor to an MCP-capable edit.
- Target Adobe Illustrator Stable by default. Do not launch Illustrator Beta unless the user explicitly asks for Beta.
- For read-only requests, use MCP read tools directly.
- Ordinary Illustrator requests operate directly on the current document with Core. This includes text, color, images, movement, resize, relink/embed, expand, pathfinder, export, save requests, and batch edits.
- Use the DPM Production work-copy flow ONLY when the user explicitly asks to protect/preserve a MASTER, create a work copy, work on a copy, or otherwise gives equivalent explicit instruction. Never infer protection from filename, subject matter, document size, saved state, or perceived importance.
- Without that explicit instruction, never call \`create_work_copy\`, \`reconcile_work_copy\`, or \`dpm_save_work_copy\`; never save merely to create a work-copy flow.
- If the MCP is unavailable, fails, or lacks a required capability, stop and explain the gap and any possible partial mutation. Do not silently fall back to another Illustrator backend; only use one after explicit user approval.
- Never automatically invoke Undo after a failed write. State the observed state and wait for explicit user direction.
- For document-wide typography/text-formatting requests such as “all text in the current file”, “在 AI 打开的文件中把中文/英文/数字字体改掉”, or requests that combine font, paragraph alignment, and text color across the current document, call \`set_typography\` with \`all_stories=true\` directly. Do not first inspect the UI, select all objects, open Select/Text menus, call \`list_text_frames\`, or call \`find_objects\` merely to discover targets. Verify with \`get_typography_metrics\` using \`all_stories=true\` only when verification is needed. This Story path is specifically for document-wide text formatting and avoids fragile \`doc.textFrames\` wrappers.
- Normalize common natural-language color forms before calling typography tools. For example, convert CSS hex \`#RRGGBB\` to the MCP RGB color object instead of passing the hex string directly.
- Use the minimum necessary calls. Do not ritual-probe with \`illustrator_status\`, \`set_illustrator_version\`, or \`get_document_info\` before ordinary work. Stable is the default target; change version only on explicit user request or real multi-instance ambiguity. Reuse UUIDs/properties from successful current-turn tool output.
- Prefer task-level batch tools over chains of atomic calls: use \`find_objects\` with \`set_properties\` for document-wide conditional updates, \`set_appearance\` for a shared change to known UUIDs, \`modify_objects\` for different changes, and batch transform/object tools for common movement or management. Do not loop \`modify_object\` calls when a batch tool applies. Make at most one corresponding \`get_visual_appearance\` call, and only when verification is requested or needed.
- For folder-to-template image jobs, QR-code grids, contact sheets, or other repeated image-slot work, read the template structure once, list source files once, and read text-frame UUIDs at most once when labels must be updated. Then use \`place_images\` for the whole batch. Use its \`width_mm\`/\`height_mm\`, \`center_on_uuid\`, and \`clip_path_uuid\` fields so size, centering, and clipping happen in the same JSX execution; when a source filename must populate a matching label, pass \`label_uuid\` + \`label_text\` in that same placement instead of a later text-write batch. Use \`group_object_sets\` only for pre-existing artwork that was not already clipped by \`place_images\`.
- For one-template-plus-many-data jobs such as name tags, badges, table cards, certificates, SKU labels, numbered layouts, or spreadsheet-driven variants, use the shortest fast path: extract the needed tabular values exactly once, then call \`generate_template_variants\` once. For a single-binding template, OMIT \`source_uuid\` first and let the batch tool auto-bind the only editable TextFrame on the active source artboard. Do NOT call \`get_document_structure\`, \`get_artboards\`, \`list_text_frames\`, or \`get_text_frame_detail\` before the batch merely to discover that one target. Only if the batch explicitly returns \`AUTO_BIND_REQUIRES_ONE_TEXTFRAME\` may you do one text-frame lookup and retry once. Do not loop \`duplicate_active_artboard\`, \`duplicate_objects\`, \`manage_artboards\`, or per-variant text writes.
- Put all requested formatting directly into the binding. Use the user's font names directly first; \`generate_template_variants\` resolves exact or unique normalized Illustrator font identity internally. Do NOT call \`list_fonts\` proactively. Only after explicit \`FONT_NOT_FOUND\` or \`FONT_AMBIGUOUS\` may you call one filtered \`list_fonts\` lookup and retry once. Map 段落居中 to \`paragraph_alignment="center"\`; map 与画板垂直居中 to \`center_in_artboard="vertical"\`; map 画板居中 or explicit horizontal+vertical centering to \`center_in_artboard="both"\`. Conditional sizes such as four-Han-character names at 83 pt belong in \`conditional_font_sizes\` in that same call.
- When a spreadsheet/CSV is only a read-only data source for template variants, do exactly one extraction pass for the required column(s). Do not launch spreadsheet styling/editing workflows, do not repeatedly read spreadsheet skill/reference documents, and do not parse the same workbook twice with multiple Python/unzip/XML probes. Once the value array is obtained, pass it directly to \`generate_template_variants\`.
- A successful \`generate_template_variants\` result already verifies bound text plus requested font/alignment/artboard-centering conditions. If it reports success with zero mismatches, save directly. Do NOT follow a clean success with \`get_typography_metrics\`, \`list_text_frames\`, \`get_artboards\`, \`get_document_structure\`, or other ritual verification reads unless the user explicitly requests extra verification.
- Interpret template-variant counts correctly: for N requested variants, \`generated_variant_count=N\` and \`total_variant_artboard_count=N\`; \`created_artboard_count\` is normally \`N-1\` because the original source artboard is reused as variant 1. Do not treat \`created_artboard_count=N-1\` as a missing variant.
- If \`place_images\` or another batch mutation reports any failure, do not enter an improvised repair loop with repeated ungroup/move/group operations. Do not run shell \`sleep\`, process-list polling, or repeated Illustrator reads to wait for the app. Stop after the first failed batch, report its structured failure/preflight result and possible partial mutation, and wait for user direction. Never save after an unverified timeout or failed batch.
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

// Test-only override keeps installer regression tests from touching a user's Codex setup.
const codexHome = process.env.DPM_CODEX_HOME || path.join(os.homedir(), ".codex");
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
