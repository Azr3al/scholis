import { paymentFieldDisplayValue } from "@/lib/data-sheets/payment-row-utils";
import type { StudentPaymentAdminReportRow } from "@/components/finances/student-payments-report";

export type PaymentCopyStudentSlot = {
  userId: number | null;
  name: string;
  email: string;
};

export function paymentAmountValuesForCopy(
  pageRows: Array<
    Pick<StudentPaymentAdminReportRow, "parsed_amount"> & { __flatKind?: string }
  >,
): string[] {
  const values: string[] = [];
  for (const row of pageRows) {
    if (row.__flatKind === "group_part") continue;
    values.push(paymentFieldDisplayValue(row as StudentPaymentAdminReportRow, "parsed_amount"));
  }
  return values;
}

export function paymentStudentSlotsForCopy(
  pageRows: Array<{
    user?: { id?: number; name?: string; email?: string } | null;
    __flatKind?: string;
  }>,
): PaymentCopyStudentSlot[] {
  const slots: PaymentCopyStudentSlot[] = [];
  for (const row of pageRows) {
    if (row.__flatKind === "group_part") continue;
    slots.push({
      userId: row.user?.id ?? null,
      name: row.user?.name ?? "",
      email: row.user?.email ?? "",
    });
  }
  return slots;
}
