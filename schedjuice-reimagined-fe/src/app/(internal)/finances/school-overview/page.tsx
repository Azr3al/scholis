"use client";

import { PageContainer } from "@/components/layout/page-container";
import { useFinancePageHeader } from "@/components/finances/record/use-finance-record-page-header";
import { makePostRequest } from "@/app/client-api/utils";
import { AggregateCards } from "@/app/(internal)/finances/_components/aggregate-cards";
import { CashFlowNotes } from "@/app/(internal)/finances/_components/cash-flow-notes";
import { OngoingMonthBanner } from "@/app/(internal)/finances/_components/ongoing-month-banner";
import MonthSelector from "@/components/form/selectors/month-selector";
import YearSelector from "@/components/form/selectors/year-selector";
import { ReportSkeleton } from "@/components/loading/structured-skeletons";
import { buttonVariants, Button, Input } from "@/components/primitives";
import { Table, type Column } from "@/components/data-table";
import { Pagination } from "@/components/data-table/parts/pagination";
import { hasAdminCredentials } from "@/helpers/authorization";
import { formatDecimalString } from "@/helpers/money";
import { useTenantCurrencySymbol } from "@/hooks/useTenantCurrencySymbol";
import { useUser } from "@/hooks/useUser";
import { crossfade } from "@/lib/sj/motion";
import { cn } from "@/lib/utils";
import type {
  SchoolOverviewApiEnvelope,
  SchoolOverviewCourse,
  SchoolOverviewPayload,
  SchoolOverviewRequestBody,
} from "@/types/finance/cash-flow";
import { useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { format } from "date-fns";
import { NavArrowLeft, Search } from "iconoir-react";
import { motion } from "motion/react";
import Link from "next/link";
import {
  parseAsArrayOf,
  parseAsInteger,
  parseAsIsoDateTime,
  parseAsString,
  useQueryState,
} from "nuqs";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useDebouncedCallback } from "use-debounce";

const PAGE_SIZE = 20;

function getSchoolOverviewPayload(
  res: SchoolOverviewApiEnvelope | undefined,
): SchoolOverviewPayload | undefined {
  if (!res) return undefined;
  if (res.courses != null && res.grand_aggregate != null) {
    return {
      courses: res.courses,
      count: res.count ?? res.courses.length,
      grand_aggregate: res.grand_aggregate,
      is_ongoing_month: res.is_ongoing_month,
    };
  }
  const nested = res.data;
  if (nested?.courses != null && nested?.grand_aggregate != null) {
    return {
      ...nested,
      count: nested.count ?? nested.courses.length,
      is_ongoing_month: nested.is_ongoing_month ?? res.is_ongoing_month,
    };
  }
  return undefined;
}

