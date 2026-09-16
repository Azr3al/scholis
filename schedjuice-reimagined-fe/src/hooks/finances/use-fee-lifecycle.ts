import { makePostRequest } from "@/app/client-api/utils";
import type {
  FeeLifecycleFilterState,
  FeeLifecycleRequest,
  FeeLifecycleResponse,
} from "@/types/finance/fee-lifecycle";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";

export function buildFeeLifecycleRequest(
  state: FeeLifecycleFilterState,
): FeeLifecycleRequest | null {
  const programId = Number(state.programId);
  if (!Number.isFinite(programId) || programId <= 0) {
    return null;
  }

  const body: FeeLifecycleRequest = {
    program_id: programId,
    period: state.period,
    breakdown: state.breakdown,
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

export function useFeeLifecycle(
  state: FeeLifecycleFilterState,
  options?: { enabled?: boolean },
) {
  const body = buildFeeLifecycleRequest(state);
  const permitted = options?.enabled ?? true;
  return useQuery({
    queryKey: ["finance-fee-lifecycle", body],
    queryFn: async () => {
      const res = await makePostRequest("finance/fee-lifecycle", body!);
      return (res?.data?.data ?? res?.data) as FeeLifecycleResponse;
    },
    enabled: body != null && permitted,
    keepPreviousData: true,
  });
}
