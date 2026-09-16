import { formatInTimeZone } from "date-fns-tz";
import { formatDate } from "@/helpers/date";
import { formatMoney } from "@/helpers/money";
import {
  describeInstallmentCoverageDisplay,
  formatMonthLong,
} from "@/helpers/payment-coverage-months";
import type { organizationType } from "@/types/organization";
import { UserPaymentStatus } from "@/types/finance";

export type ReceiptDownloadErrorCode =
  | "group_not_fully_verified"
  | "download_failed";

export class ReceiptDownloadError extends Error {
  readonly code: ReceiptDownloadErrorCode;

  constructor(code: ReceiptDownloadErrorCode) {
    super(code);
    this.name = "ReceiptDownloadError";
    this.code = code;
  }
}

export function receiptDownloadErrorMessage(code: ReceiptDownloadErrorCode): {
  title: string;
  description: string;
} {
  if (code === "group_not_fully_verified") {
    return {
      title: "Could not generate receipt",
      description: "This group payment is not fully verified yet.",
    };
  }
  return {
    title: "Could not generate receipt",
    description: "Please try again.",
  };
}

export function notifyReceiptDownloadError(
  toast: { add: (opts: { type: "error"; title: string; description: string }) => void },
  err: unknown,
): void {
  if (err instanceof ReceiptDownloadError) {
    const { title, description } = receiptDownloadErrorMessage(err.code);
    toast.add({ type: "error", title, description });
    return;
  }
  const { title, description } = receiptDownloadErrorMessage("download_failed");
  toast.add({ type: "error", title, description });
}

export type PaymentReceiptTenant = Pick<
  organizationType,
  "name" | "logo" | "timezone"
>;

export function resolveReceiptTimezone(
  timezone?: string | null,
): string {
  const tz = timezone?.trim();
  return tz || "UTC";
}

export function formatReceiptDateTime(
  isoOrDate: string | Date,
  timezone: string,
): string {
  const date =
    typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  return formatInTimeZone(
    date,
    resolveReceiptTimezone(timezone),
    "MMM d, yyyy, h:mm a zzz",
  );
}

export function formatReceiptDate(
  isoOrDate: string | Date,
  timezone: string,
): string {
  const date =
    typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  return formatInTimeZone(
    date,
    resolveReceiptTimezone(timezone),
    "MMM d, yyyy",
  );
}

const DEFAULT_LOGO_TIMEOUT_MS = 2500;

export async function resolveLogoForPdf(
  url: string | null | undefined,
  timeoutMs: number = DEFAULT_LOGO_TIMEOUT_MS,
): Promise<string | null> {
  const trimmed = url?.trim();
  if (!trimmed) return null;

  return await new Promise((resolve) => {
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };

    const timer = setTimeout(() => finish(null), timeoutMs);
    const img = new Image();
    img.onload = () => finish(trimmed);
    img.onerror = () => finish(null);
    img.src = trimmed;
  });
}

export type PaymentReceiptRowInput = {
  id: number | string;
  user?: { name?: string | null } | null;
  course?: { id?: number | null; title?: string | null } | null;
  group_kind?: "split_screenshots" | "multi_course" | null;
  courses?: { id: number; title: string }[];
  transaction_id?: string | null;
  parsed_amount?: string | number | null;
  base_amount?: string | number | null;
  discount_amount?: string | number | null;
  invoiced_amount?: string | number | null;
  actual_amount?: string | number | null;
  discount_label?: string | null;
  discount_lines?: Array<{
    label?: string | null;
    amount?: string | number | null;
  }> | null;
  payment_method?: { name?: string | null } | null;
  billing_start_date?: string | null;
  billing_end_date?: string | null;
  issued_at?: string | null;
  payment_date?: string | null;
  created_at?: string | null;
  covered_months?: { year: number; month_index: number }[];
  is_installment?: boolean;
  installment_cumulative_percent?: string | null;
  installment_covered_through?: { year: number; month_index: number } | null;
  remarks?: string | null;
  kind?: "payment" | "group";
  group_id?: number | null;
  parts?: PaymentReceiptRowInput[];
  status?: string | null;
  created_by?: {
    name?: string | null;
    id?: number | null;
    user_signature_url?: string | null;
  } | null;
  verified_by?: {
    name?: string | null;
    id?: number | null;
    user_signature_url?: string | null;
  } | null;
  payment_sequence?: number | null;
  term_total?: string | number | null;
  paid_to_date?: string | number | null;
  total_refunded?: string | number | null;
  total_refunded_to_date?: string | number | null;
  is_amount_overridden?: boolean | null;
  computed_invoiced_amount?: string | number | null;
  receipt_number?: number | null;
};