const SchoolOverviewPage = () => {
  const router = useRouter();
  const currencySymbol = useTenantCurrencySymbol();
  const { user, isLoading: userLoading } = useUser();
  const defaultDateParser = useMemo(
    () => parseAsIsoDateTime.withDefault(new Date()),
    [],
  );
  const [date, setDate] = useQueryState("date", defaultDateParser);
  const [q, setQ] = useQueryState("q", parseAsString.withDefault(""));
  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(1));
  const [sorts, setSorts] = useQueryState(
    "sorts",
    parseAsArrayOf(parseAsString).withDefault(["course_title"]),
  );

  const [draftQ, setDraftQ] = useState(q);
  useEffect(() => setDraftQ(q), [q]);
  const setQDebounced = useDebouncedCallback((value: string) => {
    void setQ(value);
    void setPage(1);
  }, 200);

  const allowed = user ? hasAdminCredentials(user) : false;

  useEffect(() => {
    if (!userLoading && user && !hasAdminCredentials(user)) {
      router.replace("/home");
    }
  }, [userLoading, user, router]);

  const overviewQuery = useQuery({
    queryKey: [
      "schoolOverviewTrphillips",
      date.getFullYear(),
      date.getMonth() + 1,
      q,
      page,
      PAGE_SIZE,
      sorts,
    ],
    enabled: allowed,
    keepPreviousData: true,
    queryFn: async () => {
      const body: SchoolOverviewRequestBody = {
        month: date.getMonth() + 1,
        year: date.getFullYear(),
        q: q.trim() || undefined,
        page,
        size: PAGE_SIZE,
        sorts: sorts.length ? sorts : ["course_title"],
      };
      const res = await makePostRequest(
        "cash-flow/trphillips/school-overview",
        body,
      );
      return res.data as SchoolOverviewApiEnvelope;
    },
  });

  const payload = getSchoolOverviewPayload(overviewQuery.data);
  const courses = payload?.courses ?? [];
  const count = payload?.count ?? 0;
  const grandAggregate = payload?.grand_aggregate;
  const isOngoingMonth = payload?.is_ongoing_month ?? false;
  const apiErrorMessage =
    overviewQuery.data?.message ||
    (isAxiosError(overviewQuery.error)
      ? String(
          (overviewQuery.error.response?.data as { message?: string } | undefined)
            ?.message ?? overviewQuery.error.message,
        )
      : null);

  const cashFlowHrefForCourse = (courseId: number) =>
    `/finances/cash-flow?courseId=${courseId}&date=${encodeURIComponent(date.toISOString())}`;

  const tableColumns = useMemo(
    (): Column<SchoolOverviewCourse>[] => [
      {
        id: "course_title",
        header: "Course",
        accessor: (row: SchoolOverviewCourse) => row.course_title,
        enableSorting: true,
        sizing: { role: "prose", width: { min: "14rem" }, sticky: "left" },
        cell: ({ row }: { row: SchoolOverviewCourse }) => (
          <Link
            href={cashFlowHrefForCourse(row.course_id)}
            className="font-medium text-text-primary underline-offset-4 hover:underline"
          >
            {row.course_title || "Untitled course"}
          </Link>
        ),
      },
      {
        id: "mt_name",
        header: "MT name",
        accessor: (row) => row.mt_name || "",
        enableSorting: true,
        sizing: { role: "prose", width: { min: "10rem" } },
        cell: ({ value }) => (
          <span className="text-text-primary">
            {value ? String(value) : "—"}
          </span>
        ),
      },
      {
        id: "total_income",
        header: "Total income",
        accessor: (row) =>
          formatDecimalString(row.total_income, currencySymbol),
        align: "right",
        sizing: { role: "numeric", tabular: true },
        enableSorting: true,
        cell: ({ value }) => (
          <span className="block text-right tabular-nums text-text-primary">
            {value == null || value === "" ? "—" : String(value)}
          </span>
        ),
      },
      {
        id: "total_expense",
        header: "Total expense",
        accessor: (row) =>
          formatDecimalString(row.total_expense, currencySymbol),
        align: "right",
        sizing: { role: "numeric", tabular: true },
        enableSorting: true,
        cell: ({ value }) => (
          <span className="block text-right tabular-nums text-text-primary">
            {value == null || value === "" ? "—" : String(value)}
          </span>
        ),
      },
      {
        id: "total_profit",
        header: "Total profit",
        accessor: (row) =>
          formatDecimalString(row.total_profit, currencySymbol),
        align: "right",
        sizing: { role: "numeric", tabular: true },
        enableSorting: true,
        cell: ({ value }) => (
          <span className="block text-right tabular-nums text-text-primary">
            {value == null || value === "" ? "—" : String(value)}
          </span>
        ),
      },
    ],
    [currencySymbol, date],
  );

  useFinancePageHeader(
    useMemo(
      () =>
        user && allowed
          ? {
              actions: (
                <Link
                  href={`/finances/cash-flow?date=${encodeURIComponent(date.toISOString())}`}
                  className={cn(
                    buttonVariants({ variant: "secondary", size: "sm" }),
                    "gap-2",
                  )}
                >
                  <NavArrowLeft className="size-4 shrink-0" aria-hidden />
                  Back to cash flow
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

  const qTrimmed = q.trim();
  const showEmptyMonth =
    !overviewQuery.isLoading &&
    !overviewQuery.isError &&
    !overviewQuery.data?.isError &&
    count === 0 &&
    !qTrimmed;
  const showSearchEmpty =
    !overviewQuery.isLoading &&
    !overviewQuery.isError &&
    !overviewQuery.data?.isError &&
    count === 0 &&
    Boolean(qTrimmed);
  const showTable =
    !overviewQuery.isLoading &&
    !overviewQuery.isError &&
    !overviewQuery.data?.isError &&
    count > 0;
  const showCards =
    !overviewQuery.isLoading &&
    !overviewQuery.isError &&
    !overviewQuery.data?.isError &&
    (count > 0 || Boolean(qTrimmed));

  return (
    <PageContainer width="wide" className="space-y-3">
      <motion.div
        variants={crossfade}
        initial="initial"
        animate="animate"
        className="space-y-3"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <YearSelector
            date={date}
            setDate={(newDate) => {
              void setDate(new Date(newDate.getFullYear(), date.getMonth(), 1));
              void setPage(1);
            }}
          />
          <MonthSelector
            date={date}
            setDate={(newDate) => {
              void setDate(new Date(date.getFullYear(), newDate.getMonth(), 1));
              void setPage(1);
            }}
          />
          <div className="relative min-w-[12rem] w-full max-w-sm sm:w-72 sm:flex-none">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-muted"
              aria-hidden
            />
            <Input
              type="search"
              value={draftQ}
              onChange={(e) => {
                const next = e.target.value;
                setDraftQ(next);
                setQDebounced(next);
              }}
              placeholder="Search courses…"
              className="h-10 border-border bg-surface pl-8"
              aria-label="Search courses"
            />
          </div>
        </div>

        <p className="text-sm text-text-secondary">
          <span className="font-semibold text-text-primary">
            {format(date, "MMMM yyyy")}
          </span>
        </p>
        <CashFlowNotes />
        <OngoingMonthBanner show={isOngoingMonth} />

        {overviewQuery.isLoading && !payload ? (
          <ReportSkeleton tableColumns={5} />
        ) : overviewQuery.isError || overviewQuery.data?.isError ? (
          <p className="text-sm text-danger" role="alert">
            {apiErrorMessage ||
              "Failed to load school overview. Ensure the API endpoint is available and try again."}
          </p>
        ) : showEmptyMonth ? (
          <p className="py-6 text-center text-sm text-text-muted">
            No courses with cash-flow activity this month.
          </p>
        ) : (
          <>
            {showCards ? (
              <AggregateCards
                aggregate={grandAggregate}
                currencySymbol={currencySymbol}
              />
            ) : null}

            {showSearchEmpty ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <p className="text-sm text-text-muted">
                  No courses match your search.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setDraftQ("");
                    void setQ("");
                    void setPage(1);
                  }}
                >
                  Clear search
                </Button>
              </div>
            ) : null}

            {showTable ? (
              <div className="min-w-0 space-y-0">
                <div className="min-w-0 overflow-x-auto">
                  <Table
                    columns={tableColumns}
                    rows={courses}
                    getRowId={(row) => String(row.course_id)}
                    sorts={sorts}
                    onSortsChange={(next) => {
                      void setSorts(next.length ? next : ["course_title"]);
                      void setPage(1);
                    }}
                  />
                </div>
                <Pagination
                  page={page}
                  pageSize={PAGE_SIZE}
                  totalCount={count}
                  onPageChange={(next) => {
                    void setPage(next);
                  }}
                />
              </div>
            ) : null}
          </>
        )}
      </motion.div>
    </PageContainer>
  );
};

export default SchoolOverviewPage;
