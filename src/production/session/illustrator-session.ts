import type { IllustratorBridge, ScriptResult } from "../../executor/bridge.js";
import { assertOutputDoesNotOverwriteMaster } from "../qa/master-protection.js";
import {
  SafeMutationContext,
  createWorkCopyIdentity,
  mutationError,
  type MutationResult,
} from "../mutation/context.js";
import { executeTextCanary, type TextCanarySuccess } from "../mutation/text-canary.js";
import {
  createEllipse,
  createLine,
  createRectangle,
  createTextFrame,
  setFillStroke,
  updateObject,
  type EllipseRequest,
  type FillStrokeRequest,
  type LineRequest,
  type ObjectUpdateRequest,
  type RectangleRequest,
  type TextFrameRequest,
  type SelectObjectsRequest,
  type DuplicateObjectsRequest,
  type GroupObjectsRequest,
  type UngroupObjectRequest,
  type AlignObjectsRequest,
  type DistributeObjectsRequest,
  selectObjects,
  clearSelection,
  duplicateObjects,
  groupObjects,
  ungroupObject,
  alignObjects,
  distributeObjects,
} from "../mutation/editing.js";
import type { ObjectSummary } from "../../executor/read-schema.js";
import type { ObjectLocator } from "../../executor/read-schema.js";
import {
  fitArtboardToSelection, placeImage, rearrangeArtboards, relinkImage, runExpand, runPathfinder,
  type ArtboardLayout, type ExpandOptions, type PathfinderMode, type PlaceImageRequest,
} from "../../illustrator/legacy/adapters/donor-capabilities.js";
import { executeBacklogOperation, type BacklogOperationRequest } from "../../illustrator/legacy/donor-backed/backlog-operations.js";

/** Persistence can legitimately exceed the ordinary interactive transport deadline. */
export const DEFAULT_SAVE_WORK_COPY_TIMEOUT_MS = 300_000;
/** Opening a file is a separate session operation, not a document mutation. */
export const DEFAULT_OPEN_DOCUMENT_TIMEOUT_MS = 120_000;

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

