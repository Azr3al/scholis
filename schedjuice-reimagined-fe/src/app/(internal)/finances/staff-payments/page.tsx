"use client";

import { Badge } from "@/app/_chrome/badge";
import {
  ResourceTable,
  useResourceTableState,
  column,
  type Column,
} from "@/components/data-table";
import EntityCombobox from "@/components/form/entity-combobox";
import YearMonthSelector from "@/components/form/selectors/year-month-selector";
import {
  FilterToolbar,
  FilterToolbarField,
} from "@/components/filters/filter-toolbar";
import FullScreenImageViewer from "@/components/images/full-screen-image-viewer";
import { PageContainer } from "@/components/layout/page-container";
import { TableSkeleton } from "@/components/loading/structured-skeletons";
import { Button, Input, buttonVariants } from "@/components/primitives";
import { useFinancePageHeader } from "@/components/finances/record/use-finance-record-page-header";
import { STAFF_ROLE_FILTER } from "@/components/finances/payment-info-form-fields";
import {
  canRecordStaffPayments,
  canViewAllStaffPayments,
} from "@/helpers/authorization";
import {
  formatDate,
  formatDateTime,
} from "@/helpers/date";
import { formatMoney } from "@/helpers/money";
import { isValidApiEntityIdParam } from "@/helpers/relation-fk";
import { useTenantCurrencySymbol } from "@/hooks/useTenantCurrencySymbol";
import { useUser } from "@/hooks/useUser";
import { crossfade } from "@/lib/sj/motion";
import { cn } from "@/lib/utils";
import { useStaffPaymentsList } from "@/sdk/hooks/staff-payments";
import type { StaffPayment } from "@/sdk";
import { operatorEnum } from "@/types/api";
import { motion } from "motion/react";
import Link from "next/link";
import { parseAsIsoDateTime, parseAsString, useQueryState } from "nuqs";
import { format } from "date-fns";
import { useMemo, useState } from "react";

function formatPayoutAccount(row: StaffPayment): string {
  const info = row.payment_info;
  if (!info) return "—";
  const bank = info.bank_type?.trim() || "—";
  const wallet = info.description?.trim();
  return wallet ? `${bank} · ${wallet}` : bank;
}

function primaryProofUrl(row: StaffPayment): string | null {
  const proof = row.proofs?.[0];
  if (proof?.file_url) return proof.file_url;
  return row.screenshot ?? null;
}

