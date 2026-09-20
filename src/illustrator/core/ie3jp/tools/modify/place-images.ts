import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { executeToolJsx } from '../tool-executor.js';
import { coordinateSystemSchema } from '../session.js';
import { WRITE_ANNOTATIONS } from './shared.js';

const placementSchema = z.object({
  file_path: z.string(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  embed: z.boolean().optional().default(false),
  layer_name: z.string().optional(),
  name: z.string().optional(),
});

const jsxCode = `
var preflight = preflightChecks();
if (preflight) writeResultFile(RESULT_PATH, preflight);
else {
  try {
    var params = readParamsFile(PARAMS_PATH);
    var doc = app.activeDocument;
    var coordSystem = params.coordinate_system || "artboard-web";
    var abRect = coordSystem === "artboard-web" ? getActiveArtboardRect() : null;
    var results = [], failed = [];

    function locateEmbeddedByName(tag) {
      for (var ri = 0; ri < doc.rasterItems.length; ri++) {
        if (doc.rasterItems[ri].name === tag) return doc.rasterItems[ri];
      }
      return null;
    }

    for (var i = 0; i < params.placements.length; i++) {
      var op = params.placements[i], placed = null, resultItem = null;
      try {
        var imgFile = new File(op.file_path);
        if (!imgFile.exists) throw new Error("Image file not found: " + op.file_path);
        if (/\\.svgz?$/i.test(op.file_path)) throw new Error("SVG is not supported by place_images; use import_svg_as_editable.");

        var targetLayer = resolveTargetLayer(doc, op.layer_name);
        placed = targetLayer.placedItems.add();
        try { placed.file = imgFile; }
        catch (linkErr) {
          try { placed.remove(); } catch (ignoreRemove) {}
          placed = null;
          throw new Error("Failed to link image file: " + linkErr.message);
        }

        resultItem = placed;
        if (op.embed === true) {
          var tag = "__place_images_embed_" + (new Date()).getTime() + "_" + i;
          placed.name = tag;
          placed.embed();
          placed = null;
          resultItem = locateEmbeddedByName(tag);
          if (!resultItem) throw new Error("embed() succeeded but resulting RasterItem could not be found");
        }

        if (typeof op.width === "number") resultItem.width = op.width;
        if (typeof op.height === "number") resultItem.height = op.height;

        if (typeof op.x === "number" && typeof op.y === "number") {
          var pos = webToAiPoint(op.x, op.y, coordSystem, abRect);
          resultItem.left = pos[0];
          resultItem.top = pos[1];
        }

        resultItem.name = op.name || "";

        var bounds = resultItem.geometricBounds;
        var widthPt = Math.abs(bounds[2] - bounds[0]);
        var heightPt = Math.abs(bounds[3] - bounds[1]);
        results.push({
          index:i,
          success:true,
          uuid:ensureUUID(resultItem),
          filePath:op.file_path,
          type:op.embed ? "embedded" : "linked",
          widthPt:widthPt,
          heightPt:heightPt,
          verified:verifyItem(resultItem, coordSystem, abRect)
        });
      } catch(e) {
        failed.push({ index:i, file_path:op.file_path, reason:e.message });
        results.push({ index:i, success:false, filePath:op.file_path, error:e.message });
      }
    }

    writeResultFile(RESULT_PATH, {
      success: failed.length === 0,
      requested_count: params.placements.length,
      success_count: params.placements.length - failed.length,
      fail_count: failed.length,
      failed_objects: failed,
      results: results,
      coordinateSystem: coordSystem
    });
  } catch(e) {
    writeResultFile(RESULT_PATH, { error:true, message:"place_images failed: " + e.message, line:e.line });
  }
}
`;

export function register(server: McpServer): void {
  server.registerTool('place_images', {
    title: 'Place Images',
    description: 'Batch-place many raster/PDF files in one background JSX execution. Prefer this over repeated place_image calls for folders, grids, templates, QR codes, or other multi-image work. Each placement can set exact top-left position, width, height, layer, name, and embed mode, and results preserve input order for downstream batch operations.',
    inputSchema: {
      placements: z.array(placementSchema).min(1).max(200),
      coordinate_system: coordinateSystemSchema,
    },
    annotations: WRITE_ANNOTATIONS,
  }, async (params) => executeToolJsx(jsxCode, params, { resolveCoordinate: true }));
}
