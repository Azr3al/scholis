import { z } from "zod";

const aiUsageCacheMetricsSchema = z.object({
  input_tokens: z.number(),
  cached_input_tokens: z.number(),
  cache_hit_rate: z.number(),
  cache_savings_usd: z.string(),
});

export const aiUsageMonthTotalsSchema = z
  .object({
    total_cost_usd: z.string(),
    total_tokens: z.number(),
    request_count: z.number(),
  })
  .merge(aiUsageCacheMetricsSchema);

export const aiUsageTrendPointSchema = aiUsageMonthTotalsSchema.extend({
  year: z.number(),
  month: z.number(),
});

export const aiUsageBudgetSchema = z.object({
  monthly_usd_limit: z.string(),
  used_pct: z.number(),
});

export const aiUsageOrgSummaryRowSchema = z.object({
  organization_id: z.number(),
  name: z.string(),
  schema_name: z.string(),
  selected_month: aiUsageMonthTotalsSchema,
  budget: aiUsageBudgetSchema.nullable(),
  trend: z.array(aiUsageTrendPointSchema),
});

export const aiUsageSummarySchema = z.object({
  year: z.number(),
  month: z.number(),
  totals: z
    .object({
      total_cost_usd: z.string(),
      total_tokens: z.number(),
      request_count: z.number(),
      organization_count: z.number(),
    })
    .merge(aiUsageCacheMetricsSchema),
  organizations: z.array(aiUsageOrgSummaryRowSchema),
});

export const aiUsageModelBreakdownSchema = z
  .object({
    model: z.string(),
    total_cost_usd: z.string(),
    total_tokens: z.number(),
    request_count: z.number(),
  })
  .merge(aiUsageCacheMetricsSchema);

export const aiUsageUserRowSchema = z.object({
  user_id: z.number().nullable(),
  display_name: z.string(),
  email: z.string(),
  total_cost_usd: z.string(),
  total_tokens: z.number(),
  request_count: z.number(),
  cached_input_tokens: z.number(),
  cache_hit_rate: z.number(),
  monthly_usd_limit: z.string().optional(),
  used_pct: z.number().optional(),
  remaining_usd: z.string().optional(),
  limit_status: z.enum(["ok", "near_limit", "at_limit"]).optional(),
});

export const aiUsageOrgDetailSchema = z.object({
  organization: z.object({
    id: z.number(),
    name: z.string(),
  }),
  year: z.number(),
  month: z.number(),
  month_summary: aiUsageMonthTotalsSchema.extend({
    by_model: z.array(aiUsageModelBreakdownSchema),
  }),
});

export const aiUsageOrgUsersSchema = z.object({
  year: z.number(),
  month: z.number(),
  users: z.array(aiUsageUserRowSchema),
});

export type AiUsageSummary = z.infer<typeof aiUsageSummarySchema>;
export type AiUsageOrgDetail = z.infer<typeof aiUsageOrgDetailSchema>;
export type AiUsageOrgUsers = z.infer<typeof aiUsageOrgUsersSchema>;
export type AiUsageTrendPoint = z.infer<typeof aiUsageTrendPointSchema>;

export const likelyCauseCodeSchema = z.enum([
  "tool_descriptions",
  "complex_task",
  "model_loop",
  "unknown",
]);

export type LikelyCauseCode = z.infer<typeof likelyCauseCodeSchema>;

export const likelyCauseFilterSchema = z.enum([
  "tool_descriptions",
  "complex_task",
  "model_loop",
  "unknown",
  "uncategorized",
]);

export type LikelyCauseFilter = z.infer<typeof likelyCauseFilterSchema>;

export const failuresSortSchema = z.enum([
  "-created_at",
  "created_at",
  "-tool_iterations",
  "tool_iterations",
]);

export type FailuresSort = z.infer<typeof failuresSortSchema>;

export const failuresResolutionFilterSchema = z.enum(["open", "resolved", "all"]);

export type FailuresResolutionFilter = z.infer<
  typeof failuresResolutionFilterSchema
>;

export const capabilityGapCodeSchema = z.enum([
  "missing_tool",
  "data_not_exposed",
  "access_policy",
  "feature_unavailable",
  "unknown",
]);

export type CapabilityGapCode = z.infer<typeof capabilityGapCodeSchema>;

export const capabilityGapFilterSchema = capabilityGapCodeSchema;

export type CapabilityGapFilter = z.infer<typeof capabilityGapFilterSchema>;

export const failuresOutcomeFilterSchema = z.enum([
  "tool_limit_exceeded",
  "capability_gap",
  "all",
]);

export type FailuresOutcomeFilter = z.infer<typeof failuresOutcomeFilterSchema>;

export const aiUsageFailureOutcomeSchema = z.enum([
  "tool_limit_exceeded",
  "capability_gap",
]);

export const aiUsageFailureToolCallSchema = z.object({
  name: z.string(),
  ok: z.boolean(),
  error: z.string(),
});

export const aiUsageThinkingStepSchema = z.object({
  iteration: z.number(),
  text: z.string(),
  thinking_tokens: z.number(),
});

