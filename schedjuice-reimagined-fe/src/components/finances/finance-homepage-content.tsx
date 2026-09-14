"use client";

import { searchEntities } from "@/app/client-api/utils";
import { FinanceCollectionsLineChart } from "@/components/charts/finance-collections-line-chart";
import { GenericPieChart } from "@/components/charts/generic-pie-chart";
import EntityCombobox from "@/components/form/entity-combobox";
import YearMonthSelector from "@/components/form/selectors/year-month-selector";
import { DatePicker } from "@/components/date/date-picker";
import { FilterToolbar, FilterToolbarField } from "@/components/filters/filter-toolbar";
import { Button, Select, buttonVariants } from "@/components/primitives";
import { FinanceHomepageStatCards } from "@/components/finances/finance-homepage-stat-cards";
import { FeeLifecycleSection } from "@/components/finances/fee-lifecycle-section";
import {
  FinanceHomepageInitialSkeleton,
  FinanceHomepageRefreshingShell,
} from "@/components/finances/finance-homepage-loading";
import { useFinancePageHeader } from "@/components/finances/record/use-finance-record-page-header";
import {
  canViewUnpaidStudents,
  isPaymentMembershipScoped,
} from "@/helpers/authorization";
import { getPieChartConfig } from "@/helpers/charts";
import { formatDecimalString } from "@/helpers/money";
import {
  FINANCE_HOMEPAGE_PERIODS,
  FINANCE_PIE_GROUP_OPTIONS,
  getCurrentMonthCustomRange,
  isFinanceHomepageCustomPeriodIncomplete,
  useFinanceHomepage,
} from "@/hooks/finances/use-finance-homepage";
import { usePermissions } from "@/hooks/usePermissions";
import { useTenantCurrencySymbol } from "@/hooks/useTenantCurrencySymbol";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import {
  getReportsNavHref,
  getTenantReportLinks,
} from "@/lib/reports/tenant-report-links";
import { crossfade } from "@/lib/sj/motion";
import { dashboardSectionStackClassName } from "@/lib/ui-remediation/r7-dashboard-layout-classes";
import { cn } from "@/lib/utils";
import type { filterParamsBody } from "@/types/api";
import { operatorEnum } from "@/types/api";
import { CourseCreationMethod } from "@/types/program";
import type {
  FinanceHomepagePeriod,
  FinanceHomepageResponse,
  FinancePieGroupBy,
} from "@/types/finance/homepage";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowRight, Page as FileText, Plus } from "iconoir-react";
import { motion } from "motion/react";
import Link from "next/link";
import {
  parseAsIsoDateTime,
  parseAsString,
  parseAsStringLiteral,
  useQueryState,
} from "nuqs";
import { useEffect, useMemo, useRef } from "react";

const ACTIVE_PROGRAM_FILTER_PARAMS: filterParamsBody = {
  filter_params: [
    { field_name: "is_active", operator: operatorEnum.exact, value: "true" },
  ],
};

const PERIOD_VALUES = FINANCE_HOMEPAGE_PERIODS.map((p) => p.value);
const PIE_GROUP_VALUES = FINANCE_PIE_GROUP_OPTIONS.map((p) => p.value);