export type PaymentReceiptPartLine = {
  label: string;
  transactionId: string;
  amountPaid: string;
};

export type PaymentReceiptCourseLine = {
  courseTitle: string;
  discountLines: string[];
  baseAmount: string | null;
  invoicedAmount: string | null;
  amountPaid: string;
};

export type PaymentReceiptPayload = {
  orgName: string;
  orgLogoUrl: string | null;
  receiptNumber: string;
  receiptDate: string;
  studentName: string;
  courseTitle: string;
  baseAmount: string | null;
  discountLine: string | null;
  /** Per-discount lines when the payment has more than one stacked discount. */
  discountLines: string[] | null;
  invoicedAmount: string | null;
  refundLine: string | null;
  amountPaid: string;
  transactionId: string;
  paymentMethod: string;
  billingPeriod: string;
  installmentNote: string | null;
  remarks: string | null;
  parts: PaymentReceiptPartLine[] | null;
  courseLines: PaymentReceiptCourseLine[] | null;
  generatedAt: string;
  downloadedBy: string;
  createdBy: string | null;
  verifiedBy: string | null;
  authorizedSignatureUrl: string | null;
  authorizedSignatureName: string | null;
  paymentSequence: number | null;
  monthsCoveredCount: number | null;
  termProgress: string | null;
  adjustedNote: string | null;
};

function hasAmountValue(value: string | number | null | undefined): boolean {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function normalizeAmountKey(value: string | number): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value).trim();
  return String(n);
}

export function resolvePaymentReceiptPaidAmount(row: {
  actual_amount?: string | number | null;
  parsed_amount?: string | number | null;
  invoiced_amount?: string | number | null;
}): string | null {
  for (const v of [row.actual_amount, row.parsed_amount, row.invoiced_amount]) {
    if (hasAmountValue(v)) return String(v);
  }
  return null;
}

