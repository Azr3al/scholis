import type { StudentPaymentAdminReportRow } from "@/components/finances/student-payments-report";
import { getCalendarMonthUtcFilterBounds } from "@/helpers/date";
import { isPaymentMembershipScoped } from "@/helpers/authorization";
import { isValidApiEntityIdParam } from "@/helpers/relation-fk";
import { isGroupPaymentRow } from "@/lib/data-sheets/payment-row-utils";
import { filterParamsBody, operatorEnum } from "@/types/api";
import { UserPaymentStatus } from "@/types/finance";
import { TransactionScreenshotStrategy } from "@/types/organization";
import type { accountType } from "@/types/user";

function parseVerifiedAmount(value: string | null | undefined): number {
  const n = parseFloat(String(value ?? ""));
  return Number.isNaN(n) ? 0 : n;
}

export type StudentDetailScope = {
  courseId: string;
  monthDate: Date;
  /** When user_upload strategy, month filter uses billing_start_date. */
  useBillingStartDate?: boolean;
};

export function buildStudentDetailFilterParams(
  u: accountType | undefined,
  studentUserId: string,
  scope?: StudentDetailScope | null,
): filterParamsBody {
  const f: filterParamsBody = { filter_params: [] };
  if (!u || !studentUserId.trim()) return f;
  if (
    !scope?.courseId ||
    !isValidApiEntityIdParam(String(scope.courseId)) ||
    !(scope.monthDate instanceof Date) ||
    Number.isNaN(scope.monthDate.getTime())
  ) {
    return f;
  }
  if (isPaymentMembershipScoped(u)) {
    f.filter_params?.push({
      field_name: "course__user_courses__user_id",
      operator: operatorEnum.exact,
      value: String(u.id),
    });
  }
  f.filter_params?.push({
    field_name: "course_id",
    operator: operatorEnum.exact,
    value: String(Math.trunc(Number(scope.courseId))),
  });
  const fieldName = scope.useBillingStartDate
    ? "billing_start_date"
    : "issued_at";
  const bounds = getCalendarMonthUtcFilterBounds(scope.monthDate);
  f.filter_params?.push(
    {
      field_name: fieldName,
      operator: operatorEnum.gte,
      value: bounds.start.toISOString(),
    },
    {
      field_name: fieldName,
      operator: operatorEnum.lte,
      value: bounds.end.toISOString(),
    },
  );
  f.filter_params?.push({
    field_name: "user_id",
    operator: operatorEnum.exact,
    value: studentUserId,
  });
  return f;
}

export function sortStudentPaymentDetailRows(
  rows: StudentPaymentAdminReportRow[],
): StudentPaymentAdminReportRow[] {
  return [...rows].sort((a, b) => {
    const ta = a.billing_start_date
      ? new Date(a.billing_start_date).getTime()
      : Number.NEGATIVE_INFINITY;
    const tb = b.billing_start_date
      ? new Date(b.billing_start_date).getTime()
      : Number.NEGATIVE_INFINITY;
    if (ta !== tb) return tb - ta;
    return String(b.id).localeCompare(String(a.id));
  });
}

type StudentPaymentsSummary = {
  count: number;
  verifiedCount: number;
  totalVerifiedAmount: number;
};

export function summarizeStudentPayments(
  rows: StudentPaymentAdminReportRow[],
): StudentPaymentsSummary {
  let verifiedCount = 0;
  let totalVerifiedAmount = 0;

  for (const r of rows) {
    if (isGroupPaymentRow(r)) {
      const parts = r.parts ?? [];
      if (parts.length > 0) {
        for (const part of parts) {
          if (part.status === UserPaymentStatus.verified) {
            totalVerifiedAmount += parseVerifiedAmount(part.parsed_amount);
          }
        }
      } else if (r.status === UserPaymentStatus.verified) {
        totalVerifiedAmount += parseVerifiedAmount(r.parsed_amount);
      }

      if (r.status === UserPaymentStatus.verified) {
        verifiedCount++;
      }
      continue;
    }

    if (r.status === UserPaymentStatus.verified) {
      verifiedCount++;
      totalVerifiedAmount += parseVerifiedAmount(r.parsed_amount);
    }
  }

  return { count: rows.length, verifiedCount, totalVerifiedAmount };
}

export function studentDetailUsesBillingStartDate(
  strategy: string | null | undefined,
): boolean {
  return strategy === TransactionScreenshotStrategy.user_upload;
}
