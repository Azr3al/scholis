import { makePostRequest } from "@/app/client-api/utils";
import type {
  FinanceHomepageFilterState,
  FinanceHomepagePeriod,
  FinanceHomepageRequest,
  FinanceHomepageResponse,
  FinancePieGroupBy,
} from "@/types/finance/homepage";
import { useQuery } from "@tanstack/react-query";
import { format, endOfMonth, startOfMonth } from "date-fns";

export function buildFinanceHomepageRequest(
  state: FinanceHomepageFilterState,
): FinanceHomepageRequest | null {
  const programId = Number(state.programId);
  if (!Number.isFinite(programId) || programId <= 0) {
    return null;
  }

  const body: FinanceHomepageRequest = {
    program_id: programId,
    period: state.period,
    pie_group_by: state.pieGroupBy,
  };

  if (state.intakeId) {
    const intakeId = Number(state.intakeId);
    if (Number.isFinite(intakeId) && intakeId > 0) {
      body.intake_id = intakeId;
    }
  }

  if (state.period === "intake_range") {
    body.period = "intake_range";
  } else if (state.period === "custom") {
    if (!state.dateFrom || !state.dateTo) {
      return null;
    }
    body.date_from = format(state.dateFrom, "yyyy-MM-dd");
    body.date_to = format(state.dateTo, "yyyy-MM-dd");
  } else if (state.dateFrom) {
    body.date_from = format(state.dateFrom, "yyyy-MM-dd");
  }

  return body;
}

export function getCurrentMonthCustomRange(referenceDate = new Date()): {
  dateFrom: Date;
  dateTo: Date;
} {
  return {
    dateFrom: startOfMonth(referenceDate),
    dateTo: endOfMonth(referenceDate),
  };
}

export function isFinanceHomepageCustomPeriodIncomplete(
  state: Pick<FinanceHomepageFilterState, "period" | "dateFrom" | "dateTo">,
): boolean {
  return state.period === "custom" && (!state.dateFrom || !state.dateTo);
}

export function useFinanceHomepage(state: FinanceHomepageFilterState) {
  const body = buildFinanceHomepageRequest(state);
  return useQuery({
    queryKey: ["finance-homepage", body],
    queryFn: async () => {
      const res = await makePostRequest("finance/homepage", body!);
      return (res?.data?.data ?? res?.data) as FinanceHomepageResponse;
    },
    enabled: body != null,
    keepPreviousData: true,
  });
}

export const FINANCE_HOMEPAGE_PERIODS: { value: FinanceHomepagePeriod; label: string }[] =
  [
    { value: "single_month", label: "This month" },
    { value: "last_3_months", label: "Last 3 months" },
    { value: "last_6_months", label: "Last 6 months" },
    { value: "last_12_months", label: "Last 12 months" },
    { value: "all_time", label: "All time" },
    { value: "custom", label: "Custom range" },
  ];

export const FINANCE_PIE_GROUP_OPTIONS: { value: FinancePieGroupBy; label: string }[] =
  [
    { value: "payment_status", label: "Payment status" },
    { value: "bank_type", label: "Bank type" },
    { value: "payment_method", label: "Payment method" },
    { value: "course", label: "Course" },
  ];
