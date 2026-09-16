"use client";

import { updateEntity } from "@/app/client-api/utils";
import {
  AutoFormField,
  AutoFormGroupSection,
  getObjectFormSchema,
  resolveAutoFormSchema,
} from "@/components/auto-form";
import { FieldRenderer } from "@/components/custom-fields/field-renderer";
import { GroupSection } from "@/components/custom-fields/group-section";
import { AutoFormFieldsSkeleton } from "@/components/form/auto-form-fields-skeleton";
import { Button, useToast } from "@/components/primitives";
import { toISODateString } from "@/helpers/date";
import {
  buildDvrCustomFormConfig,
  includedFieldNames,
  requiredFieldNames,
  resolveDvrVerifyFields,
  type DvrFieldConfig,
} from "@/helpers/dvr";
import {
  scheduleScrollToFirstFormError,
  setFormErrrors,
} from "@/helpers/form";
import { useFieldDefinitions } from "@/hooks/use-field-definitions";
import { useFormConfig } from "@/hooks/use-form-config";
import { buildConfigSchema } from "@/lib/custom-fields/build-config-schema";
import { collectGroupPayload } from "@/lib/custom-fields/completion";
import {
  isFieldReadOnly,
  isFieldRequired,
} from "@/lib/custom-fields/field-policy";
import {
  CUSTOM_FIELD_ENTITY_USER,
  type CustomFieldDefinitionDto,
} from "@/types/custom-fields";
import {
  EMPTY_FORM_CONFIG,
  type FormConfig,
} from "@/types/form-config";
import { accountEditSchema, type accountType } from "@/types/user";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useMemo, useState, type ReactNode } from "react";
import { FormProvider, useForm } from "react-hook-form";
import * as z from "zod";
import { resolveListItemPresence } from "@/lib/sj/motion";

function stripOptionalNullable(schema: z.ZodTypeAny): z.ZodTypeAny {
  let current = schema;
  for (let i = 0; i < 8; i++) {
    const typeName = current._def.typeName as string;
    if (typeName === "ZodOptional" || typeName === "ZodNullable") {
      current = current._def.innerType as z.ZodTypeAny;
      continue;
    }
    break;
  }
  return current;
}

function builtinSchemaFromConfigs(configs: DvrFieldConfig[]) {
  const included = includedFieldNames(configs);
  const required = new Set(requiredFieldNames(configs));
  if (included.length === 0) {
    return z.object({});
  }
  const picked = accountEditSchema.pick(
    Object.fromEntries(included.map((f) => [f, true])) as any,
  ) as z.ZodObject<any>;

  // accountEditSchema already marks many DVR fields optional/nullable.
  // `.partial()` can only relax required keys — it cannot make those required.
  // Rebuild each key so DVR `required: true` actually strips optional/nullable.
  const nextShape: Record<string, z.ZodTypeAny> = {};
  for (const name of included) {
    const original = picked.shape[name] as z.ZodTypeAny;
    const base = stripOptionalNullable(original);
    const description = original.description ?? base.description;
    let field: z.ZodTypeAny = required.has(name)
      ? base
      : base.optional().nullable();
    if (description) {
      field = field.describe(description);
    }
    nextShape[name] = field;
  }
  return z.object(nextShape);
}

function patchConfigRequired(
  config: FormConfig,
  customs: DvrFieldConfig[],
): FormConfig {
  const required = new Set(
    customs.filter((c) => c.required).map((c) => c.name),
  );
  return {
    ...config,
    groups: config.groups.map((g) => ({
      ...g,
      fields: g.fields.map((f) => ({
        ...f,
        requiredAt: required.has(f.fieldKey)
          ? ("profile_completion" as const)
          : ("never" as const),
      })),
    })),
  };
}

