import type { StudentPaymentAdminReportRow } from "@/components/finances/student-payments-report";
import { UserPaymentStatus } from "@/types/finance";

export function isSyntheticPaymentRow(row: { id: number | string }): boolean {
  return String(row.id).includes("new");
}

export function isDroppedEnrollmentRow(row: StudentPaymentAdminReportRow): boolean {
  return row.is_removed === true;
}

export function isExemptPaymentExpectationRow(
  row: StudentPaymentAdminReportRow,
): boolean {
  return isDroppedEnrollmentRow(row);
}

/**
 * Rows the shared-course note can be built from. `user-payments/search` rows
 * carry far less than an admin-report row, so accept either.
 */
export type SharedCourseNoteRow =
  | StudentPaymentAdminReportRow
  | {
      id: number | string;
      kind?: "payment" | "group";
      group_kind?: "split_screenshots" | "multi_course" | null;
      courses?: { id: number; title: string }[];
      shared_screenshot_courses?: { id: number; title: string }[];
    };

export function isGroupPaymentRow(row: {
  id: number | string;
  kind?: "payment" | "group";
}): boolean {
  return row.kind === "group" || String(row.id).startsWith("group-");
}

export type PaymentRowFlatKind = "standalone" | "group_parent" | "group_part";

/** Whether the Receipt action should appear for this row (not auth/status). */
export function canShowPaymentReceiptAction(
  row: { id: number | string },
  flatKind?: PaymentRowFlatKind,
): boolean {
  if (isSyntheticPaymentRow(row)) return false;
  if (flatKind === "group_part") return false;
  return true;
}

export function shouldFlattenMultiCourseGroup(
  row: StudentPaymentAdminReportRow,
): boolean {
  if (!isGroupPaymentRow(row) || row.group_kind !== "multi_course") {
    return false;
  }
  const parts = row.parts ?? [];
  if (parts.length === 0) return false;
  const courseIds = parts
    .map((part) => part.course?.id)
    .filter((id): id is number => id != null);
  if (courseIds.length !== parts.length) return false;
  return new Set(courseIds).size === courseIds.length;
}

export function sharedScreenshotCourseTitles(
  row: SharedCourseNoteRow,
): string[] {
  return (row.shared_screenshot_courses ?? [])
    .map((course) => course.title?.trim())
    .filter((title): title is string => Boolean(title));
}

function groupOwnCourseTitles(row: SharedCourseNoteRow): string[] {
  return (row.courses ?? [])
    .map((course) => course.title?.trim())
    .filter((title): title is string => Boolean(title));
}

const LONG_COURSE_TITLE_LEN = 28;

export function truncateCourseTitle(
  title: string,
  maxLen = LONG_COURSE_TITLE_LEN,
): string {
  if (title.length <= maxLen) return title;
  return `${title.slice(0, maxLen - 1)}…`;
}

function formatNamedCourseList(titles: string[], maxVisible = 2): string {
  if (titles.length === 0) return "";
  if (titles.length === 1) {
    return truncateCourseTitle(titles[0]);
  }
  const hasLongTitle = titles.some((title) => title.length > LONG_COURSE_TITLE_LEN);
  if (hasLongTitle) {
    return `${titles.length} courses`;
  }
  const visible = titles.slice(0, maxVisible).map((title) => truncateCourseTitle(title));
  const remainder = titles.length - visible.length;
  if (remainder <= 0) {
    return visible.join(", ");
  }
  return `${visible.join(", ")} +${remainder} more`;
}

function resolveSharedCourseNote(
  row: SharedCourseNoteRow,
): { prefix: "same_transaction" | "covers"; titles: string[] } | null {
  const siblingTitles = sharedScreenshotCourseTitles(row);
  if (siblingTitles.length > 0) {
    return { prefix: "same_transaction", titles: siblingTitles };
  }
  if (isGroupPaymentRow(row) && row.group_kind === "multi_course") {
    const ownTitles = groupOwnCourseTitles(row);
    if (ownTitles.length > 1) {
      return { prefix: "covers", titles: ownTitles };
    }
  }
  return null;
}

export function sharedScreenshotNote(
  row: SharedCourseNoteRow,
): string | null {
  const resolved = resolveSharedCourseNote(row);
  if (!resolved) return null;
  const names = formatNamedCourseList(resolved.titles);
  if (!names) return null;
  if (resolved.prefix === "covers") {
    return `Covers ${names}`;
  }
  return `Same transaction also paid ${names}`;
}

export function sharedScreenshotNoteTitles(
  row: SharedCourseNoteRow,
): string | null {
  const resolved = resolveSharedCourseNote(row);
  if (!resolved || resolved.titles.length === 0) return null;
  return resolved.titles.join(", ");
}