export interface OpenDocumentResult { name: string; path: string; saved: boolean; version: string; }
export interface OpenDocumentOptions { reconcileAfterTimeout?: boolean; }

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

  /** Opens an explicit file but deliberately does not authorize any write. */
  async openDocument(documentPath: string, options: OpenDocumentOptions = {}): Promise<ScriptResult<OpenDocumentResult>> {
    if (typeof documentPath !== "string" || documentPath.trim() === "") return { ok: false, error: "INVALID_REQUEST: documentPath is required" };
    const result = await this.bridge.execute<OpenDocumentResult>(`
      var expected = ${literal(documentPath)};
      for (var i = 0; i < app.documents.length; i++) {
        var openDocument = app.documents[i];
        var openPath = null;
        try { openPath = openDocument.fullName.fsName.replace(/\\\\/g, '/'); } catch (e1) {}
        if (openPath === expected) {
          try { openDocument.activate(); } catch (e2) {}
          return { name: openDocument.name, path: openDocument.fullName.fsName, saved: openDocument.saved, version: app.version };
        }
      }
      var file = new File(${literal(documentPath)});
      if (!file.exists) throw new Error('DOCUMENT_NOT_FOUND');
      app.open(file);
      // Older Illustrator builds can return a transient Document wrapper from
      // app.open(). Re-read the active document before identity verification.
      var d = app.activeDocument;
      var actual = null;
      try { actual = d.fullName.fsName; } catch (e) {}
      if (actual === null) throw new Error('OPENED_DOCUMENT_NOT_PATH_BACKED');
      return { name: d.name, path: actual, saved: d.saved, version: app.version };
    `, DEFAULT_OPEN_DOCUMENT_TIMEOUT_MS);
    if (result.ok || !result.error?.includes("ILLUSTRATOR_TIMEOUT") || options.reconcileAfterTimeout === false) return result;

    // Do not retry an open. A single read-only reconciliation may establish
    // that Illustrator already completed it and selected the exact file.
    const reconciled = await this.bridge.execute<OpenDocumentResult>(`
      if (app.documents.length === 0) throw new Error('NO_DOCUMENT');
      var d = app.activeDocument;
      var p = null;
      try { p = d.fullName.fsName; } catch (e) {}
      return { name: d.name, path: p, saved: d.saved, version: app.version };
    `, 30_000);
    if (!reconciled.ok || !reconciled.value || !reconciled.value.path) return result;
    const expected = documentPath.replace(/\\/g, "/");
    const actual = reconciled.value.path.replace(/\\/g, "/");
    return actual === expected && reconciled.value.saved ? reconciled : result;
  }

  /** Read the active document only; it never opens, activates, or mutates a document. */
  async readActiveDocumentIdentity(): Promise<ScriptResult<OpenDocumentResult>> {
    return this.bridge.execute<OpenDocumentResult>(`
      if (app.documents.length === 0) throw new Error('NO_DOCUMENT');
      var d = app.activeDocument;
      var p = null;
      try { p = d.fullName.fsName; } catch (e) {}
      if (p === null) throw new Error('ACTIVE_DOCUMENT_NOT_PATH_BACKED');
      return { name: d.name, path: p, saved: d.saved, version: app.version };
    `, 30_000);
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

  /**
   * Internal managed-session authorization after host-side verified copying
   * and an Illustrator read-only open/identity proof. This method does not
   * issue a document write and is deliberately not exposed as an MCP tool.
   */
  authorizeVerifiedFilesystemWorkCopy(
    masterPath: string,
    workPath: string,
    opened: OpenDocumentResult,
  ): MutationResult<{ workPath: string }> {
    const intended = createWorkCopyIdentity(masterPath, workPath);
    if (!intended.ok) return intended;
    const actual = createWorkCopyIdentity(masterPath, opened.path);
    if (!opened.saved || !actual.ok || actual.value.workCanonicalPath !== intended.value.workCanonicalPath) {
      this.mutationContext = null;
      return {
        ok: false,
        contextState: "QUARANTINED",
        error: mutationError("WORK_COPY_IDENTITY_MISMATCH", "identity", "authorize-filesystem-work-copy", "Illustrator did not make the copied, saved WORK COPY active."),
      };
    }
    this.mutationContext = new SafeMutationContext(intended.value);
    return { ok: true, value: { workPath: opened.path }, contextState: this.mutationContext.state };
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

  async saveDocument(workPath: string): Promise<MutationResult<{ path: string; saved: boolean }>> {
    if (!this.mutationContext) return this.workCopyRequired("save-document");
    const preflight = this.mutationContext.prepare("save-document", workPath, false);
    if (preflight) return { ok: false, error: preflight, contextState: this.mutationContext.state };
    const result = await this.bridge.execute<{ path: string; saved: boolean }>(`
      ${workCopyGuard(workPath)}
      d.save();
      var actual = d.fullName.fsName.replace(/\\\\/g, '/');
      if (actual !== ${literal(workPath)} || !d.saved) throw new Error('SAVE_POST_CONDITION_FAILED');
      return { path: d.fullName.fsName, saved: d.saved };
    `, DEFAULT_SAVE_WORK_COPY_TIMEOUT_MS);
    if (!result.ok || !result.value) {
      this.mutationContext.quarantine();
      return { ok: false, contextState: this.mutationContext.state, error: mutationError("MUTATION_OUTCOME_UNKNOWN", "transport", "save-document", result.error ?? "ILLUSTRATOR_EXECUTION_FAILED", true, "Do not retry automatically; create a new verified work-copy session.", result.error ? { bridgeError: result.error } : undefined) };
    }
    return { ok: true, value: result.value, contextState: this.mutationContext.state };
  }

  async createRectangle(workPath: string, request: RectangleRequest): Promise<MutationResult<ObjectSummary>> { return this.withContext("create-rectangle", (context) => createRectangle(this.bridge, context, workPath, request)); }
  async createEllipse(workPath: string, request: EllipseRequest): Promise<MutationResult<ObjectSummary>> { return this.withContext("create-ellipse", (context) => createEllipse(this.bridge, context, workPath, request)); }
  async createLine(workPath: string, request: LineRequest): Promise<MutationResult<ObjectSummary>> { return this.withContext("create-line", (context) => createLine(this.bridge, context, workPath, request)); }
  async createTextFrame(workPath: string, request: TextFrameRequest): Promise<MutationResult<ObjectSummary>> { return this.withContext("create-text-frame", (context) => createTextFrame(this.bridge, context, workPath, request)); }
  async updateObject(workPath: string, request: ObjectUpdateRequest): Promise<MutationResult<ObjectSummary>> { return this.withContext("update-object", (context) => updateObject(this.bridge, context, workPath, request)); }
  async setFillStroke(workPath: string, request: FillStrokeRequest): Promise<MutationResult<ObjectSummary>> { return this.withContext("set-fill-stroke", (context) => setFillStroke(this.bridge, context, workPath, request)); }
  async selectObjects(workPath: string, request: SelectObjectsRequest) { return this.withContext("select-objects", (context) => selectObjects(this.bridge, context, workPath, request)); }
  async clearSelection(workPath: string) { return this.withContext("clear-selection", (context) => clearSelection(this.bridge, context, workPath)); }
  async duplicateObjects(workPath: string, request: DuplicateObjectsRequest) { return this.withContext("duplicate-objects", (context) => duplicateObjects(this.bridge, context, workPath, request)); }
  async groupObjects(workPath: string, request: GroupObjectsRequest) { return this.withContext("group-objects", (context) => groupObjects(this.bridge, context, workPath, request)); }
  async ungroupObject(workPath: string, request: UngroupObjectRequest) { return this.withContext("ungroup-object", (context) => ungroupObject(this.bridge, context, workPath, request)); }
  async alignObjects(workPath: string, request: AlignObjectsRequest) { return this.withContext("align-objects", (context) => alignObjects(this.bridge, context, workPath, request)); }
  async distributeObjects(workPath: string, request: DistributeObjectsRequest) { return this.withContext("distribute-objects", (context) => distributeObjects(this.bridge, context, workPath, request)); }
  async pathfinderObjects(workPath: string, locators: ObjectLocator[], mode: PathfinderMode) { return this.selectThen(workPath, locators, "pathfinder-objects", () => this.withContext("pathfinder-objects", (context) => runPathfinder(this.bridge, context, workPath, mode))); }
  async expandObjects(workPath: string, locators: ObjectLocator[], options: ExpandOptions) { return this.selectThen(workPath, locators, "expand-objects", () => this.withContext("expand-objects", (context) => runExpand(this.bridge, context, workPath, options))); }
  async relinkImage(workPath: string, locator: ObjectLocator, newPath: string) { return this.selectThen(workPath, [locator], "relink-image", () => this.withContext("relink-image", (context) => relinkImage(this.bridge, context, workPath, newPath))); }
  async fitArtboardToObjects(workPath: string, locators: ObjectLocator[]) { return this.selectThen(workPath, locators, "fit-artboard-to-objects", () => this.withContext("fit-artboard-to-objects", (context) => fitArtboardToSelection(this.bridge, context, workPath))); }
  async placeImage(workPath: string, request: PlaceImageRequest) { return this.withContext("place-image", (context) => placeImage(this.bridge, context, workPath, request)); }
  async rearrangeArtboards(workPath: string, layout: ArtboardLayout, rowsOrColumns: number, spacing: number) { return this.withContext("rearrange-artboards", (context) => rearrangeArtboards(this.bridge, context, workPath, layout, rowsOrColumns, spacing)); }
  /** Closed internal Phase 2 donor-operation surface; never accepts raw JSX. */
  async runBacklogOperation(workPath: string, request: BacklogOperationRequest) {
    return this.withContext(`donor-${request.operation}`, (context) => executeBacklogOperation(this.bridge, context, workPath, request));
  }

  /** Called only by the managed registry after a successful read result. */
  async refreshAfterVerifiedRead(workPath: string): Promise<MutationResult<{ refreshed: true }>> {
    if (!this.mutationContext) return this.workCopyRequired("verified-read-refresh");
    const active = await this.bridge.execute<{ path: string }>(`
      if (app.documents.length === 0) throw new Error('NO_DOCUMENT');
      return { path: app.activeDocument.fullName.fsName };
    `, 30_000);
    if (!active.ok || !active.value) return { ok: false, contextState: this.mutationContext.state, error: mutationError("ACTIVE_DOCUMENT_MISMATCH", "identity", "verified-read-refresh", active.error ?? "Could not verify active document.") };
    const result = this.mutationContext.refreshAfterVerifiedRead(active.value.path);
    return result ? { ok: false, error: result, contextState: this.mutationContext.state } : { ok: true, value: { refreshed: true }, contextState: this.mutationContext.state };
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
    if (!this.mutationContext) return this.workCopyRequired(operation);
    return executeTextCanary(this.bridge, this.mutationContext, {
      operation,
      workPath,
      nextContents: value,
      targets: [target],
    });
  }

  private workCopyRequired<T>(operation: string): MutationResult<T> {
    return { ok: false, contextState: "QUARANTINED", error: mutationError("WORK_COPY_REQUIRED", "identity", operation, "No verified work-copy identity exists for this session.") };
  }

  private async selectThen<T>(workPath: string, locators: ObjectLocator[], operation: string, run: () => Promise<MutationResult<T>>): Promise<MutationResult<T>> {
    if (!Array.isArray(locators) || locators.length === 0) return this.workCopyRequired(operation);
    const selected = await this.selectObjects(workPath, { locators, replaceSelection: true });
    if (!selected.ok) return { ok: false, error: selected.error, contextState: selected.contextState };
    return run();
  }

  private async withContext<T>(operation: string, run: (context: SafeMutationContext) => Promise<MutationResult<T>>): Promise<MutationResult<T>> {
    if (!this.mutationContext) return this.workCopyRequired(operation);
    return run(this.mutationContext);
  }
}
