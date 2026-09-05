"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import type { FieldConfigItem } from "@/components/auto-form";
import { zodResolverForAutoForm } from "@/components/auto-form";
import GenericForm from "@/components/form/generic-form";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import { canManageActiveStatus } from "@/lib/form/field-visibility";
import {
  discountCreateEditSchema,
  DISCOUNT_SCOPE_LABELS,
  DiscountEligibilityType,
  DiscountType,
} from "@/types/finance";

type DiscountFormValues = z.infer<typeof discountCreateEditSchema>;

type DiscountFormProps = Omit<
  React.ComponentProps<typeof GenericForm>,
  "schema" | "fieldConfig" | "formInstance" | "watchValues"
>;

function renderWhen(children: ReactNode, visible: boolean) {
  return visible ? <>{children}</> : null;
}

export function DiscountForm({ isEdit = false, ...genericFormProps }: DiscountFormProps) {
  const { tenant } = useTenant();
  const { user } = useUser();
  const canManageActive = canManageActiveStatus(user);
  const showActiveField = isEdit && canManageActive;
  const eligibilityEnabled = tenant?.is_discount_eligibility_enabled !== false;

  const form = useForm<DiscountFormValues>({
    resolver: zodResolverForAutoForm(discountCreateEditSchema),
    defaultValues: {
      eligibility_type: DiscountEligibilityType.none,
      is_active: true,
      discount_type: DiscountType.fixed_amount,
    },
  });

  const [discountType, eligibilityTypeRaw] = form.watch([
    "discount_type",
    "eligibility_type",
  ]);
  const eligibilityType = eligibilityTypeRaw ?? DiscountEligibilityType.none;

  const prevDiscountTypeRef = useRef<DiscountType | undefined>(undefined);
  const prevEligibilityTypeRef = useRef<DiscountEligibilityType | undefined>(
    undefined,
  );

  useEffect(() => {
    if (!eligibilityEnabled) {
      form.setValue("eligibility_type", DiscountEligibilityType.none);
      form.setValue("early_bird_days", null);
      form.setValue("bulk_min_courses", null);
    }
  }, [eligibilityEnabled, form]);

  useEffect(() => {
    const prev = prevDiscountTypeRef.current;
    if (prev !== undefined && prev !== discountType) {
      if (discountType === DiscountType.percent) {
        form.setValue("fixed_amount", null);
      } else if (discountType === DiscountType.fixed_amount) {
        form.setValue("percent_value", null);
      }
    }
    prevDiscountTypeRef.current = discountType;
  }, [discountType, form]);

  useEffect(() => {
    if (!eligibilityEnabled) return;
    const prev = prevEligibilityTypeRef.current;
    if (prev !== undefined && prev !== eligibilityType) {
      if (eligibilityType !== DiscountEligibilityType.early_bird) {
        form.setValue("early_bird_days", null);
      }
      if (eligibilityType !== DiscountEligibilityType.bulk) {
        form.setValue("bulk_min_courses", null);
      }
    }
    prevEligibilityTypeRef.current = eligibilityType;
  }, [eligibilityEnabled, eligibilityType, form]);

  const fieldConfig = useMemo((): Record<string, FieldConfigItem> => {
    const isPercent = discountType === DiscountType.percent;
    const isFixed = discountType === DiscountType.fixed_amount;
    const isEarlyBird =
      eligibilityEnabled &&
      eligibilityType === DiscountEligibilityType.early_bird;
    const isBulk =
      eligibilityEnabled && eligibilityType === DiscountEligibilityType.bulk;

    const config: Record<string, FieldConfigItem> = {
      scope: {
        enumOptionLabels: DISCOUNT_SCOPE_LABELS,
      },
      percent_value: {
        renderParent: ({ children }) => renderWhen(children, isPercent),
      },
      fixed_amount: {
        renderParent: ({ children }) => renderWhen(children, isFixed),
      },
      eligibility_type: {
        renderParent: ({ children }) =>
          renderWhen(children, eligibilityEnabled),
      },
      early_bird_days: {
        description: "Days before course start (early bird only).",
        renderParent: ({ children }) => renderWhen(children, isEarlyBird),
      },
      bulk_min_courses: {
        description: "Minimum concurrent active courses (bulk only).",
        renderParent: ({ children }) => renderWhen(children, isBulk),
      },
      is_active: {
        fieldType: "switch",
        customLabel: "Active",
        renderParent: ({ children }) => renderWhen(children, showActiveField),
      },
    };

    if (isEdit) {
      const autosaveFalse = { autosave: false as const };
      config.discount_type = autosaveFalse;
      config.percent_value = { ...config.percent_value, ...autosaveFalse };
      config.fixed_amount = { ...config.fixed_amount, ...autosaveFalse };
      config.scope = autosaveFalse;
      config.eligibility_type = {
        ...config.eligibility_type,
        ...autosaveFalse,
      };
      config.early_bird_days = {
        ...config.early_bird_days,
        ...autosaveFalse,
      };
      config.bulk_min_courses = {
        ...config.bulk_min_courses,
        ...autosaveFalse,
      };
      if (showActiveField) {
        config.is_active = { ...config.is_active, ...autosaveFalse };
      }
    }

    return config;
  }, [discountType, eligibilityEnabled, eligibilityType, isEdit, showActiveField]);

  return (
    <GenericForm
      {...genericFormProps}
      isEdit={isEdit}
      measure="full"
      schema={discountCreateEditSchema}
      formInstance={form}
      watchValues={["discount_type", "eligibility_type"]}
      fieldConfig={fieldConfig}
    />
  );
}
