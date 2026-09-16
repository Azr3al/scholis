const SUBHEADER_PATTERN = /^(mark|grade|score)s?$/i;

function cellStr(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

export function forwardFillRow(cells: unknown[]): string[] {
  const filled: string[] = [];
  let last = "";
  for (const cell of cells) {
    const text = cellStr(cell);
    if (text) last = text;
    filled.push(last || text);
  }
  return filled;
}

function isSmallInteger(value: unknown): boolean {
  const text = cellStr(value);
  if (!text) return false;
  const num = Number.parseInt(text, 10);
  return Number.isFinite(num) && num >= 1 && num <= 9999 && String(num) === text;
}

export function looksLikeSubheaderRow(
  parentHeaders: string[],
  subRow: unknown[],
): boolean {
  if (subRow.length === 0) return false;

  if (cellStr(subRow[0])) {
    if (isSmallInteger(subRow[0])) return false;
    return false;
  }

  const width = Math.max(parentHeaders.length, subRow.length);
  const subCells = Array.from({ length: width }, (_, i) =>
    i < subRow.length ? subRow[i] : null,
  );

  const subheaderMatches = subCells.filter((sub) =>
    SUBHEADER_PATTERN.test(cellStr(sub)),
  ).length;
  return subheaderMatches >= 2;
}

export function flattenTwoRowHeaders(
  headers: string[],
  rows: (string | number | null)[][],
): { headers: string[]; rows: (string | number | null)[][] } {
  if (rows.length === 0) {
    return { headers, rows };
  }

  const subRow = rows[0]!;
  if (!looksLikeSubheaderRow(headers, subRow)) {
    return { headers, rows };
  }

  const width = Math.max(
    headers.length,
    subRow.length,
    ...rows.map((row) => row.length),
  );
  const filledParents = forwardFillRow(
    Array.from({ length: width }, (_, i) => (i < headers.length ? headers[i] : "")),
  );
  const subCells = Array.from({ length: width }, (_, i) =>
    i < subRow.length ? subRow[i] : null,
  );

  const newHeaders: string[] = [];
  for (let i = 0; i < width; i++) {
    const parent = filledParents[i] ?? "";
    const sub = cellStr(subCells[i]);
    if (sub && SUBHEADER_PATTERN.test(sub)) {
      newHeaders.push(parent ? `${parent} ${sub}`.trim() : sub);
    } else {
      newHeaders.push(parent || sub);
    }
  }

  return { headers: newHeaders, rows: rows.slice(1) };
}
