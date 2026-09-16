"use client";
import { Button, Sheet, buttonVariants } from "@/components/primitives";

import { TableSkeleton } from "@/components/loading/structured-skeletons";
import type { StudentPaymentAdminReportRow } from "@/components/finances/student-payments-report";
import { formatDate } from "@/helpers/date";
import { formatMoney } from "@/helpers/money";
import { snakeToTitle } from "@/helpers/formatters";
import { useStudentPaymentsDetail } from "@/hooks/finances/use-student-payments-detail";
import { useTenant } from "@/hooks/useTenant";
import { useTenantCurrencySymbol } from "@/hooks/useTenantCurrencySymbol";
import { isGroupPaymentRow, sharedScreenshotNote, sharedScreenshotNoteTitles } from "@/lib/data-sheets/payment-row-utils";
import { summarizeStudentPayments } from "@/lib/finances/student-payments-detail-utils";
import { TransactionScreenshotStrategy } from "@/types/organization";
import { MediaImage as ImageIcon } from "iconoir-react";
import { EmptyCopy, EmptyState } from "@/components/primitives/empty";
import { EMPTY_COPY_PRESETS } from "@/components/primitives/empty/empty-copy-presets";

function billingPeriod(row: StudentPaymentAdminReportRow): string {
  if (row.billing_start_date && row.billing_end_date) {
    return `${formatDate(row.billing_start_date)} – ${formatDate(row.billing_end_date)}`;
  }
  if (row.issued_at) return formatDate(row.issued_at);
  return "—";
}

function getPaymentPartCount(row: StudentPaymentAdminReportRow): number {
  return row.part_count ?? row.parts?.length ?? 0;
}

function formatPaymentMethodSummary(row: StudentPaymentAdminReportRow): string | null {
  const parts = row.parts ?? [];
  if (parts.length > 0) {
    const names = Array.from(
      new Set(
        parts
          .map((part) => part.payment_method?.name?.trim())
          .filter(Boolean) as string[],
      ),
    );
    return names.length > 0 ? names.join(", ") : null;
  }
  const name = row.payment_method?.name?.trim();
  return name || null;
}

function PaymentPartRow({
  part,
  index,
  currencySymbol,
  onViewScreenshot,
}: {
  part: StudentPaymentAdminReportRow;
  index: number;
  currencySymbol: string;
  onViewScreenshot: (url: string) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-slate-600">Part {index + 1}</p>
        <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
          {snakeToTitle(part.status)}
        </span>
      </div>

      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div>
          <dt className="text-slate-400">Amount</dt>
          <dd className="font-mono text-slate-700">
            {part.parsed_amount
              ? formatMoney(part.parsed_amount, currencySymbol)
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-slate-400">Method</dt>
          <dd className="text-slate-700">{part.payment_method?.name ?? "—"}</dd>
        </div>
        <div className="col-span-2 min-w-0">
          <dt className="text-slate-400">Transaction ID</dt>
          <dd className="break-all font-mono text-slate-700">
            {part.transaction_id ?? "—"}
          </dd>
        </div>
      </dl>

      {part.screenshot ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-2 h-8 active:scale-[0.98]"
          onClick={() => onViewScreenshot(part.screenshot!)}
        >
          <ImageIcon className="mr-1.5 size-4" aria-hidden />
          View screenshot
        </Button>
      ) : null}
    </div>
  );
}

