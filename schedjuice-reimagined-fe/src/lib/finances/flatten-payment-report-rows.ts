import type { StudentPaymentAdminReportRow } from "@/components/finances/student-payments-report";
import {
  isGroupPaymentRow,
  shouldFlattenMultiCourseGroup,
} from "@/lib/data-sheets/payment-row-utils";

export type FlattenedPaymentRow = {
  kind: "standalone" | "group_parent" | "group_part";
  row: StudentPaymentAdminReportRow;
  parentGroupId: number | null;
  partIndex: number | null;
};

export function resolveGroupId(row: StudentPaymentAdminReportRow): number | null {
  if (row.group_id != null) return Number(row.group_id);
  const m = String(row.id).match(/^group-(\d+)$/);
  return m ? Number(m[1]) : null;
}

export function flattenPaymentReportRows(
  rows: StudentPaymentAdminReportRow[],
  expandedGroupIds: ReadonlySet<number>,
): FlattenedPaymentRow[] {
  const out: FlattenedPaymentRow[] = [];
  for (const row of rows) {
    if (!isGroupPaymentRow(row)) {
      out.push({
        kind: "standalone",
        row,
        parentGroupId: null,
        partIndex: null,
      });
      continue;
    }
    if (shouldFlattenMultiCourseGroup(row)) {
      for (const part of row.parts ?? []) {
        out.push({
          kind: "standalone",
          row: part,
          parentGroupId: null,
          partIndex: null,
        });
      }
      continue;
    }
    const gid = resolveGroupId(row);
    out.push({
      kind: "group_parent",
      row,
      parentGroupId: gid,
      partIndex: null,
    });
    if (gid == null || !expandedGroupIds.has(gid)) continue;
    const parts = row.parts ?? [];
    parts.forEach((part, index) => {
      out.push({
        kind: "group_part",
        row: part,
        parentGroupId: gid,
        partIndex: index,
      });
    });
  }
  return out;
}