function DvrPreviewFieldMotion({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  const variants = resolveListItemPresence(reduceMotion);
  return (
    <motion.div
      layout={!reduceMotion}
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="w-full min-w-0"
    >
      {children}
    </motion.div>
  );
}

export type DvrVerifyFormMode = "verify" | "preview";

export type DvrVerifyFormProps = {
  mode?: DvrVerifyFormMode;
  user: accountType;
  dvrId?: number;
  rawFields: unknown;
  onVerified?: () => void;
  isVerifying?: boolean;
  title?: string;
  description?: string;
};

export function DvrVerifyForm({
  mode = "verify",
  user,
  dvrId,
  rawFields,
  onVerified,
  isVerifying,
  title,
  description,
}: DvrVerifyFormProps) {
  if (mode === "verify") {
    if (dvrId == null || !onVerified) {
      throw new Error(
        "DvrVerifyForm verify mode requires dvrId and onVerified",
      );
    }
  }

  const toast = useToast();
  const { data: definitions, isLoading: defsLoading } = useFieldDefinitions(
    CUSTOM_FIELD_ENTITY_USER,
  );
  const roles = useMemo(
    () => (Array.isArray(user.roles) ? user.roles.map(String) : []),
    [user.roles],
  );
  const { data: formConfig, isLoading: configLoading } = useFormConfig(
    "edit",
    roles,
    CUSTOM_FIELD_ENTITY_USER,
  );

  const activeCustomDefs = useMemo(
    () =>
      (definitions ?? []).filter(
        (d) => d.source === "custom" && d.is_active,
      ),
    [definitions],
  );

  const activeCustomKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const d of activeCustomDefs) keys.add(d.field_key);
    return keys;
  }, [activeCustomDefs]);

  const customKeysInCatalogOrder = useMemo(
    () => activeCustomDefs.map((d) => d.field_key),
    [activeCustomDefs],
  );

  const { builtins, customs } = useMemo(
    () =>
      resolveDvrVerifyFields(
        rawFields,
        activeCustomKeys,
        customKeysInCatalogOrder,
      ),
    [rawFields, activeCustomKeys, customKeysInCatalogOrder],
  );

  // Definitions are enough to render customs; form-config is a preference layer.
  const loading = defsLoading || (customs.length > 0 && configLoading);
  const isPreview = mode === "preview";

  const chrome =
    title || description ? (
      <div className="space-y-1">
        {title ? <h2 className="text-lg font-semibold">{title}</h2> : null}
        {description ? (
          <p className="text-sm text-text-secondary">{description}</p>
        ) : null}
      </div>
    ) : null;

  if (loading) {
    return (
      <div className="space-y-4">
        {chrome}
        <AutoFormFieldsSkeleton rows={4} />
      </div>
    );
  }

  // Preview keeps the combined form mounted so field exit animations can finish.
  if (!isPreview && builtins.length === 0 && customs.length === 0) {
    return (
      <div className="space-y-4">
        {chrome}
        <p className="text-sm text-text-secondary">No fields to verify.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {chrome}
      <DvrVerifyCombinedForm
        mode={mode}
        user={user}
        dvrId={dvrId ?? 0}
        builtins={builtins}
        customs={customs}
        formConfig={formConfig ?? EMPTY_FORM_CONFIG}
        definitions={activeCustomDefs}
        onVerified={onVerified ?? (() => {})}
        isVerifying={isVerifying}
        toast={toast}
      />
    </div>
  );
}

