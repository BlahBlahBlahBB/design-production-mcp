/**
 * MIT-derived and adapted from ie3jp/illustrator-mcp-server
 * src/tools/modify/place-image.ts and manage-linked-images.ts at
 * 1814485cfa24787215f0ec515a6853cb293e1e0a.
 *
 * These builders intentionally contain no transport or MCP registration. A
 * caller must pass them to executeSafeDonorOperation, which proves DPM's work
 * copy before the first Illustrator DOM write.
 */

export interface PlaceImageRequest {
  filePath: string;
  x?: number;
  y?: number;
  name?: string;
  embed?: boolean;
}

function literal(value: string): string { return JSON.stringify(value.replaceAll("\\", "/")); }

/** Place an image, retaining IE3JP's temporary-name technique for embed(). */
export function buildPlaceImageJsx(request: PlaceImageRequest): string {
  return `
    var __dpmImageFile = new File(${literal(request.filePath)});
    if (!__dpmImageFile.exists) return __dpmDonorFailure('TARGET_NOT_FOUND', 'preflight', 'Image file does not exist.', false);
    if (/\\.svgz?$/i.test(__dpmImageFile.fsName)) return __dpmDonorFailure('ILLUSTRATOR_UNSUPPORTED', 'preflight', 'Use the editable SVG import capability for SVG files.', false);
    try {
      var __dpmPlaced = __dpmDonorDocument.placedItems.add();
      try { __dpmPlaced.file = __dpmImageFile; } catch (linkError) {
        try { __dpmPlaced.remove(); } catch (removeError) {}
        return __dpmDonorFailure('ILLUSTRATOR_EXECUTION_FAILED', 'mutation', 'Illustrator could not link the image: ' + linkError, false);
      }
      ${typeof request.x === "number" && typeof request.y === "number" ? `__dpmPlaced.left = ${request.x}; __dpmPlaced.top = ${request.y};` : ""}
      ${request.name !== undefined ? `__dpmPlaced.name = ${JSON.stringify(request.name)};` : ""}
      var __dpmResult = __dpmPlaced;
      var __dpmEmbedded = ${request.embed === true ? "true" : "false"};
      if (__dpmEmbedded) {
        var __dpmTag = '__dpm_place_embed_' + (new Date()).getTime();
        __dpmPlaced.name = __dpmTag;
        __dpmPlaced.embed();
        var __dpmFound = null;
        for (var __dpmIndex = 0; __dpmIndex < __dpmDonorDocument.rasterItems.length; __dpmIndex++) {
          if (__dpmDonorDocument.rasterItems[__dpmIndex].name === __dpmTag) { __dpmFound = __dpmDonorDocument.rasterItems[__dpmIndex]; break; }
        }
        if (!__dpmFound) return __dpmDonorFailure('POST_CONDITION_FAILED', 'post-condition', 'embed() completed but its RasterItem could not be found.', true);
        __dpmResult = __dpmFound;
        __dpmResult.name = ${JSON.stringify(request.name ?? "")};
      }
      var __dpmBounds = __dpmResult.geometricBounds;
      return { ok: true, value: { type: __dpmEmbedded ? 'embedded' : 'linked', name: __dpmResult.name || '', bounds: __dpmBounds } };
    } catch (e) {
      return __dpmDonorFailure('ILLUSTRATOR_EXECUTION_FAILED', 'mutation', 'Place image failed: ' + e, true);
    }
  `;
}

/** Relink the selected, unique PlacedItem. Selection is deliberately temporary, not an identity API. */
export function buildRelinkSelectedImageJsx(newPath: string): string {
  return `
    var __dpmRelinkFile = new File(${literal(newPath)});
    if (!__dpmRelinkFile.exists) return __dpmDonorFailure('TARGET_NOT_FOUND', 'preflight', 'Replacement image file does not exist.', false);
    if (!app.selection || app.selection.length !== 1 || app.selection[0].typename !== 'PlacedItem') return __dpmDonorFailure('TARGET_AMBIGUOUS', 'preflight', 'Exactly one placed image must be selected by a verified higher-level adapter.', false);
    try {
      var __dpmLinked = app.selection[0];
      __dpmLinked.relink(__dpmRelinkFile);
      return { ok: true, value: { action: 'relink', name: __dpmLinked.name || '', path: __dpmRelinkFile.fsName } };
    } catch (e) {
      return __dpmDonorFailure('ILLUSTRATOR_EXECUTION_FAILED', 'mutation', 'Relink failed: ' + e, true);
    }
  `;
}
