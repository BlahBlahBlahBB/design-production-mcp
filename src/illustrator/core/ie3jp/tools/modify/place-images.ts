import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { executeToolJsx } from '../tool-executor.js';
import { coordinateSystemSchema } from '../session.js';
import { WRITE_ANNOTATIONS } from './shared.js';

const placementSchema = z.object({
  file_path: z.string(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().positive().optional().describe('Width in Illustrator points. Use width_mm when the user supplied millimeters.'),
  height: z.number().positive().optional().describe('Height in Illustrator points. Use height_mm when the user supplied millimeters.'),
  width_mm: z.number().positive().optional().describe('Exact width in millimeters; converted to Illustrator points inside the tool.'),
  height_mm: z.number().positive().optional().describe('Exact height in millimeters; converted to Illustrator points inside the tool.'),
  center_on_uuid: z.string().optional().describe('Center the placed image on this existing object after sizing. Takes precedence over x/y.'),
  clip_path_uuid: z.string().optional().describe('After placement, create a clipping group using this existing object as the topmost clipping path.'),
  group_name: z.string().optional().describe('Optional name for the clipping group created by clip_path_uuid.'),
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

        var centerTarget = null, clipPath = null;
        if (op.center_on_uuid) {
          centerTarget = findItemByUUID(op.center_on_uuid);
          if (!centerTarget) throw new Error("Center target not found: " + op.center_on_uuid);
        }
        if (op.clip_path_uuid) {
          clipPath = findItemByUUID(op.clip_path_uuid);
          if (!clipPath) throw new Error("Clip path not found: " + op.clip_path_uuid);
        }

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

        var requestedWidth = typeof op.width_mm === "number" ? op.width_mm * 72 / 25.4 : op.width;
        var requestedHeight = typeof op.height_mm === "number" ? op.height_mm * 72 / 25.4 : op.height;
        if (typeof requestedWidth === "number") resultItem.width = requestedWidth;
        if (typeof requestedHeight === "number") resultItem.height = requestedHeight;

        if (centerTarget) {
          var tb = centerTarget.geometricBounds;
          var rb = resultItem.geometricBounds;
          var targetCenterX = (tb[0] + tb[2]) / 2;
          var targetCenterY = (tb[1] + tb[3]) / 2;
          var itemWidth = Math.abs(rb[2] - rb[0]);
          var itemHeight = Math.abs(rb[3] - rb[1]);
          resultItem.left = targetCenterX - itemWidth / 2;
          resultItem.top = targetCenterY + itemHeight / 2;
        } else if (typeof op.x === "number" && typeof op.y === "number") {
          var pos = webToAiPoint(op.x, op.y, coordSystem, abRect);
          resultItem.left = pos[0];
          resultItem.top = pos[1];
        }

        resultItem.name = op.name || "";

        var placedUuid = ensureUUID(resultItem);
        var bounds = resultItem.geometricBounds;
        var widthPt = Math.abs(bounds[2] - bounds[0]);
        var heightPt = Math.abs(bounds[3] - bounds[1]);
        var outputItem = resultItem, groupUuid = null;
        if (clipPath) {
          var parentLayer = clipPath.layer;
          var group = parentLayer.groupItems.add();
          resultItem.move(group, ElementPlacement.PLACEATEND);
          clipPath.move(group, ElementPlacement.PLACEATEND);
          if (op.group_name) group.name = op.group_name;
          group.clipped = true;
          outputItem = group;
          groupUuid = ensureUUID(group);
        }
        results.push({
          index:i,
          success:true,
          uuid:placedUuid,
          group_uuid:groupUuid,
          filePath:op.file_path,
          type:op.embed ? "embedded" : "linked",
          widthPt:widthPt,
          heightPt:heightPt,
          verified:verifyItem(outputItem, coordSystem, abRect)
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
    description: 'Batch-place many raster/PDF files in one background JSX execution. Prefer this over repeated place_image calls for folders, grids, templates, QR codes, or other multi-image work. Each placement can size in points or millimeters, center on an existing UUID, optionally turn an existing UUID into the clipping path in the same operation, or use explicit x/y. Results preserve input order for downstream batch operations.',
    inputSchema: {
      placements: z.array(placementSchema).min(1).max(200),
      coordinate_system: coordinateSystemSchema,
    },
    annotations: WRITE_ANNOTATIONS,
  }, async (params) => executeToolJsx(jsxCode, params, { resolveCoordinate: true }));
}
