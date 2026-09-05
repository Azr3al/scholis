type ParseExcelPasteResult = {
  rows: (string | null)[][];
  warnings: string[];
  error: string | null;
};

export const PASTE_MAX_ROWS = 5000;

type ParseExcelPasteWithHeadersResult = {
  headers: string[];
  rows: (string | null)[][];
  warnings: string[];
  error: string | null;
};

function normalizeLineCells(line: string): string[] {
  return line.split("\t").map((cell) => cell.trim());
}

function normalizeRowWidth(
  cells: string[],
  columnCount: number,
  lineNumber: number,
): { row: (string | null)[]; warnings: string[] } {
  const warnings: string[] = [];

  if (cells.length > columnCount) {
    warnings.push(
      `Row ${lineNumber} had ${cells.length} columns; using first ${columnCount}`,
    );
  }

  const row: (string | null)[] = [];
  for (let i = 0; i < columnCount; i++) {
    const value = cells[i];
    row.push(value === undefined || value === "" ? null : value);
  }

  return { row, warnings };
}

function splitNonEmptyLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
}

export function parseExcelPasteWithHeaders(
  text: string,
  maxRows: number = PASTE_MAX_ROWS,
): ParseExcelPasteWithHeadersResult {
  const lines = splitNonEmptyLines(text);

  if (lines.length === 0) {
    return { headers: [], rows: [], warnings: [], error: null };
  }

  const headerCells = normalizeLineCells(lines[0]!);
  const headers = headerCells.map((cell) => cell);

  if (lines.length === 1) {
    return {
      headers,
      rows: [],
      warnings: [],
      error: "No data rows found",
    };
  }

  const dataLines = lines.slice(1);
  if (dataLines.length > maxRows) {
    return {
      headers,
      rows: [],
      warnings: [],
      error: `Exceeds maximum of ${maxRows} rows`,
    };
  }

  const rows: (string | null)[][] = [];
  const warnings: string[] = [];
  const columnCount = headers.length;

  dataLines.forEach((line, index) => {
    const cells = normalizeLineCells(line);
    const { row, warnings: rowWarnings } = normalizeRowWidth(
      cells,
      columnCount,
      index + 1,
    );
    rows.push(row);
    warnings.push(...rowWarnings);
  });

  return { headers, rows, warnings, error: null };
}

export function parseExcelPaste(
  text: string,
  columnCount: number,
): ParseExcelPasteResult {
  if (columnCount <= 0) {
    return { rows: [], warnings: [], error: "No columns in uploaded file" };
  }

  const lines = splitNonEmptyLines(text);

  if (lines.length === 0) {
    return { rows: [], warnings: [], error: null };
  }

  const rows: (string | null)[][] = [];
  const warnings: string[] = [];

  lines.forEach((line, index) => {
    const cells = normalizeLineCells(line);
    const { row, warnings: rowWarnings } = normalizeRowWidth(
      cells,
      columnCount,
      index + 1,
    );
    rows.push(row);
    warnings.push(...rowWarnings);
  });

  return { rows, warnings, error: null };
}
