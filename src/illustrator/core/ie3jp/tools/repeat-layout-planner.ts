export interface NormalizedGeometricBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface RepeatLayoutPlanInput {
  sourceBounds: NormalizedGeometricBounds;
  rows: number;
  columns: number;
  horizontalSpacing: number;
  verticalSpacing: number;
}

export interface RepeatLayoutCellPlan {
  row: number;
  column: number;
  offset_x: number;
  offset_y: number;
  targetBounds: NormalizedGeometricBounds;
  is_original: boolean;
}

const MAX_CELLS = 200;

function finite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
}

export function planRepeatLayout(input: RepeatLayoutPlanInput): RepeatLayoutCellPlan[] {
  const { sourceBounds, rows, columns, horizontalSpacing, verticalSpacing } = input;
  if (!Number.isInteger(rows) || rows < 1) throw new Error('rows must be an integer >= 1');
  if (!Number.isInteger(columns) || columns < 1) throw new Error('columns must be an integer >= 1');
  if (rows * columns > MAX_CELLS) throw new Error(`rows * columns must be <= ${MAX_CELLS}`);
  finite(horizontalSpacing, 'horizontalSpacing');
  finite(verticalSpacing, 'verticalSpacing');
  if (horizontalSpacing < 0) throw new Error('horizontalSpacing must be >= 0');
  if (verticalSpacing < 0) throw new Error('verticalSpacing must be >= 0');

  for (const [label, value] of Object.entries(sourceBounds)) finite(value, `sourceBounds.${label}`);
  const width = sourceBounds.right - sourceBounds.left;
  const height = sourceBounds.top - sourceBounds.bottom;
  if (width <= 0 || height <= 0) throw new Error('sourceBounds must have positive width and height');

  const horizontalStep = width + horizontalSpacing;
  const verticalStep = height + verticalSpacing;
  const cells: RepeatLayoutCellPlan[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const offset_x = column * horizontalStep;
      const offset_y = row * verticalStep;
      cells.push({
        row,
        column,
        offset_x,
        offset_y,
        targetBounds: {
          left: sourceBounds.left + offset_x,
          top: sourceBounds.top + offset_y,
          right: sourceBounds.right + offset_x,
          bottom: sourceBounds.bottom + offset_y,
        },
        is_original: row === 0 && column === 0,
      });
    }
  }
  return cells;
}
