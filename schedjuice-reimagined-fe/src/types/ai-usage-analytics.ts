import { z } from "zod";

export const aiUsageAnalyticsDailySchema = z.object({
  date: z.string(),
  request_count: z.number(),
  success_count: z.number(),
  total_tokens: z.number(),
  total_cost_usd: z.string(),
});

export const aiUsageAnalyticsOutcomeTotalsSchema = z.object({
  success: z.number(),
  capability_gap: z.number(),
  tool_limit_exceeded: z.number(),
  error: z.number(),
  blocked: z.number(),
  rate_limited: z.number(),
});

export const aiUsageAnalyticsMonthlyTrendSchema = z.object({
  year: z.number(),
  month: z.number(),
  request_count: z.number(),
  success_count: z.number(),
  success_rate: z.number(),
  total_cost_usd: z.string(),
  total_tokens: z.number(),
});

export const aiUsageAnalyticsTopUserSchema = z.object({
  user_id: z.number().nullable(),
  display_name: z.string(),
  email: z.string(),
  request_count: z.number(),
  total_cost_usd: z.string(),
  total_tokens: z.number(),
});

export const aiUsageAnalyticsSchema = z.object({
  year: z.number(),
  month: z.number(),
  feature: z.string(),
  tenant_id: z.number().nullable(),
  daily: z.array(aiUsageAnalyticsDailySchema),
  outcome_totals: aiUsageAnalyticsOutcomeTotalsSchema,
  monthly_trend: z.array(aiUsageAnalyticsMonthlyTrendSchema),
  top_users: z.array(aiUsageAnalyticsTopUserSchema),
});

export type AiUsageAnalyticsDaily = z.infer<typeof aiUsageAnalyticsDailySchema>;
export type AiUsageAnalyticsOutcomeTotals = z.infer<
  typeof aiUsageAnalyticsOutcomeTotalsSchema
>;
export type AiUsageAnalyticsMonthlyTrend = z.infer<
  typeof aiUsageAnalyticsMonthlyTrendSchema
>;
export type AiUsageAnalyticsTopUser = z.infer<typeof aiUsageAnalyticsTopUserSchema>;
export type AiUsageAnalytics = z.infer<typeof aiUsageAnalyticsSchema>;

export type AiAnalyticsFeature = "telegram_query" | "ai_query" | "all";