function GroupPaymentCard({
  row,
  currencySymbol,
  onViewScreenshot,
}: {
  row: StudentPaymentAdminReportRow;
  currencySymbol: string;
  onViewScreenshot: (url: string) => void;
}) {
  const partCount = getPaymentPartCount(row);
  const methodSummary = formatPaymentMethodSummary(row);
  const parts = row.parts ?? [];

  const sharedNote = sharedScreenshotNote(row);
  const sharedNoteTitles = sharedScreenshotNoteTitles(row);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">
            {row.course?.title ?? "—"}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">{billingPeriod(row)}</p>
          {sharedNote ? (
            <p
              title={sharedNoteTitles ?? undefined}
              className="mt-1 max-w-full break-words text-xs font-medium text-amber-800 dark:text-amber-200"
            >
              {sharedNote}
            </p>
          ) : null}
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
          {snakeToTitle(row.status)}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div>
          <dt className="text-slate-400">Total amount</dt>
          <dd className="font-mono text-slate-700">
            {row.parsed_amount
              ? formatMoney(row.parsed_amount, currencySymbol)
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-slate-400">Parts</dt>
          <dd className="font-mono text-slate-700">
            {partCount > 0 ? partCount : "—"}
          </dd>
        </div>
        {methodSummary ? (
          <div className="col-span-2">
            <dt className="text-slate-400">Payment methods</dt>
            <dd className="text-slate-700">{methodSummary}</dd>
          </div>
        ) : null}
      </dl>

      {parts.length > 0 ? (
        <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
          {parts.map((part, index) => (
            <PaymentPartRow
              key={String(part.id)}
              part={part}
              index={index}
              currencySymbol={currencySymbol}
              onViewScreenshot={onViewScreenshot}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PaymentCard({
  row,
  currencySymbol,
  userUpload,
  onViewScreenshot,
}: {
  row: StudentPaymentAdminReportRow;
  currencySymbol: string;
  userUpload: boolean;
  onViewScreenshot: (url: string) => void;
}) {
  const sharedNote = sharedScreenshotNote(row);
  const sharedNoteTitles = sharedScreenshotNoteTitles(row);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">
            {row.course?.title ?? "—"}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">{billingPeriod(row)}</p>
          {sharedNote ? (
            <p
              title={sharedNoteTitles ?? undefined}
              className="mt-1 max-w-full break-words text-xs font-medium text-amber-800 dark:text-amber-200"
            >
              {sharedNote}
            </p>
          ) : null}
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
          {snakeToTitle(row.status)}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div>
          <dt className="text-slate-400">Amount</dt>
          <dd className="font-mono text-slate-700">
            {row.parsed_amount
              ? formatMoney(row.parsed_amount, currencySymbol)
              : "—"}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-slate-400">Transaction ID</dt>
          <dd className="break-all font-mono text-slate-700">
            {row.transaction_id ?? "—"}
          </dd>
        </div>
        {!userUpload ? (
          <>
            <div>
              <dt className="text-slate-400">Payment account</dt>
              <dd className="text-slate-700">
                {row.payment_method?.name ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-400">Date on screenshot</dt>
              <dd className="text-slate-700">
                {row.date_on_screenshot ?? "—"}
              </dd>
            </div>
          </>
        ) : null}
      </dl>

      {row.screenshot ? (
        <Button
          type="button"
          variant="secondary" size="sm"
          className="mt-3 h-8 active:scale-[0.98]"
          onClick={() => onViewScreenshot(row.screenshot!)}
        >
          <ImageIcon className="mr-1.5 size-4" aria-hidden />
          View screenshot
        </Button>
      ) : null}
    </div>
  );
}

function formatMonthLabel(monthDate: Date): string {
  return monthDate.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

export function StudentPaymentsDrawer({
  studentId,
  courseId,
  monthDate,
  courseTitle,
  onClose,
  onViewScreenshot,
}: {
  studentId: string;
  courseId: string;
  monthDate: Date;
  courseTitle?: string | null;
  onClose: () => void;
  onViewScreenshot: (url: string) => void;
}) {
  const open = Boolean(studentId.trim());
  const { tenant } = useTenant();
  const currencySymbol = useTenantCurrencySymbol();
  const { query, rows, studentName, enabled } = useStudentPaymentsDetail(
    studentId,
    courseId,
    monthDate,
  );

  const userUpload =
    tenant?.transaction_screenshot_strategy ===
    TransactionScreenshotStrategy.user_upload;
  const summary = summarizeStudentPayments(rows);

  return (
    <Sheet.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Sheet.Portal>
        <Sheet.Backdrop />
        <Sheet.Popup
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-none md:w-[720px] lg:w-[820px]"
      >
        <div className="space-y-1 border-b border-slate-200 px-6 py-5 pr-12 text-left">
          <Sheet.Title className="text-lg font-semibold text-slate-900">
            {studentName ?? "Student"}
          </Sheet.Title>
          <Sheet.Description className="text-xs text-slate-500">
            Payments for this student
            {courseTitle ? ` in ${courseTitle}` : ""}
            {monthDate ? ` — ${formatMonthLabel(monthDate)}` : ""}.
          </Sheet.Description>
        </div>

        <div className="flex items-center gap-6 border-b border-slate-200 px-6 py-3">
          <div>
            <p className="text-xs text-slate-400">Payments</p>
            <p className="font-mono text-sm text-slate-700">{summary.count}</p>
          </div>
          <div className="border-l border-slate-200 pl-6">
            <p className="text-xs text-slate-400">Verified</p>
            <p className="font-mono text-sm text-slate-700">
              {summary.verifiedCount}
            </p>
          </div>
          <div className="border-l border-slate-200 pl-6">
            <p className="text-xs text-slate-400">Total verified</p>
            <p className="font-mono text-sm text-slate-700">
              {formatMoney(summary.totalVerifiedAmount, currencySymbol)}
            </p>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-5">
          {!enabled ? (
            <EmptyState>
              <p className="text-sm text-muted-foreground" role="status">
                Can&apos;t load payments. This row is missing course information.
              </p>
            </EmptyState>
          ) : query.isLoading ? (
            <TableSkeleton columns={4} rows={5} />
          ) : query.isError ? (
            <p className="text-sm text-destructive" role="alert">
              Failed to load. Please try again.
            </p>
          ) : rows.length === 0 ? (
            <EmptyState>
              <EmptyCopy {...EMPTY_COPY_PRESETS.noPayments} />
            </EmptyState>
          ) : (
            rows.map((row) =>
              isGroupPaymentRow(row) ? (
                <GroupPaymentCard
                  key={String(row.id)}
                  row={row}
                  currencySymbol={currencySymbol}
                  onViewScreenshot={onViewScreenshot}
                />
              ) : (
                <PaymentCard
                  key={String(row.id)}
                  row={row}
                  currencySymbol={currencySymbol}
                  userUpload={userUpload}
                  onViewScreenshot={onViewScreenshot}
                />
              ),
            )
          )}
        </div>
      </Sheet.Popup>
      </Sheet.Portal>
    </Sheet.Root>
  );
}
