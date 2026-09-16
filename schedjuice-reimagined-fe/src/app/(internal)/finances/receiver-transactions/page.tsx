"use client";

import {
  ResourceTable,
  useResourceTableState,
  column,
  type Column,
} from "@/components/data-table";
import { PageContainer } from "@/components/layout/page-container";
import { TableSkeleton } from "@/components/loading/structured-skeletons";
import { buttonVariants, Select } from "@/components/primitives";
import { useFinancePageHeader } from "@/components/finances/record/use-finance-record-page-header";
import { formatDateTime, getFirstDayOfMonth } from "@/helpers/date";
import { applyColumnLayoutMeta } from "@/lib/finances/apply-column-layout-meta";
import type { ColumnLayoutMeta } from "@/lib/finances/apply-column-layout-meta";
import { useTenant } from "@/hooks/useTenant";
import { cn } from "@/lib/utils";
import { useReceiverSideScreenshotsList } from "@/sdk/hooks/receiver-side-screenshots";
import type { ReceiverSideScreenshot } from "@/sdk";
import { operatorEnum } from "@/types/api";
import { TransactionScreenshotStrategy } from "@/types/organization";
import Link from "next/link";
import { useMemo, useState } from "react";

type MatchedFilter = "all" | "matched" | "unmatched";

const receiverTransactionsColumnLayout: ColumnLayoutMeta[] = [
  {
    id: "transaction_id",
    contentRole: "identifier",
    minWidth: "14rem",
    align: "left",
    truncate: false,
  },
  {
    id: "is_matched",
    contentRole: "status",
    minWidth: "9rem",
    align: "left",
    truncate: false,
  },
  {
    id: "user_payment",
    contentRole: "prose",
    minWidth: "16rem",
    align: "left",
    truncate: true,
  },
  {
    id: "updated_at",
    contentRole: "date",
    minWidth: "9rem",
    align: "left",
    truncate: false,
  },
];

const ReceiverTransactionsPage = () => {
  const { tenant, isLoading: isTenantLoading } = useTenant();
  const [matchedFilter, setMatchedFilter] = useState<MatchedFilter>("all");
  const tableState = useResourceTableState({
    namespace: "receiver-transactions",
    syncUrl: false,
    initial: { sorts: ["-updated_at"] },
  });

  const filterParams = useMemo(() => {
    if (matchedFilter === "all") return undefined;
    return [
      {
        field_name: "is_matched",
        operator: operatorEnum.exact,
        value: matchedFilter === "matched" ? "True" : "False",
      },
    ];
  }, [matchedFilter]);

  const list = useReceiverSideScreenshotsList({
    page: tableState.page,
    pageSize: tableState.pageSize,
    sorts: tableState.sorts.length ? tableState.sorts : ["-updated_at"],
    q: tableState.q,
    fields: [
      "id",
      "transaction_id",
      "is_matched",
      "updated_at",
      "user_payment.id",
      "user_payment.transaction_id",
      "user_payment.issued_at",
      "user_payment.billing_start_date",
      "user_payment.status",
      "user_payment.user.name",
      "user_payment.course.id",
      "user_payment.course.title",
    ],
    expand: ["user_payment", "user_payment.user", "user_payment.course"],
    filterParams,
  });

  const columns: Column<ReceiverSideScreenshot>[] = useMemo(() => {
    const buildStudentPaymentsUrl = (up: {
      transaction_id?: string | null;
      course?: { id?: number } | null;
      issued_at?: string | null;
      billing_start_date?: string | null;
      status?: string;
    }) => {
      const params = new URLSearchParams();
      if (up.transaction_id) params.set("transactionId", up.transaction_id);
      if (up.course?.id) params.set("courseId", String(up.course.id));
      if (up.status) params.set("status", up.status);
      const dateStr =
        tenant?.transaction_screenshot_strategy ===
        TransactionScreenshotStrategy.user_upload
          ? up.billing_start_date
          : up.issued_at;
      if (dateStr) {
        const firstOfMonth = getFirstDayOfMonth(new Date(dateStr));
        params.set("date", firstOfMonth.toISOString());
      }
      const qs = params.toString();
      return `/finances/student-payments${qs ? `?${qs}` : ""}`;
    };

    return applyColumnLayoutMeta(
      [
      column.text<ReceiverSideScreenshot>({
        id: "transaction_id",
        header: "Transaction ID",
        accessor: (row) => row.transaction_id,
      }),
      {
        id: "is_matched",
        header: "Matched",
        accessor: (row) => (row.is_matched ? "Yes" : "No"),
        cell: ({ row }) => (
          <span
            className={cn(
              "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium tabular-nums",
              row.is_matched
                ? "border-accent/30 bg-accent/10 text-accent"
                : "border-border bg-surface-hover text-text-secondary",
            )}
          >
            {row.is_matched ? "Matched" : "Unmatched"}
          </span>
        ),
      },
      {
        id: "user_payment",
        header: "Linked Payment",
        accessor: (row) =>
          row.user_payment
            ? `${row.user_payment.user?.name || "-"} · ${row.user_payment.course?.title || "-"}`
            : "-",
        enableSorting: false,
        cell: ({ row }) => {
          const up = row.user_payment;
          const label = up
            ? `${up.user?.name || "-"} · ${up.course?.title || "-"}`
            : "-";
          if (!up) return label;
          return (
            <Link href={buildStudentPaymentsUrl(up)} className="hover:underline">
              {label}
            </Link>
          );
        },
      },
      {
        id: "updated_at",
        header: "Updated",
        accessor: (row) => row.updated_at,
        cell: ({ row }) =>
          row.updated_at ? formatDateTime(row.updated_at) : "—",
      },
    ],
      receiverTransactionsColumnLayout,
    );
  }, [tenant?.transaction_screenshot_strategy]);

  const verificationUploadAction = useMemo(
    () => (
      <Link
        href="/finances/student-payments/verification-upload"
        className={cn(buttonVariants({ variant: "primary" }))}
      >
        Verification File Upload
      </Link>
    ),
    [],
  );

  useFinancePageHeader(
    useMemo(
      () => ({
        actions: verificationUploadAction,
      }),
      [verificationUploadAction],
    ),
  );

  if (!tenant && isTenantLoading) {
    return (
      <PageContainer width="wide">
        <TableSkeleton
          columns={receiverTransactionsColumnLayout.length}
          showPagination
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer width="wide">
      <div className="min-w-0 overflow-x-auto">
        <ResourceTable
          list={list}
          tableState={tableState}
          columns={columns}
          getRowId={(row) => String(row.id)}
          filterSlot={
            <div className="flex w-52 min-w-0 flex-col gap-1.5">
              <span className="text-sm font-medium text-text-secondary">
                Matched status
              </span>
              <Select
                size="compact"
                className="min-w-[10rem]"
                value={matchedFilter}
                onValueChange={(v) => {
                  setMatchedFilter(v as MatchedFilter);
                  tableState.setState({ page: 1 });
                }}
                items={[
                  { value: "all", label: "All" },
                  { value: "matched", label: "Matched" },
                  { value: "unmatched", label: "Unmatched" },
                ]}
                placeholder="Status"
              />
            </div>
          }
        />
      </div>
    </PageContainer>
  );
};

export default ReceiverTransactionsPage;