const StaffPaymentsPage = () => {
  const { user } = useUser();
  const currencySymbol = useTenantCurrencySymbol();
  const [viewImageUrl, setViewImageUrl] = useState<string | null>(null);
  const [date, setDate] = useQueryState(
    "date",
    parseAsIsoDateTime.withDefault(new Date()),
  );
  const [staffId, setStaffId] = useQueryState(
    "staffId",
    parseAsString.withDefault(""),
  );
  const [transactionId, setTransactionId] = useState("");

  const monthDate = useMemo(
    () => new Date(date.getFullYear(), date.getMonth(), 1),
    [date],
  );

  const tableState = useResourceTableState({
    namespace: "staff-payments",
    syncUrl: false,
    initial: { sorts: ["-paid_at", "-created_at"] },
  });

  const filterParams = useMemo(() => {
    const params: {
      field_name: string;
      operator: typeof operatorEnum.exact | typeof operatorEnum.gte | typeof operatorEnum.lte | typeof operatorEnum.contains;
      value: string;
    }[] = [];
    params.push(
      {
        field_name: "pay_period_year",
        operator: operatorEnum.exact,
        value: String(monthDate.getFullYear()),
      },
      {
        field_name: "pay_period_month",
        operator: operatorEnum.exact,
        value: String(monthDate.getMonth() + 1),
      },
    );
    if (staffId && isValidApiEntityIdParam(staffId)) {
      params.push({
        field_name: "user_id",
        operator: operatorEnum.exact,
        value: String(Math.trunc(Number(staffId))),
      });
    }
    const tid = transactionId.trim();
    if (tid) {
      params.push({
        field_name: "transaction_id",
        operator: operatorEnum.contains,
        value: tid,
      });
    }
    return params;
  }, [monthDate, staffId, transactionId]);

  const canViewAll = user ? canViewAllStaffPayments(user) : false;
  const canRecord = user ? canRecordStaffPayments(user) : false;

  const scopedFilterParams = useMemo(() => {
    if (canViewAll || !user?.id) return filterParams;
    return [
      ...filterParams.filter((p) => p.field_name !== "user_id"),
      {
        field_name: "user_id",
        operator: operatorEnum.exact,
        value: String(user.id),
      },
    ];
  }, [canViewAll, filterParams, user?.id]);

  const list = useStaffPaymentsList({
    page: tableState.page,
    pageSize: tableState.pageSize,
    sorts: tableState.sorts.length ? tableState.sorts : ["-paid_at", "-created_at"],
    q: tableState.q,
    filterParams: scopedFilterParams,
    expand: ["user", "payment_info", "created_by", "proofs"],
    fields: [
      "id",
      "amount",
      "amount_currency",
      "paid_at",
      "confirmed_at",
      "pay_period_year",
      "pay_period_month",
      "transaction_id",
      "screenshot",
      "proofs.id",
      "proofs.filename",
      "proofs.file_url",
      "user.id",
      "user.name",
      "payment_info.id",
      "payment_info.account_name",
      "payment_info.bank_type",
      "payment_info.description",
      "created_by.id",
      "created_by.name",
    ],
  });

  const columns: Column<StaffPayment>[] = useMemo(() => {
    const cols: Column<StaffPayment>[] = [];
    if (canViewAll) {
      cols.push(
        column.text<StaffPayment>({
          id: "user",
          header: "Staff member",
          accessor: (row) => row.user?.name ?? "—",
          sizing: { role: "person" },
        }),
      );
    }
    cols.push(
      column.text<StaffPayment>({
        id: "payment_info",
        header: "Payout account",
        accessor: formatPayoutAccount,
        sizing: { role: "prose", wrap: "truncate" },
      }),
      {
        id: "pay_period",
        header: "Pay period",
        accessor: (row) => {
          if (!row.pay_period_year || !row.pay_period_month) return "—";
          return format(
            new Date(row.pay_period_year, row.pay_period_month - 1, 1),
            "MMMM yyyy",
          );
        },
        sizing: { role: "date" },
      },
      {
        id: "paid_at",
        header: "Paid",
        accessor: (row) => (row.paid_at ? formatDateTime(row.paid_at) : "—"),
        sizing: { role: "date" },
      },
      {
        id: "amount",
        header: "Amount",
        accessor: (row) =>
          row.amount != null && row.amount !== ""
            ? formatMoney(row.amount, currencySymbol)
            : "—",
        align: "right",
        sizing: { role: "numeric", tabular: true },
        cell: ({ value }) => (
          <span className="block text-right tabular-nums">
            {value == null || value === "" ? "—" : String(value)}
          </span>
        ),
      },
      {
        id: "confirmed_at",
        header: "Receipt",
        accessor: (row) => row.confirmed_at ?? "",
        enableSorting: false,
        cell: ({ row }) =>
          row.confirmed_at ? (
            <div className="space-y-1">
              <Badge className="border-transparent bg-brand/15 px-2 py-0.5 text-[11px] font-semibold text-brand">
                Confirmed
              </Badge>
              <p className="text-xs text-text-muted">
                {formatDate(row.confirmed_at)}
              </p>
            </div>
          ) : (
            <Badge className="border-transparent bg-warning/15 px-2 py-0.5 text-[11px] font-semibold text-warning">
              Awaiting confirmation
            </Badge>
          ),
      },
      column.text<StaffPayment>({
        id: "transaction_id",
        header: "Reference",
        accessor: (row) => row.transaction_id ?? "—",
        sizing: { role: "identifier" },
      }),
      {
        id: "screenshot",
        header: "Proof",
        accessor: (row) => primaryProofUrl(row) ?? "",
        enableSorting: false,
        cell: ({ row }) => {
          const proofUrl = primaryProofUrl(row);
          return proofUrl ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-brand underline-offset-2 hover:bg-surface-hover hover:underline"
              onClick={() => setViewImageUrl(proofUrl)}
            >
              View proof
            </Button>
          ) : (
            "—"
          );
        },
      },
    );
    if (canViewAll) {
      cols.push(
        column.text<StaffPayment>({
          id: "created_by",
          header: "Recorded by",
          accessor: (row) => row.created_by?.name ?? "—",
          sizing: { role: "person" },
        }),
      );
    }
    return cols;
  }, [canViewAll, currencySymbol]);

  useFinancePageHeader(
    useMemo(
      () => ({
        actions: canRecord ? (
          <Link
            href="/finances/staff-payments/create"
            className={cn(buttonVariants({ variant: "primary", size: "sm" }))}
          >
            Record payment
          </Link>
        ) : null,
      }),
      [canRecord],
    ),
  );

  const filterSlot = (
    <FilterToolbar>
      <FilterToolbarField label="Pay period">
        <YearMonthSelector
          date={monthDate}
          setDate={(next) => {
            setDate(next);
            tableState.setState({ page: 1 });
          }}
        />
      </FilterToolbarField>
      {canViewAll ? (
        <FilterToolbarField label="Staff member">
          <EntityCombobox
            label=""
            entity="users"
            value={staffId || undefined}
            onChange={(value) => {
              setStaffId(value ?? "");
              tableState.setState({ page: 1 });
            }}
            displayFunction={(u) => `${u.name} (${u.email})`}
            comboboxPlaceholder="All staff"
            allowDeselect
            queryParams={{
              fields: ["id", "name", "email"],
              sorts: ["name"],
              size: -1,
            }}
            filterParams={STAFF_ROLE_FILTER}
          />
        </FilterToolbarField>
      ) : null}
      <FilterToolbarField label="Reference">
        <Input
          value={transactionId}
          onChange={(e) => {
            setTransactionId(e.target.value);
            tableState.setState({ page: 1 });
          }}
          placeholder="Transaction ID"
          className="h-9 min-w-[12rem]"
        />
      </FilterToolbarField>
    </FilterToolbar>
  );

  if (list.isLoading && list.rows.length === 0) {
    return (
      <PageContainer width="wide" aria-busy="true">
        <TableSkeleton columns={canViewAll ? 8 : 6} rows={8} />
      </PageContainer>
    );
  }

  return (
    <PageContainer width="wide">
      <motion.div
        key={`${monthDate.toISOString()}-${staffId}-${transactionId}`}
        variants={crossfade}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        <ResourceTable
          list={list}
          listChrome="unified"
          tableState={tableState}
          columns={columns}
          getRowId={(row) => String(row.id)}
          filterSlot={filterSlot}
        />
      </motion.div>
      <FullScreenImageViewer
        imageUrl={viewImageUrl}
        title="Payment proof"
        onClose={() => setViewImageUrl(null)}
      />
    </PageContainer>
  );
};

export default StaffPaymentsPage;
