import { randomUUID } from "node:crypto";
import type { IllustratorReadBridge, ScriptResult } from "../../executor/bridge.js";
import type { FindObjectsCriteria, FindObjectsOptions, FindObjectsResult, ObjectSummary } from "../../executor/read-schema.js";
import type { MutationResult } from "../mutation/context.js";
import { canonicalizeDocumentPath, mutationError, type MutationErrorCode } from "../mutation/context.js";
import type { EllipseRequest, FillStrokeRequest, LineRequest, ObjectUpdateRequest, RectangleRequest, TextFrameRequest } from "../mutation/editing.js";
import { IllustratorProductionSession, type OpenDocumentResult } from "./illustrator-session.js";
import { createVerifiedFilesystemWorkCopy, reverifyFilesystemWorkCopy, type VerifiedFilesystemCopyResult, type WorkCopyVerification } from "./work-copy-filesystem.js";

interface ManagedSession { id: string; masterPath: string; workPath: string; production: IllustratorProductionSession; }
type PendingAttemptState = "OPEN_PENDING" | "AUTHORIZED" | "FAILED";
interface PendingWorkCopyAttempt {
  attemptId: string;
  masterPath: string;
  workPath: string;
  verification: WorkCopyVerification;
  createdAt: string;
  state: PendingAttemptState;
}
interface AuthorizedWorkCopy { sessionId: string; masterPath: string; workPath: string; verification: WorkCopyVerification; }
interface PendingWorkCopy {
  code: "WORK_COPY_OPEN_PENDING";
  attemptId: string;
  masterPath: string;
  workPath: string;
  verification: WorkCopyVerification;
  recovery: string;
}
type WorkCopyCreationResult = MutationResult<AuthorizedWorkCopy> | { ok: false; contextState: "QUARANTINED"; error: ReturnType<ManagedSessionRegistry["error"]>; value: PendingWorkCopy };

/** Process-local session authorization. IDs cannot be reconstructed into a write grant. */
export class ManagedSessionRegistry {
  private readonly sessions = new Map<string, ManagedSession>();
  private readonly pendingAttempts = new Map<string, PendingWorkCopyAttempt>();

  constructor(
    private readonly bridge: IllustratorReadBridge,
    private readonly copyWork: (masterPath: string, workPath: string) => Promise<VerifiedFilesystemCopyResult> = createVerifiedFilesystemWorkCopy,
  ) {}

  status() { return this.bridge.detect(); }
  openDocument(path: string): Promise<ScriptResult<OpenDocumentResult>> { return new IllustratorProductionSession(this.bridge).openDocument(path); }

  async createWorkCopy(masterPath: string, workPath: string): Promise<WorkCopyCreationResult> {
    const production = new IllustratorProductionSession(this.bridge);
    try {
      // Validate the actual persisted source before copying. `saved` is the
      // only applicable Illustrator signal here; `modified` is unreliable on
      // legacy builds and is intentionally not used as a proxy.
      const master = await production.openDocument(masterPath);
      if (!master.ok || !master.value) return { ok: false, contextState: "QUARANTINED", error: this.error("create-work-copy", master.error ?? "WORK_COPY_OPEN_FAILED", master.error?.includes("ILLUSTRATOR_TIMEOUT") ? "WORK_COPY_OPEN_TIMEOUT" : "WORK_COPY_OPEN_FAILED") };
      if (!master.value.saved) return { ok: false, contextState: "QUARANTINED", error: this.error("create-work-copy", "MASTER must be saved before a filesystem work-copy can be created.", "MASTER_NOT_SAVED") };
      if (canonicalizeDocumentPath(master.value.path) !== canonicalizeDocumentPath(masterPath)) {
        return { ok: false, contextState: "QUARANTINED", error: this.error("create-work-copy", "Opened MASTER path does not match the requested source path.", "WORK_COPY_IDENTITY_MISMATCH") };
      }

      const copied = await this.copyWork(masterPath, workPath);
      if (!copied.ok) return { ok: false, contextState: "QUARANTINED", error: this.error("create-work-copy", copied.error.message, copied.error.code) };

      // A delayed app.open may still complete after the transport deadline. Do
      // not spend another 30 seconds synchronously probing it here: preserve a
      // server-owned, hash-verified attempt for explicit read-only recovery.
      const opened = await production.openDocument(workPath, { reconcileAfterTimeout: false });
      if (!opened.ok || !opened.value) {
        if (opened.error?.includes("ILLUSTRATOR_TIMEOUT")) return this.createPendingAttempt(masterPath, workPath, copied.value);
        return { ok: false, contextState: "QUARANTINED", error: this.error("create-work-copy", opened.error ?? "WORK_COPY_OPEN_FAILED", "WORK_COPY_OPEN_FAILED") };
      }
      const authorized = production.authorizeVerifiedFilesystemWorkCopy(masterPath, workPath, opened.value);
      if (!authorized.ok) return { ok: false, contextState: authorized.contextState, error: authorized.error };
      const sessionId = randomUUID();
      this.sessions.set(sessionId, { id: sessionId, masterPath, workPath, production });
      return { ok: true, value: { sessionId, masterPath, workPath: authorized.value.workPath, verification: copied.value }, contextState: production.mutationContextState ?? "QUARANTINED" };
    } catch (error) {
      return { ok: false, contextState: "QUARANTINED", error: this.error("create-work-copy", error instanceof Error ? error.message : String(error)) };
    }
  }

