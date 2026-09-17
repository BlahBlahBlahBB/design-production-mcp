/**
 * MIT-derived and adapted from ie3jp/illustrator-mcp-server
 * src/tools/modify/manage-artboards.ts at
 * 1814485cfa24787215f0ec515a6853cb293e1e0a. This preserves the documented
 * legacy Document.rearrangeArtboards() implementation and compatibility-safe
 * UserInteractionLevel restoration.
 */

export type ArtboardLayout = "grid_by_row" | "grid_by_col" | "row" | "column";

export function buildRearrangeArtboardsJsx(layout: ArtboardLayout, rowsOrColumns = 1, spacing = 20): string {
  return `
    try {
      var __dpmLayouts = { grid_by_row: DocumentArtboardLayout.GridByRow, grid_by_col: DocumentArtboardLayout.GridByCol, row: DocumentArtboardLayout.Row, column: DocumentArtboardLayout.Column };
      var __dpmPreviousInteraction = app.userInteractionLevel;
      try {
        app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
        var __dpmDidRearrange = __dpmDonorDocument.rearrangeArtboards(__dpmLayouts[${JSON.stringify(layout)}], ${rowsOrColumns}, ${spacing}, true);
        if (__dpmDidRearrange === false) return __dpmDonorFailure('POST_CONDITION_FAILED', 'post-condition', 'Illustrator declined to rearrange artboards.', false);
      } finally { app.userInteractionLevel = __dpmPreviousInteraction; }
      var __dpmArtboards = [];
      for (var __dpmArtboardIndex = 0; __dpmArtboardIndex < __dpmDonorDocument.artboards.length; __dpmArtboardIndex++) {
        var __dpmArtboard = __dpmDonorDocument.artboards[__dpmArtboardIndex];
        __dpmArtboards.push({ index: __dpmArtboardIndex, name: __dpmArtboard.name, rect: __dpmArtboard.artboardRect });
      }
      return { ok: true, value: { artboards: __dpmArtboards } };
    } catch (e) { return __dpmDonorFailure('ILLUSTRATOR_EXECUTION_FAILED', 'mutation', 'Artboard rearrange failed: ' + e, true); }
  `;
}
