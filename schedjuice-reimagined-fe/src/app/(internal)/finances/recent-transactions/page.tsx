"use client";

import { DatePicker } from "@/app/_chrome/date-picker";
import EntityCombobox from "@/components/form/entity-combobox";
import Selector from "@/components/form/selectors/selector";
import YearMonthSelector from "@/components/form/selectors/year-month-selector";
import { FilterToolbar, FilterToolbarAction, FilterToolbarField } from "@/components/filters/filter-toolbar";
import { PaymentCoverageEditDialog } from "@/components/finances/payment-coverage-edit-dialog";
import {
  PaymentBankFilterChips,
  PaymentBankMultiSelectFilter,
} from "@/components/finances/payment-bank-multi-select-filter";
import { buildRecentTransactionsColumns } from "@/components/finances/recent-transactions-cells";
import { RecentTransactionsTimeline } from "@/components/finances/recent-transactions-timeline";
import { StudentPaymentsDrawer } from "@/components/finances/student-payments-drawer";
import { useFinancePageHeader } from "@/components/finances/record/use-finance-record-page-header";
import { PageContainer } from "@/components/layout/page-container";
import { resourceTableListChromeClassName } from "@/components/data-table/parts/toolbar";
import { TableSkeleton } from "@/components/loading/structured-skeletons";
import {
  Button,
  Dialog,
  Input,
  buttonVariants,
  useToast,
} from "@/components/primitives";
import { getActiveCourseFilterParams } from "@/helpers/date";
import { snakeToTitle } from "@/helpers/formatters";
import {
  isPaymentMembershipScoped,
} from "@/helpers/authorization";
import {
  downloadReceiptForPaymentRow,
  notifyReceiptDownloadError,
} from "@/helpers/payment-receipt";
import { transactionDuplicatesHref } from "@/helpers/student-payments-transaction-lookup";
import { useRecentTransactionsInfinite } from "@/hooks/finances/use-recent-transactions-infinite";
import { useTenant } from "@/hooks/useTenant";
import { useTenantCurrencySymbol } from "@/hooks/useTenantCurrencySymbol";
import { useUser } from "@/hooks/useUser";
import { buildRecentTxnFilterParams } from "@/lib/finances/build-recent-txn-filter-params";
import {
  getRecentTxnDateField,
  groupTransactionsByDay,
} from "@/lib/finances/group-transactions-by-day";
import { parseRecentTxnRowDrawerContext } from "@/lib/finances/recent-transactions-row-utils";
import { cn } from "@/lib/utils";
import type { UserPayment } from "@/sdk";
import { operatorEnum } from "@/types/api";
import { PaymentBank, UserPaymentStatus } from "@/types/finance";
import { TransactionScreenshotStrategy } from "@/types/organization";
import type { accountType } from "@/types/user";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDateFormatter } from "react-aria";
import { useQueryClient } from "@tanstack/react-query";

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function isCurrentMonth(date: Date): boolean {
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth()
  );
}

function scrollMainToTop() {
  document.getElementById("main-content")?.scrollTo({ top: 0 });
}

