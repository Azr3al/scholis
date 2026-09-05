"use client";

import { updateEntity } from "@/app/client-api/utils";
import { column, type Column } from "@/components/data-table";
import UserPaymentActionCell from "@/components/datatable/user-payment-action-cell";
import UserPaymentStatusInlineForm from "@/components/datatable/user-payment-status-inline-form";
import InlineInput from "@/components/datatable/inline-input";
import { CellAutosaveInput, useCellAutosave } from "@/components/edit-kit";
import { formatDate } from "@/helpers/date";
import {
  canDownloadPaymentReceipt,
  canVerifyPayments,
  canViewPaymentScreenshots,
} from "@/helpers/authorization";
import {
  canShowPaymentReceiptAction,
  sharedScreenshotNote,
  sharedScreenshotNoteTitles,
  sharedTransactionLookupId,
} from "@/lib/data-sheets/payment-row-utils";
import { transactionDuplicatesHref } from "@/helpers/student-payments-transaction-lookup";
import { applyColumnLayoutMeta } from "@/lib/finances/apply-column-layout-meta";
import { recentTransactionsColumnLayout } from "@/lib/finances/recent-transactions-column-meta";
import {
  patchPaymentRowInQueryCaches,
  restoreQueryCacheSnapshots,
  type QueryCacheSnapshot,
} from "@/lib/finances/patch-payment-row-cache";
import { formatMoney } from "@/helpers/money";
import type { UserPayment } from "@/sdk";
import { UserPaymentStatus } from "@/types/finance";
import { TransactionScreenshotStrategy, type organizationType } from "@/types/organization";
import type { accountType } from "@/types/user";
import Link from "next/link";
import { useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/primitives";

export function TransactionIdCell({ row }: { row: UserPayment }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const cacheSnapRef = useRef<QueryCacheSnapshot[]>([]);
  const stringValue = row.transaction_id ?? "";
  const autosave = useCellAutosave({
    value: stringValue,
    onOptimisticUpdate: (next) => {
      cacheSnapRef.current = patchPaymentRowInQueryCaches(
        queryClient,
        row.id,
        { transaction_id: next },
      );
    },
    onRollback: () => {
      restoreQueryCacheSnapshots(queryClient, cacheSnapRef.current);
      cacheSnapRef.current = [];
    },
    onError: () => {
      toast.add({
        type: "error",
        description: "Could not save change.",
      });
    },
    onSave: async (next) => {
      await updateEntity("user-payments", row.id, {
        transaction_id: next,
      });
      void queryClient.invalidateQueries({ queryKey: ["user-payments"] });
      void queryClient.invalidateQueries({
        queryKey: ["recent-transactions-infinite"],
      });
    },
  });

  return (
    <CellAutosaveInput
      autosave={autosave}
      inputClassName="h-8 min-w-0 flex-1 text-sm"
    />
  );
}

export function buildRecentTransactionsColumns(args: {
  tenant: organizationType;
  user: accountType;
  currencySymbol: string;
  pathname: string;
  searchParams: URLSearchParams;
  onOpenStudent: (row: UserPayment) => void;
  onOpenCoverageEdit: (row: UserPayment) => void;
  onDownloadReceipt: (row: UserPayment) => void;
  downloadingReceiptId: number | null;
  onViewScreenshot: (url: string) => void;
  onDuplicateSearch: (transactionId: string) => void;
}): Column<UserPayment>[] {
  const {
    tenant,
    user,
    currencySymbol,
    pathname,
    searchParams,
    onOpenStudent,
    onOpenCoverageEdit,
    onDownloadReceipt,
    downloadingReceiptId,
    onViewScreenshot,
    onDuplicateSearch,
  } = args;

  const layout = recentTransactionsColumnLayout({
    canVerify: canVerifyPayments(user),
    userUploadStrategy:
      tenant.transaction_screenshot_strategy ===
      TransactionScreenshotStrategy.user_upload,
  });

  const cols: Column<UserPayment>[] = [
    {
      id: "user__name",
      header: "Student",
      accessor: (row) => row.user?.name,
      cell: ({ row }) => {
        const displayName = row.user?.name ?? "—";
        const uid = row.user?.id;
        const sharedNote = sharedScreenshotNote(row);
        const sharedNoteTitles = sharedScreenshotNoteTitles(row);
        const sharedTxnId = sharedTransactionLookupId(row);
        const sharedNoteHref =
          sharedNote && sharedTxnId
            ? transactionDuplicatesHref(sharedTxnId, pathname, searchParams)
            : null;

        const nameNode =
          uid == null ? (
            <span className="min-w-0 max-w-full truncate">{displayName}</span>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenStudent(row);
              }}
              className="min-w-0 max-w-full truncate text-left font-medium text-primary hover:underline"
            >
              {displayName}
            </button>
          );

        if (!sharedNote) return nameNode;

        return (
          <div className="flex min-w-0 flex-col items-start gap-0.5 text-left">
            {nameNode}
            {sharedNoteHref ? (
              <Link
                href={sharedNoteHref}
                onClick={(e) => e.stopPropagation()}
                title={sharedNoteTitles ?? undefined}
                className="max-w-full break-words text-xs font-medium text-amber-800 underline-offset-2 hover:underline dark:text-amber-200"
              >
                {sharedNote}
              </Link>
            ) : (
              <span
                title={sharedNoteTitles ?? undefined}
                className="max-w-full break-words text-xs font-medium text-amber-800 dark:text-amber-200"
              >
                {sharedNote}
              </span>
            )}
          </div>
        );
      },
    },
    column.text<UserPayment>({
      id: "course",
      header: "Course",
      accessor: (row) => row.course?.title,
      enableSorting: false,
    }),
    {
      id: "transaction_id",
      header: "Transaction ID",
      accessor: (row) => row.transaction_id ?? "",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="min-w-0 space-y-1">
          {row.status === UserPaymentStatus.verified && !row.transaction_id ? (
            <span className="text-danger">
              Verified payments must have a TRANSACTION ID
            </span>
          ) : null}
          <TransactionIdCell row={row} />
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      accessor: (row) => row.status,
      enableSorting: false,
      cell: ({ row }) => (
        <UserPaymentStatusInlineForm
          userId={row.user?.id != null ? String(row.user.id) : ""}
          isDisabled={Boolean(user && !canVerifyPayments(user))}
          status={row.status as UserPaymentStatus}
          userPaymentId={row.id}
        />
      ),
    },
    {
      id: "payment_date",
      header: "Payment date",
      accessor: (row) => row.payment_date ?? null,
      enableSorting: false,
      cell: ({ row }) => {
        const raw = row.payment_date;
        return raw ? formatDate(raw, "MMM d, yyyy") : "—";
      },
    },
    column.editableText<UserPayment>({
      id: "description",
      header: "Description",
      accessor: (row) => row.description ?? "",
      onSave: async (row, value) => {
        await updateEntity("user-payments", row.id, {
          description: value,
        });
      },
    }),
    column.editableText<UserPayment>({
      id: "remarks",
      header: "Remarks",
      accessor: (row) => row.remarks ?? "",
      onSave: async (row, value) => {
        await updateEntity("user-payments", row.id, { remarks: value });
      },
    }),
    column.text<UserPayment>({
      id: "created_by",
      header: "Created By",
      accessor: (row) => row.created_by?.name,
      enableSorting: false,
    }),
  ];

  const insertAt = 5;
  if (
    tenant.transaction_screenshot_strategy ===
    TransactionScreenshotStrategy.user_upload
  ) {
    cols.splice(insertAt, 0, {
      id: "billing_start_date",
      header: "Billing Period",
      accessor: (row) =>
        row.billing_start_date && row.billing_end_date
          ? `${formatDate(row.billing_start_date)} - ${formatDate(row.billing_end_date)}`
          : row.issued_at
            ? formatDate(row.issued_at)
            : "-",
      enableSorting: false,
    });
  } else {
    cols.splice(insertAt, 0, {
      id: "payment_method__name",
      header: "Payment Account",
      accessor: (row) => row.payment_method?.name,
      enableSorting: false,
    });
    cols.splice(insertAt + 1, 0, {
      id: "payment_method__payment_bank",
      header: "Bank",
      accessor: (row) => row.payment_method?.payment_bank ?? "—",
      enableSorting: false,
    });
    cols.splice(insertAt + 2, 0, {
      id: "date_on_screenshot",
      header: "Date on Screenshot",
      accessor: (row) => row.date_on_screenshot,
      enableSorting: false,
    });
  }

  if (canVerifyPayments(user)) {
    cols.splice(insertAt, 0, {
      id: "parsed_amount",
      header: "Amount",
      accessor: (row) =>
        row.parsed_amount ? formatMoney(row.parsed_amount, currencySymbol) : "-",
      enableSorting: false,
      cell: ({ row }) => (
        <InlineInput
          value={String(row.parsed_amount ?? "").split(".")[0]}
          fieldName="parsed_amount"
          entityName="user-payments"
          entityId={row.id}
          inputType="number"
          isDisabled={row.status !== UserPaymentStatus.verified}
          displayFunc={(v) => (v ? formatMoney(v, currencySymbol) : "-")}
        />
      ),
    });
  }

  cols.push({
    id: "_actions",
    header: "Actions",
    accessor: () => "",
    enableSorting: false,
    cell: ({ row }) => (
      <UserPaymentActionCell
        status={row.status as UserPaymentStatus}
        showView={canViewPaymentScreenshots(user) && Boolean(row.screenshot)}
        onView={() => onViewScreenshot(row.screenshot ?? "")}
        showCoverage={!row.is_installment}
        onEditCoverage={() => onOpenCoverageEdit(row)}
        canDownloadReceipt={
          row.status === UserPaymentStatus.verified &&
          canShowPaymentReceiptAction(row) &&
          canDownloadPaymentReceipt(user)
        }
        onDownloadReceipt={() => onDownloadReceipt(row)}
        isDownloadingReceipt={downloadingReceiptId === row.id}
        onDuplicateSearch={() => {
          const tid = row.transaction_id?.trim();
          if (!tid) return;
          onDuplicateSearch(tid);
        }}
        userPaymentId={String(row.id)}
      />
    ),
  });

  return applyColumnLayoutMeta(cols, layout);
}
