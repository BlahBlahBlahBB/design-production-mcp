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
  label_uuid: z.string().optional().describe('Optional TextFrame UUID whose contents should be updated for this placement.'),
  label_text: z.string().optional().describe('Text to write to label_uuid, commonly the source filename without extension.'),
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
    var results = [], failed = [], prepared = [], preflightFailures = [];
    var timingStart = (new Date()).getTime();
    var preflightStart = timingStart;
    var preflightMs = 0, placementMs = 0, clippingMs = 0, labelMs = 0, verificationMs = 0;

    function timingSummary() {
      var elapsed = (new Date()).getTime() - timingStart;
      var accounted = preflightMs + placementMs + clippingMs + labelMs + verificationMs;
      return {
        elapsed_ms: elapsed,
        preflight_ms: preflightMs,
        placement_ms: placementMs,
        clipping_ms: clippingMs,
        label_ms: labelMs,
        verification_ms: verificationMs,
        unaccounted_ms: Math.max(0, elapsed - accounted)
      };
    }

    function locateEmbeddedByName(tag) {
      for (var ri = 0; ri < doc.rasterItems.length; ri++) {
        if (doc.rasterItems[ri].name === tag) return doc.rasterItems[ri];
      }
      return null;
    }

    function readableContents(item) {
      try { return String(item.contents || ""); } catch (_) { return ""; }
    }

    // Whole-batch preflight: no Illustrator mutation until every source and target is valid.
    for (var pi = 0; pi < params.placements.length; pi++) {
      var pop = params.placements[pi];
      var prep = { op:pop, imgFile:null, centerTarget:null, clipPath:null, labelTarget:null, labelOriginal:null };
      try {
        prep.imgFile = new File(pop.file_path);
        if (!prep.imgFile.exists) throw new Error("Image file not found: " + pop.file_path);
        if (/\\.svgz?$/i.test(pop.file_path)) throw new Error("SVG is not supported by place_images; use import_svg_as_editable.");

        if (pop.center_on_uuid) {
          prep.centerTarget = findItemByUUID(pop.center_on_uuid);
          if (!prep.centerTarget) throw new Error("Center target not found: " + pop.center_on_uuid);
        }

        if (pop.clip_path_uuid) {
          prep.clipPath = findItemByUUID(pop.clip_path_uuid);
          if (!prep.clipPath) throw new Error("Clip path not found: " + pop.clip_path_uuid);
          if (prep.clipPath.typename !== "PathItem") throw new Error("clip_path_uuid must resolve to a simple PathItem");
          if (prep.clipPath.locked || prep.clipPath.hidden) throw new Error("Clip path must be unlocked and visible");
        }

        if (pop.label_uuid || typeof pop.label_text === "string") {
          if (!pop.label_uuid || typeof pop.label_text !== "string") throw new Error("label_uuid and label_text must be supplied together");
          prep.labelTarget = findItemByUUID(pop.label_uuid);
          if (!prep.labelTarget) throw new Error("Label target not found: " + pop.label_uuid);
          if (prep.labelTarget.typename !== "TextFrame") throw new Error("label_uuid must resolve to a TextFrame");
          if (prep.labelTarget.locked || prep.labelTarget.hidden) throw new Error("Label target must be unlocked and visible");
          prep.labelOriginal = readableContents(prep.labelTarget);
        }

        prepared.push(prep);
      } catch(prepError) {
        preflightFailures.push({ index:pi, file_path:pop.file_path, reason:prepError.message });
      }
    }

    preflightMs = (new Date()).getTime() - preflightStart;

    if (preflightFailures.length) {
      writeResultFile(RESULT_PATH, {
        success:false,
        preflight:"FAILED_NO_MUTATION",
        requested_count:params.placements.length,
        success_count:0,
        fail_count:preflightFailures.length,
        failed_objects:preflightFailures,
        results:[],
        timing:timingSummary()
      });
    } else {
      for (var i = 0; i < prepared.length; i++) {
        var p = prepared[i], op = p.op, placed = null, resultItem = null, group = null, labelChanged = false;
        try {
          var placementStart = (new Date()).getTime();
          var targetLayer = resolveTargetLayer(doc, op.layer_name);
          placed = targetLayer.placedItems.add();
          try { placed.file = p.imgFile; }
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

          if (p.centerTarget) {
            var tb = p.centerTarget.geometricBounds;
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
          placementMs += (new Date()).getTime() - placementStart;
          var outputItem = resultItem, groupUuid = null;

          if (p.clipPath) {
            var clippingStart = (new Date()).getTime();
            // Illustrator clipping groups require the mask at PLACEATBEGINNING
            // and the mask PathItem itself marked as clipping. Duplicate first so
            // a failed operation can remove only new artwork and leave the template intact.
            var parentLayer = p.clipPath.layer;
            group = parentLayer.groupItems.add();
            var mask = p.clipPath.duplicate(group, ElementPlacement.PLACEATBEGINNING);
            resultItem.move(group, ElementPlacement.PLACEATEND);
            mask.clipping = true;
            group.clipped = true;
            if (op.group_name) group.name = op.group_name;
            outputItem = group;
            groupUuid = ensureUUID(group);
            clippingMs += (new Date()).getTime() - clippingStart;
          }

          if (p.labelTarget) {
            var labelStart = (new Date()).getTime();
            p.labelTarget.contents = op.label_text.split(String.fromCharCode(10)).join(String.fromCharCode(13));
            labelChanged = true;
            if (readableContents(p.labelTarget) !== op.label_text.split(String.fromCharCode(10)).join(String.fromCharCode(13))) {
              throw new Error("Label readback mismatch");
            }
            labelMs += (new Date()).getTime() - labelStart;
          }

          // Commit the mask replacement only after image, clipping, and optional label all succeeded.
          if (p.clipPath) p.clipPath.remove();

          var verificationStart = (new Date()).getTime();
          var verifiedOutput = verifyItem(outputItem, coordSystem, abRect);
          verificationMs += (new Date()).getTime() - verificationStart;

          results.push({
            index:i,
            success:true,
            uuid:placedUuid,
            group_uuid:groupUuid,
            label_uuid:op.label_uuid || null,
            filePath:op.file_path,
            type:op.embed ? "embedded" : "linked",
            widthPt:widthPt,
            heightPt:heightPt,
            verified:verifiedOutput
          });
        } catch(e) {
          // Per-slot rollback: preserve original template mask and label whenever possible.
          try {
            if (labelChanged && p.labelTarget) p.labelTarget.contents = p.labelOriginal;
          } catch(ignoreLabelRollback) {}
          try {
            if (group) group.remove();
            else if (resultItem) resultItem.remove();
            else if (placed) placed.remove();
          } catch(ignoreArtworkRollback) {}

          failed.push({ index:i, file_path:op.file_path, reason:e.message });
          results.push({ index:i, success:false, filePath:op.file_path, error:e.message });
        }
      }

      writeResultFile(RESULT_PATH, {
        success: failed.length === 0,
        preflight:"PASS",
        requested_count: params.placements.length,
        success_count: params.placements.length - failed.length,
        fail_count: failed.length,
        failed_objects: failed,
        results: results,
        coordinateSystem: coordSystem,
        timing: timingSummary()
      });
    }
  } catch(e) {
    writeResultFile(RESULT_PATH, { error:true, message:"place_images failed: " + e.message, line:e.line });
  }
}
`;

export function register(server: McpServer): void {
  server.registerTool('place_images', {
    title: 'Place Images',
    description: 'Batch-place many raster/PDF files in one background JSX execution. Large batches may legitimately take longer than the normal 30/60 second transport budget; this tool waits up to 180 seconds so a completed Illustrator mutation is not misreported as a timeout. The result includes timing telemetry for total JSX time plus preflight, placement, clipping, label, verification, and transport elapsed milliseconds. Prefer this over repeated place_image calls for folders, grids, templates, QR codes, or other multi-image work. The entire batch is preflighted before mutation. Each placement can size in points or millimeters, center on an existing UUID, create a clipping group from an existing simple PathItem using Illustrator-safe mask ordering, and optionally update a matching TextFrame label in the same operation. Failed placements roll back newly created artwork instead of leaving orphaned images. Results preserve input order.',
    inputSchema: {
      placements: z.array(placementSchema).min(1).max(200),
      coordinate_system: coordinateSystemSchema,
    },
    annotations: WRITE_ANNOTATIONS,
  }, async (params) => executeToolJsx(jsxCode, params, { resolveCoordinate: true, timeoutMs: 180_000, includeTiming: true }));
}