export function sharedTransactionLookupId(
  row: StudentPaymentAdminReportRow | { transaction_id?: string | null },
): string | null {
  const transactionId = row.transaction_id?.trim();
  return transactionId || null;
}

export function syntheticAllowsInlineCreate(
  row: StudentPaymentAdminReportRow,
): boolean {
  return isSyntheticPaymentRow(row) && !isExemptPaymentExpectationRow(row);
}

export function getPaymentPartCount(row: StudentPaymentAdminReportRow): number {
  return row.part_count ?? row.parts?.length ?? 0;
}

export function getPaymentScreenshotUrl(
  row: StudentPaymentAdminReportRow,
): string | null {
  if (row.screenshot) return row.screenshot;
  return row.parts?.find((part) => Boolean(part.screenshot))?.screenshot ?? null;
}

/** Numeric UserPayment id for API calls (excludes synthetic and group parent rows). */
export function resolveUserPaymentId(
  row: StudentPaymentAdminReportRow,
): number | null {
  return typeof row.id === "number" ? row.id : null;
}

export function formatTransactionCount(count: number): string {
  return `${count} transaction${count === 1 ? "" : "s"}`;
}

export type PaymentEditableField =
  | "transaction_id"
  | "description"
  | "remarks"
  | "parsed_amount"
  | "date_on_screenshot";

const TEXT_FIELDS = new Set<PaymentEditableField>([
  "transaction_id",
  "description",
  "remarks",
  "date_on_screenshot",
]);

const GROUP_PART_OWNED_FIELDS = new Set<PaymentEditableField>([
  "parsed_amount",
  "transaction_id",
  "date_on_screenshot",
  "description",
  "remarks",
]);

export function isPaymentFieldEditable(
  row: StudentPaymentAdminReportRow,
  field: string,
): boolean {
  if (isExemptPaymentExpectationRow(row)) return false;

  if (field === "payment_date" && isGroupPaymentRow(row)) return false;

  if (
    isGroupPaymentRow(row) &&
    GROUP_PART_OWNED_FIELDS.has(field as PaymentEditableField)
  ) {
    return false;
  }

  if (field === "parsed_amount") {
    return row.status !== UserPaymentStatus.verified;
  }

  if (field === "date_on_screenshot") {
    return row.status !== UserPaymentStatus.verified;
  }

  if (TEXT_FIELDS.has(field as PaymentEditableField)) {
    return true;
  }

  if (field === "payment_date") {
    return true;
  }

  return false;
}

export function paymentRowMissingScreenshot(
  row: StudentPaymentAdminReportRow,
): boolean {
  if (isGroupPaymentRow(row)) return false;
  if (isSyntheticPaymentRow(row)) return false;
  return !getPaymentScreenshotUrl(row);
}

export function paymentFieldDisplayValue(
  row: StudentPaymentAdminReportRow,
  field: string,
): string {
  switch (field) {
    case "transaction_id":
      return row.transaction_id ?? "";
    case "description":
      return row.description ?? "";
    case "remarks":
      return row.remarks ?? "";
    case "parsed_amount":
      return row.parsed_amount
        ? parseFloat(String(row.parsed_amount)).toString()
        : "";
    case "date_on_screenshot":
      return row.date_on_screenshot ?? "";
    case "payment_date":
      return row.payment_date ?? "";
    case "status":
      return row.status;
    case "payment_method":
      return row.payment_method?.id != null
        ? String(row.payment_method.id)
        : "";
    case "user__name":
      return row.user?.name ?? "";
    case "course":
      return row.course?.title ?? "";
    case "created_by":
      return row.microsoft_submission_id
        ? "SuConnect"
        : (row.created_by?.name ?? "");
    case "billing_start_date":
      return row.billing_start_date ?? "";
    case "payment_method__name":
      return row.payment_method?.name ?? "";
    default:
      return "";
  }
}

export function paymentFieldApiPayload(
  field: string,
  value: string,
): Record<string, unknown> {
  if (field === "parsed_amount") {
    return { parsed_amount: value === "" ? null : value };
  }
  if (field === "payment_method") {
    return { payment_method: value === "" ? null : value };
  }
  if (field === "payment_date") {
    return { payment_date: value === "" ? null : value };
  }
  return { [field]: value === "" ? null : value };
}

export function resolveGroupPaymentDateDisplay(
  row: StudentPaymentAdminReportRow,
): string {
  if (isGroupPaymentRow(row)) {
    const parts = row.parts ?? [];
    let best: string | null = null;
    let bestMs = Infinity;
    for (const part of parts) {
      const raw = part.payment_date ?? part.created_at;
      if (!raw) continue;
      const ms = new Date(raw).getTime();
      if (Number.isFinite(ms) && ms < bestMs) {
        bestMs = ms;
        best = raw;
      }
    }
    return best ?? row.payment_date ?? "";
  }
  return row.payment_date ?? "";
}
