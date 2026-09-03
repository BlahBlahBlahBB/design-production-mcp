import type { IllustratorBridge, ScriptResult } from "../../executor/bridge.js";
import { assertOutputDoesNotOverwriteMaster } from "../qa/master-protection.js";
import {
  SafeMutationContext,
  createWorkCopyIdentity,
  mutationError,
  type MutationResult,
} from "../mutation/context.js";
import { executeTextCanary, type TextCanarySuccess } from "../mutation/text-canary.js";

/** Persistence can legitimately exceed the ordinary interactive transport deadline. */
export const DEFAULT_SAVE_WORK_COPY_TIMEOUT_MS = 300_000;

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

function workCopyGuard(workPath: string): string {
  return `
    if (app.documents.length === 0) throw new Error('NO_DOCUMENT');
    var d = app.activeDocument;
    var expectedWork = ${literal(workPath)};
    var actualWork = d.fullName.fsName.replace(/\\\\/g, '/');
    if (actualWork !== expectedWork) throw new Error('ACTIVE_DOCUMENT_IS_NOT_WORK_COPY');
  `;
}

export class IllustratorProductionSession {
  private mutationContext: SafeMutationContext | null = null;

  constructor(private readonly bridge: IllustratorBridge) {}

  get mutationContextState(): SafeMutationContext["state"] | null {
    return this.mutationContext?.state ?? null;
  }

  async saveWorkCopy(request: WorkCopyRequest): Promise<ScriptResult<{ path: string }>> {
    assertOutputDoesNotOverwriteMaster(request.masterPath, request.workPath);

    const result = await this.bridge.execute<{ path: string }>(`
      if (app.documents.length === 0) throw new Error('NO_DOCUMENT');
      var source = app.activeDocument;
      if (!source.saved) throw new Error('MASTER_MUST_BE_SAVED');
      var expectedMaster = ${literal(request.masterPath)};
      var actualMaster = source.fullName.fsName.replace(/\\\\/g, '/');
      if (actualMaster !== expectedMaster) throw new Error('ACTIVE_DOCUMENT_IS_NOT_EXPECTED_MASTER');
      var workFile = new File(${literal(request.workPath)});
      source.saveAs(workFile);
      return {path: source.fullName.fsName};
    `, DEFAULT_SAVE_WORK_COPY_TIMEOUT_MS);
    if (!result.ok || !result.value) return result;

    const intended = createWorkCopyIdentity(request.masterPath, request.workPath);
    const actual = createWorkCopyIdentity(request.masterPath, result.value.path);
    if (!intended.ok || !actual.ok || intended.value.workCanonicalPath !== actual.value.workCanonicalPath) {
      this.mutationContext = null;
      return { ok: false, error: "WORK_COPY_IDENTITY_INVALID: saveAs did not produce the requested work-copy path" };
    }
    this.mutationContext = new SafeMutationContext(intended.value);
    return result;
  }

  async replaceNamedText(
    workPath: string,
    objectName: string,
    value: string,
    expectedCurrentContents: string,
  ): Promise<MutationResult<TextCanarySuccess>> {
    return this.runTextCanary(workPath, {
      kind: "name",
      name: objectName,
      expected: { typename: "TextFrame", name: objectName, contents: expectedCurrentContents },
    }, value, "replace-named-text");
  }

  async replaceTextFrameByIndex(
    workPath: string,
    index: number,
    value: string,
    expectedCurrentContents: string,
  ): Promise<MutationResult<TextCanarySuccess>> {
    return this.runTextCanary(workPath, {
      kind: "index",
      index,
      expected: { typename: "TextFrame", contents: expectedCurrentContents },
    }, value, "replace-text-frame-by-index");
  }

  async exportOutputs(request: ExportRequest): Promise<ScriptResult<{ pdf?: string; png?: string }>> {
    assertOutputDoesNotOverwriteMaster(request.masterPath, request.workPath);
    if (request.pdfPath) assertOutputDoesNotOverwriteMaster(request.masterPath, request.pdfPath);
    if (request.pngPath) assertOutputDoesNotOverwriteMaster(request.masterPath, request.pngPath);

    return this.bridge.execute(`
      ${workCopyGuard(request.workPath)}
      d.save();
      var result = {};
      ${request.pngPath ? `
      var pngFile = new File(${literal(request.pngPath)});
      var pngOptions = new ExportOptionsPNG24();
      pngOptions.transparency = true;
      pngOptions.artBoardClipping = true;
      d.exportFile(pngFile, ExportType.PNG24, pngOptions);
      result.png = pngFile.fsName;
      ` : ""}
      ${request.pdfPath ? `
      // PDF saveAs changes the active document association, so it intentionally runs last.
      // The AI work copy has already been persisted above and remains on disk.
      var pdfFile = new File(${literal(request.pdfPath)});
      var pdfOptions = new PDFSaveOptions();
      d.saveAs(pdfFile, pdfOptions);
      result.pdf = pdfFile.fsName;
      ` : ""}
      return result;
    `, 60_000);
  }

  private async runTextCanary(
    workPath: string,
    target: Parameters<typeof executeTextCanary>[2]["targets"][number],
    value: string,
    operation: string,
  ): Promise<MutationResult<TextCanarySuccess>> {
    if (!this.mutationContext) {
      return {
        ok: false,
        contextState: "QUARANTINED",
        error: mutationError("WORK_COPY_REQUIRED", "identity", operation, "No verified work-copy identity exists for this session."),
      };
    }
    return executeTextCanary(this.bridge, this.mutationContext, {
      operation,
      workPath,
      nextContents: value,
      targets: [target],
    });
  }
}