export function FinanceHomepageContent() {
  const currencySymbol = useTenantCurrencySymbol();
  const { tenant } = useTenant();
  const { user } = useUser();
  const { canAny } = usePermissions();

  const [programId, setProgramId] = useQueryState(
    "program",
    parseAsString.withDefault(""),
  );
  const [intakeId, setIntakeId] = useQueryState(
    "intake",
    parseAsString.withDefault(""),
  );
  const [period, setPeriod] = useQueryState(
    "period",
    parseAsStringLiteral(PERIOD_VALUES).withDefault("single_month"),
  );
  const [dateFrom, setDateFrom] = useQueryState(
    "date_from",
    parseAsIsoDateTime,
  );
  const [dateTo, setDateTo] = useQueryState("date_to", parseAsIsoDateTime);
  const [pieGroupBy, setPieGroupBy] = useQueryState(
    "pie_group_by",
    parseAsStringLiteral(PIE_GROUP_VALUES).withDefault("payment_status"),
  );

  const programsQuery = useQuery({
    queryKey: ["finance-homepage-programs"],
    queryFn: () =>
      searchEntities("programs", { size: 100 }, ACTIVE_PROGRAM_FILTER_PARAMS),
  });

  const selectedProgram = useMemo(() => {
    const rows = programsQuery.data?.data?.data ?? programsQuery.data?.data ?? [];
    return (rows as { id: number; is_default?: boolean; course_creation_method?: string }[]).find(
      (p) => String(p.id) === programId,
    );
  }, [programsQuery.data, programId]);

  const isIntakeBased =
    selectedProgram?.course_creation_method === CourseCreationMethod.intake_based;
  const singleIntakeSelected = Boolean(intakeId);
  const effectivePeriod: FinanceHomepagePeriod = useMemo(() => {
    if (isIntakeBased && singleIntakeSelected) {
      return "intake_range";
    }
    return period as FinanceHomepagePeriod;
  }, [isIntakeBased, singleIntakeSelected, period]);

  useEffect(() => {
    if (programId || programsQuery.isLoading) return;
    const rows =
      (programsQuery.data?.data?.data ?? programsQuery.data?.data ?? []) as {
        id: number;
        name?: string;
        is_default?: boolean;
      }[];
    if (!rows.length) return;
    const defaultProgram = rows.find((p) => p.is_default) ?? rows[0];
    void setProgramId(String(defaultProgram.id));
  }, [programId, programsQuery.data, programsQuery.isLoading, setProgramId]);

  useEffect(() => {
    if (period !== "custom" || (dateFrom && dateTo)) return;
    const { dateFrom: monthStart, dateTo: monthEnd } = getCurrentMonthCustomRange();
    if (!dateFrom) void setDateFrom(monthStart);
    if (!dateTo) void setDateTo(monthEnd);
  }, [period, dateFrom, dateTo, setDateFrom, setDateTo]);

  const homepageQuery = useFinanceHomepage({
    programId,
    intakeId,
    period: effectivePeriod,
    dateFrom: dateFrom ?? null,
    dateTo: dateTo ?? null,
    pieGroupBy: pieGroupBy as FinancePieGroupBy,
  });

  const isCustomPeriodIncomplete = isFinanceHomepageCustomPeriodIncomplete({
    period: effectivePeriod,
    dateFrom: dateFrom ?? null,
    dateTo: dateTo ?? null,
  });

  const lastPayloadRef = useRef<FinanceHomepageResponse | undefined>(undefined);
  if (homepageQuery.data) {
    lastPayloadRef.current = homepageQuery.data;
  }

  const payload = homepageQuery.data ?? lastPayloadRef.current;
  const isInitialLoad =
    homepageQuery.isLoading && payload == null && !isCustomPeriodIncomplete;
  const isRefreshing = homepageQuery.isFetching && homepageQuery.data != null;
  const anchorMonth = payload?.meta.anchor_month;
  const monthParam =
    anchorMonth != null
      ? `${anchorMonth.year}-${String(anchorMonth.month).padStart(2, "0")}`
      : dateFrom
        ? format(dateFrom, "yyyy-MM")
        : format(new Date(), "yyyy-MM");

  const quickLinks = useMemo(() => {
    const links: { href: string; label: string; show: boolean }[] = [
      {
        href: `/finances/student-payments?program=${programId}&month=${monthParam}`,
        label: "Student Payments",
        show: canAny(["payment.view_all", "payment.record"]),
      },
      {
        href: `/finances/unpaid-students?program=${programId}&month=${monthParam}`,
        label: "Unpaid Students",
        show: user != null && canViewUnpaidStudents(user),
      },
      {
        href: `/finances/recent-transactions?program=${programId}&from=${payload?.meta.date_from ?? ""}&to=${payload?.meta.date_to ?? ""}`,
        label: "Recent Transactions",
        show: canAny(["payment.view_all"]),
      },
    ];
    return links.filter((l) => l.show);
  }, [canAny, user, programId, monthParam, payload?.meta.date_from, payload?.meta.date_to]);

  const pieChartData = useMemo(
    () =>
      (payload?.pie_chart.slices ?? []).map((slice) => ({
        category: slice.key,
        label: slice.label,
        amount: Number(slice.amount),
        count: slice.count,
      })),
    [payload?.pie_chart.slices],
  );

  const pieChartConfig = useMemo(
    () => getPieChartConfig(pieChartData),
    [pieChartData],
  );

  const pageHeaderToolbar = useMemo(
    () => (
      <FilterToolbar>
        <FilterToolbarField label="Program" width="md">
          <EntityCombobox
            entity="programs"
            label="Program"
            layout="toolbar"
            hideLabel
            value={programId}
            onChange={(v) => {
              void setProgramId(v ?? "");
              void setIntakeId("");
            }}
            filterParams={ACTIVE_PROGRAM_FILTER_PARAMS}
            queryParams={{
              fields: ["id", "name", "is_default", "course_creation_method"],
              sorts: ["name"],
            }}
            displayFunction={(p) => p.name ?? "—"}
            comboboxPlaceholder="Select program"
          />
        </FilterToolbarField>
        {isIntakeBased ? (
          <FilterToolbarField label="Intake" width="md">
            <EntityCombobox
              entity="intakes"
              label="Intake"
              layout="toolbar"
              hideLabel
              value={intakeId}
              onChange={(v) => void setIntakeId(v ?? "")}
              disabled={!programId}
              filterParams={{
                filter_params: programId
                  ? [
                      {
                        field_name: "program",
                        operator: operatorEnum.exact,
                        value: programId,
                      },
                    ]
                  : [],
              }}
              queryParams={{ fields: ["id", "name"], sorts: ["name"] }}
              displayFunction={(i) => i.name ?? "—"}
              comboboxPlaceholder="All intakes"
              allowDeselect
            />
          </FilterToolbarField>
        ) : null}
        {!singleIntakeSelected || !isIntakeBased ? (
          <>
            <FilterToolbarField label="Period" width="md">
              <Select
                value={period}
                onValueChange={(v) => void setPeriod(v as FinanceHomepagePeriod)}
                items={FINANCE_HOMEPAGE_PERIODS.map((p) => ({
                  value: p.value,
                  label: p.label,
                }))}
              />
            </FilterToolbarField>
            {period === "single_month" ? (
              <FilterToolbarField label="Month" width="sm">
                <YearMonthSelector
                  layout="toolbar"
                  date={dateFrom ?? new Date()}
                  setDate={(d) => void setDateFrom(d)}
                />
              </FilterToolbarField>
            ) : null}
            {period === "custom" ? (
              <>
                <FilterToolbarField label="From" width="sm">
                  <DatePicker
                    date={dateFrom ?? undefined}
                    setDate={(d) => void setDateFrom(d ?? null)}
                    size="compact"
                  />
                </FilterToolbarField>
                <FilterToolbarField label="To" width="sm">
                  <DatePicker
                    date={dateTo ?? undefined}
                    setDate={(d) => void setDateTo(d ?? null)}
                    size="compact"
                  />
                </FilterToolbarField>
              </>
            ) : null}
          </>
        ) : null}
        <FilterToolbarField label="Group by" width="md">
          <Select
            value={pieGroupBy}
            onValueChange={(v) => void setPieGroupBy(v as FinancePieGroupBy)}
            items={FINANCE_PIE_GROUP_OPTIONS.map((p) => ({
              value: p.value,
              label: p.label,
            }))}
          />
        </FilterToolbarField>
      </FilterToolbar>
    ),
    [
      programId,
      setProgramId,
      setIntakeId,
      isIntakeBased,
      intakeId,
      singleIntakeSelected,
      period,
      setPeriod,
      dateFrom,
      dateTo,
      setDateFrom,
      setDateTo,
      pieGroupBy,
      setPieGroupBy,
    ],
  );

  const tenantReportLinks = useMemo(() => getTenantReportLinks(tenant), [tenant]);
  const tenantReportHref = useMemo(() => getReportsNavHref(tenant), [tenant]);

  const showEnrollmentPayment = canAny(["payment.record"]);
  const showTenantReport =
    tenantReportLinks.length > 0 && canAny(["analytics.view"]);
  const showQuickLinksNav =
    showEnrollmentPayment || showTenantReport || quickLinks.length > 0;

  useFinancePageHeader(
    useMemo(
      () => ({
        toolbar: pageHeaderToolbar,
      }),
      [pageHeaderToolbar],
    ),
  );

  if (programsQuery.isSuccess && !(programsQuery.data?.data?.data ?? programsQuery.data?.data)?.length) {
    return (
      <p className="text-sm text-muted-foreground">No programs available for your account.</p>
    );
  }

  if (isInitialLoad || !programId) {
    return <FinanceHomepageInitialSkeleton />;
  }

  if (homepageQuery.isError && payload == null && !isCustomPeriodIncomplete) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">Failed to load finance overview.</p>
        <Button size="sm" onClick={() => homepageQuery.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <motion.div {...crossfade} className={dashboardSectionStackClassName()}>
      {isCustomPeriodIncomplete ? (
        <p className="text-sm text-muted-foreground">
          Select a from and to date to load data for this range.
        </p>
      ) : null}

      {showQuickLinksNav ? (
        <nav
          aria-label="Finance quick links"
          className="flex flex-wrap items-center gap-x-2 gap-y-2 border-b border-border pb-4"
        >
          {showEnrollmentPayment ? (
            <Link
              href="/finances/student-payments/enrollment-payment"
              className={cn(
                buttonVariants({ variant: "primary", size: "sm" }),
                "gap-1.5 shadow-sm",
              )}
            >
              <Plus className="size-4 shrink-0" aria-hidden />
              Enrollment payment
            </Link>
          ) : null}
          {showTenantReport ? (
            <Link
              href={tenantReportHref}
              className={cn(
                buttonVariants({ variant: "secondary", size: "sm" }),
                "gap-1.5",
              )}
            >
              <FileText className="size-4 shrink-0" aria-hidden />
              {tenantReportLinks[0]?.label ?? "Reports"}
            </Link>
          ) : null}
          {(showEnrollmentPayment || showTenantReport) && quickLinks.length > 0 ? (
            <span
              className="mx-1 hidden h-4 w-px shrink-0 bg-border sm:inline-block"
              aria-hidden
            />
          ) : null}
          {quickLinks.map((link, index) => (
            <span key={link.href} className="inline-flex items-center">
              {index > 0 ? (
                <span className="mx-3 text-muted-foreground/40" aria-hidden>
                  /
                </span>
              ) : null}
              <Link
                href={link.href}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline decoration-primary/35 underline-offset-4 transition-colors hover:decoration-primary"
              >
                {link.label}
                <ArrowRight className="size-3.5 shrink-0" aria-hidden />
              </Link>
            </span>
          ))}
        </nav>
      ) : null}

      <FinanceHomepageRefreshingShell isRefreshing={isRefreshing}>
        <FinanceHomepageStatCards summary={payload?.summary} currencySymbol={currencySymbol} />
      </FinanceHomepageRefreshingShell>

      <div className="rounded-lg border bg-card p-4">
        <FeeLifecycleSection
          filterState={{
            programId,
            intakeId,
            period: effectivePeriod,
            dateFrom: dateFrom ?? null,
            dateTo: dateTo ?? null,
          }}
        />
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <FinanceHomepageRefreshingShell
          isRefreshing={isRefreshing}
          className="rounded-lg border bg-card p-4"
        >
          <FinanceCollectionsLineChart
            current={payload?.line_chart.current ?? []}
            currencySymbol={currencySymbol}
            description={payload?.meta.period_label}
          />
        </FinanceHomepageRefreshingShell>
        <FinanceHomepageRefreshingShell
          isRefreshing={isRefreshing}
          className="rounded-lg border bg-card p-4"
        >
          <GenericPieChart
            chartConfig={pieChartConfig}
            chartData={pieChartData}
            title="Payment breakdown"
            description={payload?.meta.period_label ?? ""}
            dataKey="amount"
            tooltipFormatter={(value, entry) =>
              `${formatDecimalString(String(value), currencySymbol)} (${entry?.count ?? 0} payments)`
            }
          />
        </FinanceHomepageRefreshingShell>
      </div>

      {user && isPaymentMembershipScoped(user) ? (
        <p className="text-xs text-muted-foreground">
          Showing data for courses you are assigned to within this program.
        </p>
      ) : null}
    </motion.div>
  );
}
