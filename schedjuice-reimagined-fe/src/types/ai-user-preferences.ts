import { z } from "zod";

import { aiUsageMonthTotalsSchema, aiUsageTrendPointSchema } from "@/types/ai-usage";

export const aiUserBudgetSchema = z.object({
  monthly_usd_limit: z.string(),
  used_usd: z.string(),
  remaining_usd: z.string(),
  used_pct: z.number(),
  is_over_limit: z.boolean(),
  limit_source: z.enum(["user_override", "org_default", "platform_default"]),
});

export const aiUserPreferencesSchema = z.object({
  user_id: z.number(),
  response_language: z.enum(["auto", "en", "my"]),
  tone: z.enum(["default", "formal", "casual"]),
  verbosity: z.enum(["default", "brief", "detailed"]),
  preferred_name: z.string(),
  monthly_usd_limit: z.string().nullable().optional(),
  effective_monthly_usd_limit: z.string().optional(),
  limit_source: z
    .enum(["user_override", "org_default", "platform_default"])
    .optional(),
  updated_at: z.string().nullable(),
});

export const aiUserUsageDetailSchema = z.object({
  user_id: z.number(),
  year: z.number(),
  month: z.number(),
  month_summary: aiUsageMonthTotalsSchema.extend({
    by_feature: z.array(
      z.object({
        feature: z.string(),
        total_cost_usd: z.string(),
        total_tokens: z.number(),
        request_count: z.number(),
        cached_input_tokens: z.number(),
        cache_hit_rate: z.number(),
      }),
    ),
  }),
  trend: z.array(aiUsageTrendPointSchema),
  budget: aiUserBudgetSchema,
});

export type AiUserPreferences = z.infer<typeof aiUserPreferencesSchema>;
export type AiUserUsageDetail = z.infer<typeof aiUserUsageDetailSchema>;
export type AiUserBudget = z.infer<typeof aiUserBudgetSchema>;

export const RESPONSE_LANGUAGE_OPTIONS = [
  { value: "auto", label: "Auto (match my message)" },
  { value: "en", label: "English" },
  { value: "my", label: "Burmese" },
] as const;

export const TONE_OPTIONS = [
  { value: "default", label: "Default" },
  { value: "formal", label: "Formal" },
  { value: "casual", label: "Casual" },
] as const;

export const VERBOSITY_OPTIONS = [
  { value: "default", label: "Default" },
  { value: "brief", label: "Brief" },
  { value: "detailed", label: "Detailed" },
] as const;