function parseRefundAmount(value: string | number | null | undefined): number {
  if (!hasAmountValue(value)) return 0;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function resolveReceiptRefundTotal(row: PaymentReceiptRowInput): number {
  if (hasAmountValue(row.total_refunded)) {
    return parseRefundAmount(row.total_refunded);
  }
  const parts = row.parts ?? [];
  if (parts.length === 0) return 0;
  return parts.reduce((sum, part) => sum + resolveReceiptRefundTotal(part), 0);
}

export function resolveNetReceiptPaidAmount(
  row: PaymentReceiptRowInput,
): string | null {
  const gross = resolvePaymentReceiptPaidAmount(row);
  if (gross == null) return null;
  const grossNum = Number(gross);
  if (!Number.isFinite(grossNum)) return gross;
  const refund = resolveReceiptRefundTotal(row);
  return String(Math.max(0, grossNum - refund));
}

function monthSortKey(m: { year: number; month_index: number }) {
  return m.year * 12 + m.month_index;
}

function areContiguousMonths(
  months: { year: number; month_index: number }[],
): boolean {
  if (months.length <= 1) return true;
  const sorted = [...months].sort((a, b) => monthSortKey(a) - monthSortKey(b));
  for (let i = 1; i < sorted.length; i++) {
    if (monthSortKey(sorted[i]!) !== monthSortKey(sorted[i - 1]!) + 1) {
      return false;
    }
  }
  return true;
}

export function resolvePaymentReceiptNumber(row: {
  id: number | string;
  receipt_number?: number | null;
}): string {
  // Never fall back to payment PK — that looks like a real receipt # (e.g. 183)
  // when admin-report rows are stale or omit receipt_number.
  return row.receipt_number != null ? String(row.receipt_number) : "—";
}

function resolveGroupReceiptNumber(
  groupRow: PaymentReceiptRowInput,
): string {
  return groupRow.receipt_number != null
    ? String(groupRow.receipt_number)
    : "—";
}

/**
 * A row whose receipt belongs to a payment group. Every caller must agree on
 * this, or a row can route to the group PDF while enrichment treats it as a
 * standalone payment and never fetches the group.
 */
export function isGroupReceiptRow(row: PaymentReceiptRowInput): boolean {
  return (
    row.kind === "group" ||
    row.group_id != null ||
    String(row.id).startsWith("group-")
  );
}

function unwrapPaymentEntityPayload(res: unknown): PaymentReceiptRowInput | null {
  const payload = res as {
    data?: { data?: PaymentReceiptRowInput } | PaymentReceiptRowInput;
  };
  const data = payload?.data;
  if (!data) return null;
  if (typeof data === "object" && "data" in data && data.data) {
    return data.data as PaymentReceiptRowInput;
  }
  return data as PaymentReceiptRowInput;
}

type NestedDisplayRef =
  | { name?: string | null; title?: string | null }
  | null
  | undefined;

function hasNestedDisplayRef(ref: NestedDisplayRef): boolean {
  if (ref == null || typeof ref !== "object") return false;
  const name = ref.name?.trim();
  const title = ref.title?.trim();
  return Boolean(name || title);
}

function preferNestedDisplayRef<T extends NestedDisplayRef>(
  rowRef: T,
  freshRef: T,
): T {
  return hasNestedDisplayRef(rowRef) ? rowRef : freshRef;
}

function pickReceiptEnrichmentFields(
  fresh: PaymentReceiptRowInput,
  { includeGroupFields = false }: { includeGroupFields?: boolean } = {},
): Partial<PaymentReceiptRowInput> {
  const keys: (keyof PaymentReceiptRowInput)[] = [
    "receipt_number",
    "total_refunded",
    "total_refunded_to_date",
    "paid_to_date",
    "term_total",
  ];
  if (includeGroupFields) {
    keys.push("parts", "status");
  }

  const picked: Partial<PaymentReceiptRowInput> = {};
  for (const key of keys) {
    const value = fresh[key];
    if (value !== undefined && value !== null) {
      (picked as Record<string, unknown>)[key] = value;
    }
  }
  return picked;
}

function mergeEnrichedPaymentReceiptRow(
  row: PaymentReceiptRowInput,
  fresh: PaymentReceiptRowInput,
  { isGroup }: { isGroup: boolean },
): PaymentReceiptRowInput {
  const merged: PaymentReceiptRowInput = {
    ...row,
    ...pickReceiptEnrichmentFields(fresh, { includeGroupFields: isGroup }),
    receipt_number: fresh.receipt_number ?? row.receipt_number,
    total_refunded: fresh.total_refunded ?? row.total_refunded,
    total_refunded_to_date:
      fresh.total_refunded_to_date ?? row.total_refunded_to_date,
    paid_to_date: fresh.paid_to_date ?? row.paid_to_date,
    term_total: fresh.term_total ?? row.term_total,
  };

  if (!isGroup) {
    return merged;
  }

  return {
    ...merged,
    parts: fresh.parts ?? row.parts,
    user: preferNestedDisplayRef(row.user, fresh.user),
    course: preferNestedDisplayRef(row.course, fresh.course),
    payment_method: preferNestedDisplayRef(row.payment_method, fresh.payment_method),
    created_by: preferNestedDisplayRef(row.created_by, fresh.created_by),
    verified_by: preferNestedDisplayRef(row.verified_by, fresh.verified_by),
  };
}

/**
 * Admin-report rows can be stale or omit `receipt_number`. Refetch the payment
 * (or group) so the PDF always uses the sequential receipt number from the DB.
 */
export async function enrichPaymentReceiptRow(
  row: PaymentReceiptRowInput,
): Promise<PaymentReceiptRowInput> {
  const { makeGetRequest } = await import("@/app/client-api/utils");

  if (isGroupReceiptRow(row)) {
    const gid =
      typeof row.group_id === "number"
        ? row.group_id
        : typeof row.id === "number"
          ? row.id
          : Number(String(row.group_id ?? row.id).replace(/^group-/, ""));
    if (!Number.isFinite(gid)) return row;
    try {
      const res = await makeGetRequest(`user-payment-groups/${gid}`);
      const fresh = unwrapPaymentEntityPayload(res);
      if (!fresh) return row;
      return mergeEnrichedPaymentReceiptRow(row, fresh, { isGroup: true });
    } catch {
      return row;
    }
  }

  if (typeof row.id !== "number") return row;
  try {
    const res = await makeGetRequest(`user-payments/${row.id}`);
    const fresh = unwrapPaymentEntityPayload(res);
    if (!fresh) return row;
    return mergeEnrichedPaymentReceiptRow(row, fresh, { isGroup: false });
  } catch {
    return row;
  }
}

export function buildPaymentReceiptFilename(row: {
  id: number | string;
  transaction_id?: string | null;
}): string {
  const tid = row.transaction_id?.trim();
  if (tid) return `receipt-${tid}.pdf`;
  return `receipt-payment-${row.id}.pdf`;
}

export function buildGroupPaymentReceiptFilename(
  groupId: number | string,
): string {
  return `receipt-group-${groupId}.pdf`;
}

export function formatPaymentReceiptBillingPeriod(
  row: Pick<
    PaymentReceiptRowInput,
    "covered_months" | "billing_start_date" | "billing_end_date" | "issued_at"
  >,
): string {
  if (row.covered_months && row.covered_months.length > 0) {
    const sorted = [...row.covered_months].sort(
      (a, b) => monthSortKey(a) - monthSortKey(b),
    );
    if (areContiguousMonths(sorted)) {
      const first = sorted[0]!;
      const last = sorted[sorted.length - 1]!;
      if (sorted.length === 1) {
        return formatMonthLong(first.year, first.month_index);
      }
      return `${formatMonthLong(first.year, first.month_index)} – ${formatMonthLong(last.year, last.month_index)}`;
    }
    return sorted.map((m) => formatMonthLong(m.year, m.month_index)).join(", ");
  }
  if (row.billing_start_date && row.billing_end_date) {
    return `${formatDate(row.billing_start_date)} – ${formatDate(row.billing_end_date)}`;
  }
  if (row.issued_at) {
    return formatDate(row.issued_at);
  }
  return "—";
}

function formatOptionalMoney(
  value: string | number | null | undefined,
  currencySymbol: string,
): string | null {
  if (!hasAmountValue(value)) return null;
  return formatMoney(value as string | number, currencySymbol);
}

function formatDiscountLineEntry(
  label: string,
  amount: string | number,
  currencySymbol: string,
): string {
  return `${label} (-${formatMoney(amount, currencySymbol)})`;
}

function buildDiscountLines(
  row: PaymentReceiptRowInput,
  currencySymbol: string,
): { discountLine: string | null; discountLines: string[] | null } {
  const lines = (row.discount_lines ?? []).filter((line) => {
    if (!hasAmountValue(line.amount)) return false;
    const n = Number(line.amount);
    return Number.isFinite(n) && n > 0;
  });

  if (lines.length > 0) {
    const formatted = lines.map((line) =>
      formatDiscountLineEntry(
        line.label?.trim() || "Discount",
        line.amount!,
        currencySymbol,
      ),
    );
    if (formatted.length === 1) {
      return { discountLine: formatted[0]!, discountLines: null };
    }
    return { discountLine: null, discountLines: formatted };
  }

  if (!hasAmountValue(row.discount_amount)) {
    return { discountLine: null, discountLines: null };
  }
  const amount = Number(row.discount_amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { discountLine: null, discountLines: null };
  }
  const label = row.discount_label?.trim() || "Discount";
  return {
    discountLine: formatDiscountLineEntry(
      label,
      row.discount_amount!,
      currencySymbol,
    ),
    discountLines: null,
  };
}

function buildAmountFields(
  row: PaymentReceiptRowInput,
  currencySymbol: string,
): Pick<
  PaymentReceiptPayload,
  | "baseAmount"
  | "discountLine"
  | "discountLines"
  | "invoicedAmount"
  | "refundLine"
  | "amountPaid"
> {
  const gross = resolvePaymentReceiptPaidAmount(row);
  const net = resolveNetReceiptPaidAmount(row);
  const refundTotal = resolveReceiptRefundTotal(row);
  const invoiced = hasAmountValue(row.invoiced_amount)
    ? String(row.invoiced_amount)
    : null;
  const showInvoiced =
    invoiced != null &&
    net != null &&
    normalizeAmountKey(invoiced) !== normalizeAmountKey(net);
  const { discountLine, discountLines } = buildDiscountLines(
    row,
    currencySymbol,
  );

  return {
    baseAmount: formatOptionalMoney(row.base_amount, currencySymbol),
    discountLine,
    discountLines,
    invoicedAmount: showInvoiced
      ? formatMoney(invoiced!, currencySymbol)
      : null,
    refundLine:
      refundTotal > 0
        ? formatDiscountLineEntry("Refund", refundTotal, currencySymbol)
        : null,
    amountPaid: net ? formatMoney(net, currencySymbol) : "—",
  };
}

function buildProgressFields(
  row: PaymentReceiptRowInput,
  currencySymbol: string,
): Pick<
  PaymentReceiptPayload,
  "paymentSequence" | "monthsCoveredCount" | "termProgress" | "adjustedNote"
> {
  const monthsCoveredCount = row.covered_months?.length ?? null;

  let termProgress: string | null = null;
  if (hasAmountValue(row.term_total) && hasAmountValue(row.paid_to_date)) {
    const paidToDate = Number(row.paid_to_date);
    const refundedToDate = parseRefundAmount(row.total_refunded_to_date);
    const netPaidToDate =
      Number.isFinite(paidToDate) && paidToDate >= refundedToDate
        ? paidToDate - refundedToDate
        : Number(row.paid_to_date);
    termProgress =
      `Term total ${formatMoney(row.term_total!, currencySymbol)}` +
      ` · Paid to date ${formatMoney(netPaidToDate, currencySymbol)}`;
  }

  const adjustedNote =
    row.is_amount_overridden && hasAmountValue(row.computed_invoiced_amount)
      ? `Adjusted by staff (system calculated ${formatMoney(
          row.computed_invoiced_amount!,
          currencySymbol,
        )})`
      : null;

  return {
    paymentSequence: row.payment_sequence ?? null,
    monthsCoveredCount,
    termProgress,
    adjustedNote,
  };
}

function resolvePersonName(
  value: { name?: string | null } | null | undefined,
): string | null {
  const name = value?.name?.trim();
  return name || null;
}

type ReceiptStaffRef = {
  name?: string | null;
  user_signature_url?: string | null;
} | null | undefined;

export function resolveReceiptAuthorizedSignature(row: {
  verified_by?: ReceiptStaffRef;
  created_by?: ReceiptStaffRef;
}): { name: string | null; signatureUrl: string | null } {
  const verifiedName = row.verified_by?.name?.trim();
  if (verifiedName && verifiedName !== "Multiple") {
    const url = row.verified_by?.user_signature_url?.trim();
    if (url) {
      return { name: verifiedName, signatureUrl: url };
    }
  }

  const createdName = row.created_by?.name?.trim();
  if (createdName) {
    const url = row.created_by?.user_signature_url?.trim();
    if (url) {
      return { name: createdName, signatureUrl: url };
    }
  }

  return { name: null, signatureUrl: null };
}

export function resolveReceiptPaymentDate(
  row: Pick<PaymentReceiptRowInput, "payment_date" | "created_at">,
  timezone: string,
): string {
  const raw = row.payment_date ?? row.created_at;
  if (raw) return formatReceiptDate(raw, timezone);
  return formatReceiptDate(new Date(), timezone);
}

export function earliestPartPaymentDate(
  parts: PaymentReceiptRowInput[],
): string | null {
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
  return best;
}

function buildSharedMeta(
  row: PaymentReceiptRowInput,
  tenant: PaymentReceiptTenant,
  downloadedByName?: string | null,
): Pick<
  PaymentReceiptPayload,
  | "orgName"
  | "orgLogoUrl"
  | "receiptDate"
  | "studentName"
  | "courseTitle"
  | "billingPeriod"
  | "installmentNote"
  | "remarks"
  | "generatedAt"
  | "downloadedBy"
  | "createdBy"
  | "verifiedBy"
  | "authorizedSignatureUrl"
  | "authorizedSignatureName"
> {
  const tz = resolveReceiptTimezone(tenant.timezone);
  const generatedAt = formatReceiptDateTime(new Date(), tz);
  const receiptDate = resolveReceiptPaymentDate(row, tz);

  const installmentNote = row.is_installment
    ? describeInstallmentCoverageDisplay({
        installment_cumulative_percent: row.installment_cumulative_percent,
        installment_covered_through: row.installment_covered_through,
      })
    : null;

  const downloadedBy = downloadedByName?.trim() || "—";
  const authorized = resolveReceiptAuthorizedSignature(row);

  return {
    orgName: tenant.name,
    orgLogoUrl: tenant.logo ?? null,
    receiptDate,
    studentName: row.user?.name?.trim() || "—",
    courseTitle: row.course?.title?.trim() || "—",
    billingPeriod: formatPaymentReceiptBillingPeriod(row),
    installmentNote,
    remarks: row.remarks?.trim() || null,
    generatedAt,
    downloadedBy,
    createdBy: resolvePersonName(row.created_by),
    verifiedBy: resolvePersonName(row.verified_by),
    authorizedSignatureUrl: authorized.signatureUrl,
    authorizedSignatureName: authorized.name,
  };
}

export function buildPaymentReceiptPayload(
  row: PaymentReceiptRowInput,
  tenant: PaymentReceiptTenant,
  currencySymbol: string,
  downloadedByName?: string | null,
): PaymentReceiptPayload {
  return {
    ...buildSharedMeta(row, tenant, downloadedByName),
    ...buildAmountFields(row, currencySymbol),
    ...buildProgressFields(row, currencySymbol),
    receiptNumber: resolvePaymentReceiptNumber(row),
    transactionId: row.transaction_id?.trim() || "—",
    paymentMethod: row.payment_method?.name?.trim() || "—",
    parts: null,
    courseLines: null,
  };
}

function sumAmountField(
  parts: PaymentReceiptRowInput[],
  field: "base_amount" | "discount_amount" | "invoiced_amount",
): string | null {
  let total = 0;
  let has = false;
  for (const part of parts) {
    const raw = part[field];
    if (!hasAmountValue(raw)) continue;
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    total += n;
    has = true;
  }
  return has ? String(total) : null;
}

function resolveGroupTransactionId(parts: PaymentReceiptRowInput[]): string {
  const ids = parts
    .map((p) => p.transaction_id?.trim())
    .filter((id): id is string => Boolean(id));
  if (ids.length === 0) return "—";
  if (new Set(ids).size === 1) return ids[0]!;
  return "—";
}

function buildCourseLines(
  parts: PaymentReceiptRowInput[],
  currencySymbol: string,
): PaymentReceiptCourseLine[] {
  const order: number[] = [];
  const byCourse = new Map<number, PaymentReceiptRowInput[]>();
  for (const part of parts) {
    const courseId = part.course?.id;
    if (courseId == null) continue;
    if (!byCourse.has(courseId)) {
      byCourse.set(courseId, []);
      order.push(courseId);
    }
    byCourse.get(courseId)!.push(part);
  }

  return order.map((courseId) => {
    const courseParts = byCourse.get(courseId)!;
    const paidTotal = courseParts.reduce((sum, part) => {
      const net = resolveNetReceiptPaidAmount(part);
      const n = net == null ? NaN : Number(net);
      return Number.isFinite(n) ? sum + n : sum;
    }, 0);
    const discountLines: string[] = [];
    for (const part of courseParts) {
      for (const line of part.discount_lines ?? []) {
        if (!hasAmountValue(line.amount)) continue;
        const n = Number(line.amount);
        if (!Number.isFinite(n) || n <= 0) continue;
        discountLines.push(
          formatDiscountLineEntry(
            line.label?.trim() || "Discount",
            line.amount!,
            currencySymbol,
          ),
        );
      }
    }
    return {
      courseTitle: courseParts[0]?.course?.title?.trim() || "—",
      discountLines,
      baseAmount: formatOptionalMoney(
        sumAmountField(courseParts, "base_amount"),
        currencySymbol,
      ),
      invoicedAmount: formatOptionalMoney(
        sumAmountField(courseParts, "invoiced_amount"),
        currencySymbol,
      ),
      amountPaid: formatMoney(String(paidTotal), currencySymbol),
    };
  });
}

export function buildGroupPaymentReceiptPayload(
  groupRow: PaymentReceiptRowInput,
  tenant: PaymentReceiptTenant,
  currencySymbol: string,
  downloadedByName?: string | null,
): PaymentReceiptPayload {
  const parts = groupRow.parts ?? [];
  const paidTotal = parts.reduce((sum, part) => {
    const paid = resolvePaymentReceiptPaidAmount(part);
    if (paid == null) return sum;
    const n = Number(paid);
    return Number.isFinite(n) ? sum + n : sum;
  }, 0);
  const hasPaid = parts.some((p) => resolvePaymentReceiptPaidAmount(p) != null);
  const refundTotal = resolveReceiptRefundTotal(groupRow);

  const synthetic: PaymentReceiptRowInput = {
    ...groupRow,
    base_amount:
      groupRow.base_amount ?? sumAmountField(parts, "base_amount"),
    discount_amount:
      groupRow.discount_amount ?? sumAmountField(parts, "discount_amount"),
    invoiced_amount:
      groupRow.invoiced_amount ?? sumAmountField(parts, "invoiced_amount"),
    actual_amount: hasPaid ? String(paidTotal) : null,
    parsed_amount: null,
    total_refunded:
      groupRow.total_refunded ??
      (refundTotal > 0 ? String(refundTotal) : null),
  };

  const earliest = earliestPartPaymentDate(parts);
  const metaRow =
    earliest != null ? { ...groupRow, payment_date: earliest } : groupRow;

  const shared = buildSharedMeta(metaRow, tenant, downloadedByName);
  const distinctCourseIds = new Set(
    parts
      .map((part) => part.course?.id)
      .filter((id): id is number => id != null),
  );
  const courseLines =
    distinctCourseIds.size > 1 ? buildCourseLines(parts, currencySymbol) : null;

  return {
    ...shared,
    ...buildAmountFields(synthetic, currencySymbol),
    ...buildProgressFields(synthetic, currencySymbol),
    receiptNumber: resolveGroupReceiptNumber(groupRow),
    transactionId: resolveGroupTransactionId(parts),
    paymentMethod: groupRow.payment_method?.name?.trim() || "—",
    parts: null,
    courseLines,
    courseTitle: courseLines ? "Multiple courses" : shared.courseTitle,
  };
}

export async function downloadPaymentReceipt(
  row: PaymentReceiptRowInput,
  tenant: PaymentReceiptTenant,
  currencySymbol: string,
  downloadedByName?: string | null,
): Promise<void> {
  const { pdf } = await import("@react-pdf/renderer");
  const { PaymentReceiptPdfDocument } = await import(
    "@/components/finances/payment-receipt-pdf"
  );
  const { downloadFile } = await import("@/helpers/file");

  const enriched = await enrichPaymentReceiptRow(row);
  const payload = buildPaymentReceiptPayload(
    enriched,
    tenant,
    currencySymbol,
    downloadedByName,
  );
  const orgLogoUrl = await resolveLogoForPdf(payload.orgLogoUrl);
  const authorizedSignatureUrl = await resolveLogoForPdf(
    payload.authorizedSignatureUrl,
  );
  const blob = await pdf(
    PaymentReceiptPdfDocument({
      payload: { ...payload, orgLogoUrl, authorizedSignatureUrl },
    }),
  ).toBlob();
  const url = URL.createObjectURL(blob);
  try {
    downloadFile(url, buildPaymentReceiptFilename(row));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function downloadGroupPaymentReceipt(
  groupRow: PaymentReceiptRowInput,
  tenant: PaymentReceiptTenant,
  currencySymbol: string,
  downloadedByName?: string | null,
): Promise<void> {
  const { pdf } = await import("@react-pdf/renderer");
  const { PaymentReceiptPdfDocument } = await import(
    "@/components/finances/payment-receipt-pdf"
  );
  const { downloadFile } = await import("@/helpers/file");

  const enriched = await enrichPaymentReceiptRow(groupRow);
  if (enriched.status !== UserPaymentStatus.verified) {
    throw new ReceiptDownloadError("group_not_fully_verified");
  }
  const payload = buildGroupPaymentReceiptPayload(
    enriched,
    tenant,
    currencySymbol,
    downloadedByName,
  );
  const groupId = enriched.group_id ?? enriched.id;
  const orgLogoUrl = await resolveLogoForPdf(payload.orgLogoUrl);
  const authorizedSignatureUrl = await resolveLogoForPdf(
    payload.authorizedSignatureUrl,
  );
  const blob = await pdf(
    PaymentReceiptPdfDocument({
      payload: { ...payload, orgLogoUrl, authorizedSignatureUrl },
    }),
  ).toBlob();
  const url = URL.createObjectURL(blob);
  try {
    downloadFile(url, buildGroupPaymentReceiptFilename(groupId));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Download the correct receipt PDF for an admin-report or list row. */
export async function downloadReceiptForPaymentRow(
  row: PaymentReceiptRowInput,
  tenant: PaymentReceiptTenant,
  currencySymbol: string,
  downloadedByName?: string | null,
): Promise<void> {
  if (isGroupReceiptRow(row)) {
    await downloadGroupPaymentReceipt(row, tenant, currencySymbol, downloadedByName);
  } else {
    await downloadPaymentReceipt(row, tenant, currencySymbol, downloadedByName);
  }
}
