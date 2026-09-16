export interface PasteWrite {
  row: number; // display row
  field: string;
  value: string;
}

export interface PastePlan {
  writes: PasteWrite[];
  appendCount: number; // rows to append at the end before applying writes beyond rowCount
}

export interface PlanPasteInput {
  block: string[][];
  fields: (string | null)[]; // fields aligned to grid columns; null = non-data column
  anchor: { row: number; col: number }; // col = index into fields
  selection: { rows: number; cols: number };
  rowCount: number;
  canGrow: boolean;
  isEditable: (displayRow: number, field: string) => boolean;
}

export function planPaste(input: PlanPasteInput): PastePlan {
  const { block, fields, anchor, selection, rowCount, canGrow, isEditable } =
    input;

  if (block.length === 0) return { writes: [], appendCount: 0 };

  const isSingle = block.length === 1 && block[0].length === 1;
  const targetRows = isSingle ? Math.max(1, selection.rows) : block.length;
  const targetCols = isSingle
    ? Math.max(1, selection.cols)
    : Math.max(...block.map((r) => r.length));

  const maxDisplayRow = anchor.row + targetRows - 1;
  const overflow = Math.max(0, maxDisplayRow - (rowCount - 1));
  const appendCount = canGrow ? overflow : 0;
  const lastWritableRow = canGrow ? maxDisplayRow : rowCount - 1;

  const writes: PasteWrite[] = [];

  for (let r = 0; r < targetRows; r++) {
    const displayRow = anchor.row + r;
    if (displayRow > lastWritableRow) break;

    for (let c = 0; c < targetCols; c++) {
      const colIndex = anchor.col + c;
      const field = fields[colIndex];
      if (!field) continue;
      if (!isEditable(displayRow, field)) continue;

      const sourceRow = block[r % block.length];
      const value = isSingle
        ? block[0][0]
        : sourceRow[c % sourceRow.length] ?? "";

      writes.push({ row: displayRow, field, value });
    }
  }

  return { writes, appendCount };
}
