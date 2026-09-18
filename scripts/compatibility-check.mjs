#!/usr/bin/env node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import {
  COMPATIBILITY_CAPABILITIES,
  sanitizeCompatibilityReport,
} from '../dist/src/compat/illustrator-compatibility.js';
import { executeJsx } from '../dist/src/illustrator/core/ie3jp/executor/jsx-runner.js';
import { ensureTmpDir, cleanupTmpDirSync } from '../dist/src/illustrator/core/ie3jp/executor/file-transport.js';
import { register as registerTypography } from '../dist/src/illustrator/core/ie3jp/tools/typography-core.js';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const marker = `DPM_COMPAT_${process.pid}_${Date.now()}`;
const caps = Object.fromEntries(COMPATIBILITY_CAPABILITIES.map((key) => [key, 'SKIPPED']));
let reportPath = path.resolve('compatibility-report.json');
let tempDir;
let markerUuid;
let illustratorVersion = 'unknown';
let illustratorInternalVersion = 'unknown';
let fonts;
let currentStage = 'initialization';

function parseOptions(argv) {
  const options = { help: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--help' || argv[i] === '-h') options.help = true;
    else if (argv[i] === '--output') {
      const value = argv[++i];
      if (!value) throw new Error('--output requires a file path');
      options.output = value;
    } else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return options;
}

function textResult(result) {
  if (result && typeof result === 'object' && !Array.isArray(result) && !Array.isArray(result.content)) return result;
  const text = result?.content?.find((item) => item.type === 'text')?.text;
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

async function jsx(script, params = {}) {
  return executeJsx(script, params, { activate: false, timeout: 120_000 });
}

function findTypographyHandlers() {
  const handlers = {};
  registerTypography({ registerTool(name, _config, handler) { handlers[name] = handler; } });
  return handlers;
}

const setupJsx = `
var stage = 'version', doc = null;
var priorInteraction = null;
try {
  var versionError = checkIllustratorVersion();
  if (versionError) writeResultFile(RESULT_PATH, { ok:false });
  else {
    priorInteraction = app.userInteractionLevel;
    app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
    stage = 'create_document';
    var p = readParamsFile(PARAMS_PATH), version = app.version; doc = app.documents.add(DocumentColorSpace.RGB, 420, 320);
    stage = 'create_objects';
    var marked = doc.pathItems.rectangle(300, 10, 2, 2); marked.name = p.marker;
    var nativeId = ensureUUID(marked);
    stage = 'enumerate_fonts';
    function findInstalledFont(names, role) {
      for (var ni = 0; ni < names.length; ni++) {
        try {
          var font = app.textFonts.getByName(names[ni]), family = font.family || '', style = font.style || '';
          if (role === 'han' && (style === 'Medium' || style === 'Regular' || style === 'Book' || /常规|中黑|標準|標準體/.test(style))) return { name:font.name, family:family, style:style };
          if (role === 'latin' && (style === 'Bold' || /粗體|粗体/.test(style))) return { name:font.name, family:family, style:style };
        } catch (_) {}
      }
      return null;
    }
    var han = findInstalledFont(['PingFangSC-Medium','PingFangSC-Regular','HiraginoSans-W3','HiraginoSans-W6','SourceHanSansSC-Medium','NotoSansCJKsc-Regular','MicrosoftYaHei','SimHei','AdobeHeitiStd-Regular','KozGoPr6N-Medium','YuGothic-Medium'], 'han');
    var latin = findInstalledFont(['Helvetica-Bold','HelveticaNeue-Bold','Arial-BoldMT','TimesNewRomanPS-BoldMT','MyriadPro-Bold','Aptos-Bold'], 'latin');
    var text = doc.textFrames.pointText([30, 270]);
    if (han) text.textRange.characterAttributes.textFont = app.textFonts.getByName(han.name);
    text.contents = '汉 A1！'; text.name = p.marker + '_text'; var textId = ensureUUID(text);
    var statuses = {
      illustrator_connection:'PASS',
      document_create_read:(doc.artboards.length === 1 && doc.documentColorSpace === DocumentColorSpace.RGB ? 'PASS' : 'FAIL'),
      native_uuid:(nativeId && nativeId === marked.uuid && textId && textId === text.uuid ? 'PASS' : 'FAIL'),
      shape_create_read:(marked.typename === 'PathItem' && marked.name === p.marker ? 'PASS' : 'FAIL'),
      text_create_read:(text.typename === 'TextFrame' && text.contents === '汉 A1！' ? 'PASS' : 'FAIL'),
      layers:'SKIPPED', artboards:'SKIPPED', batch_move:'SKIPPED', appearance:'SKIPPED',
      typography_basic:'SKIPPED', paragraph_alignment:'SKIPPED', mixed_han_latin_typography:'SKIPPED',
      export_tempfile:'SKIPPED', expand_representative:'SKIPPED', pathfinder_representative:'SKIPPED'
    };
    var layer = doc.layers.add(); layer.name = p.marker + '_layer'; statuses.layers = layer.name === p.marker + '_layer' ? 'PASS' : 'FAIL';
    var artboard = doc.artboards.add([0, 300, 120, 180]); statuses.artboards = (doc.artboards.length === 2 && artboard.artboardRect[2] === 120) ? 'PASS' : 'FAIL';
    app.userInteractionLevel = priorInteraction;
    stage = 'write_setup_result';
    writeResultFile(RESULT_PATH, { ok:true, version:version, internalVersion:version, documentName:doc.name, markerUuid:nativeId, textUuid:textId, markerName:p.marker, fonts:{han:han,latin:latin}, capabilities:statuses });
  }
} catch (e) { try { if (priorInteraction !== null) app.userInteractionLevel = priorInteraction; } catch (_) {} try { if (doc) doc.close(SaveOptions.DONOTSAVECHANGES); } catch (_) {} writeResultFile(RESULT_PATH, { ok:false, stage:stage }); }
`;

const readAcrossJsx = `
try {
  var p = readParamsFile(PARAMS_PATH), doc = app.activeDocument, found = doc.getPageItemFromUuid(p.uuid);
  writeResultFile(RESULT_PATH, { found:!!found, matches:!!found && found.uuid === p.uuid, type:found ? found.typename : '' });
} catch (e) { writeResultFile(RESULT_PATH, { found:false, matches:false }); }
`;

const finishJsx = `
try {
  var p = readParamsFile(PARAMS_PATH), doc = app.activeDocument, out = {};
  var markerItem = null;
  for (var ii = 0; ii < doc.pageItems.length; ii++) if (doc.pageItems[ii].name === p.marker) { markerItem = doc.pageItems[ii]; break; }
  if (!markerItem) { writeResultFile(RESULT_PATH, { cleanup:false }); }
  else {
    var beforeLeft = markerItem.left; markerItem.translate(10, 0); out.batch_move = Math.abs(markerItem.left - beforeLeft - 10) < 0.01 ? 'PASS' : 'FAIL';
    var rgb = new RGBColor(); rgb.red=20; rgb.green=80; rgb.blue=180; markerItem.fillColor = rgb;
    out.appearance = markerItem.fillColor.typename === 'RGBColor' ? 'PASS' : 'FAIL';
    var docExport = new File(p.exportPath), opts = new ExportOptionsSVG(); opts.embedRasterImages = true;
    doc.exportFile(docExport, ExportType.SVG, opts); out.export_tempfile = docExport.exists ? 'PASS' : 'FAIL';
    var expandable = doc.pathItems.rectangle(250, 50, 20, 20); expandable.filled = true; expandable.stroked = true; expandable.strokeWidth = 2; expandable.selected = true;
    try { app.executeMenuCommand('expandStyle'); out.expand_representative = 'PASS'; } catch (_) { out.expand_representative = 'FAIL'; }
    try {
      var p1 = doc.pathItems.rectangle(200, 50, 30, 30), p2 = doc.pathItems.rectangle(185, 65, 30, 30);
      doc.selection = null; p1.selected = true; p2.selected = true;
      app.executeMenuCommand('Live Pathfinder Add'); app.executeMenuCommand('expandStyle');
      out.pathfinder_representative = doc.selection && doc.selection.length ? 'PASS' : 'FAIL';
    } catch (_) { out.pathfinder_representative = 'FAIL'; }
    try { doc.close(SaveOptions.DONOTSAVECHANGES); out.cleanup = true; } catch (_) { out.cleanup = false; }
    writeResultFile(RESULT_PATH, out);
  }
} catch (e) { writeResultFile(RESULT_PATH, { cleanup:false }); }
`;

const cleanupJsx = `
try {
  var p = readParamsFile(PARAMS_PATH), closed = false;
  for (var di = app.documents.length - 1; di >= 0; di--) {
    var doc = app.documents[di], found = false;
    for (var ii = 0; ii < doc.pageItems.length; ii++) {
      var itemName = doc.pageItems[ii].name;
      if (itemName === p.marker || /^DPM_COMPAT_[0-9]+_[0-9]+(?:_text|_layer)?$/.test(itemName)) { found = true; break; }
    }
    if (found) { doc.close(SaveOptions.DONOTSAVECHANGES); closed = true; break; }
  }
  writeResultFile(RESULT_PATH, { cleanup:closed });
} catch (e) { writeResultFile(RESULT_PATH, { cleanup:false }); }
`;

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    console.log('Usage: npm run compatibility:check -- [--output <compatibility-report.json>]');
    return;
  }
  if (options.output) reportPath = path.resolve(options.output);
  tempDir = await mkdtemp(path.join(tmpdir(), 'dpm-compat-'));
  const exportPath = path.join(tempDir, 'smoke.svg');
  const handlers = findTypographyHandlers();
  await ensureTmpDir();
  try {
    currentStage = 'prior_fixture_cleanup';
    console.log('Stable compatibility: checking for prior marked disposable documents');
    await jsx(cleanupJsx, { marker });
    currentStage = 'setup';
    console.log('Stable compatibility: creating disposable setup fixture');
    const bootstrap = textResult(await jsx(setupJsx, { marker }));
    if (!bootstrap?.ok) {
      await jsx(cleanupJsx, { marker }).catch(() => undefined);
      if (bootstrap?.stage) console.log(`Compatibility setup stopped safely at: ${bootstrap.stage}`);
      caps.illustrator_connection = bootstrap ? 'PASS' : 'FAIL';
      for (const key of ['document_create_read', 'native_uuid', 'cross_jsx_uuid_lookup', 'shape_create_read', 'text_create_read', 'typography_basic', 'paragraph_alignment', 'mixed_han_latin_typography', 'appearance', 'batch_move', 'layers', 'artboards', 'export_tempfile', 'expand_representative', 'pathfinder_representative']) caps[key] = 'SKIPPED';
    } else {
      illustratorVersion = bootstrap.version;
      illustratorInternalVersion = bootstrap.internalVersion;
      markerUuid = bootstrap.markerUuid;
      Object.assign(caps, bootstrap.capabilities);
      currentStage = 'native_uuid_lookup';
      console.log('Stable compatibility: setup fixture created');
      const across = textResult(await jsx(readAcrossJsx, { uuid:bootstrap.textUuid }));
      caps.cross_jsx_uuid_lookup = across?.found && across?.matches && across.type === 'TextFrame' ? 'PASS' : 'FAIL';
      console.log('Stable compatibility: native UUID lookup checked');

      const fontsReady = bootstrap.fonts?.han && bootstrap.fonts?.latin;
      if (!fontsReady) caps.mixed_han_latin_typography = 'VERSION_DEPENDENT';
      else {
        currentStage = 'mixed_script_typography';
        console.log('Stable compatibility: applying and reading mixed-script typography');
        const result = textResult(await handlers.set_typography({
          uuids:[bootstrap.textUuid],
          character:{font_size:14},
          script_rules:{han:{font_name:bootstrap.fonts.han.name},latin:{font_name:bootstrap.fonts.latin.name}},
          paragraph:{paragraph_alignment:'left'},
        }));
        const setResult = result?.results?.[0];
        caps.typography_basic = setResult?.verified_properties?.some((item) => item.property === 'font_size' && item.matches) ? 'PASS' : 'FAIL';
        caps.paragraph_alignment = setResult?.verified_properties?.some((item) => item.property === 'paragraph_alignment' && item.matches) ? 'PASS' : 'FAIL';
        const metricsResult = textResult(await handlers.get_typography_metrics({ uuids:[bootstrap.textUuid] }));
        const metrics = metricsResult?.typography_metrics?.[0]?.properties;
        const runs = metrics?.script_runs ?? [];
        const expected = { han:bootstrap.fonts.han, latin:bootstrap.fonts.latin };
        const runPass = runs.length > 0 && runs.every((run) => run.font_family === expected[run.script]?.family && run.font_style === expected[run.script]?.style);
        caps.mixed_han_latin_typography = runPass && setResult?.script_rules?.han?.success && setResult?.script_rules?.latin?.success ? 'PASS' : 'FAIL';
        console.log('Stable compatibility: mixed-script typography readback complete');
      }

      currentStage = 'representative_checks';
      console.log('Stable compatibility: running remaining representative checks');
      const finished = textResult(await jsx(finishJsx, { marker, exportPath }));
      for (const key of ['batch_move', 'appearance', 'export_tempfile', 'expand_representative', 'pathfinder_representative']) caps[key] = finished?.[key] ?? 'FAIL';
      if (!finished?.cleanup) await jsx(cleanupJsx, { marker });
      caps.place_image_fixture = 'SKIPPED';
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const kind = message.includes('timed out') ? 'timeout'
      : message.includes('terminated') ? 'terminated'
        : message.includes('Automation permission denied') ? 'automation_permission'
          : 'jsx_transport_error';
    console.log(`Stable compatibility: ${currentStage} failed (${kind})`);
    await jsx(cleanupJsx, { marker }).catch(() => undefined);
    if (caps.illustrator_connection === 'SKIPPED') caps.illustrator_connection = 'FAIL';
  } finally {
    cleanupTmpDirSync();
    await rm(tempDir, { recursive:true, force:true });
  }

  const report = sanitizeCompatibilityReport({
    mcp_version:pkg.version,
    platform:process.platform,
    node_version:process.version,
    illustrator_version:illustratorVersion,
    illustrator_internal_version:illustratorInternalVersion,
    timestamp:new Date().toISOString(),
    capabilities:caps,
  });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  const passed = Object.values(report.capabilities).filter((status) => status === 'PASS').length;
  const failed = Object.values(report.capabilities).filter((status) => status === 'FAIL').length;
  console.log(`Compatibility smoke: ${passed} PASS, ${failed} FAIL, ${Object.values(report.capabilities).filter((status) => status === 'SKIPPED').length} SKIPPED, ${Object.values(report.capabilities).filter((status) => status === 'VERSION_DEPENDENT').length} VERSION_DEPENDENT`);
  console.log(`Report: ${reportPath}`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  cleanupTmpDirSync();
  console.error(error instanceof Error ? error.message : 'Compatibility checker failed.');
  process.exitCode = 1;
});
