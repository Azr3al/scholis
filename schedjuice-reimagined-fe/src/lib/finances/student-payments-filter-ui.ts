export const STUDENT_PAYMENT_GLIDE_TXN_ID_WIDTH = 280;
export const STUDENT_PAYMENT_GLIDE_DESCRIPTION_WIDTH = 320;

type StudentPaymentsMonthSelectorOpts = {
  globalTransactionLookup: boolean;
  /** When false (recent-transactions grid), hide. Defaults to true for report shell. */
  isReport?: boolean;
};

/**
 * Month selector is shown for report views (finance + course), hidden for
 * global transaction lookup and non-report (recent) grids.
 * Course scope (`fixedCourseId`) must NOT hide the selector.
 */
export function shouldShowStudentPaymentsMonthSelector(
  opts: StudentPaymentsMonthSelectorOpts,
): boolean {
  if (opts.globalTransactionLookup) return false;
  if (opts.isReport === false) return false;
  return true;
}

type EditablePaymentFieldName = "transaction_id" | "description" | "remarks";

export function paymentEditableFieldInputClassName(
  field: EditablePaymentFieldName,
): string {
  const minW = field === "transaction_id" ? "min-w-[18rem]" : "min-w-[20rem]";
  return `h-8 ${minW} flex-1 text-left text-sm`;
}
