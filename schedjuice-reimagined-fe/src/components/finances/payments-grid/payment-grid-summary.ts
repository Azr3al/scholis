"use client";

import type { ReactNode } from "react";

import type { StudentPaymentsAdminReportSummary } from "@/components/finances/student-payments-report";
import type { StudentPaymentAdminReportRow } from "@/components/finances/student-payments-report";
import { formatMoney } from "@/helpers/money";
import { UserPaymentStatus } from "@/types/finance";

function distinctNonDroppedStudentIdsFromRows(
  rows: StudentPaymentAdminReportRow[],
): number {
  const ids = new Set<number>();
  for (const r of rows) {
    if (r.is_removed === true) continue;
    const uid = r.user?.id;
    if (uid != null) ids.add(uid);
  }
  return ids.size;
}

export type PaymentSummaryStats = {
  verifiedTotal: string;
  unuploaded: number;
  uploaded: number;
  verifiedCount: number;
  droppedCount: number;
  activeStudents: number;
};

export function computePaymentSummaryStats(
  rows: StudentPaymentAdminReportRow[],
  apiSummary: StudentPaymentsAdminReportSummary | null | undefined,
  currencySymbol: string,
  fixedCourseId?: string,
): PaymentSummaryStats {
  const exemptFromUnuploaded = (r: StudentPaymentAdminReportRow) =>
    r.is_removed === true;

  const verifiedTotal =
    apiSummary && typeof apiSummary.verified_total === "string"
      ? formatMoney(apiSummary.verified_total, currencySymbol)
      : formatMoney(
          rows
            .filter((r) => r.status === UserPaymentStatus.verified)
            .reduce(
              (acc, row) =>
                acc + parseFloat(String(row.parsed_amount || "0")),
              0,
            ),
          currencySymbol,
        );

  const unuploaded =
    apiSummary && typeof apiSummary.unuploaded_count === "number"
      ? apiSummary.unuploaded_count
      : rows.filter(
          (r) =>
            r.status === UserPaymentStatus.pending_payment &&
            !exemptFromUnuploaded(r),
        ).length;

  const uploaded =
    apiSummary && typeof apiSummary.uploaded_count === "number"
      ? apiSummary.uploaded_count
      : rows.length - unuploaded;

  const verifiedCount =
    apiSummary && typeof apiSummary.verified_count === "number"
      ? apiSummary.verified_count
      : rows.filter((r) => r.status === UserPaymentStatus.verified).length;

  const droppedCount =
    apiSummary && typeof apiSummary.removed_count === "number"
      ? apiSummary.removed_count
      : rows.filter((r) => r.is_removed === true).length;

  const activeStudents =
    apiSummary && typeof apiSummary.active_student_row_count === "number"
      ? apiSummary.active_student_row_count
      : distinctNonDroppedStudentIdsFromRows(rows);

  void fixedCourseId;

  return {
    verifiedTotal,
    unuploaded,
    uploaded,
    verifiedCount,
    droppedCount,
    activeStudents,
  };
}

export function buildPaymentSummaryLine(
  rows: StudentPaymentAdminReportRow[],
  apiSummary: StudentPaymentsAdminReportSummary | null | undefined,
  currencySymbol: string,
  fixedCourseId?: string,
  monthApplicable = true,
): ReactNode {
  if (!monthApplicable) {
    return "Month not applicable for this course";
  }

  const stats = computePaymentSummaryStats(
    rows,
    apiSummary,
    currencySymbol,
    fixedCourseId,
  );

  const parts = [
    `${rows.length} rows`,
    `Verified ${stats.verifiedTotal}`,
    `${stats.unuploaded} unuploaded`,
    `${stats.verifiedCount} verified`,
  ];

  if (fixedCourseId) {
    parts.push(`${stats.activeStudents} active students`);
  } else {
    parts.push(`${stats.activeStudents} students`);
  }

  return parts.join(" · ");
}

export function buildRecentTransactionsSummary(
  rows: StudentPaymentAdminReportRow[],
  totalCount?: number,
): ReactNode {
  if (totalCount != null) {
    return `${totalCount} transactions`;
  }
  const students = new Set<number>();
  for (const r of rows) {
    if (r.user?.id != null) students.add(r.user.id);
  }
  return `${rows.length} transactions · ${students.size} students`;
}
