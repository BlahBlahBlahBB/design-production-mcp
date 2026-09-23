import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { executeToolJsx } from '../tool-executor.js';
import { DESTRUCTIVE_ANNOTATIONS } from './shared.js';

export const repeatLayoutSchema = z.object({
  target_uuid: z.string().min(1),
  rows: z.number().int().min(1),
  columns: z.number().int().min(1),
  horizontal_spacing: z.number().finite().min(0),
  vertical_spacing: z.number().finite().min(0),
}).strict().refine((value) => value.rows * value.columns <= 200, {
  message: 'rows * columns must be <= 200',
  path: ['rows'],
});

const jsxCode = `
var preflight = preflightChecks();
if (preflight) writeResultFile(RESULT_PATH, preflight);
else try {
  var params = readParamsFile(PARAMS_PATH);
  var source = findItemByUUID(params.target_uuid);
  if (!source) throw new Error("Source object not found: " + params.target_uuid);
  if (source.locked === true || source.hidden === true) throw new Error("Source object is locked or hidden");

  var rows = params.rows, columns = params.columns;
  var hGap = params.horizontal_spacing, vGap = params.vertical_spacing;
  if (rows < 1 || columns < 1 || rows !== Math.floor(rows) || columns !== Math.floor(columns)) throw new Error("rows and columns must be positive integers");
  if (rows * columns > 200) throw new Error("rows * columns must be <= 200");
  if (!isFinite(hGap) || !isFinite(vGap) || hGap < 0 || vGap < 0) throw new Error("spacing must be finite and non-negative");

  function normalizeBounds(raw) {
    if (!raw || raw.length < 4) throw new Error("Geometric bounds are unavailable");
    var x1 = Number(raw[0]), y1 = Number(raw[1]), x2 = Number(raw[2]), y2 = Number(raw[3]);
    if (!isFinite(x1) || !isFinite(y1) || !isFinite(x2) || !isFinite(y2)) throw new Error("Geometric bounds are non-finite");
    var b = { left:Math.min(x1,x2), top:Math.max(y1,y2), right:Math.max(x1,x2), bottom:Math.min(y1,y2) };
    b.width = b.right - b.left; b.height = b.top - b.bottom;
    if (!(b.width > 0) || !(b.height > 0)) throw new Error("Source geometric bounds must have positive dimensions");
    return b;
  }
  function close(a, b) { return Math.abs(a - b) <= 0.01; }
  function boundsMatch(actual, expected) {
    return close(actual.left, expected.left) && close(actual.top, expected.top) &&
      close(actual.right, expected.right) && close(actual.bottom, expected.bottom);
  }
  function readBounds(item) { return normalizeBounds(item.geometricBounds); }
  function translatedBounds(sourceBounds, dx, dy) {
    return { left:sourceBounds.left + dx, top:sourceBounds.top + dy, right:sourceBounds.right + dx,
      bottom:sourceBounds.bottom + dy, width:sourceBounds.width, height:sourceBounds.height };
  }
  function cleanup(createdRefs, rollbackErrors) {
    for (var ri = createdRefs.length - 1; ri >= 0; ri--) {
      try { createdRefs[ri].remove(); } catch (removeError) { rollbackErrors.push(removeError.message); }
    }
  }

  var sourceBounds = readBounds(source);
  var originalSourceBounds = { left:sourceBounds.left, top:sourceBounds.top, right:sourceBounds.right, bottom:sourceBounds.bottom, width:sourceBounds.width, height:sourceBounds.height };
  var createdRefs = [];
  var generated = [];
  var generatedUuids = {};
  var cells = [{ row:0, column:0, offset_x:0, offset_y:0, is_original:true, planned:originalSourceBounds }];
  var horizontalStep = sourceBounds.width + hGap;
  var verticalStep = sourceBounds.height + vGap;
  for (var row = 0; row < rows; row++) {
    for (var column = 0; column < columns; column++) {
      if (row === 0 && column === 0) continue;
      cells.push({ row:row, column:column, offset_x:column * horizontalStep, offset_y:row * verticalStep, is_original:false,
        planned:translatedBounds(originalSourceBounds, column * horizontalStep, -row * verticalStep) });
    }
  }

  try {
    for (var ci = 1; ci < cells.length; ci++) {
      var cell = cells[ci];
      var duplicate = source.duplicate();
      createdRefs.push(duplicate);
      // Planner coordinates are top-left, positive-Y-down; Illustrator translate is native Y-up.
      duplicate.translate(cell.offset_x, -cell.offset_y);
      var duplicateUuid = ensureUUID(duplicate, true);
      if (!duplicateUuid) throw new Error("Unable to establish duplicate UUID");
      if (duplicateUuid === params.target_uuid || generatedUuids[duplicateUuid]) throw new Error("Duplicate UUID collision");
      generatedUuids[duplicateUuid] = true;
      var actualBounds = readBounds(duplicate);
      if (!boundsMatch(actualBounds, cell.planned)) throw new Error("Generated bounds verification failed at row " + cell.row + ", column " + cell.column);
      generated.push({ row:cell.row, column:cell.column, uuid:duplicateUuid, bounds:actualBounds, is_original:false });
    }

    var sourceAfter = readBounds(source);
    if (!boundsMatch(sourceAfter, originalSourceBounds)) throw new Error("Source bounds changed during repeat layout");
    if (generated.length !== cells.length - 1) throw new Error("Generated count verification failed");
    var resultCells = [{ row:0, column:0, uuid:params.target_uuid, bounds:sourceAfter, is_original:true }].concat(generated);
    writeResultFile(RESULT_PATH, { status:"SUCCESS", source_uuid:params.target_uuid, rows:rows, columns:columns,
      total_cells:cells.length, generated_count:generated.length, cells:resultCells });
  } catch (error) {
    var rollbackErrors = [];
    cleanup(createdRefs, rollbackErrors);
    if (rollbackErrors.length) {
      writeResultFile(RESULT_PATH, { status:"ROLLBACK_FAILED", partial_mutation:true, source_uuid:params.target_uuid,
        message:"repeat_layout failed and cleanup may be incomplete: " + error.message, rollback_errors:rollbackErrors });
    } else if (createdRefs.length) {
      writeResultFile(RESULT_PATH, { status:"ROLLED_BACK", source_uuid:params.target_uuid, message:"repeat_layout failed: " + error.message });
    } else {
      writeResultFile(RESULT_PATH, { status:"FAILED_NO_MUTATION", source_uuid:params.target_uuid, message:"repeat_layout failed: " + error.message });
    }
  }
} catch (error) {
  writeResultFile(RESULT_PATH, { status:"FAILED_NO_MUTATION", message:"repeat_layout failed: " + error.message, line:error.line });
}
`;

export function register(server: McpServer): void {
  server.registerTool('repeat_layout', {
    title: 'Repeat Layout',
    description: 'Duplicate one source object into a bounded row-major layout using geometric bounds and edge-to-edge spacing.',
    inputSchema: repeatLayoutSchema,
    annotations: DESTRUCTIVE_ANNOTATIONS,
  }, async (params) => executeToolJsx(jsxCode, params, { timeoutMs: 180_000, includeTiming: true }));
}

export { jsxCode as repeatLayoutJsxCode };