function DvrVerifyCombinedForm({
  mode,
  user,
  dvrId,
  builtins,
  customs,
  formConfig,
  definitions,
  onVerified,
  isVerifying,
  toast,
}: {
  mode: DvrVerifyFormMode;
  user: accountType;
  dvrId: number;
  builtins: DvrFieldConfig[];
  customs: DvrFieldConfig[];
  formConfig: FormConfig;
  definitions: CustomFieldDefinitionDto[];
  onVerified: () => void;
  isVerifying?: boolean;
  toast: ReturnType<typeof useToast>;
}) {
  const isPreview = mode === "preview";
  const patchedConfig = useMemo(
    () =>
      patchConfigRequired(
        buildDvrCustomFormConfig(formConfig, customs, definitions),
        customs,
      ),
    [formConfig, customs, definitions],
  );

  const builtinSchema = useMemo(
    () => builtinSchemaFromConfigs(builtins),
    [builtins],
  );

  const schema = useMemo(() => {
    const base = builtinSchema as z.ZodObject<any>;
    return buildConfigSchema(base, patchedConfig, "edit");
  }, [builtinSchema, patchedConfig]);

  const resolvedBuiltin = useMemo(
    () => resolveAutoFormSchema(builtinSchema),
    [builtinSchema],
  );
  const builtinObjectSchema = useMemo(
    () => getObjectFormSchema(resolvedBuiltin),
    [resolvedBuiltin],
  );
  const builtinGroups = useMemo(
    () => [
      {
        id: "details",
        title: "Details",
        fields: builtins.map((b) => b.name),
      },
    ],
    [builtins],
  );

  const defaultValues = useMemo(() => {
    const userRecord = user as accountType & {
      custom_data?: Record<string, unknown>;
    };
    const values: Record<string, unknown> = {
      custom_data: { ...(userRecord.custom_data ?? {}) },
    };
    for (const b of builtins) {
      values[b.name] = (userRecord as Record<string, unknown>)[b.name];
    }
    return values;
  }, [user, builtins]);

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues,
    values: defaultValues,
  });

  const [submitting, setSubmitting] = useState(false);
  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      updateEntity("users", user.id, body),
    onSuccess: () => onVerified(),
    onError: (e) => {
      const applied = setFormErrrors(e, form);
      if (applied) scheduleScrollToFirstFormError(form);
      if (!applied) {
        toast.add({
          type: "error",
          description: "Failed to update your data",
        });
      }
    },
    onSettled: () => setSubmitting(false),
  });

  const customFields = useMemo(
    () => patchedConfig.groups.flatMap((g) => g.fields),
    [patchedConfig],
  );

  const emptyPreview =
    isPreview && builtins.length === 0 && customs.length === 0;

  return (
    <FormProvider {...form}>
      <form
        className="space-y-6 pb-24 lg:pb-8"
        onSubmit={
          isPreview
            ? (e) => {
                e.preventDefault();
              }
            : form.handleSubmit((data) => {
                setSubmitting(true);
                const payload: Record<string, unknown> = {
                  dvr_verify_id: dvrId,
                };
                for (const b of builtins) {
                  if (b.name in data) {
                    let v = (data as Record<string, unknown>)[b.name];
                    if (b.name === "date_of_birth" && v) {
                      v = toISODateString(v as string | Date);
                    }
                    payload[b.name] = v;
                  }
                }
                const customPayload = collectGroupPayload(
                  customFields,
                  data as Record<string, unknown>,
                );
                if (customPayload.custom_data) {
                  payload.custom_data = customPayload.custom_data;
                }
                mutation.mutate(payload);
              })
        }
      >
        <fieldset disabled={isPreview} className="min-w-0 space-y-6 border-0 p-0">
          {isPreview ? (
            <div className="flex w-full flex-col gap-5">
              <AnimatePresence mode="popLayout" initial={false}>
                {builtins.map((b) => {
                  const zodItem = builtinObjectSchema.shape[b.name] as
                    | z.ZodTypeAny
                    | undefined;
                  if (!zodItem) return null;
                  return (
                    <DvrPreviewFieldMotion key={b.name}>
                      <AutoFormField name={b.name} zodItem={zodItem} />
                    </DvrPreviewFieldMotion>
                  );
                })}
                {customFields.map((field) => (
                  <DvrPreviewFieldMotion key={field.fieldKey}>
                    <FieldRenderer
                      form={form}
                      field={field}
                      required={isFieldRequired(field, "edit")}
                      readOnly={isFieldReadOnly(field, "admin")}
                    />
                  </DvrPreviewFieldMotion>
                ))}
              </AnimatePresence>
              {emptyPreview ? (
                <p className="text-sm text-text-secondary">
                  Select at least one field
                </p>
              ) : null}
            </div>
          ) : (
            <>
              {builtins.length > 0 ? (
                <div className="flex w-full flex-col gap-8">
                  {builtinGroups.map((group) => (
                    <AutoFormGroupSection
                      key={group.id}
                      group={group}
                      shape={builtinObjectSchema.shape}
                    />
                  ))}
                </div>
              ) : null}
              {patchedConfig.groups.map((group) => (
                <div key={group.id ?? "customs"} className="space-y-2">
                  {group.name ? (
                    <h3 className="text-sm font-medium text-text-secondary">
                      {group.name}
                    </h3>
                  ) : null}
                  <GroupSection
                    form={form}
                    group={group}
                    surface="edit"
                    actor="admin"
                  />
                </div>
              ))}
            </>
          )}
        </fieldset>
        {!isPreview ? (
          <Button
            type="submit"
            variant="primary"
            isLoading={submitting || Boolean(isVerifying) || mutation.isPending}
          >
            Submit
          </Button>
        ) : null}
      </form>
    </FormProvider>
  );
}
