import type { IllustratorBridge, ScriptResult } from "../../executor/bridge.js";
import { assertOutputDoesNotOverwriteMaster } from "../qa/master-protection.js";

export interface WorkCopyRequest {
  masterPath: string;
  workPath: string;
}

export interface ExportRequest {
  masterPath: string;
  workPath: string;
  pdfPath?: string;
  pngPath?: string;
}

function literal(value: string): string {
  return JSON.stringify(value.replaceAll("\\", "/"));
}

export class IllustratorProductionSession {
  constructor(private readonly bridge: IllustratorBridge) {}

  async saveWorkCopy(request: WorkCopyRequest): Promise<ScriptResult<{ path: string }>> {
    assertOutputDoesNotOverwriteMaster(request.masterPath, request.workPath);

    return this.bridge.execute(`
      if (app.documents.length === 0) throw new Error('NO_DOCUMENT');
      var source = app.activeDocument;
      if (!source.saved) throw new Error('MASTER_MUST_BE_SAVED');
      var expectedMaster = ${literal(request.masterPath)};
      var actualMaster = source.fullName.fsName.replace(/\\\\/g, '/');
      if (actualMaster !== expectedMaster) throw new Error('ACTIVE_DOCUMENT_IS_NOT_EXPECTED_MASTER');
      var workFile = new File(${literal(request.workPath)});
      source.saveAs(workFile);
      return {path: source.fullName.fsName};
    `);
  }

  async replaceNamedText(objectName: string, value: string): Promise<ScriptResult<{ replaced: number }>> {
    return this.bridge.execute(`
      if (app.documents.length === 0) throw new Error('NO_DOCUMENT');
      var d = app.activeDocument;
      var targetName = ${JSON.stringify(objectName)};
      var nextValue = ${JSON.stringify(value)};
      var replaced = 0;
      for (var i = 0; i < d.textFrames.length; i++) {
        var t = d.textFrames[i];
        if (t.name === targetName) {
          if (t.locked || t.hidden) throw new Error('TARGET_TEXT_NOT_EDITABLE:' + targetName);
          t.contents = nextValue;
          replaced++;
        }
      }
      if (replaced === 0) throw new Error('TARGET_TEXT_NOT_FOUND:' + targetName);
      return {replaced: replaced};
    `);
  }

  async exportOutputs(request: ExportRequest): Promise<ScriptResult<{ pdf?: string; png?: string }>> {
    assertOutputDoesNotOverwriteMaster(request.masterPath, request.workPath);
    if (request.pdfPath) assertOutputDoesNotOverwriteMaster(request.masterPath, request.pdfPath);
    if (request.pngPath) assertOutputDoesNotOverwriteMaster(request.masterPath, request.pngPath);

    return this.bridge.execute(`
      if (app.documents.length === 0) throw new Error('NO_DOCUMENT');
      var d = app.activeDocument;
      if (!d.saved) throw new Error('WORK_COPY_MUST_BE_SAVED');
      var expectedWork = ${literal(request.workPath)};
      var actualWork = d.fullName.fsName.replace(/\\\\/g, '/');
      if (actualWork !== expectedWork) throw new Error('ACTIVE_DOCUMENT_IS_NOT_WORK_COPY');
      var result = {};
      ${request.pdfPath ? `
      var pdfFile = new File(${literal(request.pdfPath)});
      var pdfOptions = new PDFSaveOptions();
      d.saveAs(pdfFile, pdfOptions);
      result.pdf = pdfFile.fsName;
      ` : ""}
      ${request.pngPath ? `
      var pngFile = new File(${literal(request.pngPath)});
      var pngOptions = new ExportOptionsPNG24();
      pngOptions.transparency = true;
      pngOptions.artBoardClipping = true;
      d.exportFile(pngFile, ExportType.PNG24, pngOptions);
      result.png = pngFile.fsName;
      ` : ""}
      return result;
    `, 60_000);
  }
}
