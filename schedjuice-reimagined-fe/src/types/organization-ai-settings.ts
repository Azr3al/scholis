import * as z from "zod";

const aiPackSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  tool_names: z.array(z.string()),
});

const aiAvailableToolSchema = z.object({
  name: z.string(),
  description: z.string(),
  pack_id: z.string(),
  exposure: z.string(),
});

export const organizationAiSettingsSchema = z.object({
  name: z.string(),
  is_ai_enabled: z.boolean().describe("Enable AI assistant"),
  ai_default_model: z
    .string()
    .nullable()
    .optional()
    .describe("Default model (blank = platform default)"),
  ai_max_context_turns: z
    .number()
    .min(1)
    .max(20)
    .describe("Conversation memory (turns)"),
  ai_max_tool_iterations: z
    .number()
    .min(1)
    .max(10)
    .describe("Max tool call rounds"),
  ai_school_context: z
    .string()
    .max(2000)
    .describe("Brief school context for the AI"),
  ai_assistant_instructions: z
    .string()
    .max(2000)
    .describe("Assistant behavior instructions"),
  ai_enabled_packs: z.array(z.string()).optional().default([]),
  ai_available_packs: z.array(aiPackSchema).optional().default([]),
  available_tools: z.array(aiAvailableToolSchema).optional().default([]),
  can_edit_ai_packs: z.boolean().optional().default(false),
  ai_platform_base_prompt: z
    .string()
    .describe("Platform rules (read-only)"),
  ai_system_prompt_preview: z
    .string()
    .describe("Full assembled prompt preview"),
  ai_platform_defaults: z.object({
    default_model: z.string(),
    monthly_usd_limit: z.number(),
    default_user_monthly_usd_limit: z.number(),
    monthly_token_limit: z.number().nullable(),
    hard_enforce: z.boolean(),
    alert_thresholds: z.array(z.number()),
    max_tool_iterations: z.number(),
  }),
  ai_available_models: z.array(z.string()),
  ai_monthly_usd_limit: z
    .union([z.number(), z.string()])
    .nullable()
    .optional()
    .describe("Monthly USD limit"),
  ai_monthly_token_limit: z
    .number()
    .nullable()
    .optional()
    .describe("Monthly token limit"),
  ai_hard_enforce: z.boolean().describe("Hard enforce limits"),
  ai_alert_thresholds: z
    .array(z.number())
    .describe("Spend alert thresholds (0–1)"),
  ai_budget_active: z.boolean().describe("Budget tracking active"),
  ai_default_user_monthly_usd_limit: z
    .union([z.number(), z.string()])
    .nullable()
    .optional()
    .describe("Default per-user monthly USD limit"),
});

export type OrganizationAiSettings = z.infer<typeof organizationAiSettingsSchema>;

export const organizationAiSettingsEditSchema = organizationAiSettingsSchema.omit({
  name: true,
  ai_platform_base_prompt: true,
  ai_system_prompt_preview: true,
  ai_platform_defaults: true,
  ai_available_models: true,
  ai_available_packs: true,
  available_tools: true,
  can_edit_ai_packs: true,
});

export type OrganizationAiSettingsEdit = z.infer<
  typeof organizationAiSettingsEditSchema
>;
