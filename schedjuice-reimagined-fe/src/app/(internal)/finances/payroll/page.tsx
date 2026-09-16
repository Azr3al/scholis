"use client";

import { PageContainer } from "@/components/layout/page-container";
import { useFinancePageHeader } from "@/components/finances/record/use-finance-record-page-header";
import { makePostRequest } from "@/app/client-api/utils";
import EntityCombobox from "@/components/form/entity-combobox";
import { FilterToolbar } from "@/components/filters/filter-toolbar";
import { Loader } from "@/components/form/loader";
import YearMonthSelector from "@/components/form/selectors/year-month-selector";
import { Table, column, type Column } from "@/components/data-table";
import {
  isPastPayPeriod,
  PayrollPaymentCard,
} from "@/components/finances/payroll/payroll-payment-card";
import { PayrollPayslipSheet } from "@/components/finances/payroll/payroll-payslip-sheet";
import {
  PayrollEarningsCard,
  PayrollFinalizedHint,
  PayrollHoursCard,
  payrollSummaryGridClassName,
} from "@/components/finances/payroll/payroll-summary-cards";
import { Switch } from "@/components/primitives";
import { queryParamDefault } from "@/config/defaults";
import { formatDate, getUserTimezoneInfo } from "@/helpers/date";
import {
  formatOrgTime,
  resolveTimeDisplayFormat,
} from "@/helpers/time-format";
import { utcDateTimeToTenantHHmm } from "@/helpers/checkin-history";
import { permissionsFor } from "@/helpers/authorization";
import { listToApiArray } from "@/helpers/filter-params";
import {
  formatPayrollHours,
  formatPayrollMoney,
} from "@/lib/payroll/format";
import {
  buildSessionBasedCourseSummaries,
  buildTrphillipsCourseSummaries,
  type PayrollSessionRow as PayrollGroupSessionRow,
} from "@/lib/payroll/group-by-course";
import { useTenant } from "@/hooks/useTenant";
import { useTenantCurrencySymbol } from "@/hooks/useTenantCurrencySymbol";
import { useUser } from "@/hooks/useUser";
import { useStaffPaymentsList } from "@/sdk/hooks/staff-payments";
import { operatorEnum } from "@/types/api";
import { PayrollPaymentStatus } from "@/types/payroll-payment";
import { PayrollCalculationStrategy } from "@/types/organization";
import { role } from "@/types/user";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useMemo, useState } from "react";

type PayrollSessionRow = PayrollGroupSessionRow & {
  date?: string;
  checkin_time?: string;
  checkout_time?: string;
  per_session_rate?: number;
  hourly_rate?: number;
  student_bonus_rate?: number;
  student_count?: number;
};

type CourseSummaryRow = {
  courseTitle: string;
  sessionCount?: number;
  perSessionRate?: number;
  regularHours?: number;
  extraHours?: number;
  totalHours?: number;
  earnings: number;
};

function formatPayrollClock(
  utcOrHhmm: string | undefined,
  tenantTimezone: string | undefined,
  timeFormat: ReturnType<typeof resolveTimeDisplayFormat>,
): string {
  if (!utcOrHhmm) return "";
  const hhmm = utcOrHhmm.includes("T")
    ? utcDateTimeToTenantHHmm(utcOrHhmm, tenantTimezone)
    : utcOrHhmm;
  return hhmm ? formatOrgTime(hhmm, timeFormat) : "";
}

