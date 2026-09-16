function needsQuoting(cell: string): boolean {
  return cell.includes("\t") || cell.includes("\n") || cell.includes('"');
}

function quote(cell: string): string {
  return `"${cell.replace(/"/g, '""')}"`;
}

export function serializeTsv(rows: readonly (readonly string[])[]): string {
  return rows
    .map((row) => row.map((c) => (needsQuoting(c) ? quote(c) : c)).join("\t"))
    .join("\n");
}

function escapeHtml(cell: string): string {
  return cell
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function serializeHtmlTable(rows: readonly (readonly string[])[]): string {
  const body = rows
    .map(
      (row) =>
        `<tr>${row.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`,
    )
    .join("");
  return `<table>${body}</table>`;
}

export function parseTsv(text: string): string[][] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];

    if (inQuotes) {
      if (ch === '"') {
        if (normalized[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === "\t") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }

  // flush the final cell/row unless the input ended exactly on a newline
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}
