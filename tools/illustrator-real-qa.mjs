#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { LocalIllustratorBridge } from "../dist/src/executor/local-illustrator-bridge.js";
import { IllustratorProductionSession } from "../dist/src/production/session/illustrator-session.js";

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function hashFile(filePath) {
  return sha256(await readFile(filePath));
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function ask(rl, question, fallback = "") {
  const suffix = fallback ? ` [${fallback}]` : "";
  const answer = (await rl.question(`${question}${suffix}: `)).trim();
  return answer || fallback;
}

function requireOk(label, result, report) {
  report.steps.push({ label, ...result });
  if (!result.ok) {
    throw new Error(`${label} failed: ${result.error || "unknown error"}`);
  }
  return result.value;
}

async function main() {
  const report = {
    startedAt: new Date().toISOString(),
    platform: process.platform,
    node: process.version,
    steps: [],
    master: {},
    outputs: {},
    target: {},
    result: "INCOMPLETE",
  };

  if (process.platform !== "darwin") {
    throw new Error("This Phase 1 QA runner is currently intended for macOS real-machine validation.");
  }

  console.log("\nDesign Production MCP — Illustrator Real QA\n");
  console.log("This test never intentionally writes to the MASTER file. It saves a separate work copy first.\n");

  const bridge = new LocalIllustratorBridge();
  const status = await bridge.detect();
  report.steps.push({ label: "detect Illustrator", ok: status.installed && status.running, value: status });
  if (!status.installed || !status.running) {
    throw new Error("Illustrator could not be reached. Launch Illustrator and grant macOS Automation permission if prompted.");
  }
  console.log(`✓ Illustrator detected: ${status.version || "unknown version"}`);

  const summary = requireOk("read document summary", await bridge.getDocumentSummary(), report);
  console.log(`✓ Active document: ${summary.name}`);
  if (!summary.path) {
    throw new Error("The active document must already have a filesystem path before QA.");
  }
  if (!summary.saved) {
    throw new Error("The active MASTER has unsaved changes. Save it manually in Illustrator before QA.");
  }

  const textFrames = requireOk("list text frames", await bridge.listTextFrames(), report);
  console.log(`✓ Text frames readable: ${textFrames.length}`);
  if (textFrames.length === 0) {
    throw new Error("The active document has no text frames to use for the Phase 1 replacement test.");
  }

  const named = textFrames.filter((item) => item.name);
  const editable = textFrames.filter((item) => !item.locked && !item.hidden);
  if (editable.length === 0) {
    throw new Error("The active document has no unlocked, visible text frame available for QA.");
  }

  console.log("\nText targets found:");
  for (const item of textFrames.slice(0, 50)) {
    const label = item.name ? `name=${item.name}` : "unnamed";
    console.log(`  [${item.index}] ${label} -> ${String(item.contents).slice(0, 60)}${item.locked || item.hidden ? " (not editable)" : ""}`);
  }

  const rl = readline.createInterface({ input, output });
  try {
    const masterPath = path.resolve(await ask(rl, "MASTER path", summary.path));
    if (path.resolve(summary.path) !== masterPath) {
      throw new Error(`Active Illustrator document does not match MASTER path. Active: ${summary.path}`);
    }

    let targetMode;
    if (named.length > 0) {
      targetMode = (await ask(rl, "Target mode: name or index", "name")).toLowerCase();
      if (targetMode !== "name" && targetMode !== "index") throw new Error("Target mode must be 'name' or 'index'.");
    } else {
      targetMode = "index";
      console.log("No named text frames found; using guarded legacy index targeting.");
    }

    let objectName = null;
    let targetIndex = null;
    let expectedCurrentContents = null;

    if (targetMode === "name") {
      objectName = await ask(rl, "Named text object to change for QA", named[0].name);
      const selected = named.find((item) => item.name === objectName);
      if (!selected) throw new Error(`Named text object not found in the read-only snapshot: ${objectName}`);
      if (selected.locked || selected.hidden) throw new Error(`Selected named text object is not editable: ${objectName}`);
      report.target = { mode: "name", name: objectName, index: selected.index, originalContents: selected.contents };
    } else {
      const defaultIndex = String(editable[0].index);
      const rawIndex = await ask(rl, "Text frame index to change for QA", defaultIndex);
      targetIndex = Number(rawIndex);
      if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= textFrames.length) {
        throw new Error(`Invalid text frame index: ${rawIndex}`);
      }
      const selected = textFrames[targetIndex];
      if (selected.locked || selected.hidden) throw new Error(`Selected text frame index is not editable: ${targetIndex}`);
      expectedCurrentContents = selected.contents;
      report.target = { mode: "index", index: targetIndex, name: selected.name || "", originalContents: selected.contents };
    }

    const nextValue = await ask(rl, "Temporary QA text", "DPM_QA_TEST");
    const outputDir = path.resolve(await ask(rl, "QA output folder", path.join(path.dirname(masterPath), "DPM-QA-output")));
    await mkdir(outputDir, { recursive: true });

    const base = path.basename(masterPath, path.extname(masterPath));
    const stamp = nowStamp();
    const workPath = path.join(outputDir, `${base}__QA_WORK__${stamp}.ai`);
    const pdfPath = path.join(outputDir, `${base}__QA__${stamp}.pdf`);
    const pngPath = path.join(outputDir, `${base}__QA__${stamp}.png`);
    const reportPath = path.join(outputDir, `${base}__QA_REPORT__${stamp}.json`);

    const before = await hashFile(masterPath);
    report.master.path = masterPath;
    report.master.sha256Before = before;

    const session = new IllustratorProductionSession(bridge);
    const workCopy = requireOk("save work copy", await session.saveWorkCopy({ masterPath, workPath }), report);
    report.outputs.workCopy = workCopy.path;
    console.log(`✓ Work copy created: ${workPath}`);

    if (targetMode === "name") {
      requireOk("replace named text", await session.replaceNamedText(workPath, objectName, nextValue), report);
      console.log(`✓ Replaced test object '${objectName}' in work copy only`);
    } else {
      requireOk(
        "replace text by index",
        await session.replaceTextFrameByIndex(workPath, targetIndex, nextValue, expectedCurrentContents),
        report,
      );
      console.log(`✓ Replaced text frame index ${targetIndex} in work copy only`);
    }

    const exports = requireOk(
      "export PDF/PNG",
      await session.exportOutputs({ masterPath, workPath, pdfPath, pngPath }),
      report,
    );
    report.outputs = { ...report.outputs, ...exports, requestedPdf: pdfPath, requestedPng: pngPath };
    console.log("✓ PDF/PNG export command completed");

    const after = await hashFile(masterPath);
    report.master.sha256After = after;
    report.master.unchanged = before === after;
    if (before !== after) {
      report.result = "FAIL_MASTER_MUTATED";
      throw new Error("MASTER hash changed. Phase 1 must not pass.");
    }
    console.log("✓ MASTER SHA-256 unchanged");

    report.result = "PASS";
    report.finishedAt = new Date().toISOString();
    await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
    console.log(`\nPASS — report: ${reportPath}\n`);
  } catch (error) {
    report.result = report.result === "FAIL_MASTER_MUTATED" ? report.result : "FAIL";
    report.error = error instanceof Error ? error.message : String(error);
    report.finishedAt = new Date().toISOString();
    const fallback = path.join(process.cwd(), `illustrator-real-qa-failure-${nowStamp()}.json`);
    await writeFile(fallback, JSON.stringify(report, null, 2), "utf8");
    console.error(`\nFAIL — ${report.error}`);
    console.error(`Failure report: ${fallback}\n`);
    process.exitCode = 1;
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
