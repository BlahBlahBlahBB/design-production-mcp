import type { IllustratorBridge } from "../../../executor/bridge.js";
import {
  type MutationClassification,
  type MutationResult,
  SafeMutationContext,
  mutationError,
} from "../../../production/mutation/context.js";

/**
 * The only entry point for imported Illustrator-side mutations.  Donor JSX is
 * intentionally not allowed to address a document by itself: this adapter
 * proves the active file is DPM's already-authorized work copy first.
 */
export interface DonorOperationRequest {
  operation: string;
  workPath: string;
  jsx: string;
  classification: MutationClassification;
}

interface DonorJsxFailure {
  ok: false;
  error: { code?: string; stage?: string; message?: string; partialMutationPossible?: boolean };
}
interface DonorJsxSuccess<T> { ok: true; value: T; }
type DonorJsxResult<T> = DonorJsxFailure | DonorJsxSuccess<T>;

function literal(value: string): string {
  return JSON.stringify(value.replaceAll("\\", "/"));
}

function safeEnvelope(request: DonorOperationRequest): string {
  return `
    function __dpmDonorFailure(code, stage, message, partialMutationPossible) {
      return { ok: false, error: { code: code, stage: stage, message: message, partialMutationPossible: partialMutationPossible } };
    }
    if (app.documents.length === 0) return __dpmDonorFailure('NO_DOCUMENT', 'preflight', 'No active Illustrator document.', false);
    var __dpmDonorDocument = app.activeDocument;
    var __dpmDonorPath = null;
    try { __dpmDonorPath = __dpmDonorDocument.fullName.fsName.replace(/\\\\/g, '/'); } catch (e) {}
    if (__dpmDonorPath === null || __dpmDonorPath !== ${literal(request.workPath)}) {
      return __dpmDonorFailure('ACTIVE_DOCUMENT_MISMATCH', 'preflight', 'Active document is not the authorized work copy.', false);
    }
    ${request.jsx}
  `;
}

/** Execute imported JSX under DPM's work-copy and quarantine policy. */
export async function executeSafeDonorOperation<T>(
  bridge: IllustratorBridge,
  context: SafeMutationContext,
  request: DonorOperationRequest,
): Promise<MutationResult<T>> {
  const preflight = context.prepare(request.operation, request.workPath);
  if (preflight) return { ok: false, error: preflight, contextState: context.state };

  const transport = await bridge.execute<DonorJsxResult<T>>(safeEnvelope(request), 30_000);
  if (!transport.ok || !transport.value) {
    context.quarantine();
    const bridgeError = transport.error ?? "Imported donor operation returned no result.";
    return {
      ok: false,
      contextState: context.state,
      error: mutationError(
        bridgeError.includes("ILLUSTRATOR_TIMEOUT") ? "MUTATION_OUTCOME_UNKNOWN" : "ILLUSTRATOR_EXECUTION_FAILED",
        "transport",
        request.operation,
        bridgeError,
        true,
        "Do not retry automatically. Create a new verified work-copy session.",
        { bridgeError },
      ),
    };
  }
  if (!transport.value.ok) {
    const error = transport.value.error;
    const partial = error.partialMutationPossible === true;
    if (partial) context.quarantine();
    return {
      ok: false,
      contextState: context.state,
      error: mutationError(
        error.code === "NO_DOCUMENT" || error.code === "ACTIVE_DOCUMENT_MISMATCH" ? error.code : "ILLUSTRATOR_EXECUTION_FAILED",
        error.stage === "preflight" ? "preflight" : "mutation",
        request.operation,
        error.message ?? "Imported donor operation failed.",
        partial,
      ),
    };
  }
  if (request.classification.impact === "STRUCTURE") context.markStructuralMutation();
  return { ok: true, value: transport.value.value, contextState: context.state };
}