const PayrollPage = () => {
  const [date, setDate] = useState<Date>(new Date());
  const [userId, setUserId] = useState<string | undefined>(undefined);
  const [includeInactiveUsers, setIncludeInactiveUsers] = useState(false);
  const [groupByCourse, setGroupByCourse] = useState(false);
  const [payslipOpen, setPayslipOpen] = useState(false);
  const currencySymbol = useTenantCurrencySymbol();
  const { tenant } = useTenant();
  const timeFormat = resolveTimeDisplayFormat(tenant?.time_display_format);
  const { user, isTeacher } = useUser();
  const canViewAllPayroll = user
    ? permissionsFor(user).can("payroll.view_all")
    : false;

  const targetUserId = canViewAllPayroll ? userId : user?.id;
  const targetUserIdString =
    targetUserId != null ? String(Math.trunc(Number(targetUserId))) : undefined;

  const isSessionBased =
    tenant?.payroll_calculation_strategy === PayrollCalculationStrategy.session_based;
  const payrollEndpoint = isSessionBased ? "payroll/session-based" : "payroll/trphillips";

  const getPayroll = useQuery({
    enabled: targetUserId !== undefined,
    queryKey: ["getPayroll", payrollEndpoint, userId, date, user?.id],
    queryFn: () => {
      return makePostRequest(payrollEndpoint, {
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        user_id: targetUserId,
      });
    },
  });

  const staffPaymentFilters = useMemo(
    () =>
      targetUserIdString
        ? [
            {
              field_name: "user_id",
              operator: operatorEnum.exact,
              value: targetUserIdString,
            },
            {
              field_name: "pay_period_year",
              operator: operatorEnum.exact,
              value: String(date.getFullYear()),
            },
            {
              field_name: "pay_period_month",
              operator: operatorEnum.exact,
              value: String(date.getMonth() + 1),
            },
          ]
        : [],
    [targetUserIdString, date],
  );

  const staffPaymentList = useStaffPaymentsList({
    enabled: Boolean(targetUserIdString),
    page: 1,
    pageSize: 1,
    sorts: ["-paid_at", "-created_at"],
    q: "",
    filterParams: staffPaymentFilters,
    expand: ["created_by", "proofs"],
    fields: [
      "id",
      "amount",
      "amount_currency",
      "paid_at",
      "pay_period_year",
      "pay_period_month",
      "confirmed_at",
      "screenshot",
      "proofs.id",
      "proofs.filename",
      "proofs.file_url",
      "created_by.id",
      "created_by.name",
    ],
  });

  const aggregate = getPayroll.data?.data.aggregate;
  const staffPayment = staffPaymentList.rows[0] ?? null;
  const paymentStatus = staffPayment
    ? PayrollPaymentStatus.Paid
    : PayrollPaymentStatus.Pending;
  const paymentCardAmount =
    paymentStatus === PayrollPaymentStatus.Paid
      ? staffPayment?.amount
      : aggregate?.total_earnings;
  const summaryLoading = getPayroll.isLoading || staffPaymentList.isLoading;
  const sessionRows = (getPayroll.data?.data.data ?? []) as PayrollSessionRow[];

  const courseSummaryData = useMemo(() => {
    if (!groupByCourse) return [] as CourseSummaryRow[];
    if (isSessionBased) {
      return buildSessionBasedCourseSummaries(
        sessionRows as Parameters<typeof buildSessionBasedCourseSummaries>[0],
        aggregate?.per_session_rate ?? 0,
      ) as CourseSummaryRow[];
    }
    return buildTrphillipsCourseSummaries(
      sessionRows as Parameters<typeof buildTrphillipsCourseSummaries>[0],
      aggregate?.by_course,
    ) as CourseSummaryRow[];
  }, [groupByCourse, isSessionBased, sessionRows, aggregate]);

  const sessionTableColumns = useMemo((): Column<PayrollSessionRow>[] => {
    const baseColumns: Column<PayrollSessionRow>[] = [
      column.text<PayrollSessionRow>({
        id: "course",
        header: "Course",
        accessor: (r) => r.course ?? "",
      }),
      column.text<PayrollSessionRow>({
        id: "date",
        header: "Date",
        accessor: (r) => (r.date ? formatDate(r.date) : ""),
      }),
      {
        id: "time_log",
        header: "Time Log",
        accessor: (r) =>
          r.checkin_time && r.checkout_time
            ? `${formatPayrollClock(r.checkin_time, tenant?.timezone, timeFormat)} - ${formatPayrollClock(r.checkout_time, tenant?.timezone, timeFormat)}`
            : "N/A",
        cell: ({ row }) =>
          row.checkin_time && row.checkout_time ? (
            <span className="bg-muted p-1 font-mono text-sm">
              {formatPayrollClock(row.checkin_time, tenant?.timezone, timeFormat)} -{formatPayrollClock(row.checkout_time, tenant?.timezone, timeFormat)}
            </span>
          ) : (
            "N/A"
          ),
      },
    ];

    if (isSessionBased) {
      return [
        ...baseColumns,
        {
          id: "per_session_rate",
          header: "Per Session Rate",
          accessor: (r) =>
            r.per_session_rate !== undefined
              ? formatPayrollMoney(r.per_session_rate, currencySymbol)
              : "N/A",
          align: "right",
          sizing: { role: "numeric", tabular: true },
          enableSorting: true,
          cell: ({ value }) => (
            <span className="block text-right tabular-nums">
              {value == null || value === "" ? "—" : String(value)}
            </span>
          ),
        },
      ];
    }

    return [
      ...baseColumns,
      column.text<PayrollSessionRow>({
        id: "is_extra",
        header: "Class Type",
        accessor: (r) => (r.is_extra ? "Extra Class" : "Regular Class"),
      }),
      column.text<PayrollSessionRow>({
        id: "hours",
        header: "Hours",
        accessor: (r) => (r.hours != null ? formatPayrollHours(r.hours) : ""),
      }),
      {
        id: "rate",
        header: "Rate",
        accessor: (r) => {
          let rate = "N/A";
          if (r.hourly_rate) {
            rate = formatPayrollMoney(r.hourly_rate, currencySymbol);
          }
          if (r.student_bonus_rate) {
            rate = formatPayrollMoney(
              r.hourly_rate! + r.student_bonus_rate * (r.student_count! - 1),
              currencySymbol,
            );
          }
          return `${rate}/Hr`;
        },
        align: "right",
        sizing: { role: "numeric", tabular: true },
        enableSorting: true,
        cell: ({ value }) => (
          <span className="block text-right tabular-nums">
            {value == null || value === "" ? "—" : String(value)}
          </span>
        ),
      },
      column.text<PayrollSessionRow>({
        id: "student_count",
        header: "Student Count",
        accessor: (r) => (r.student_count != null ? String(r.student_count) : ""),
      }),
    ];
  }, [currencySymbol, isSessionBased, timeFormat, tenant?.timezone]);

  const courseSummaryColumns = useMemo((): Column<CourseSummaryRow>[] => {
    if (isSessionBased) {
      return [
        column.text<CourseSummaryRow>({
          id: "courseTitle",
          header: "Course",
          accessor: (r) => r.courseTitle,
        }),
        column.text<CourseSummaryRow>({
          id: "sessionCount",
          header: "Sessions",
          accessor: (r) => (r.sessionCount != null ? String(r.sessionCount) : ""),
        }),
        {
          id: "perSessionRate",
          header: "Per Session Rate",
          accessor: (r) =>
            r.perSessionRate !== undefined
              ? formatPayrollMoney(r.perSessionRate, currencySymbol)
              : "",
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
          id: "earnings",
          header: "Earnings",
          accessor: (r) => formatPayrollMoney(r.earnings, currencySymbol),
          align: "right",
          sizing: { role: "numeric", tabular: true },
          enableSorting: true,
          cell: ({ value }) => (
            <span className="block text-right tabular-nums">
              {value == null || value === "" ? "—" : String(value)}
            </span>
          ),
        },
      ];
    }

    return [
      column.text<CourseSummaryRow>({
        id: "courseTitle",
        header: "Course",
        accessor: (r) => r.courseTitle,
      }),
      column.text<CourseSummaryRow>({
        id: "regularHours",
        header: "Regular Hours",
        accessor: (r) =>
          r.regularHours != null ? formatPayrollHours(r.regularHours) : "",
      }),
      column.text<CourseSummaryRow>({
        id: "extraHours",
        header: "Extra Hours",
        accessor: (r) =>
          r.extraHours != null ? formatPayrollHours(r.extraHours) : "",
      }),
      column.text<CourseSummaryRow>({
        id: "totalHours",
        header: "Total Hours",
        accessor: (r) =>
          r.totalHours != null ? formatPayrollHours(r.totalHours) : "",
      }),
      {
        id: "earnings",
        header: "Earnings",
        accessor: (r) => formatPayrollMoney(r.earnings, currencySymbol),
        align: "right",
        sizing: { role: "numeric", tabular: true },
        enableSorting: true,
        cell: ({ value }) => (
          <span className="block text-right tabular-nums">
            {value == null || value === "" ? "—" : String(value)}
          </span>
        ),
      },
    ];
  }, [currencySymbol, isSessionBased]);

  const loadingSlot = getPayroll.isLoading ? (
    <div className="flex min-h-[16rem] items-center justify-center">
      <Loader />
    </div>
  ) : undefined;

  useFinancePageHeader();

  return (
    <PageContainer width="wide" className="space-y-4">
      <FilterToolbar>
        {canViewAllPayroll && (
          <>
            <EntityCombobox
              canSetDefaultValue={true}
              label="Select User"
              layout="toolbar"
              containerClassName="min-w-[200px]"
              entity="users"
              displayFunction={(u) => u.name}
              value={userId ? userId : undefined}
              onChange={(value) => setUserId(value)}
              queryParams={{
                ...queryParamDefault,
                sorts: ["name"],
                fields: ["id", "name"],
                size: -1,
                ...(includeInactiveUsers ? { include_inactive: true } : {}),
              }}
              filterParams={{
                filter_params: [
                  {
                    field_name: "roles",
                    operator: operatorEnum.contained_by,
                    value: listToApiArray([
                      role.superadmin,
                      role.admin,
                      role.manager,
                      role.teacher,
                      role.finance,
                      role.hr,
                    ]),
                  },
                ],
              }}
            />
            <label
              htmlFor="payroll-include-inactive"
              className="flex items-center gap-2 self-end pb-2"
            >
              <Switch
                id="payroll-include-inactive"
                checked={includeInactiveUsers}
                onCheckedChange={setIncludeInactiveUsers}
              />
              <span className="whitespace-nowrap text-sm font-normal text-text-primary">
                Include inactive
              </span>
            </label>
          </>
        )}
        {isTeacher && (
          <label
            htmlFor="payroll-group-by-course"
            className="flex items-center gap-2 self-end pb-2"
          >
            <Switch
              id="payroll-group-by-course"
              checked={groupByCourse}
              onCheckedChange={setGroupByCourse}
            />
            <span className="whitespace-nowrap text-sm font-normal text-text-primary">
              Group by course
            </span>
          </label>
        )}
        <YearMonthSelector
          layout="toolbar"
          date={date}
          setDate={(d) => setDate(d)}
        />
      </FilterToolbar>
      <p>
        Showing data for{" "}
        <span className="font-bold">{date && format(date, "MMMM yyyy")}</span>
      </p>
      <p className="text-sm text-text-secondary">
        Check-in/out times are in your local timezone:{" "}
        {getUserTimezoneInfo().full}
      </p>
      <div className={payrollSummaryGridClassName()}>
        <PayrollHoursCard
          isSessionBased={isSessionBased}
          isLoading={summaryLoading}
          sessionCount={aggregate?.session_count}
          regularHours={aggregate?.regular_hours}
          extraHours={aggregate?.extra_hours}
          perSessionRate={aggregate?.per_session_rate}
          currencySymbol={currencySymbol}
        />
        <PayrollEarningsCard
          isLoading={summaryLoading}
          totalEarnings={aggregate?.total_earnings}
          currencySymbol={currencySymbol}
          isSessionBased={isSessionBased}
          sessionCount={aggregate?.session_count}
          regularHours={aggregate?.regular_hours}
          extraHours={aggregate?.extra_hours}
          perSessionRate={aggregate?.per_session_rate}
        />
        {targetUserIdString ? (
          <PayrollPaymentCard
            payPeriodDate={date}
            status={paymentStatus}
            amount={paymentCardAmount}
            currencySymbol={currencySymbol}
            paidAt={staffPayment?.paid_at}
            confirmedAt={staffPayment?.confirmed_at}
            isLoading={summaryLoading}
            onClick={() => setPayslipOpen(true)}
          />
        ) : null}
      </div>
      <PayrollFinalizedHint visible={isPastPayPeriod(date)} />
      {tenant ? (
        <PayrollPayslipSheet
          open={payslipOpen}
          onOpenChange={setPayslipOpen}
          payPeriodDate={date}
          status={paymentStatus}
          staffPayment={staffPayment}
          aggregate={aggregate}
          sessionRows={sessionRows}
          strategy={
            isSessionBased
              ? PayrollCalculationStrategy.session_based
              : PayrollCalculationStrategy.tr_phillips
          }
          currencySymbol={currencySymbol}
          tenant={tenant}
          canConfirm={Boolean(isTeacher && user?.id === targetUserId)}
        />
      ) : null}
      {groupByCourse ? (
        <div className="min-w-0 overflow-x-auto">
          <Table
            columns={courseSummaryColumns}
            rows={courseSummaryData}
            getRowId={(row) => row.courseTitle}
            bodySlot={loadingSlot}
          />
        </div>
      ) : (
        <div className="min-w-0 overflow-x-auto">
          <Table
            columns={sessionTableColumns}
            rows={sessionRows}
            getRowId={(row) =>
              `${row.course ?? ""}-${row.date ?? ""}-${row.checkin_time ?? ""}`
            }
            bodySlot={loadingSlot}
          />
        </div>
      )}
    </PageContainer>
  );
};

export default PayrollPage;
