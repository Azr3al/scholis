import type { CommitError, ImportFieldDef, ParseResult } from "@/app/client-api/imports";
import { normalizeCell } from "@/lib/imports/normalize-cell";

export type ImportValidationError = {
  sourceRow: number;
  field: string;
  reason: string;
  origin: "client" | "server";
};

function errorKey(sourceRow: number, field: string): string {
  return `${sourceRow}:${field}`;
}

export function collectClientErrors(input: {
  rows: ParseResult["rows"];
  mapping: Record<number, string | null>;
  fields: ImportFieldDef[];
  skippedRows?: Set<number>;
}): ImportValidationError[] {
  const { rows, mapping, fields, skippedRows = new Set() } = input;
  const fieldByKey = new Map(fields.map((f) => [f.field_key, f]));
  const mappedCols = Object.entries(mapping)
    .filter(([, f]) => f)
    .map(([idx, field]) => ({ idx: Number(idx), field: field as string }));

  const errors: ImportValidationError[] = [];

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    if (skippedRows.has(rowIndex)) continue;
    for (const { idx, field } of mappedCols) {
      if (field === "email" || field === "courses") continue;
      const def = fieldByKey.get(field);
      if (!def) continue;
      const raw = rows[rowIndex]?.[idx];
      const value = raw === null || raw === undefined ? "" : String(raw);
      const norm = normalizeCell(value, def);
      if (norm.status === "error") {
        errors.push({
          sourceRow: rowIndex,
          field,
          reason: norm.reason ?? "Invalid value",
          origin: "client",
        });
      }
    }
  }

  return errors;
}

export function mapServerCommitErrors(
  commitErrors: CommitError[],
  rowIndexMap: number[],
): ImportValidationError[] {
  return commitErrors.map((e) => ({
    sourceRow: rowIndexMap[e.row] ?? e.row,
    field: e.field,
    reason: e.reason,
    origin: "server" as const,
  }));
}

export function mergeValidationErrors(
  client: ImportValidationError[],
  server: ImportValidationError[],
): ImportValidationError[] {
  const byKey = new Map<string, ImportValidationError>();
  for (const err of client) {
    byKey.set(errorKey(err.sourceRow, err.field), err);
  }
  for (const err of server) {
    byKey.set(errorKey(err.sourceRow, err.field), err);
  }
  return Array.from(byKey.values()).sort((a, b) => {
    if (a.sourceRow !== b.sourceRow) return a.sourceRow - b.sourceRow;
    return a.field.localeCompare(b.field);
  });
}
