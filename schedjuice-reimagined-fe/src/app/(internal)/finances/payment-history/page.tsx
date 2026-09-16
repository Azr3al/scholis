"use client";

import {
  PaymentHistoryReceiptDownloadCell,
  PaymentHistoryReuploadCell,
  PaymentHistoryViewCell,
} from "@/components/datatable/payment-history-action-cell";
import {
  ResourceTable,
  useResourceTableState,
  column,
  type Column,
} from "@/components/data-table";
import { PageContainer } from "@/components/layout/page-container";
import { useFinancePageHeader } from "@/components/finances/record/use-finance-record-page-header";
import { formatDate, formatDateTime } from "@/helpers/date";
import { snakeToTitle } from "@/helpers/formatters";
import { formatMoney } from "@/helpers/money";
import { isValidApiEntityIdParam } from "@/helpers/relation-fk";
import { useTenantCurrencySymbol } from "@/hooks/useTenantCurrencySymbol";
import { useUser } from "@/hooks/useUser";
import { useUserPaymentsList } from "@/sdk/hooks/user-payments";
import type { UserPayment } from "@/sdk";
import { operatorEnum } from "@/types/api";
import { UserPaymentStatus } from "@/types/finance";
import { useMemo } from "react";

function formatBillingPeriod(
  billingStartDate?: string | null,
  billingEndDate?: string | null,
) {
  if (billingStartDate && billingEndDate) {
    return `${formatDate(billingStartDate)} – ${formatDate(billingEndDate)}`;
  }
  return "—";
}

const PaymentHistoryPage = () => {
  const currencySymbol = useTenantCurrencySymbol();
  const { user } = useUser();
  const tableState = useResourceTableState({
    namespace: "user-payments",
    syncUrl: false,
    initial: { sorts: ["-created_at"] },
  });

  const filterParams = useMemo(
    () => [
      {
        field_name: "user_id",
        operator: operatorEnum.exact,
        value: String(user?.id),
      },
      {
        field_name: "status",
        operator: operatorEnum.in,
        value: [
          UserPaymentStatus.pending_verification,
          UserPaymentStatus.verified,
          UserPaymentStatus.awaiting_extraction,
          UserPaymentStatus.awaiting_metadata_extraction,
          UserPaymentStatus.cannot_extract,
          UserPaymentStatus.duplicated,
          UserPaymentStatus.amount_mismatch,
        ].join(","),
      },
    ],
    [user?.id],
  );

  const list = useUserPaymentsList({
    page: tableState.page,
    pageSize: tableState.pageSize,
    sorts: tableState.sorts.length ? tableState.sorts : ["-created_at"],
    q: tableState.q,
    expand: ["course", "payment_method", "created_by", "verified_by"],
    filterParams,
    enabled: isValidApiEntityIdParam(String(user?.id ?? "")),
  });

  const columns: Column<UserPayment>[] = useMemo(
    () => [
      column.text<UserPayment>({
        id: "course",
        header: "Course",
        accessor: (row) => row.course?.title,
        sizing: { role: "prose", width: { min: "12rem" } },
      }),
      {
        id: "billing_period",
        header: "Billing Period",
        accessor: (row) =>
          formatBillingPeriod(row.billing_start_date, row.billing_end_date),
        enableSorting: false,
        sizing: { role: "date", width: { min: "11rem" } },
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-sm text-text-muted">
            {formatBillingPeriod(row.billing_start_date, row.billing_end_date)}
          </span>
        ),
      },
      column.text<UserPayment>({
        id: "description",
        header: "Description",
        accessor: (row) => row.description,
        sizing: { role: "prose", width: { min: "14rem" } },
      }),
      {
        id: "invoiced_amount",
        header: "Amount",
        accessor: (row) => row.invoiced_amount,
        align: "right",
        enableSorting: false,
        sizing: { role: "numeric", tabular: true },
        cell: ({ row }) => (
          <span className="block text-right tabular-nums font-medium">
            {row.invoiced_amount
              ? formatMoney(String(row.invoiced_amount), currencySymbol)
              : "—"}
          </span>
        ),
      },
      {
        id: "issued_at",
        header: "Submitted",
        accessor: (row) => row.created_at,
        enableSorting: false,
        sizing: { role: "date", width: { min: "9rem" } },
        cell: ({ row }) => (
          <time
            dateTime={row.created_at}
            className="block whitespace-nowrap text-sm text-text-muted"
          >
            {row.created_at ? formatDateTime(row.created_at) : "—"}
          </time>
        ),
      },
      column.text<UserPayment>({
        id: "status",
        header: "Status",
        accessor: (row) => (row.status ? snakeToTitle(row.status) : null),
        sizing: { role: "status", width: { min: "10rem" } },
      }),
      {
        id: "receipt",
        header: "Receipt",
        accessor: (row) => row.screenshot,
        enableSorting: false,
        cell: ({ row }) => (
          <PaymentHistoryViewCell screenshot={row.screenshot} />
        ),
      },
      {
        id: "receipt_pdf",
        header: "PDF",
        accessor: () => null,
        enableSorting: false,
        cell: ({ row }) => <PaymentHistoryReceiptDownloadCell row={row} />,
      },
      {
        id: "receipt_reupload",
        header: "Replace",
        accessor: () => null,
        enableSorting: false,
        cell: ({ row }) => (
          <PaymentHistoryReuploadCell
            userPaymentId={row.id}
            status={row.status as UserPaymentStatus}
          />
        ),
      },
    ],
    [currencySymbol],
  );

  useFinancePageHeader(
    useMemo(
      () => ({
        toolbar: (
          <p className="text-sm text-text-secondary">
            View past payments, billing periods, and payment receipts.
          </p>
        ),
      }),
      [],
    ),
  );

  return (
    <PageContainer width="wide" className="space-y-4">
      <div className="min-w-0 overflow-x-auto">
        <ResourceTable
          list={list}
          tableState={tableState}
          columns={columns}
          getRowId={(row) => String(row.id)}
        />
      </div>
    </PageContainer>
  );
};
export default PaymentHistoryPage;
