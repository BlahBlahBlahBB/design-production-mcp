/**
 * Direct current-document envelope for the fixed MIT donor implementations.
 * The caller never supplies JSX, an Action payload, or a menu command.
 */
export function directDonorJsx(operation: string, body: string): string {
  return `
var preflight = preflightChecks();
if (preflight) {
  writeResultFile(RESULT_PATH, preflight);
} else {
  try {
    var __dpmDonorDocument = app.activeDocument;
    function __dpmDonorFailure(code, stage, message, partialMutationPossible) {
      return { ok: false, error: { code: code, stage: stage, message: message, partialMutationPossible: partialMutationPossible } };
    }
    var outcome = (function () { ${body} })();
    if (!outcome || outcome.ok === false) {
      var donorError = outcome && outcome.error ? outcome.error : { message: "${operation} returned no result." };
      writeResultFile(RESULT_PATH, { error: true, message: donorError.message || "${operation} failed." });
    } else {
      writeResultFile(RESULT_PATH, outcome.value);
    }
  } catch (error) {
    writeResultFile(RESULT_PATH, { error: true, message: "${operation} failed: " + error.message, line: error.line });
  }
}
`;
}
