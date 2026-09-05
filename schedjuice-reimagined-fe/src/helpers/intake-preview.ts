import type { IntakePreviewCourseRow } from "@/types/intake";

export type GroupedPreview = {
  levelId?: number;
  levelName?: string;
  subjectLabels?: string[];
  rows: IntakePreviewCourseRow[];
};

export function groupPreviewRows(
  rows: IntakePreviewCourseRow[],
  levelsById: Record<number, string>,
  subjectLabelsByLevel: Record<number, string[]>,
): GroupedPreview[] {
  const flat: GroupedPreview[] = [];
  const byLevel = new Map<number | "flat", IntakePreviewCourseRow[]>();

  for (const row of rows) {
    const key = row.level_id ?? ("flat" as const);
    if (!byLevel.has(key)) byLevel.set(key, []);
    byLevel.get(key)!.push(row);
  }

  for (const [key, groupRows] of Array.from(byLevel.entries())) {
    if (key === "flat") {
      flat.push({ rows: groupRows });
      continue;
    }
    flat.push({
      levelId: key,
      levelName: levelsById[key] ?? `Level ${key}`,
      subjectLabels: subjectLabelsByLevel[key] ?? [],
      rows: groupRows,
    });
  }

  return flat.sort((a, b) => {
    if (a.levelId == null) return 1;
    if (b.levelId == null) return -1;
    return a.levelId - b.levelId;
  });
}

export function getSubjectLabelsForRow(
  row: IntakePreviewCourseRow,
  subjectsById: Record<number, string>,
  levelSubjectOverrides?: Record<number, number[]>,
): string[] {
  if (row.subject_id != null) {
    const label =
      row.subject_name?.trim() ||
      subjectsById[row.subject_id] ||
      `Subject #${row.subject_id}`;
    return [label];
  }
  if (row.level_id != null) {
    const ids = levelSubjectOverrides?.[row.level_id] ?? [];
    return ids.map((id) => subjectsById[id] ?? `Subject #${id}`);
  }
  return [];
}

export function getDefaultPaymentPlanId(
  paymentPlanId?: number,
  defaultPaymentPlanId?: number,
): number | undefined {
  return defaultPaymentPlanId ?? paymentPlanId;
}

export function getEffectivePaymentPlanId(
  rowKey: string,
  defaultPaymentPlanId: number | undefined,
  paymentPlanOverrides?: Record<string, number>,
): number | undefined {
  if (paymentPlanOverrides && rowKey in paymentPlanOverrides) {
    return paymentPlanOverrides[rowKey];
  }
  return defaultPaymentPlanId;
}

export function rowHasCustomPaymentPlan(
  rowKey: string,
  paymentPlanOverrides?: Record<string, number>,
): boolean {
  return Boolean(paymentPlanOverrides && rowKey in paymentPlanOverrides);
}
