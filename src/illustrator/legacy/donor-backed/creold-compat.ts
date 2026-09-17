/**
 * MIT-derived from Creold/illustrator-scripts, revision
 * 9b3e3eeade9ba748f41612ec4697bb6a5c2489c2.  The original scripts include
 * dialog-driven entry points; only non-interactive Illustrator-side helpers
 * are retained here for future safe adapters.
 */

/** Legacy-compatible selection-to-active-artboard fit used by FitArtboardsToArtwork.jsx. */
export function buildFitActiveArtboardToSelectionJsx(): string {
  return `
    try {
      if (!app.selection || app.selection.length === 0) return __dpmDonorFailure('TARGET_NOT_FOUND', 'preflight', 'Fit artboard requires a verified selected object set.', false);
      var __dpmActiveArtboard = __dpmDonorDocument.artboards.getActiveArtboardIndex();
      var __dpmFit = __dpmDonorDocument.fitArtboardToSelectedArt(__dpmActiveArtboard);
      if (__dpmFit === false) return __dpmDonorFailure('POST_CONDITION_FAILED', 'post-condition', 'Illustrator declined to fit the artboard.', false);
      return { ok: true, value: { artboardIndex: __dpmActiveArtboard, rect: __dpmDonorDocument.artboards[__dpmActiveArtboard].artboardRect } };
    } catch (e) { return __dpmDonorFailure('ILLUSTRATOR_EXECUTION_FAILED', 'mutation', 'Fit artboard failed: ' + e, true); }
  `;
}
