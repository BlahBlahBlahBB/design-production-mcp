#!/usr/bin/env node
import { existsSync, statSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const SERVER_NAME = "design-production-illustrator";
const TABLE_HEADER = `[mcp_servers.${SERVER_NAME}]`;
const RECOMMENDED_TOOL_TIMEOUT_SEC = 240;
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
- Put all requested formatting directly into the binding. Use the user's font names directly first; \`generate_template_variants\` accepts either \`font\` or \`font_name\` and normalizes them internally before resolving exact or unique Illustrator font identity. Do NOT retry a batch merely to rename \`font\` to \`font_name\`, and do NOT call \`list_fonts\` proactively. Only after explicit \`FONT_NOT_FOUND\` or \`FONT_AMBIGUOUS\` may you call one filtered \`list_fonts\` lookup and retry once. Map 段落居中 to \`paragraph_alignment="center"\`; map 与画板垂直居中 to \`center_in_artboard="vertical"\`; map 画板居中 or explicit horizontal+vertical centering to \`center_in_artboard="both"\`. Conditional sizes such as four-Han-character names at 83 pt belong in \`conditional_font_sizes\` in that same call.
- When a spreadsheet/CSV is only a read-only data source for template variants, perform one extraction attempt with one parser and cache the result for the rest of the turn. Read spreadsheet skill/reference material at most once when the environment requires it. If that first parser succeeds, do not invoke pandas after openpyxl, openpyxl after pandas, unzip/XML inspection, or another workbook read for reassurance. Use a second parser only when the first attempt returns a concrete parse error, missing-sheet error, or genuine column ambiguity; explain that fallback in the trace. For larger lists (roughly 20+ values), do not paste or reconstruct the values through model text/tool arguments. Have the successful parser write the exact string array to one UTF-8 temporary JSON file and pass that path as \`values_json_path\` to \`generate_template_variants\`. The batch tool reports the exact input count, SHA-256, and true duplicate values from that file. For small lists, inline \`values\` remains acceptable. Never deduplicate unless the user explicitly asks; duplicate source rows are legitimate data.
- A successful \`generate_template_variants\` result already verifies bound text plus requested font/alignment/artboard-centering conditions. If it reports success with zero mismatches, save directly. Do NOT follow a clean success with \`get_typography_metrics\`, \`list_text_frames\`, \`get_artboards\`, \`get_document_structure\`, or other ritual verification reads unless the user explicitly requests extra verification.
- For large generated documents, perform at most one intended save operation: use \`save_document(mode="save_as", path=...)\` directly when the result should be a new AI file, or \`save_document(mode="save")\` only when overwriting the active document is actually intended. Do not do save -> stat -> save_as, repeated \`stat\` probes, or a second save merely because the first transport call is slow. The save tool has a long-save budget and timing telemetry. If it still returns a timeout or uncertain result, stop and report save state as uncertain; do not immediately retry or overwrite another file without user direction.
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

const TABLE_HEADER_RE = /^\s*\[mcp_servers\.design-production-illustrator\]\s*(?:#.*)?$/;
const ENV_TABLE_HEADER = `[mcp_servers.${SERVER_NAME}.env]`;
const ENV_TABLE_HEADER_RE = /^\s*\[mcp_servers\.design-production-illustrator\.env\]\s*(?:#.*)?$/;
const TARGET_SUBTABLE_RE = /^\s*\[mcp_servers\.design-production-illustrator\./;
const TABLE_RE = /^\s*\[[^\]]+\]\s*(?:#.*)?$/;
const KEY_RE = /^(\s*)([A-Za-z0-9_.-]+)(\s*)=(.*)$/;
const SIMPLE_NUMBER_RE = /^\s*(\d+(?:\.\d+)?)\s*(?:#.*)?$/;

function splitConfig(content) {
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  return { lines: content.split(eol), eol };
}

function locateTargetTable(lines) {
  const headers = lines.reduce((found, line, index) => {
    if (TABLE_HEADER_RE.test(line)) found.push(index);
    return found;
  }, []);
  if (headers.length > 1) throw new Error(`Duplicate ${TABLE_HEADER} entries; refusing to rewrite Codex configuration.`);
  const envHeaders = lines.reduce((found, line, index) => {
    if (ENV_TABLE_HEADER_RE.test(line)) found.push(index);
    else if (TARGET_SUBTABLE_RE.test(line)) throw new Error(`Unsupported nested ${TABLE_HEADER} table; refusing to rewrite Codex configuration.`);
    return found;
  }, []);
  if (envHeaders.length > 1) throw new Error(`Duplicate ${ENV_TABLE_HEADER} entries; refusing to rewrite Codex configuration.`);
  if (headers.length === 0) {
    if (envHeaders.length) throw new Error(`Orphaned ${ENV_TABLE_HEADER}; refusing to rewrite Codex configuration.`);
    return null;
  }

  const start = headers[0];
  let end = start + 1;
  while (end < lines.length && !/^\s*\[/.test(lines[end])) end += 1;
  if (end < lines.length && !TABLE_RE.test(lines[end])) {
    throw new Error(`Malformed TOML table boundary near ${TABLE_HEADER}; refusing to rewrite Codex configuration.`);
  }
  let env = null;
  if (envHeaders.length) {
    const envStart = envHeaders[0];
    let envEnd = envStart + 1;
    while (envEnd < lines.length && !/^\s*\[/.test(lines[envEnd])) envEnd += 1;
    if (envEnd < lines.length && !TABLE_RE.test(lines[envEnd])) {
      throw new Error(`Malformed TOML table boundary near ${ENV_TABLE_HEADER}; refusing to rewrite Codex configuration.`);
    }
    env = { start: envStart, end: envEnd };
  }
  return { start, end, env };
}

function parseTomlString(raw) {
  const value = raw.trim();
  if (/^"(?:\\.|[^"\\])*"$/.test(value)) {
    try { return JSON.parse(value); } catch { return null; }
  }
  if (/^'[^']*'$/.test(value)) return value.slice(1, -1);
  return null;
}

function parseInlineEntries(raw, label) {
  const entries = new Map();
  let remaining = raw.trim();
  while (remaining) {
    const match = remaining.match(/^([A-Za-z0-9_.-]+)\s*=\s*("(?:\\.|[^"\\])*"|'[^']*')\s*(?:,\s*|$)/);
    if (!match) throw new Error(`Malformed ${label}; refusing to rewrite Codex configuration.`);
    if (entries.has(match[1])) throw new Error(`Duplicate ${match[1]} in ${label}; refusing to rewrite Codex configuration.`);
    const value = parseTomlString(match[2]);
    if (value === null) throw new Error(`Malformed ${label}; refusing to rewrite Codex configuration.`);
    entries.set(match[1], value);
    remaining = remaining.slice(match[0].length);
  }
  return entries;
}

function parseEnvVars(raw) {
  const openingBracket = raw.indexOf("[");
  if (!/^\s*\[/.test(raw)) throw new Error(`Malformed env_vars in ${TABLE_HEADER}; refusing to rewrite Codex configuration.`);
  let closingBracket = -1;
  let quote = null;
  let escaped = false;
  for (let index = openingBracket + 1; index < raw.length; index += 1) {
    const char = raw[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\" && quote === '"') escaped = true;
      else if (char === quote) quote = null;
    } else if (char === '"' || char === "'") quote = char;
    else if (char === "]") { closingBracket = index; break; }
  }
  if (closingBracket < 0 || !/^\s*(?:#.*)?$/.test(raw.slice(closingBracket + 1))) {
    throw new Error(`Malformed env_vars in ${TABLE_HEADER}; refusing to rewrite Codex configuration.`);
  }
  const names = [];
  let remaining = raw.slice(openingBracket + 1, closingBracket).trim();
  while (remaining) {
    const item = remaining.match(/^("(?:\\.|[^"\\])*"|'[^']*'|\{[^{}]*\})\s*(?:,\s*|$)/);
    if (!item) throw new Error(`Malformed env_vars in ${TABLE_HEADER}; refusing to rewrite Codex configuration.`);
    let name;
    if (item[1].startsWith("{")) {
      const fields = parseInlineEntries(item[1].slice(1, -1), "env_vars entry");
      if ([...fields.keys()].some((field) => field !== "name" && field !== "source") ||
          (fields.get("source") ?? "local") !== "local") {
        throw new Error(`Unsupported env_vars entry in ${TABLE_HEADER}; refusing to rewrite Codex configuration.`);
      }
      name = fields.get("name");
    } else {
      name = parseTomlString(item[1]);
    }
    if (!name || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || names.includes(name)) {
      throw new Error(`Invalid or duplicate env_vars entry in ${TABLE_HEADER}; refusing to rewrite Codex configuration.`);
    }
    names.push(name);
    remaining = remaining.slice(item[0].length);
  }
  return { names, closingBracket, trailingComma: raw.slice(openingBracket + 1, closingBracket).trimEnd().endsWith(",") };
}

function validTmpdir(value) {
  if (typeof value !== "string" || !value || !path.isAbsolute(value)) return false;
  try { return statSync(value).isDirectory(); } catch { return false; }
}

function inspectTmpdir(lines, target) {
  const targetEntries = inspectTargetTable(lines, target.start, target.end).keys;
  const envVarsEntry = targetEntries.get("env_vars")?.[0];
  const inlineEnvEntry = targetEntries.get("env")?.[0];
  if ((targetEntries.get("env_vars")?.length ?? 0) > 1 || (targetEntries.get("env")?.length ?? 0) > 1) {
    throw new Error(`Duplicate environment key in ${TABLE_HEADER}; refusing to rewrite Codex configuration.`);
  }
  const envVars = envVarsEntry ? parseEnvVars(envVarsEntry.match[4]) : null;
  const inlineEnv = inlineEnvEntry ? inlineEnvEntry.match[4].match(/^\s*\{(.*)\}\s*(?:#.*)?$/) : null;
  if (inlineEnvEntry && !inlineEnv) throw new Error(`Malformed env in ${TABLE_HEADER}; refusing to rewrite Codex configuration.`);
  const inlineValues = inlineEnv ? parseInlineEntries(inlineEnv[1], "env") : new Map();
  const nestedValues = new Map();
  if (target.env) {
    for (let index = target.env.start + 1; index < target.env.end; index += 1) {
      const line = lines[index];
      if (/^\s*(?:#.*)?$/.test(line)) continue;
      const match = line.match(KEY_RE);
      if (!match || nestedValues.has(match[2])) throw new Error(`Malformed or duplicate ${ENV_TABLE_HEADER} entry; refusing to rewrite Codex configuration.`);
      const valueMatch = match[4].match(/^\s*("(?:\\.|[^"\\])*"|'[^']*')\s*(?:#.*)?$/);
      const value = valueMatch ? parseTomlString(valueMatch[1]) : null;
      if (value === null) throw new Error(`Malformed ${ENV_TABLE_HEADER} entry; refusing to rewrite Codex configuration.`);
      nestedValues.set(match[2], value);
    }
  }
  if (inlineEnvEntry && target.env) throw new Error(`Ambiguous env in ${TABLE_HEADER}; refusing to rewrite Codex configuration.`);
  const declarations = [envVars?.names.includes("TMPDIR"), inlineValues.has("TMPDIR"), nestedValues.has("TMPDIR")].filter(Boolean).length;
  if (declarations > 1) throw new Error(`Duplicate TMPDIR declaration in ${TABLE_HEADER}; refusing to rewrite Codex configuration.`);
  const explicit = inlineValues.get("TMPDIR") ?? nestedValues.get("TMPDIR");
  if (explicit !== undefined && !validTmpdir(explicit)) throw new Error(`Invalid TMPDIR in ${TABLE_HEADER}; refusing to rewrite Codex configuration.`);
  return { envVarsEntry, envVars, configured: declarations === 1 };
}

function inspectTargetTable(lines, start, end) {
  const keys = new Map();
  for (let index = start + 1; index < end; index += 1) {
    const line = lines[index];
    if (/^\s*(?:#.*)?$/.test(line)) continue;
    const match = line.match(KEY_RE);
    if (!match) throw new Error(`Malformed ${TABLE_HEADER} entry on line ${index + 1}; refusing to rewrite Codex configuration.`);
    const entries = keys.get(match[2]) ?? [];
    entries.push({ index, match });
    keys.set(match[2], entries);
  }
  for (const key of ["command", "args", "tool_timeout_sec"]) {
    if ((keys.get(key)?.length ?? 0) > 1) throw new Error(`Duplicate ${key} key in ${TABLE_HEADER}; refusing to rewrite Codex configuration.`);
  }
  const timeout = keys.get("tool_timeout_sec")?.[0];
  if (!timeout) return { keys, timeout: null };
  const numeric = timeout.match[4].match(SIMPLE_NUMBER_RE);
  if (!numeric || !Number.isFinite(Number(numeric[1]))) {
    throw new Error(`Invalid tool_timeout_sec in ${TABLE_HEADER}; refusing to rewrite Codex configuration.`);
  }
  return { keys, timeout: Number(numeric[1]) };
}

function upsertServerTable(content, nodePath, entrypoint, currentTmpdir) {
  const { lines, eol } = splitConfig(content);
  const target = locateTargetTable(lines);
  const canForwardTmpdir = validTmpdir(currentTmpdir);
  const tmpdirWarning = canForwardTmpdir ? null : `Current TMPDIR is unavailable or invalid; ${SERVER_NAME} TMPDIR forwarding was not added.`;
  if (!target) {
    const prefix = content.trimEnd();
    const block = `${TABLE_HEADER}${eol}command = ${tomlString(nodePath)}${eol}args = [${tomlString(entrypoint)}]${eol}tool_timeout_sec = ${RECOMMENDED_TOOL_TIMEOUT_SEC}${eol}${canForwardTmpdir ? `env_vars = ["TMPDIR"]${eol}` : ""}`;
    return { content: `${prefix}${prefix ? `${eol}${eol}` : ""}${block}`, warning: tmpdirWarning };
  }

  const inspected = inspectTargetTable(lines, target.start, target.end);
  const tmpdir = inspectTmpdir(lines, target);
  const command = inspected.keys.get("command")?.[0];
  const args = inspected.keys.get("args")?.[0];
  if (command) lines[command.index] = `${command.match[1]}command${command.match[3]}= ${tomlString(nodePath)}`;
  if (args) lines[args.index] = `${args.match[1]}args${args.match[3]}= [${tomlString(entrypoint)}]`;
  const additions = [];
  if (!command) additions.push(`command = ${tomlString(nodePath)}`);
  if (!args) additions.push(`args = [${tomlString(entrypoint)}]`);
  if (inspected.timeout === null) additions.push(`tool_timeout_sec = ${RECOMMENDED_TOOL_TIMEOUT_SEC}`);
  if (!tmpdir.configured && canForwardTmpdir) {
    if (tmpdir.envVarsEntry) {
      const entry = tmpdir.envVarsEntry;
      const original = lines[entry.index];
      const bracket = original.indexOf(entry.match[4]) + tmpdir.envVars.closingBracket;
      lines[entry.index] = `${original.slice(0, bracket)}${tmpdir.envVars.names.length && !tmpdir.envVars.trailingComma ? ", " : ""}"TMPDIR"${original.slice(bracket)}`;
    } else {
      additions.push('env_vars = ["TMPDIR"]');
    }
  }
  if (additions.length > 0) lines.splice(target.end, 0, ...additions);

  const timeoutWarning = inspected.timeout !== null && inspected.timeout < RECOMMENDED_TOOL_TIMEOUT_SEC
    ? `Existing ${SERVER_NAME} tool_timeout_sec=${inspected.timeout} was preserved. ${RECOMMENDED_TOOL_TIMEOUT_SEC} seconds is recommended because some Illustrator MCP operations can run for up to 180 seconds.`
    : null;
  const warning = [timeoutWarning, !tmpdir.configured ? tmpdirWarning : null].filter(Boolean).join(" ") || null;
  return { content: lines.join(eol), warning };
}

function stripServerTable(content) {
  const { lines, eol } = splitConfig(content);
  const kept = [];
  let removed = false;
  let skipping = false;
  for (const line of lines) {
    if (TABLE_HEADER_RE.test(line) || TARGET_SUBTABLE_RE.test(line)) {
      removed = true;
      skipping = true;
      continue;
    }
    if (/^\s*\[/.test(line)) skipping = false;
    if (!skipping) kept.push(line);
  }
  const next = kept.join(eol).replace(new RegExp(`(?:${eol}){3,}`, "g"), `${eol}${eol}`).trimEnd();
  return { content: next ? `${next}${eol}` : "", removed };
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
const currentAgents = existsSync(agentsPath) ? await readFile(agentsPath, "utf8") : "";
const strippedAgents = stripRoutingBlock(currentAgents);

if (operation === "uninstall") {
  const strippedConfig = stripServerTable(currentConfig);
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

const configured = upsertServerTable(currentConfig, nodePath, entrypoint, process.env.TMPDIR);
if (configured.content !== currentConfig) {
  await writeWithBackup(configPath, configured.content, "Codex configuration");
  console.log(`Configured ${TABLE_HEADER} in ${configPath}`);
} else {
  console.log(`${TABLE_HEADER} in ${configPath} is already current.`);
}
if (configured.warning) console.warn(`WARNING: ${configured.warning}`);

const nextAgents = `${strippedAgents.content.trimEnd()}${strippedAgents.content.trimEnd() ? "\n\n" : ""}${ROUTING_BLOCK}\n`;
await writeWithBackup(agentsPath, nextAgents, "Codex global instructions");
console.log(`Configured Illustrator MCP routing instructions in ${agentsPath}`);
