import { axiosClient } from "@/lib/api";
import {
  AiUsageFailures,
  AiUsageOrgDetail,
  AiUsageOrgUsers,
  AiUsageRequests,
  AiUsageSummary,
  aiUsageFailuresSchema,
  aiUsageFailureItemSchema,
  aiUsageOrgDetailSchema,
  aiUsageOrgUsersSchema,
  aiUsageRequestsSchema,
  aiUsageSummarySchema,
  CapabilityGapFilter,
  FailuresOutcomeFilter,
  FailuresResolutionFilter,
  FailuresSort,
  LikelyCauseFilter,
  RequestsOutcomeFilter,
  RequestsSort,
} from "@/types/ai-usage";
import {
  AiUsageAnalytics,
  AiAnalyticsFeature,
  aiUsageAnalyticsSchema,
} from "@/types/ai-usage-analytics";

type MonthParams = {
  year: number;
  month: number;
};

type FailuresParams = MonthParams & {
  page?: number;
  page_size?: number;
  outcome?: FailuresOutcomeFilter;
  likely_cause?: LikelyCauseFilter;
  capability_gap?: CapabilityGapFilter;
  resolution?: FailuresResolutionFilter;
  sort?: FailuresSort;
};

export async function fetchAiUsageSummary(params: MonthParams): Promise<AiUsageSummary> {
  const res = await axiosClient.get("platform/ai-usage/summary", {
    params,
  });
  const { isError, message, ...payload } = res.data ?? {};
  if (isError) {
    throw new Error(message ?? "Failed to load AI usage summary");
  }
  return aiUsageSummarySchema.parse(payload);
}

export async function fetchOrgAiUsage(
  orgId: number | string,
  params: MonthParams,
): Promise<AiUsageOrgDetail> {
  const res = await axiosClient.get(`organizations/${orgId}/ai-usage`, {
    params,
  });
  const { isError, message, ...payload } = res.data ?? {};
  if (isError) {
    throw new Error(message ?? "Failed to load AI usage");
  }
  return aiUsageOrgDetailSchema.parse(payload);
}

export async function fetchOrgAiUsageUsers(
  orgId: number | string,
  params: MonthParams & { limit?: number },
): Promise<AiUsageOrgUsers> {
  const res = await axiosClient.get(`organizations/${orgId}/ai-usage/users`, {
    params,
  });
  const { isError, message, ...payload } = res.data ?? {};
  if (isError) {
    throw new Error(message ?? "Failed to load AI usage users");
  }
  return aiUsageOrgUsersSchema.parse(payload);
}

export async function fetchAiUsageFailures(
  params: FailuresParams,
): Promise<AiUsageFailures> {
  const res = await axiosClient.get("platform/ai-usage/failures", { params });
  const { isError, message, ...payload } = res.data ?? {};
  if (isError) {
    throw new Error(message ?? "Failed to load AI failures");
  }
  return aiUsageFailuresSchema.parse(payload);
}

export async function fetchOrgAiUsageFailures(
  orgId: number | string,
  params: FailuresParams,
): Promise<AiUsageFailures> {
  const res = await axiosClient.get(`organizations/${orgId}/ai-usage/failures`, {
    params,
  });
  const { isError, message, ...payload } = res.data ?? {};
  if (isError) {
    throw new Error(message ?? "Failed to load AI failures");
  }
  return aiUsageFailuresSchema.parse(payload);
}

export async function resolveOrgAiUsageFailure(
  orgId: number | string,
  requestLogId: number,
  resolved: boolean,
) {
  const res = await axiosClient.patch(
    `organizations/${orgId}/ai-usage/failures/${requestLogId}`,
    { resolved },
  );
  const { isError, message, ...payload } = res.data ?? {};
  if (isError) {
    throw new Error(message ?? "Failed to update failure resolution");
  }
  return aiUsageFailureItemSchema.parse(payload);
}

type RequestsParams = MonthParams & {
  page?: number;
  page_size?: number;
  outcome?: RequestsOutcomeFilter;
  feature?: AiAnalyticsFeature;
  sort?: RequestsSort;
};

type AnalyticsParams = MonthParams & {
  feature?: AiAnalyticsFeature;
  tenant_id?: number | null;
};

export async function fetchOrgAiUsageAnalytics(
  orgId: number | string,
  params: AnalyticsParams,
): Promise<AiUsageAnalytics> {
  const res = await axiosClient.get(`organizations/${orgId}/ai-usage/analytics`, {
    params,
  });
  const { isError, message, ...payload } = res.data ?? {};
  if (isError) {
    throw new Error(message ?? "Failed to load AI analytics");
  }
  return aiUsageAnalyticsSchema.parse(payload);
}

export async function fetchPlatformAiUsageAnalytics(
  params: AnalyticsParams,
): Promise<AiUsageAnalytics> {
  const res = await axiosClient.get("platform/ai-usage/analytics", { params });
  const { isError, message, ...payload } = res.data ?? {};
  if (isError) {
    throw new Error(message ?? "Failed to load AI analytics");
  }
  return aiUsageAnalyticsSchema.parse(payload);
}

export async function fetchPlatformAiUsageRequests(
  params: RequestsParams,
): Promise<AiUsageRequests> {
  const res = await axiosClient.get("platform/ai-usage/requests", { params });
  const { isError, message, ...payload } = res.data ?? {};
  if (isError) {
    throw new Error(message ?? "Failed to load AI requests");
  }
  return aiUsageRequestsSchema.parse(payload);
}

export async function fetchOrgAiUsageRequests(
  orgId: number | string,
  params: RequestsParams,
): Promise<AiUsageRequests> {
  const res = await axiosClient.get(`organizations/${orgId}/ai-usage/requests`, {
    params,
  });
  const { isError, message, ...payload } = res.data ?? {};
  if (isError) {
    throw new Error(message ?? "Failed to load AI requests");
  }
  return aiUsageRequestsSchema.parse(payload);
}
