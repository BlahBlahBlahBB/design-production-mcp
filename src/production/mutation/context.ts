import path from "node:path";
import type { Bounds, ObjectLocator } from "../../executor/read-schema.js";

export type MutationContextState = "READY" | "REFRESH_REQUIRED" | "QUARANTINED";

export type MutationAccess = "READ" | "SESSION_WRITE" | "DOCUMENT_WRITE";
export type MutationImpact = "NONE" | "CONTENT" | "STYLE" | "GEOMETRY" | "STRUCTURE" | "PERSISTENCE";

export interface MutationClassification {
  access: MutationAccess;
  impact: MutationImpact;
  destructive: boolean;
}

export interface WorkCopyIdentity {
  /** The caller-visible source path; never an Illustrator persistent document ID. */
  masterPath: string;
  /** The caller-visible authorized work-copy path. */
  workPath: string;
  masterCanonicalPath: string;
  workCanonicalPath: string;
  sessionNonce: string;
}

export interface ExpectedTargetState {
  typename?: string;
  name?: string | null;
  layerPath?: string;
  contents?: string;
  bounds?: Bounds;
  locked?: boolean;
  hidden?: boolean;
}

export type MutationErrorCode =
  | "NO_DOCUMENT"
  | "MASTER_WRITE_FORBIDDEN"
  | "WORK_COPY_REQUIRED"
  | "ACTIVE_DOCUMENT_MISMATCH"
  | "WORK_COPY_IDENTITY_INVALID"
  | "MASTER_FILE_NOT_FOUND"
  | "MASTER_NOT_SAVED"
  | "WORK_COPY_ALREADY_EXISTS"
  | "WORK_COPY_COPY_FAILED"
  | "WORK_COPY_COPY_VERIFICATION_FAILED"
  | "WORK_COPY_OPEN_FAILED"
  | "WORK_COPY_OPEN_TIMEOUT"
  | "WORK_COPY_IDENTITY_MISMATCH"
  | "SESSION_NOT_FOUND"
  | "INVALID_REQUEST"
  | "TARGET_NOT_FOUND"
  | "TARGET_AMBIGUOUS"
  | "TARGET_STALE"
  | "TARGET_NOT_EDITABLE"
  | "EXPECTED_STATE_MISMATCH"
  | "MUTATION_SCOPE_VIOLATION"
  | "DESTRUCTIVE_OPERATION_FORBIDDEN"
  | "POST_CONDITION_FAILED"
  | "MUTATION_OUTCOME_UNKNOWN"
  | "ILLUSTRATOR_UNSUPPORTED"
  | "ILLUSTRATOR_EXECUTION_FAILED";

export type MutationStage = "identity" | "preflight" | "resolution" | "expected-state" | "editability" | "mutation" | "post-condition" | "transport";

export interface MutationError {
  code: MutationErrorCode;
  stage: MutationStage;
  message: string;
  operation: string;
  partialMutationPossible: boolean;
  recovery: string;
  /** Plain transport diagnostic; never an Illustrator DOM value. */
  details?: { bridgeError: string };
}

export type MutationResult<T> =
  | { ok: true; value: T; contextState: MutationContextState }
  | { ok: false; error: MutationError; contextState: MutationContextState };

export interface StructuralTarget {
  locator: ObjectLocator;
  expected?: ExpectedTargetState;
}

/**
 * Host-side path identity policy. Deliberately preserves case: callers must
 * not treat a structural locator or a platform path as a permanent ID.
 */
export function canonicalizeDocumentPath(value: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error("path is required");
  // Do not lowercase: macOS can preserve case and Unicode distinctions in paths.
  return path.resolve(value).replaceAll("\\", "/");
}

export function mutationError(
  code: MutationErrorCode,
  stage: MutationStage,
  operation: string,
  message: string,
  partialMutationPossible = false,
  recovery = "Correct the reported state and create a new verified work-copy context before retrying.",
  details?: { bridgeError: string },
): MutationError {
  return { code, stage, operation, message, partialMutationPossible, recovery, details };
}

export function createWorkCopyIdentity(masterPath: string, workPath: string): MutationResult<WorkCopyIdentity> {
  try {
    const masterCanonicalPath = canonicalizeDocumentPath(masterPath);
    const workCanonicalPath = canonicalizeDocumentPath(workPath);
    if (masterCanonicalPath === workCanonicalPath) {
      return {
        ok: false,
        contextState: "QUARANTINED",
        error: mutationError("MASTER_WRITE_FORBIDDEN", "identity", "work-copy-identity", "MASTER and WORK COPY paths are identical."),
      };
    }
    return {
      ok: true,
      contextState: "READY",
      value: {
        masterPath,
        workPath,
        masterCanonicalPath,
        workCanonicalPath,
        sessionNonce: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      },
    };
  } catch (error) {
    return {
      ok: false,
      contextState: "QUARANTINED",
      error: mutationError("WORK_COPY_IDENTITY_INVALID", "identity", "work-copy-identity", error instanceof Error ? error.message : String(error)),
    };
  }
}

/** Session-local write authorization for one verified work copy. */
export class SafeMutationContext {
  private currentState: MutationContextState = "READY";

  constructor(readonly identity: WorkCopyIdentity) {}

  get state(): MutationContextState {
    return this.currentState;
  }

  prepare(operation: string, workPath: string, requiresFreshTargets = true): MutationError | null {
    if (this.currentState === "QUARANTINED") {
      return mutationError("MUTATION_OUTCOME_UNKNOWN", "identity", operation, "This work-copy context is quarantined after an unproven mutation outcome.", true);
    }
    if (this.currentState === "REFRESH_REQUIRED" && requiresFreshTargets) {
      return mutationError("MUTATION_SCOPE_VIOLATION", "identity", operation, "A structural mutation requires targets to be re-read before another write.");
    }
    try {
      const candidate = canonicalizeDocumentPath(workPath);
      if (candidate !== this.identity.workCanonicalPath || candidate === this.identity.masterCanonicalPath) {
        return mutationError("WORK_COPY_IDENTITY_INVALID", "identity", operation, "Requested write path is not this context's authorized work copy.");
      }
      return null;
    } catch (error) {
      return mutationError("WORK_COPY_IDENTITY_INVALID", "identity", operation, error instanceof Error ? error.message : String(error));
    }
  }

  markStructuralMutation(): void {
    if (this.currentState === "READY") this.currentState = "REFRESH_REQUIRED";
  }

  /**
   * Re-arm only after the managed session has completed a successful read of
   * this same verified work copy. A quarantined context is intentionally final.
   */
  refreshAfterVerifiedRead(workPath: string): MutationError | null {
    if (this.currentState === "QUARANTINED") {
      return mutationError("MUTATION_OUTCOME_UNKNOWN", "identity", "verified-read-refresh", "A quarantined work copy cannot be re-armed.", true);
    }
    const identityFailure = this.prepare("verified-read-refresh", workPath, false);
    if (identityFailure) return identityFailure;
    if (this.currentState === "REFRESH_REQUIRED") this.currentState = "READY";
    return null;
  }

  quarantine(): void {
    this.currentState = "QUARANTINED";
  }
}