export type AiUsageThinkingStep = z.infer<typeof aiUsageThinkingStepSchema>;

export const aiUsageFailureItemSchema = z.object({
  id: z.number(),
  created_at: z.string(),
  organization_id: z.number(),
  organization_name: z.string(),
  user_id: z.number().nullable(),
  user_display_name: z.string(),
  user_email: z.string(),
  feature: z.string(),
  channel_key: z.string(),
  prompt: z.string(),
  response_text: z.string(),
  outcome: z.enum(["tool_limit_exceeded", "capability_gap"]),
  tool_iterations: z.number(),
  tool_calls: z.array(aiUsageFailureToolCallSchema),
  likely_causes: z.array(likelyCauseCodeSchema),
  capability_gaps: z.array(capabilityGapCodeSchema),
  capability_gap_intent: z.string(),
  capability_gap_reason: z.string(),
  capability_gap_domain: z.string(),
  capability_gap_suggested_surface: z.string(),
  model: z.string(),
  total_tokens: z.number(),
  latency_ms: z.number(),
  source: z.enum(["live", "backfill"]),
  thinking_steps: z.array(aiUsageThinkingStepSchema),
  resolved_at: z.string().nullable(),
  resolved_by_user_id: z.number().nullable(),
  resolved_by_display_name: z.string(),
});

export const aiUsageFailuresSchema = z.object({
  year: z.number(),
  month: z.number(),
  total_count: z.number(),
  page: z.number(),
  page_size: z.number(),
  summary: z.object({
    failure_count: z.number(),
    organizations_affected: z.number(),
    top_org: z
      .object({
        organization_id: z.number(),
        name: z.string(),
        count: z.number(),
      })
      .nullable(),
    by_org: z.array(
      z.object({
        organization_id: z.number(),
        name: z.string(),
        count: z.number(),
      }),
    ),
    by_likely_cause: z.object({
      tool_descriptions: z.number(),
      complex_task: z.number(),
      model_loop: z.number(),
      unknown: z.number(),
      uncategorized: z.number(),
    }),
    by_outcome: z.object({
      tool_limit_exceeded: z.number(),
      capability_gap: z.number(),
    }),
    by_capability_gap: z.object({
      missing_tool: z.number(),
      data_not_exposed: z.number(),
      access_policy: z.number(),
      feature_unavailable: z.number(),
      unknown: z.number(),
    }),
    top_gap_domains: z.array(
      z.object({
        domain: z.string(),
        count: z.number(),
      }),
    ),
  }),
  items: z.array(aiUsageFailureItemSchema),
});

export type AiUsageFailures = z.infer<typeof aiUsageFailuresSchema>;
export type AiUsageFailureItem = z.infer<typeof aiUsageFailureItemSchema>;

export const aiUsageRequestOutcomeSchema = z.enum([
  "success",
  "tool_limit_exceeded",
  "capability_gap",
  "error",
  "blocked",
  "rate_limited",
]);

export type AiUsageRequestOutcome = z.infer<typeof aiUsageRequestOutcomeSchema>;

export const requestsOutcomeFilterSchema = z.enum([
  "all",
  "success",
  "tool_limit_exceeded",
  "capability_gap",
  "error",
  "blocked",
  "rate_limited",
]);

export type RequestsOutcomeFilter = z.infer<typeof requestsOutcomeFilterSchema>;

export const requestsSortSchema = z.enum([
  "-created_at",
  "created_at",
  "-tool_iterations",
  "tool_iterations",
  "total_tokens",
  "-total_tokens",
]);

export type RequestsSort = z.infer<typeof requestsSortSchema>;

export const aiUsageRequestItemSchema = aiUsageFailureItemSchema.extend({
  outcome: aiUsageRequestOutcomeSchema,
});

export type AiUsageRequestItem = z.infer<typeof aiUsageRequestItemSchema>;

export const aiUsageRequestsSchema = z.object({
  year: z.number(),
  month: z.number(),
  total_count: z.number(),
  page: z.number(),
  page_size: z.number(),
  summary: z.object({
    request_count: z.number(),
    organizations_affected: z.number(),
    by_outcome: z.object({
      success: z.number(),
      tool_limit_exceeded: z.number(),
      capability_gap: z.number(),
      error: z.number(),
      blocked: z.number(),
      rate_limited: z.number(),
    }),
  }),
  items: z.array(aiUsageRequestItemSchema),
});

export type AiUsageRequests = z.infer<typeof aiUsageRequestsSchema>;

export function formatAiUsd(value: string | number): string {
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num)) return "$0.00";
  if (num >= 1) return `$${num.toFixed(2)}`;
  if (num >= 0.01) return `$${num.toFixed(4)}`;
  return `$${num.toFixed(6)}`;
}

export function formatAiTokens(value: number): string {
  return value.toLocaleString();
}

export function formatCacheHitRate(rate: number): string {
  if (!Number.isFinite(rate)) return "0.0%";
  return `${(rate * 100).toFixed(1)}%`;
}

export function formatMonthLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}
