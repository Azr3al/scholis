import { earliestCoverageMonth } from "@/helpers/payment-coverage-months";
import type { UserPayment } from "@/sdk";

export type RecentTxnRowDrawerContext = {
  studentId: string;
  courseId: string;
  monthDate: Date;
  courseTitle: string | null;
};

function monthAnchorFromIsoDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), 1);
}

function resolveDrawerMonthAnchor(row: UserPayment): Date {
  const coverage = earliestCoverageMonth(row);
  if (coverage) {
    return new Date(coverage.year, coverage.month_index - 1, 1);
  }
  return (
    monthAnchorFromIsoDate(row.billing_start_date ?? null) ??
    monthAnchorFromIsoDate(row.payment_date ?? null) ??
    new Date()
  );
}

export function parseRecentTxnRowDrawerContext(
  row: UserPayment,
): RecentTxnRowDrawerContext | null {
  const uid = row.user?.id;
  if (uid == null) return null;
  const cid = row.course?.id;
  return {
    studentId: String(uid),
    courseId: cid != null ? String(cid) : "",
    monthDate: resolveDrawerMonthAnchor(row),
    courseTitle: row.course?.title ?? null,
  };
}
