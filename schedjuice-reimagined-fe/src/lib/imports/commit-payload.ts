import type { CommitRow, ImportFieldDef } from "@/app/client-api/imports";
import { normalizeCell } from "@/lib/imports/normalize-cell";
import {
  type CellResolution,
  type DuplicateEmailResolution,
  type DuplicateEmailStrategy,
  cellKey,
} from "@/lib/imports/resolution";

const IDENTITY_KEYS = new Set(["email", "name", "phone_number", "communication_email"]);

function buildRowPayload(input: {
  row: (string | number | null)[];
  colByField: Map<string, number>;
  fields: ImportFieldDef[];
  fieldByKey: Map<string, ImportFieldDef>;
  fieldDefaults: Record<string, string>;
}): Omit<CommitRow, "course_ids"> {
  const { row, colByField, fields, fieldByKey, fieldDefaults } = input;
  const customData: Record<string, unknown> = {};
  const out: Omit<CommitRow, "course_ids"> = { email: "", custom_data: customData };

  for (const field of fields) {
    if (field.special === "course") continue;
    const def = fieldByKey.get(field.field_key);
    const col = colByField.get(field.field_key);
    const raw = col != null ? row[col] : undefined;
    let value = raw == null ? "" : String(raw).trim();
    if (value === "" && field.field_key in fieldDefaults) {
      value = fieldDefaults[field.field_key];
    }
    if (value === "") continue;
    const normalized = def ? normalizeCell(value, def).value : value;

    if (IDENTITY_KEYS.has(field.field_key)) {
      (out as unknown as Record<string, string>)[field.field_key] = normalized;
    } else if (field.source === "custom") {
      customData[field.field_key] = normalized;
    } else {
      (out as unknown as Record<string, string>)[field.field_key] = normalized;
    }
  }

  return out;
}

function isBlankCommitValue(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

function mergeRowPayloads(
  payloads: Omit<CommitRow, "course_ids">[],
): Omit<CommitRow, "course_ids"> {
  const mergedCustomData: Record<string, unknown> = {};
  const merged: Omit<CommitRow, "course_ids"> = {
    email: "",
    custom_data: mergedCustomData,
  };

  for (const payload of payloads) {
    for (const [key, value] of Object.entries(payload)) {
      if (key === "custom_data") continue;
      if (isBlankCommitValue((merged as Record<string, unknown>)[key])) {
        (merged as Record<string, unknown>)[key] = value;
      }
    }
    for (const [key, value] of Object.entries(payload.custom_data)) {
      if (isBlankCommitValue(mergedCustomData[key])) {
        mergedCustomData[key] = value;
      }
    }
  }

  return merged;
}

function findMergeGroupIndices(
  rowIndex: number,
  duplicateResolution: DuplicateEmailResolution,
): number[] | null {
  for (const [email, indices] of Array.from(duplicateResolution.duplicateGroups)) {
    if (duplicateResolution.keptRowByEmail.get(email) === rowIndex) {
      return [...indices].sort((a, b) => a - b);
    }
  }
  return null;
}

/** commitIndex → sourceRowIndex (index into parse.rows). */
export function buildCommitRowIndexMap(input: {
  rows: (string | number | null)[][];
  duplicateResolution?: DuplicateEmailResolution;
}): number[] {
  const { rows, duplicateResolution } = input;
  const skippedRows = duplicateResolution?.skippedRowIndices ?? new Set<number>();
  const map: number[] = [];
  rows.forEach((_, rowIndex) => {
    if (!skippedRows.has(rowIndex)) map.push(rowIndex);
  });
  return map;
}

export function buildCommitRows(input: {
  rows: (string | number | null)[][];
  rowIds: string[];
  mapping: Record<number, string | null>;
  fields: ImportFieldDef[];
  fieldDefaults: Record<string, string>;
  resolution: Map<string, CellResolution>;
  duplicateResolution?: DuplicateEmailResolution;
  duplicateStrategy?: DuplicateEmailStrategy;
}): CommitRow[] {
  const {
    rows,
    rowIds,
    mapping,
    fields,
    fieldDefaults,
    resolution,
    duplicateResolution,
    duplicateStrategy = "keep_first",
  } = input;
  const fieldByKey = new Map(fields.map((f) => [f.field_key, f]));
  const colByField = new Map<string, number>();
  Object.entries(mapping).forEach(([idx, key]) => {
    if (key) colByField.set(key, Number(idx));
  });

  const skippedRows = duplicateResolution?.skippedRowIndices ?? new Set<number>();
  const payloadInput = { colByField, fields, fieldByKey, fieldDefaults };

  return rows.flatMap((row, rowIndex) => {
    if (skippedRows.has(rowIndex)) return [];

    let payload = buildRowPayload({ row, ...payloadInput });

    if (duplicateStrategy === "merge" && duplicateResolution) {
      const groupIndices = findMergeGroupIndices(rowIndex, duplicateResolution);
      if (groupIndices) {
        const payloads = groupIndices.map((idx) =>
          buildRowPayload({ row: rows[idx], ...payloadInput }),
        );
        payload = mergeRowPayloads(payloads);
      }
    }

    const out: CommitRow = { ...payload, course_ids: [] };

    const userMatch = resolution.get(cellKey(rowIds[rowIndex], "email"));
    if (userMatch?.status === "confirmed" && userMatch.confirmedUserId) {
      out.match_user_id = userMatch.confirmedUserId;
    }

    const courseIds = new Set<number>();
    const coursesRes = resolution.get(cellKey(rowIds[rowIndex], "courses"));
    coursesRes?.tokens
      ?.filter((t) => t.status === "linked" && t.match)
      .forEach((t) => courseIds.add(t.match!.id));
    duplicateResolution?.mergedCourseIdsByRow.get(rowIndex)?.forEach((id) => {
      courseIds.add(id);
    });
    out.course_ids = Array.from(courseIds);

    return [out];
  });
}