const RecentTransactionPage = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();

  const [transactionId, setTransactionId] = useState("");
  const [monthDate, setMonthDate] = useState(() => startOfMonth(new Date()));
  const [day, setDay] = useState<Date | undefined>(undefined);
  const [courseId, setCourseId] = useState("");
  const [status, setStatus] = useState<UserPaymentStatus | undefined>(
    undefined,
  );
  const [selectedBanks, setSelectedBanks] = useState<PaymentBank[]>([]);
  const [viewImageUrl, setViewImageUrl] = useState<string | null>(null);
  const [coverageEdit, setCoverageEdit] = useState<null | {
    paymentIds: number[];
    courseStartDate?: string | null;
    courseEndDate?: string | null;
  }>(null);
  const [downloadingReceiptId, setDownloadingReceiptId] = useState<
    number | null
  >(null);
  const toast = useToast();
  const { tenant, isLoading: isTenantLoading } = useTenant();
  const currencySymbol = useTenantCurrencySymbol();
  const { user } = useUser();

  const showBankFilter =
    tenant?.transaction_screenshot_strategy !==
    TransactionScreenshotStrategy.user_upload;

  const [studentId, setStudentId] = useState("");
  const [drawerCourseId, setDrawerCourseId] = useState("");
  const [drawerMonthDate, setDrawerMonthDate] = useState(() => new Date());
  const [drawerCourseTitle, setDrawerCourseTitle] = useState<string | null>(
    null,
  );

  const handleMonthChange = useCallback((next: Date) => {
    const anchor = startOfMonth(next);
    setMonthDate(anchor);
    setDay((prev) =>
      prev &&
      (prev.getFullYear() !== anchor.getFullYear() ||
        prev.getMonth() !== anchor.getMonth())
        ? undefined
        : prev,
    );
  }, []);

  const clearMonthFilter = useCallback(() => {
    setMonthDate(startOfMonth(new Date()));
    setDay(undefined);
  }, []);

  const openStudentFromRow = useCallback((row: UserPayment) => {
    const ctx = parseRecentTxnRowDrawerContext(row);
    if (!ctx) return;
    setStudentId(ctx.studentId);
    setDrawerCourseId(ctx.courseId);
    setDrawerMonthDate(ctx.monthDate);
    setDrawerCourseTitle(ctx.courseTitle);
  }, []);

  const clearStudentId = useCallback(() => {
    setStudentId("");
    setDrawerCourseId("");
    setDrawerCourseTitle(null);
  }, []);

  const openCoverageEdit = useCallback((row: UserPayment) => {
    setCoverageEdit({
      paymentIds: [row.id],
      courseStartDate: row.course?.start_date ?? null,
      courseEndDate: row.course?.end_date ?? null,
    });
  }, []);

  const handleDownloadReceipt = useCallback(
    async (row: UserPayment) => {
      if (!tenant) return;
      setDownloadingReceiptId(row.id);
      try {
        await downloadReceiptForPaymentRow(
          row,
          tenant,
          currencySymbol,
          user?.name ?? null,
        );
      } catch (err) {
        notifyReceiptDownloadError(toast, err);
      } finally {
        setDownloadingReceiptId(null);
      }
    },
    [tenant, currencySymbol, user?.name, toast],
  );

  useEffect(() => {
    const sid = searchParams.get("studentId");
    const cid = searchParams.get("courseId");
    const month = searchParams.get("month");
    if (!sid || !cid || !month) return;
    const [y, m] = month.split("-").map(Number);
    if (!y || !m) return;
    setStudentId(sid);
    setDrawerCourseId(cid);
    setDrawerMonthDate(new Date(y, m - 1, 1));
  }, [searchParams]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (studentId && drawerCourseId) {
      params.set("studentId", studentId);
      params.set("courseId", drawerCourseId);
      params.set(
        "month",
        `${drawerMonthDate.getFullYear()}-${String(drawerMonthDate.getMonth() + 1).padStart(2, "0")}`,
      );
    } else {
      params.delete("studentId");
      params.delete("courseId");
      params.delete("month");
    }
    const qs = params.toString();
    const nextUrl = qs ? `${pathname}?${qs}` : pathname;
    const currentUrl = searchParams.toString()
      ? `${pathname}?${searchParams.toString()}`
      : pathname;
    if (nextUrl !== currentUrl) {
      router.replace(nextUrl, { scroll: false });
    }
  }, [studentId, drawerCourseId, drawerMonthDate, pathname, router, searchParams]);

  useEffect(() => {
    if (!studentId.trim()) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        clearStudentId();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [studentId, clearStudentId]);

  const getFilterParams = useCallback((u: accountType) => {
    const fParams = {
      filter_params: [...getActiveCourseFilterParams()],
    };
    if (isPaymentMembershipScoped(u)) {
      fParams.filter_params?.push({
        field_name: "user_courses__user_id",
        operator: operatorEnum.exact,
        value: String(u.id),
      });
    }
    return fParams;
  }, []);

  const courseComboboxFilterParams = useMemo(() => {
    if (!user) return undefined;
    return getFilterParams(user).filter_params;
  }, [user, getFilterParams]);

  const filterParams = useMemo(() => {
    if (!user) return [];
    return (
      buildRecentTxnFilterParams(user, {
        transactionId,
        monthDate,
        day,
        courseId,
        status,
        tenant,
        paymentBanks: showBankFilter ? selectedBanks : undefined,
      }).filter_params ?? []
    );
  }, [
    user,
    courseId,
    transactionId,
    monthDate,
    day,
    status,
    tenant,
    selectedBanks,
    showBankFilter,
  ]);

  const listEnabled =
    Boolean(user) &&
    (user && isPaymentMembershipScoped(user) ? filterParams.length > 0 : true);

  const infinite = useRecentTransactionsInfinite({
    filterParams,
    sorts: ["-payment_date"],
    enabled: listEnabled,
  });

  const applyFilters = useCallback(() => {
    scrollMainToTop();
    void infinite.refetch();
  }, [infinite.refetch]);

  const clearFilters = useCallback(() => {
    setMonthDate(startOfMonth(new Date()));
    setDay(undefined);
    setTransactionId("");
    setCourseId("");
    setStatus(undefined);
    setSelectedBanks([]);
    scrollMainToTop();
    void queryClient.invalidateQueries({
      queryKey: ["recent-transactions-infinite"],
    });
  }, [queryClient]);

  const dateLabelFormatter = useDateFormatter({
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  const formatDayLabel = useCallback(
    (dateKey: string) => {
      const [y, m, d] = dateKey.split("-").map(Number);
      return dateLabelFormatter.format(new Date(y, m - 1, d, 12, 0, 0));
    },
    [dateLabelFormatter],
  );

  const dateField = getRecentTxnDateField();
  const sections = useMemo(
    () =>
      groupTransactionsByDay({
        rows: infinite.rows,
        timezone: tenant?.timezone ?? "UTC",
        dateField,
        formatDayLabel,
      }),
    [infinite.rows, tenant?.timezone, dateField, formatDayLabel],
  );

  const columns = useMemo(() => {
    if (!tenant || !user) return [];
    return buildRecentTransactionsColumns({
      tenant,
      user,
      currencySymbol,
      pathname,
      searchParams,
      onOpenStudent: openStudentFromRow,
      onOpenCoverageEdit: openCoverageEdit,
      onDownloadReceipt: handleDownloadReceipt,
      downloadingReceiptId,
      onViewScreenshot: (url) => setViewImageUrl(url),
      onDuplicateSearch: (tid) => {
        router.push(transactionDuplicatesHref(tid, pathname, searchParams));
      },
    });
  }, [
    tenant,
    user,
    currencySymbol,
    pathname,
    searchParams,
    openStudentFromRow,
    openCoverageEdit,
    handleDownloadReceipt,
    downloadingReceiptId,
    router,
  ]);

  const headerActions = useMemo(
    () => (
      <Link
        href={`${pathname}/verification-upload`}
        className={cn(buttonVariants({ variant: "primary" }))}
      >
        Upload Verification File
      </Link>
    ),
    [pathname],
  );

  useFinancePageHeader(
    useMemo(
      () => ({
        actions: headerActions,
      }),
      [headerActions],
    ),
  );

  const monthStart = monthDate ? startOfMonth(monthDate) : undefined;
  const monthEnd = monthDate
    ? new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)
    : undefined;

  if (isTenantLoading) {
    return (
      <PageContainer width="wide">
        <TableSkeleton columns={8} rows={6} />
      </PageContainer>
    );
  }

  return (
    <PageContainer width="wide">
      <div className={cn(resourceTableListChromeClassName(), "min-w-0")}>
        <div className="space-y-3 border-b border-border-subtle px-3 py-3">
          <FilterToolbar>
            <FilterToolbarField
              label={
                tenant?.transaction_screenshot_strategy ===
                TransactionScreenshotStrategy.user_upload
                  ? "Upload month"
                  : "Month"
              }
              width="md"
            >
              <div className="flex h-10 items-center gap-2">
                <YearMonthSelector
                  date={monthDate}
                  setDate={handleMonthChange}
                  layout="toolbar"
                />
                {day || !isCurrentMonth(monthDate) ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={clearMonthFilter}
                  >
                    Clear
                  </Button>
                ) : null}
              </div>
            </FilterToolbarField>
            <FilterToolbarField label="Day" width="md">
              <DatePicker
                date={day}
                setDate={setDay}
                disabled={!monthDate}
                fromDate={monthStart}
                toDate={monthEnd}
                defaultMonth={monthStart}
              />
            </FilterToolbarField>
            <FilterToolbarField label="Transaction ID" width="md">
              <Input
                className="h-10 w-full min-w-52 max-w-xs"
                value={transactionId}
                onChange={(e) => {
                  e.preventDefault();
                  setTransactionId(e.target.value);
                }}
              />
            </FilterToolbarField>
            {user ? (
              <EntityCombobox
                filterParams={{
                  filter_params: courseComboboxFilterParams,
                }}
                queryParams={{
                  fields: ["title", "id"],
                  sorts: ["title"],
                }}
                displayFunction={(e) => e.title}
                entity={"courses"}
                value={courseId}
                onChange={(v) => setCourseId(v)}
                label="Course"
                layout="toolbar"
                containerClassName="w-60 min-w-56"
              />
            ) : null}
            <Selector
              options={Object.keys(UserPaymentStatus).map((o) => ({
                value: o,
                label: snakeToTitle(o),
              }))}
              value={status}
              onChange={(v) => setStatus(v as UserPaymentStatus)}
              label="Status"
              layout="toolbar"
            />
            {showBankFilter ? (
              <PaymentBankMultiSelectFilter
                selectedBanks={selectedBanks}
                onSelectedBanksChange={setSelectedBanks}
              />
            ) : null}
            <FilterToolbarAction>
              <div className="flex items-center gap-2">
                <Button onClick={applyFilters} type="button">
                  Search
                </Button>
                <Button onClick={clearFilters} type="button" variant="secondary">
                  Clear
                </Button>
              </div>
            </FilterToolbarAction>
          </FilterToolbar>
          {showBankFilter ? (
            <PaymentBankFilterChips
              selectedBanks={selectedBanks}
              onSelectedBanksChange={setSelectedBanks}
            />
          ) : null}
        </div>

        {tenant && user ? (
          <RecentTransactionsTimeline
            rows={infinite.rows}
            sections={sections}
            columns={columns}
            hasNextPage={infinite.hasNextPage}
            isFetchingNextPage={infinite.isFetchingNextPage}
            isLoading={infinite.isLoading}
            fetchNextPage={infinite.fetchNextPage}
          />
        ) : null}
      </div>

      <StudentPaymentsDrawer
          studentId={studentId}
          courseId={drawerCourseId}
          monthDate={drawerMonthDate}
          courseTitle={drawerCourseTitle}
          onClose={clearStudentId}
          onViewScreenshot={(url) => setViewImageUrl(url)}
        />

        <Dialog.Root
          open={!!viewImageUrl}
          onOpenChange={(open) => {
            if (!open) setViewImageUrl(null);
          }}
        >
          <Dialog.Portal>
            <Dialog.Backdrop />
            <Dialog.Popup className="max-h-[90vh] w-full max-w-4xl overflow-auto">
              <Dialog.Title>Screenshot</Dialog.Title>
              <div className="flex justify-center">
                {viewImageUrl ? (
                  <Image
                    src={viewImageUrl}
                    alt="payment screenshot"
                    width={800}
                    height={600}
                    className="max-h-[70vh] max-w-full rounded-lg object-contain"
                    unoptimized={true}
                  />
                ) : null}
              </div>
            </Dialog.Popup>
          </Dialog.Portal>
        </Dialog.Root>

        <PaymentCoverageEditDialog
          open={coverageEdit !== null}
          onOpenChange={(open) => {
            if (!open) setCoverageEdit(null);
          }}
          paymentIds={coverageEdit?.paymentIds ?? []}
          courseStartDate={coverageEdit?.courseStartDate}
          courseEndDate={coverageEdit?.courseEndDate}
          onSaved={() => {
            void queryClient.invalidateQueries({
              queryKey: ["recent-transactions-infinite"],
            });
          }}
        />
    </PageContainer>
  );
};

export default RecentTransactionPage;
