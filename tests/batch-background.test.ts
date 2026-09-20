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
  assert.match(executor, /timeoutMs/);
  assert.match(executor, /timeout: options\.timeoutMs/);
  assert.match(executor, /includeTiming/);
  assert.match(executor, /transport_elapsed_ms/);
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
  assert.match(installer, /HARD ROUTING RULE/);
  assert.match(installer, /FIRST backend action must be/);
  assert.match(installer, /Do not inspect the application UI first/);
  assert.match(installer, /Do not use Computer Use to check which Illustrator document is open/);
  assert.match(installer, /Do not select all objects or navigate menus as a precursor/);
  assert.match(installer, /all_stories=true.*directly/);
  assert.match(installer, /folder-to-template image jobs/);
  assert.match(installer, /place_images/);
  assert.match(installer, /clip_path_uuid/);
  assert.match(installer, /group_object_sets/);
  assert.match(installer, /label_uuid/);
  assert.match(installer, /label_text/);
  assert.match(installer, /do not enter an improvised repair loop/);
  assert.match(installer, /Do not run shell/);
  assert.match(installer, /Never save after an unverified timeout or failed batch/);
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

test("repeated image/template work has public batch placement and grouping tools", async () => {
  const registered = (createDesignProductionMcpServer() as unknown as { _registeredTools: Record<string, unknown> })._registeredTools;
  assert.ok(registered.place_images, "place_images must be registered");
  assert.ok(registered.group_object_sets, "group_object_sets must be registered");

  const placement = await source("src/illustrator/core/ie3jp/tools/modify/place-images.ts");
  assert.match(placement, /placements/);
  assert.match(placement, /width_mm/);
  assert.match(placement, /height_mm/);
  assert.match(placement, /center_on_uuid/);
  assert.match(placement, /clip_path_uuid/);
  assert.match(placement, /label_uuid/);
  assert.match(placement, /label_text/);
  assert.match(placement, /FAILED_NO_MUTATION/);
  assert.match(placement, /duplicate\(group, ElementPlacement\.PLACEATBEGINNING\)/);
  assert.match(placement, /mask\.clipping = true/);
  assert.match(placement, /group\.clipped = true/);
  assert.match(placement, /p\.clipPath\.remove\(\)/);
  assert.match(placement, /group\.remove\(\)/);
  assert.match(placement, /timeoutMs: 180_000/);
  assert.match(placement, /includeTiming: true/);
  assert.match(placement, /elapsed_ms/);
  assert.match(placement, /preflight_ms/);
  assert.match(placement, /placement_ms/);
  assert.match(placement, /clipping_ms/);
  assert.match(placement, /label_ms/);
  assert.match(placement, /verification_ms/);
  assert.match(placement, /unaccounted_ms/);
  assert.match(placement, /requested_count/);
  assert.match(placement, /failed_objects/);
  assert.doesNotMatch(placement, /activate:\s*true/);

  const groups = await source("src/illustrator/core/ie3jp/tools/modify/group-object-sets.ts");
  assert.match(groups, /groups/);
  assert.match(groups, /clip_path_uuid/);
  assert.match(groups, /PLACEATBEGINNING/);
  assert.match(groups, /\.clipping = true/);
  assert.match(groups, /FAILED_NO_MUTATION/);
  assert.match(groups, /failed_groups/);
  assert.doesNotMatch(groups, /activate:\s*true/);
});

