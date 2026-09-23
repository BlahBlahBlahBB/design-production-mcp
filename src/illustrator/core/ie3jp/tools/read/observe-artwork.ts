import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { EXPLICIT_BOUNDS_JSX } from '../geometry.js';
import { executeToolJsx } from '../tool-executor.js';
import { READ_ANNOTATIONS } from '../modify/shared.js';

/**
 * A bounded, read-only view of direct artwork roots.  PageItem descendants are
 * deliberately deferred: only the Layer tree is recursive in V1.
 */
export const observeArtworkSchema = z.object({
  artboard_index: z.number().int().min(0).optional()
    .describe('Artboard index (0-based). Defaults to the current active artboard without changing it.'),
}).strict();

const jsxCode = `
var preflight = preflightChecks();
if (preflight) writeResultFile(RESULT_PATH, preflight);
else try {
  var params = readParamsFile(PARAMS_PATH);
  var doc = app.activeDocument;
  ${EXPLICIT_BOUNDS_JSX}

  var artboardIndex = params.artboard_index !== undefined
    ? params.artboard_index
    : doc.artboards.getActiveArtboardIndex();
  if (artboardIndex < 0 || artboardIndex >= doc.artboards.length) {
    writeResultFile(RESULT_PATH, {
      error: true,
      code: 'INVALID_ARTBOARD_INDEX',
      message: 'Artboard index ' + artboardIndex + ' is out of range (0-' + (doc.artboards.length - 1) + ').'
    });
  } else {
    var selectedArtboard = doc.artboards[artboardIndex];
    var roots = [];

    function nullableString(value) {
      return typeof value === 'string' && value.length > 0 ? value : null;
    }
    function layerName(layer) {
      try { return nullableString(layer.name); } catch (_) { return null; }
    }
    function readNativeUuid(item) {
      // _getNativeUUID is the common JSX helper's intentionally read-only path.
      try {
        var uuid = _getNativeUUID(item);
        return uuid ? uuid : null;
      } catch (_) { return null; }
    }
    function readEffectiveState(item, layers) {
      var visible = true;
      var locked = false;
      try { if (item.hidden === true) visible = false; } catch (_) {}
      try { if (item.locked === true) locked = true; } catch (_) {}
      for (var i = 0; i < layers.length; i++) {
        try { if (layers[i].visible === false) visible = false; } catch (_) {}
        try { if (layers[i].locked === true) locked = true; } catch (_) {}
      }
      return { visible: visible, locked: locked };
    }
    function readSelected(item) {
      try { return item.selected === true; } catch (_) { return false; }
    }
    function belongsToObservedArtboard(item) {
      try { return getArtboardIndexForItem(item) === artboardIndex; }
      catch (_) { throw new Error('Unable to determine direct root artboard membership safely.'); }
    }
    function appendDirectRoots(layer, layerPath, layerDepth, ancestorLayers) {
      var directItemIndex = 0;
      for (var i = 0; i < layer.pageItems.length; i++) {
        var item = layer.pageItems[i];
        try {
          if (item.parent !== layer) continue;
        } catch (_) {
          throw new Error('Unable to determine whether a PageItem is directly owned by its Layer.');
        }
        var itemIndex = directItemIndex++;
        if (!belongsToObservedArtboard(item)) continue;
        var state = readEffectiveState(item, ancestorLayers);
        var bounds;
        try { bounds = dpmReadBounds(item, 'geometric'); }
        catch (_) { throw new Error('Geometric bounds are unavailable for a direct root.'); }
        roots.push({
          uuid: readNativeUuid(item),
          type: getItemType(item),
          name: (function () { try { return nullableString(item.name); } catch (_) { return null; } })(),
          layer_path: layerPath,
          layer_depth: layerDepth,
          item_index: itemIndex,
          bounds: bounds,
          visible: state.visible,
          locked: state.locked,
          selected: readSelected(item)
        });
      }
    }
    function walkLayer(layer, layerPath, layerDepth, ancestorLayers) {
      var path = layerPath.concat([layerName(layer)]);
      var lineage = ancestorLayers.concat([layer]);
      appendDirectRoots(layer, path, layerDepth, lineage);
      for (var i = 0; i < layer.layers.length; i++) {
        walkLayer(layer.layers[i], path, layerDepth + 1, lineage);
      }
    }

    for (var i = 0; i < doc.layers.length; i++) walkLayer(doc.layers[i], [], 0, []);
    writeResultFile(RESULT_PATH, {
      artboard: {
        index: artboardIndex,
        name: nullableString(selectedArtboard.name),
        bounds: dpmNormalizeBounds(selectedArtboard.artboardRect)
      },
      roots: roots,
      count: roots.length
    });
  }
} catch (error) {
  writeResultFile(RESULT_PATH, {
    error: true,
    code: 'OBSERVE_ARTWORK_FAILED',
    message: 'observe_artwork failed: ' + error.message,
    line: error.line
  });
}
`;

export function register(server: McpServer): void {
  server.registerTool('observe_artwork', {
    title: 'Observe Artwork',
    description: 'Read a bounded, deterministic inventory of direct PageItem roots on an artboard. Traverses Layers and Sublayers only; never recurses PageItem descendants or writes identifiers, metadata, or Illustrator state.',
    inputSchema: observeArtworkSchema,
    annotations: READ_ANNOTATIONS,
  }, async (params) => executeToolJsx(jsxCode, params, { activate: false }));
}
