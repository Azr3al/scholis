"use client";

import { PageContainer } from "@/components/layout/page-container";
import { useFinancePageHeader } from "@/components/finances/record/use-finance-record-page-header";
import { makePostRequest } from "@/app/client-api/utils";
import { AggregateCards } from "@/app/(internal)/finances/_components/aggregate-cards";
import { CashFlowNotes } from "@/app/(internal)/finances/_components/cash-flow-notes";
import { OngoingMonthBanner } from "@/app/(internal)/finances/_components/ongoing-month-banner";
import EntityCombobox from "@/components/form/entity-combobox";
import YearMonthSelector from "@/components/form/selectors/year-month-selector";
import { FilterToolbar } from "@/components/filters/filter-toolbar";
import { ReportSkeleton } from "@/components/loading/structured-skeletons";
import { buttonVariants } from "@/components/primitives";
import { Table, column, type Column } from "@/components/data-table";
import { formatDate } from "@/helpers/date";
import { hasAdminCredentials } from "@/helpers/authorization";
import { formatDecimalString } from "@/helpers/money";
import { useTenantCurrencySymbol } from "@/hooks/useTenantCurrencySymbol";
import { useUser } from "@/hooks/useUser";
import { crossfade } from "@/lib/sj/motion";
import { cn } from "@/lib/utils";
import type {
  CashFlowRow,
  CashFlowTrphillipsApiEnvelope,
  CashFlowTrphillipsPayload,
  CashFlowTrphillipsRequestBody,
} from "@/types/finance/cash-flow";
import { useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { format } from "date-fns";
import { motion } from "motion/react";
import Link from "next/link";
import { parseAsIsoDateTime, parseAsString, useQueryState } from "nuqs";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";

function getCashFlowPayload(
  res: CashFlowTrphillipsApiEnvelope | undefined,
): CashFlowTrphillipsPayload | undefined {
  if (!res) return undefined;
  if (res.rows != null && res.aggregate != null) {
    return {
      rows: res.rows,
      aggregate: res.aggregate,
      is_ongoing_month: res.is_ongoing_month,
    };
  }
  const nested = res.data;
  if (nested?.rows != null && nested?.aggregate != null) {
    return {
      ...nested,
      is_ongoing_month: nested.is_ongoing_month ?? res.is_ongoing_month,
    };
  }
  return undefined;
}

const CashFlowPage = () => {
  const router = useRouter();
  const currencySymbol = useTenantCurrencySymbol();
  const { user, isLoading: userLoading } = useUser();
  const defaultDateParser = useMemo(
    () => parseAsIsoDateTime.withDefault(new Date()),
    [],
  );
  const [date, setDate] = useQueryState("date", defaultDateParser);
  const [courseId, setCourseId] = useQueryState(
    "courseId",
    parseAsString.withDefault(""),
  );

  const allowed = user ? hasAdminCredentials(user) : false;

  useEffect(() => {
    if (!userLoading && user && !hasAdminCredentials(user)) {
      router.replace("/home");
    }
  }, [userLoading, user, router]);

  const cashFlowQuery = useQuery({
    queryKey: [
      "cashFlowTrphillips",
      courseId,
      date.getFullYear(),
      date.getMonth() + 1,
    ],
    enabled: allowed && courseId !== "",
    queryFn: async () => {
      const body: CashFlowTrphillipsRequestBody = {
        month: date.getMonth() + 1,
        year: date.getFullYear(),
        course_id: Number(courseId),
      };
      const res = await makePostRequest("cash-flow/trphillips", body);
      return res.data as CashFlowTrphillipsApiEnvelope;
    },
  });

  const payload = getCashFlowPayload(cashFlowQuery.data);
  const rows = payload?.rows ?? [];
  const aggregate = payload?.aggregate;
  const isOngoingMonth = payload?.is_ongoing_month ?? false;
  const apiErrorMessage =
    cashFlowQuery.data?.message ||
    (isAxiosError(cashFlowQuery.error)
      ? String(
          (cashFlowQuery.error.response?.data as { message?: string } | undefined)
            ?.message ??
            cashFlowQuery.error.message,
        )
      : null);

  const tableColumns = useMemo(
    (): Column<CashFlowRow>[] => [
      column.text<CashFlowRow>({
        id: "date",
        header: "Date",
        accessor: (row) => formatDate(row.date),
      }),
      {
        id: "student_count",
        header: "Student count",
        accessor: (row) => String(row.student_count),
        align: "right",
        sizing: { role: "numeric" },
        enableSorting: true,
        cell: ({ value }) => (
          <span className="block text-right tabular-nums">
            {value == null || value === "" ? "—" : String(value)}
          </span>
        ),
      },
      {
        id: "income",
        header: "Income",
        accessor: (row) => formatDecimalString(row.income, currencySymbol),
        align: "right",
        sizing: { role: "numeric", tabular: true },
        enableSorting: true,
        cell: ({ value }) => (
          <span className="block text-right tabular-nums">
            {value == null || value === "" ? "—" : String(value)}
          </span>
        ),
      },
      {
        id: "expense",
        header: "Expense",
        accessor: (row) => formatDecimalString(row.expense, currencySymbol),
        align: "right",
        sizing: { role: "numeric", tabular: true },
        enableSorting: true,
        cell: ({ value }) => (
          <span className="block text-right tabular-nums">
            {value == null || value === "" ? "—" : String(value)}
          </span>
        ),
      },
      {
        id: "profit",
        header: "Profit",
        accessor: (row) => formatDecimalString(row.profit, currencySymbol),
        align: "right",
        sizing: { role: "numeric", tabular: true },
        enableSorting: true,
        cell: ({ value }) => (
          <span className="block text-right tabular-nums">
            {value == null || value === "" ? "—" : String(value)}
          </span>
        ),
      },
    ],
    [currencySymbol],
  );

  useFinancePageHeader(
    useMemo(
      () =>
        user && allowed
          ? {
              actions: (
                <Link
                  href={`/finances/school-overview?date=${encodeURIComponent(date.toISOString())}`}
                  className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
                >
                  School Overview
                </Link>
              ),
            }
          : undefined,
      [user, allowed, date],
    ),
  );

  if (userLoading || (user && !allowed)) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div
          role="status"
          aria-label="Loading"
          className="size-8 animate-spin rounded-full border-2 border-border border-t-text-primary motion-reduce:animate-none"
        />
      </div>
    );
  }

  if (!user || !allowed) {
    return null;
  }

  return (
    <PageContainer width="wide" className="space-y-3">
      <motion.div
        variants={crossfade}
        initial="initial"
        animate="animate"
        className="space-y-3"
      >
        <FilterToolbar>
          <EntityCombobox
            canSetDefaultValue={true}
            label="Course"
            layout="toolbar"
            containerClassName="min-w-[200px]"
            entity="courses"
            displayFunction={(c) => c.title}
            value={courseId || undefined}
            onChange={(value) => setCourseId(value ?? "")}
            queryParams={{
              sorts: ["title"],
              fields: ["id", "title"],
              size: -1,
            }}
          />
          <YearMonthSelector
            layout="toolbar"
            date={date}
            setDate={(d) => setDate(d)}
          />
        </FilterToolbar>

        <p>
          Showing data for{" "}
          <span className="font-semibold">{format(date, "MMMM yyyy")}</span>
        </p>
        <CashFlowNotes />
        <OngoingMonthBanner show={isOngoingMonth && courseId !== ""} />

        {cashFlowQuery.isLoading ? (
          <ReportSkeleton tableColumns={5} />
        ) : cashFlowQuery.isError || cashFlowQuery.data?.isError ? (
          <p className="text-sm text-danger" role="alert">
            {apiErrorMessage ||
              "Failed to load cash flow. Ensure the API endpoint is available and try again."}
          </p>
        ) : courseId === "" ? (
          <p className="py-8 text-center text-sm text-text-muted">
            Select a course to load cash flow.
          </p>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-text-muted">
            No sessions in this period for the selected filters.
          </p>
        ) : (
          <>
            <AggregateCards
              aggregate={aggregate}
              currencySymbol={currencySymbol}
            />

            <div className="min-w-0 overflow-x-auto">
              <Table
                columns={tableColumns}
                rows={rows}
                getRowId={(row) => String(row.date)}
              />
            </div>
          </>
        )}
      </motion.div>
    </PageContainer>
  );
};

export default CashFlowPage;