test("data-driven templates use one rollback-safe variant generator", async () => {
  const registered = (createDesignProductionMcpServer() as unknown as { _registeredTools: Record<string, unknown> })._registeredTools;
  assert.ok(registered.generate_template_variants, "generate_template_variants must be registered");

  const variants = await source("src/illustrator/core/ie3jp/tools/modify/generate-template-variants.ts");
  assert.match(variants, /text_bindings/);
  assert.match(variants, /source_uuid: z\.string\(\)\.optional/);
  assert.match(variants, /AUTO_BIND_REQUIRES_ONE_TEXTFRAME/);
  assert.match(variants, /autoResolveSingleTextFrame/);
  assert.match(variants, /source_artboard_index/);
  assert.match(variants, /Math\.ceil\(Math\.sqrt\(variantCount\)\)/);
  assert.match(variants, /sourceRoot\.duplicate\(\)/);
  assert.match(variants, /dup\.translate\(dx, dy\)/);
  assert.match(variants, /writeAndFormat/);
  assert.match(variants, /script_rules/);
  assert.match(variants, /conditional_font_sizes/);
  assert.match(variants, /paragraph_alignment/);
  assert.match(variants, /center_in_artboard/);
  assert.match(variants, /font: z\.string\(\)\.min\(1\)\.optional/);
  assert.match(variants, /font_name: rule\.font_name \?\? rule\.font/);
  assert.match(variants, /params\.text_bindings\.map\(normalizeBinding\)/);
  assert.match(variants, /FONT_NOT_FOUND/);
  assert.match(variants, /FONT_AMBIGUOUS/);
  assert.match(variants, /normalizeFontKey/);
  assert.match(variants, /fontsEquivalent/);
  assert.match(variants, /representative = \{ han:-1, latin:-1 \}/);
  assert.match(variants, /visibleText = readContents\(tf\)/);
  assert.match(variants, /scriptsToCheck = \["han", "latin"\]/);
  assert.match(variants, /expected_family/);
  assert.match(variants, /actual_family/);
  assert.match(variants, /centerTextFrame/);
  assert.match(variants, /artboard_centering/);
  assert.match(variants, /paragraph_alignment_unreadable/);
  assert.match(variants, /tf\.translate/);
  assert.match(variants, /generated_variant_count/);
  assert.match(variants, /total_variant_artboard_count/);
  assert.match(variants, /failed_variant_count/);
  assert.match(variants, /created_artboard_count: variantCount - 1/);
  assert.match(variants, /removeCreatedArtwork/);
  assert.match(variants, /removeAddedArtboards/);
  assert.match(variants, /restoreSourceText/);
  assert.match(variants, /timeoutMs: 180_000/);
  assert.match(variants, /includeTiming: true/);
  assert.doesNotMatch(variants, /activate:\s*true/);

  const installer = await source("scripts/configure-codex.mjs");
  assert.match(installer, /one-template-plus-many-data jobs/);
  assert.match(installer, /generate_template_variants/);
  assert.match(installer, /OMIT .*source_uuid.*auto-bind/);
  assert.match(installer, /AUTO_BIND_REQUIRES_ONE_TEXTFRAME/);
  assert.match(installer, /Do NOT call .*get_document_structure.*get_artboards.*list_text_frames.*get_text_frame_detail.*before/);
  assert.match(installer, /accepts either .*font.*font_name.*normalizes them internally/);
  assert.match(installer, /Do NOT retry a batch merely to rename .*font.*font_name/);
  assert.match(installer, /do NOT call .*list_fonts.*proactively/i);
  assert.match(installer, /FONT_NOT_FOUND.*FONT_AMBIGUOUS/);
  assert.match(installer, /段落居中.*paragraph_alignment/);
  assert.match(installer, /画板垂直居中.*center_in_artboard/);
  assert.match(installer, /one extraction attempt with one parser/);
  assert.match(installer, /cache the resulting value array/);
  assert.match(installer, /at most once/);
  assert.match(installer, /do not invoke pandas after openpyxl, openpyxl after pandas/);
  assert.match(installer, /second parser only when the first attempt returns a concrete parse error/);
  assert.match(installer, /never re-read the workbook during that batch/);
  assert.match(installer, /save directly/);
  assert.match(installer, /Do NOT follow a clean success with .*get_typography_metrics.*list_text_frames.*get_artboards.*get_document_structure/);
  assert.match(variants, /mutationStarted/);
  assert.match(variants, /FAILED_NO_MUTATION/);
  assert.match(variants, /ROLLBACK_ATTEMPTED/);
});

test("typography stays a two-tool batch Core surface with honest Classic DOM limits", async () => {
  const typography = await source("src/illustrator/core/ie3jp/tools/typography-core.ts");
  const detail = await source("src/illustrator/core/ie3jp/tools/read/get-text-frame-detail.ts");
  const align = await source("src/illustrator/core/ie3jp/tools/modify/align-objects.ts");
  const registered = (createDesignProductionMcpServer() as unknown as { _registeredTools: Record<string, unknown> })._registeredTools;
  for (const name of ["get_typography_metrics", "set_typography"]) assert.ok(registered[name], `${name} must be registered`);
  assert.match(typography, /font_runs/);
  assert.match(typography, /mixed_fields/);
  assert.match(typography, /FONT_DEPENDENT/);
  assert.match(typography, /NOT_EXPOSED_BY_CLASSIC_DOM/);
  assert.match(typography, /auto_leading_amount/);
  assert.match(typography, /paragraph_alignment/);
  assert.match(typography, /without first inspecting the Illustrator UI, selecting objects, navigating menus, or discovering TextFrame UUIDs/);
  assert.doesNotMatch(typography, /results\.every/);
  assert.match(typography, /executeToolJsx\(readJsx, params\)/);
  assert.doesNotMatch(typography, /activate:\s*true/);
  assert.match(detail, /autoLeadingAmount/);
  assert.doesNotMatch(detail, /pa\.leading\s*=/);
  assert.doesNotMatch(detail, /pa\.autoLeading\s*=/);
  assert.match(align, /DO NOT USE FOR PARAGRAPH\/TEXT JUSTIFICATION/);
});

test("shared UUID identity prefers Illustrator native UUIDs and keeps verified legacy fallback", async () => {
  const helper = await source("src/illustrator/core/ie3jp/jsx/helpers/common.jsx");
  const duplicate = await source("src/illustrator/core/ie3jp/tools/modify/duplicate-objects.ts");
  const ensure = helper.slice(helper.indexOf("function ensureUUID"), helper.indexOf("// --- カラー変換"));
  const find = helper.slice(helper.indexOf("function findItemByUUID"), helper.indexOf("// --- レイヤー解決"));
  // Native PageItem.uuid comes before any legacy PageItem.note access.
  assert.ok(ensure.indexOf("_getNativeUUID(pageItem)") < ensure.indexOf("pageItem.note"));
  assert.match(ensure, /if \(nativeUUID\) return nativeUUID/);
  // The only generated fallback is read back from note; failure is explicit.
  assert.match(helper, /persisted === uuid/);
  assert.match(ensure, /Unable to establish a persistent UUID/);
  // Native Document lookup is verified; an older note UUID remains searchable.
  assert.match(find, /getPageItemFromUuid\(uuid\)/);
  assert.match(find, /_getNativeUUID\(nativeItem\) === uuid/);
  assert.match(find, /_uuidIndex\[uuid\] \|\| null/);
  // Duplicate uses the one shared helper instead of inventing an unpersisted ID.
  assert.match(duplicate, /ensureUUID\(dup, true\)/);
  assert.doesNotMatch(duplicate, /var newUuid = generateUUID/);
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