  /** Finalize a server-owned delayed-open attempt using read-only verification only. */
  async reconcileWorkCopy(attemptId: string): Promise<MutationResult<AuthorizedWorkCopy>> {
    const attempt = this.pendingAttempts.get(attemptId);
    if (!attempt) return { ok: false, contextState: "QUARANTINED", error: this.error("reconcile-work-copy", "Unknown, expired, or restarted pending work-copy attempt.", "WORK_COPY_PENDING_ATTEMPT_NOT_FOUND") };
    if (attempt.state === "AUTHORIZED") return { ok: false, contextState: "QUARANTINED", error: this.error("reconcile-work-copy", "This pending attempt was already authorized and cannot issue another session.", "WORK_COPY_PENDING_ALREADY_AUTHORIZED") };
    if (attempt.state === "FAILED") return { ok: false, contextState: "QUARANTINED", error: this.error("reconcile-work-copy", "This pending attempt was invalidated and cannot be recovered.", "WORK_COPY_PENDING_INVALIDATED") };

    const files = await reverifyFilesystemWorkCopy(attempt.verification);
    if (!files.ok) {
      attempt.state = "FAILED";
      return { ok: false, contextState: "QUARANTINED", error: this.error("reconcile-work-copy", files.error.message, "WORK_COPY_PENDING_INVALIDATED") };
    }

    const production = new IllustratorProductionSession(this.bridge);
    const active = await production.readActiveDocumentIdentity();
    if (!active.ok || !active.value) {
      if (active.error?.includes("ILLUSTRATOR_TIMEOUT")) {
        return { ok: false, contextState: "QUARANTINED", error: this.error("reconcile-work-copy", active.error, "WORK_COPY_OPEN_STILL_PENDING") };
      }
      return { ok: false, contextState: "QUARANTINED", error: this.error("reconcile-work-copy", active.error ?? "Illustrator did not provide an active, path-backed document.", "WORK_COPY_IDENTITY_MISMATCH") };
    }
    const authorized = production.authorizeVerifiedFilesystemWorkCopy(attempt.masterPath, attempt.workPath, active.value);
    if (!authorized.ok) return { ok: false, contextState: authorized.contextState, error: authorized.error };
    const sessionId = randomUUID();
    this.sessions.set(sessionId, { id: sessionId, masterPath: attempt.masterPath, workPath: attempt.workPath, production });
    attempt.state = "AUTHORIZED";
    return { ok: true, value: { sessionId, masterPath: attempt.masterPath, workPath: authorized.value.workPath, verification: attempt.verification }, contextState: production.mutationContextState ?? "QUARANTINED" };
  }

  async findObjects(criteria: FindObjectsCriteria, options?: FindObjectsOptions, sessionId?: string): Promise<ScriptResult<FindObjectsResult>> {
    const result = await this.bridge.findObjects(criteria, options);
    if (!sessionId || !result.ok || !result.value) return result;
    const record = this.sessions.get(sessionId);
    if (!record) return { ok: false, error: "SESSION_NOT_FOUND" };
    const refreshed = await record.production.refreshAfterVerifiedRead(record.workPath);
    if (!refreshed.ok) return { ok: false, error: `${refreshed.error.code}: ${refreshed.error.message}` };
    return result;
  }

  getDocumentInfo() { return this.bridge.getDocumentInfo(); }
  saveDocument(sessionId: string) { return this.withSession(sessionId, "save-document", (r) => r.production.saveDocument(r.workPath)); }
  createRectangle(sessionId: string, request: RectangleRequest) { return this.withSession(sessionId, "create-rectangle", (r) => r.production.createRectangle(r.workPath, request)); }
  createEllipse(sessionId: string, request: EllipseRequest) { return this.withSession(sessionId, "create-ellipse", (r) => r.production.createEllipse(r.workPath, request)); }
  createLine(sessionId: string, request: LineRequest) { return this.withSession(sessionId, "create-line", (r) => r.production.createLine(r.workPath, request)); }
  createTextFrame(sessionId: string, request: TextFrameRequest) { return this.withSession(sessionId, "create-text-frame", (r) => r.production.createTextFrame(r.workPath, request)); }
  updateObject(sessionId: string, request: ObjectUpdateRequest) { return this.withSession(sessionId, "update-object", (r) => r.production.updateObject(r.workPath, request)); }
  setFillStroke(sessionId: string, request: FillStrokeRequest) { return this.withSession(sessionId, "set-fill-stroke", (r) => r.production.setFillStroke(r.workPath, request)); }

  private async withSession<T>(sessionId: string, operation: string, action: (record: ManagedSession) => Promise<MutationResult<T>>): Promise<MutationResult<T>> {
    const record = this.sessions.get(sessionId);
    return record ? action(record) : { ok: false, contextState: "QUARANTINED", error: this.error(operation, "Unknown or expired managed session.", "SESSION_NOT_FOUND") };
  }

  private createPendingAttempt(masterPath: string, workPath: string, verification: WorkCopyVerification): WorkCopyCreationResult {
    const attemptId = randomUUID();
    this.pendingAttempts.set(attemptId, { attemptId, masterPath, workPath, verification, createdAt: new Date().toISOString(), state: "OPEN_PENDING" });
    const value: PendingWorkCopy = {
      code: "WORK_COPY_OPEN_PENDING",
      attemptId,
      masterPath,
      workPath,
      verification,
      recovery: "Call reconcile_work_copy with attemptId after Illustrator finishes opening the copied document.",
    };
    return { ok: false, contextState: "QUARANTINED", error: this.error("create-work-copy", "Illustrator open exceeded the transport deadline; no session was authorized.", "WORK_COPY_OPEN_PENDING"), value };
  }

  private error(operation: string, message: string, code: MutationErrorCode = "ILLUSTRATOR_EXECUTION_FAILED") {
    return mutationError(code, "identity", operation, message, false, "Open the MASTER and create a new verified work-copy session.");
  }
}

export type ManagedObjectResult = MutationResult<ObjectSummary>;
