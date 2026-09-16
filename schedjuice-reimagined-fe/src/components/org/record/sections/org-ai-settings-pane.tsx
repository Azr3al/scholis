"use client";
import { Spinner } from "@/components/primitives/spinner";
import {
  Button,
  Checkbox,
  Input,
  Select,
  Switch,
  Textarea,
  useToast,
  Field,
} from "@/components/primitives";

import { fetchAiSettings, patchAiSettings } from "@/app/client-api/ai-settings";
import {
  organizationAiSettingsEditSchema,
  OrganizationAiSettingsEdit,
} from "@/types/organization-ai-settings";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { FormProvider, Controller, useForm } from "react-hook-form";
import { scheduleScrollToFirstFormError } from "@/helpers/form";
import { OrgSectionPanel } from "./org-section-panel";

const AI_SETTINGS_QUERY_KEY = ["organizationAiSettings"];
const PLATFORM_DEFAULT_MODEL = "__platform_default__";

function formatUsdLimit(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatTokenLimit(value: number | null): string {
  if (value === null) return "No limit";
  return value.toLocaleString();
}

function formatThresholds(thresholds: number[]): string {
  return thresholds.join(", ");
}

export function OrgAiSettingsPane({ orgId }: { orgId: string | number }) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: [...AI_SETTINGS_QUERY_KEY, orgId],
    queryFn: () => fetchAiSettings(orgId),
    enabled: orgId != null && orgId !== "",
  });

  const form = useForm<OrganizationAiSettingsEdit>({
    resolver: zodResolver(organizationAiSettingsEditSchema),
    defaultValues: {
      is_ai_enabled: true,
      ai_default_model: "",
      ai_max_context_turns: 5,
      ai_max_tool_iterations: 5,
      ai_school_context: "",
      ai_assistant_instructions: "",
      ai_monthly_usd_limit: null,
      ai_monthly_token_limit: null,
      ai_hard_enforce: false,
      ai_alert_thresholds: [0.5, 0.8, 1.0],
      ai_budget_active: true,
      ai_default_user_monthly_usd_limit: null,
      ai_enabled_packs: [],
    },
  });

  useEffect(() => {
    if (!settingsQuery.data) return;
    const d = settingsQuery.data;
    form.reset({
      is_ai_enabled: d.is_ai_enabled,
      ai_default_model: d.ai_default_model ?? "",
      ai_max_context_turns: d.ai_max_context_turns,
      ai_max_tool_iterations: d.ai_max_tool_iterations,
      ai_school_context: d.ai_school_context ?? "",
      ai_assistant_instructions: d.ai_assistant_instructions ?? "",
      ai_monthly_usd_limit: d.ai_monthly_usd_limit ?? null,
      ai_monthly_token_limit: d.ai_monthly_token_limit ?? null,
      ai_hard_enforce: d.ai_hard_enforce,
      ai_alert_thresholds: d.ai_alert_thresholds ?? [0.5, 0.8, 1.0],
      ai_budget_active: d.ai_budget_active,
      ai_default_user_monthly_usd_limit:
        d.ai_default_user_monthly_usd_limit ?? null,
      ai_enabled_packs: d.ai_enabled_packs ?? [],
    });
  }, [settingsQuery.data, form]);

  const canEditAiPacks = Boolean(settingsQuery.data?.can_edit_ai_packs);

  const saveMutation = useMutation({
    mutationFn: (data: OrganizationAiSettingsEdit) => {
      const payload: Partial<OrganizationAiSettingsEdit> = {
        ...data,
        ai_default_model: data.ai_default_model?.trim() || null,
        ai_monthly_usd_limit:
          data.ai_monthly_usd_limit === "" || data.ai_monthly_usd_limit === null
            ? null
            : Number(data.ai_monthly_usd_limit),
        ai_default_user_monthly_usd_limit:
          data.ai_default_user_monthly_usd_limit === "" ||
          data.ai_default_user_monthly_usd_limit === null
            ? null
            : Number(data.ai_default_user_monthly_usd_limit),
      };
      if (!canEditAiPacks) {
        delete payload.ai_enabled_packs;
      }
      return patchAiSettings(orgId, payload);
    },
    onSuccess: () => {
      toast.add({ description: "AI settings saved." });
      void queryClient.invalidateQueries({ queryKey: AI_SETTINGS_QUERY_KEY });
    },
    onError: () => {
      toast.add({
        description: "Could not save AI settings.",
      });
    },
  });

  const onSubmit = (data: OrganizationAiSettingsEdit) => {
    saveMutation.mutate(data);
  };

  const platformDefaults = settingsQuery.data?.ai_platform_defaults;
  const availableModels = settingsQuery.data?.ai_available_models ?? [];
  const availablePacks = settingsQuery.data?.ai_available_packs ?? [];
  const availableTools = settingsQuery.data?.available_tools ?? [];
  const enabledPackTitles = availablePacks
    .filter((p) => (settingsQuery.data?.ai_enabled_packs ?? []).includes(p.id))
    .map((p) => p.title);

  return (
    <OrgSectionPanel
      title="AI settings"
      description={`Configure the Schedjuice assistant for ${settingsQuery.data?.name ?? "your school"}.`}
    >
      {settingsQuery.isLoading ? (
        <div className="flex items-center gap-2 text-text-muted">
          <Spinner className="h-4 w-4 " />
          Loading…
        </div>
      ) : (
        <FormProvider {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit, () =>
              scheduleScrollToFirstFormError(form),
            )}
            className="space-y-4"
          >
            <fieldset
              disabled={saveMutation.isPending}
              className="min-w-0 space-y-4 border-0 p-0 m-0"
            >
            <div className="rounded-lg border border-border bg-surface text-text-primary">
              <div className="flex flex-col gap-1.5 p-6">
                <h3 className="font-serif text-xl leading-none tracking-tight">
                  Capability packs
                </h3>
                <p className="text-sm text-text-secondary">
                  Tools available to the assistant for this school. Core search
                  tools are always on.
                  {canEditAiPacks
                    ? " Toggle packs below (platform staff only)."
                    : " Pack assignment is managed by Schedjuice staff."}
                </p>
              </div>
              <div className="p-6 pt-0 space-y-4">
                {canEditAiPacks ? (
                  <Controller
                    control={form.control}
                    name="ai_enabled_packs"
                    render={({ field }) => (
                      <div className="space-y-3">
                        {availablePacks.map((pack) => {
                          const checked = (field.value ?? []).includes(pack.id);
                          return (
                            <label
                              key={pack.id}
                              className="flex items-start gap-3 text-sm"
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(next) => {
                                  const on = next === true;
                                  const current = field.value ?? [];
                                  field.onChange(
                                    on
                                      ? Array.from(
                                          new Set([...current, pack.id]),
                                        )
                                      : current.filter((id) => id !== pack.id),
                                  );
                                }}
                              />
                              <span className="min-w-0">
                                <span className="font-medium text-text-primary">
                                  {pack.title}
                                </span>
                                <span className="block text-text-secondary">
                                  {pack.description}
                                </span>
                              </span>
                            </label>
                          );
                        })}
                        {availablePacks.length === 0 ? (
                          <p className="text-sm text-text-secondary">
                            No optional packs registered.
                          </p>
                        ) : null}
                      </div>
                    )}
                  />
                ) : (
                  <p className="text-sm text-text-primary">
                    {enabledPackTitles.length > 0
                      ? enabledPackTitles.join(", ")
                      : "Core only (no optional packs enabled)."}
                  </p>
                )}

                <div className="space-y-2">
                  <p className="text-sm font-medium text-text-primary">
                    Available tools (read-only)
                  </p>
                  {availableTools.length === 0 ? (
                    <p className="text-sm text-text-secondary">
                      No tools resolved for the current packs.
                    </p>
                  ) : (
                    <ul className="divide-y divide-border rounded-md border border-border">
                      {availableTools.map((tool) => (
                        <li
                          key={tool.name}
                          className="grid gap-1 px-3 py-2 text-sm sm:grid-cols-[minmax(0,11rem)_minmax(0,7rem)_minmax(0,5rem)_1fr]"
                        >
                          <span className="font-mono text-xs text-text-primary">
                            {tool.name}
                          </span>
                          <span className="text-text-secondary">
                            {tool.pack_id}
                          </span>
                          <span className="text-text-secondary">
                            {tool.exposure}
                          </span>
                          <span className="text-text-secondary">
                            {tool.description}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-surface text-text-primary">
              <div className="flex flex-col gap-1.5 p-6">
                <h3 className="font-serif text-xl leading-none tracking-tight">System prompt</h3>
                <p className="text-sm text-text-secondary">
                  Platform rules are fixed. Add school context and optional behavior
                  rules below. Preview shows the full prompt sent to the AI.
                </p>
              </div>
              <div className="p-6 pt-0 space-y-4">
                <Field.Root className="w-full">
                  <Field.Label>Platform rules (read-only)</Field.Label>
                  <Textarea
                    rows={8}
                    readOnly
                    className="bg-muted"
                    value={settingsQuery.data?.ai_platform_base_prompt ?? ""}
                  />
                </Field.Root>
                <Controller
                  control={form.control}
                  name="ai_school_context"
                  render={({ field, fieldState }) => (
                    <Field.Root className="w-full" name={field.name} invalid={Boolean(fieldState.error)}>
                      <Field.Label>School context</Field.Label>
<Textarea
                          rows={5}
                          placeholder="e.g. K-12 international school in Yangon, ~500 students. Teachers refer to courses as classes."
                          {...field}
                        />
                <div className="min-h-5">
                  {fieldState.error?.message ? (
                    <p className="text-sm text-danger" role="alert">
                      {fieldState.error.message}
                    </p>
                  ) : null}
                </div>
                    </Field.Root>
                  )}
                />
                <Controller
                  control={form.control}
                  name="ai_assistant_instructions"
                  render={({ field, fieldState }) => (
                    <Field.Root className="w-full" name={field.name} invalid={Boolean(fieldState.error)}>
                      <Field.Label>Additional instructions</Field.Label>
<Textarea
                          rows={4}
                          placeholder="e.g. Be formal. Always cite staff by full name."
                          {...field}
                        />
                <div className="min-h-5">
                  {fieldState.error?.message ? (
                    <p className="text-sm text-danger" role="alert">
                      {fieldState.error.message}
                    </p>
                  ) : null}
                </div>
                    </Field.Root>
                  )}
                />
                <Field.Root className="w-full">
                  <Field.Label>Preview — full prompt sent to the AI</Field.Label>
                  <Textarea
                    rows={10}
                    readOnly
                    className="bg-muted font-mono text-xs"
                    value={settingsQuery.data?.ai_system_prompt_preview ?? ""}
                  />
                  <Field.Description>Updates after you save changes.</Field.Description>
                </Field.Root>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-surface text-text-primary">
              <div className="flex flex-col gap-1.5 p-6">
                <h3 className="font-serif text-xl leading-none tracking-tight">General</h3>
                <p className="text-sm text-text-secondary">
                  Master switch, model, and conversation limits.
                </p>
              </div>
              <div className="p-6 pt-0 space-y-4">
                <Controller
                  control={form.control}
                  name="is_ai_enabled"
                  render={({ field, fieldState }) => (
                    <Field.Root className="flex items-center justify-between rounded-lg border p-3" name={field.name} invalid={Boolean(fieldState.error)}>
                      <div>
                        <Field.Label>Enable AI assistant</Field.Label>
                        <Field.Description>
                          When off, Telegram and in-app AI queries are blocked.
                        </Field.Description>
                      </div>
<Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
</Field.Root>
                  )}
                />
                <Controller
                  control={form.control}
                  name="ai_default_model"
                  render={({ field, fieldState }) => (
                    <Field.Root className="w-full" name={field.name} invalid={Boolean(fieldState.error)}>
                      <Field.Label>Default model</Field.Label>
                      <Select
                        value={field.value?.trim() || PLATFORM_DEFAULT_MODEL}
                        onValueChange={(value) =>
                          field.onChange(
                            value === PLATFORM_DEFAULT_MODEL ? "" : value,
                          )
                        }
                        items={[
                          {
                            value: PLATFORM_DEFAULT_MODEL,
                            label: `Platform default (${
                              platformDefaults?.default_model ??
                              "gpt-5.6-luna"
                            })`,
                          },
                          ...availableModels
                            .filter(
                              (model) =>
                                model !== platformDefaults?.default_model,
                            )
                            .map((model) => ({
                              value: model,
                              label: model,
                            })),
                        ]}
                        placeholder="Select a model"
                        className="w-full"
                      />
                      <Field.Description>
                        {field.value?.trim()
                          ? `School override: ${field.value.trim()}`
                          : `Using platform default: ${platformDefaults?.default_model ?? "gpt-5.6-luna"}`}
                      </Field.Description>
                                      <div className="min-h-5">
                  {fieldState.error?.message ? (
                    <p className="text-sm text-danger" role="alert">
                      {fieldState.error.message}
                    </p>
                  ) : null}
                </div>
                    </Field.Root>
                  )}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Controller
                    control={form.control}
                    name="ai_max_context_turns"
                    render={({ field, fieldState }) => (
                      <Field.Root className="w-full" name={field.name} invalid={Boolean(fieldState.error)}>
                        <Field.Label>Conversation memory (turns)</Field.Label>
<Input
                            type="number"
                            min={1}
                            max={20}
                            {...field}
                            onChange={(e) =>
                              field.onChange(Number(e.target.value))
                            }
                          />
<Field.Description>
                          How many prior Q&amp;A pairs to include (1–20).
                        </Field.Description>
                                        <div className="min-h-5">
                  {fieldState.error?.message ? (
                    <p className="text-sm text-danger" role="alert">
                      {fieldState.error.message}
                    </p>
                  ) : null}
                </div>
                      </Field.Root>
                    )}
                  />
                  <Controller
                    control={form.control}
                    name="ai_max_tool_iterations"
                    render={({ field, fieldState }) => (
                      <Field.Root className="w-full" name={field.name} invalid={Boolean(fieldState.error)}>
                        <Field.Label>Max tool rounds</Field.Label>
<Input
                            type="number"
                            min={1}
                            max={10}
                            {...field}
                            onChange={(e) =>
                              field.onChange(Number(e.target.value))
                            }
                          />
{platformDefaults && (
                          <Field.Description>
                            Platform default:{" "}
                            {platformDefaults.max_tool_iterations}
                          </Field.Description>
                        )}
                                        <div className="min-h-5">
                  {fieldState.error?.message ? (
                    <p className="text-sm text-danger" role="alert">
                      {fieldState.error.message}
                    </p>
                  ) : null}
                </div>
                      </Field.Root>
                    )}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-surface text-text-primary">
              <div className="flex flex-col gap-1.5 p-6">
                <h3 className="font-serif text-xl leading-none tracking-tight">Budget &amp; limits</h3>
                <p className="text-sm text-text-secondary">
                  Monthly caps and enforcement for AI usage.
                </p>
              </div>
              <div className="p-6 pt-0 space-y-4">
                <Controller
                  control={form.control}
                  name="ai_budget_active"
                  render={({ field, fieldState }) => (
                    <Field.Root className="flex items-center justify-between rounded-lg border p-3" name={field.name} invalid={Boolean(fieldState.error)}>
                      <div>
                        <Field.Label>Budget tracking active</Field.Label>
                      </div>
<Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
</Field.Root>
                  )}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Controller
                    control={form.control}
                    name="ai_monthly_usd_limit"
                    render={({ field, fieldState }) => (
                      <Field.Root className="w-full" name={field.name} invalid={Boolean(fieldState.error)}>
                        <Field.Label>Monthly USD limit</Field.Label>
<Input
                            type="number"
                            step="0.01"
                            placeholder="Platform default"
                            value={field.value ?? ""}
                            onChange={(e) =>
                              field.onChange(
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                              )
                            }
                          />
{platformDefaults && (
                          <Field.Description>
                            Platform default:{" "}
                            {formatUsdLimit(platformDefaults.monthly_usd_limit)}
                          </Field.Description>
                        )}
                                        <div className="min-h-5">
                  {fieldState.error?.message ? (
                    <p className="text-sm text-danger" role="alert">
                      {fieldState.error.message}
                    </p>
                  ) : null}
                </div>
                      </Field.Root>
                    )}
                  />
                  <Controller
                    control={form.control}
                    name="ai_monthly_token_limit"
                    render={({ field, fieldState }) => (
                      <Field.Root className="w-full" name={field.name} invalid={Boolean(fieldState.error)}>
                        <Field.Label>Monthly token limit</Field.Label>
<Input
                            type="number"
                            placeholder="Platform default"
                            value={field.value ?? ""}
                            onChange={(e) =>
                              field.onChange(
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                              )
                            }
                          />
{platformDefaults && (
                          <Field.Description>
                            Platform default:{" "}
                            {formatTokenLimit(
                              platformDefaults.monthly_token_limit,
                            )}
                          </Field.Description>
                        )}
                                        <div className="min-h-5">
                  {fieldState.error?.message ? (
                    <p className="text-sm text-danger" role="alert">
                      {fieldState.error.message}
                    </p>
                  ) : null}
                </div>
                      </Field.Root>
                    )}
                  />
                </div>
                <Controller
                  control={form.control}
                  name="ai_default_user_monthly_usd_limit"
                  render={({ field, fieldState }) => (
                    <Field.Root className="w-full" name={field.name} invalid={Boolean(fieldState.error)}>
                      <Field.Label>Default per-user monthly limit (USD)</Field.Label>
<Input
                          type="number"
                          step="0.01"
                          placeholder="Platform default"
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value === ""
                                ? null
                                : Number(e.target.value),
                            )
                          }
                        />
{platformDefaults && (
                        <Field.Description>
                          Platform default:{" "}
                          {formatUsdLimit(
                            platformDefaults.default_user_monthly_usd_limit,
                          )}
                          . Applies to every AI user unless overridden on their
                          user record.
                        </Field.Description>
                      )}
                                      <div className="min-h-5">
                  {fieldState.error?.message ? (
                    <p className="text-sm text-danger" role="alert">
                      {fieldState.error.message}
                    </p>
                  ) : null}
                </div>
                    </Field.Root>
                  )}
                />
                <Controller
                  control={form.control}
                  name="ai_hard_enforce"
                  render={({ field, fieldState }) => (
                    <Field.Root className="flex items-center justify-between rounded-lg border p-3" name={field.name} invalid={Boolean(fieldState.error)}>
                      <div>
                        <Field.Label>Hard enforce limits</Field.Label>
                        <Field.Description>
                          Block new AI requests when over the monthly cap.
                          {platformDefaults && (
                            <>
                              {" "}
                              Platform default:{" "}
                              {platformDefaults.hard_enforce ? "On" : "Off"}.
                            </>
                          )}
                        </Field.Description>
                      </div>
<Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
</Field.Root>
                  )}
                />
                <Controller
                  control={form.control}
                  name="ai_alert_thresholds"
                  render={({ field, fieldState }) => (
                    <Field.Root className="w-full" name={field.name} invalid={Boolean(fieldState.error)}>
                      <Field.Label>Alert thresholds</Field.Label>
<Input
                          placeholder="0.5, 0.8, 1.0"
                          value={(field.value ?? []).join(", ")}
                          onChange={(e) => {
                            const parts = e.target.value
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean)
                              .map(Number)
                              .filter((n) => !Number.isNaN(n));
                            field.onChange(parts);
                          }}
                        />
<Field.Description>
                        Comma-separated fractions of the monthly limit (e.g.
                        0.5, 0.8, 1.0).
                        {platformDefaults && (
                          <>
                            {" "}
                            Platform default:{" "}
                            {formatThresholds(platformDefaults.alert_thresholds)}.
                          </>
                        )}
                      </Field.Description>
                                      <div className="min-h-5">
                  {fieldState.error?.message ? (
                    <p className="text-sm text-danger" role="alert">
                      {fieldState.error.message}
                    </p>
                  ) : null}
                </div>
                    </Field.Root>
                  )}
                />
              </div>
            </div>

            </fieldset>
            <div className="flex justify-end">
              <Button type="submit" isLoading={saveMutation.isPending}>
                Save
              </Button>
            </div>
          </form>
        </FormProvider>
      )}
    </OrgSectionPanel>
  );
}
