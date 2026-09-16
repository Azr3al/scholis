"use client";

import { PageContainer } from "@/components/layout/page-container";
import DeleteZone from "@/components/form/delete-zone";
import GenericForm from "@/components/form/generic-form";
import type { AutoFormGroup, FieldConfigItem } from "@/components/auto-form";
import BackButton from "@/components/misc/back-button";
import { TypographyH1 } from "@/components/typography/h1";
import { useTenant } from "@/hooks/useTenant";
import {
  paymentPlanCreateEditSchema,
  paymentPlanCreateEditSchemaWithoutTiming,
  paymentPlanDescription,
} from "@/types/finance";
import { TransactionScreenshotStrategy } from "@/types/organization";
import { useParams } from "next/navigation";
import { useMemo } from "react";

const PaymentPlanUpdatePage = () => {
  const { id } = useParams<{ id: string }>();
  const { tenant } = useTenant();
  const showLegacyDiscountFields = Boolean(tenant?.is_legacy_discount_visible);
  const showPaymentTiming =
    tenant?.transaction_screenshot_strategy !==
    TransactionScreenshotStrategy.admin_upload;

  const highRiskPlanFields = useMemo(() => {
    const pricing = showLegacyDiscountFields
      ? (["price", "discount_price", "per_hour_price"] as const)
      : (["price"] as const);
    if (!showPaymentTiming) {
      return [...pricing];
    }
    return [
      ...pricing,
      "early_payment_days",
      "days_before_course_locked",
    ] as const;
  }, [showLegacyDiscountFields, showPaymentTiming]);

  const paymentPlanEditGroups = useMemo<AutoFormGroup[]>(() => {
    const groups: AutoFormGroup[] = [
      {
        id: "identity",
        title: "Plan",
        fields: ["name"],
      },
      {
        id: "pricing",
        title: "Pricing",
        description: "Money fields — save explicitly.",
        fields: showLegacyDiscountFields
          ? ["price", "billing_type", "discount_price", "per_hour_price"]
          : ["price", "billing_type"],
      },
    ];

    if (showPaymentTiming) {
      groups.push({
        id: "timing",
        title: "Payment timing",
        description: "Grace and early-payment windows — save explicitly.",
        fields: ["early_payment_days", "days_before_course_locked"],
      });
    }

    return groups;
  }, [showLegacyDiscountFields, showPaymentTiming]);

  const fieldConfig = useMemo(() => {
    const config: Record<string, FieldConfigItem> = {
      ...paymentPlanDescription,
      price: { autosave: false },
      ...(showLegacyDiscountFields
        ? {
            discount_price: { autosave: false },
            per_hour_price: { autosave: false },
          }
        : {}),
    };

    if (showPaymentTiming) {
      config.early_payment_days = {
        ...paymentPlanDescription.early_payment_days,
        autosave: false,
      };
      config.days_before_course_locked = {
        ...paymentPlanDescription.days_before_course_locked,
        autosave: false,
      };
    }

    return config;
  }, [showLegacyDiscountFields, showPaymentTiming]);

  const schema = showPaymentTiming
    ? paymentPlanCreateEditSchema
    : paymentPlanCreateEditSchemaWithoutTiming;

  return (
    <PageContainer width="narrow" className="space-y-3">
      <BackButton href={`/payment-plans/${id}`}></BackButton>
      <TypographyH1>Edit Payment Plan</TypographyH1>
      <GenericForm
        isEdit={true}
        autosave
        entityId={id}
        entityName="Payment Plan"
        apiUrl="payment-plans"
        schema={schema}
        groups={paymentPlanEditGroups}
        fieldConfig={fieldConfig}
        shouldAutosaveField={(name) =>
          !(highRiskPlanFields as readonly string[]).includes(name)
        }
        explicitSaveFields={[...highRiskPlanFields]}
        explicitSaveLabel="Save pricing"
      ></GenericForm>
      <DeleteZone
        validate_input="delete payment plan"
        entityName="Payment Plan"
        entityId={id}
        deleteApiUrl="payment-plans"
        redirectUrl="/payment-plans"
      ></DeleteZone>
    </PageContainer>
  );
};

export default PaymentPlanUpdatePage;
