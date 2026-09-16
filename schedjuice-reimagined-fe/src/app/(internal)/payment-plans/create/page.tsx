"use client";

import type { AutoFormGroup } from "@/components/auto-form";
import { PageContainer } from "@/components/layout/page-container";
import { TypographyH1 } from "@/components/typography/h1";
import BackButton from "@/components/misc/back-button";
import GenericForm from "@/components/form/generic-form";
import { useTenant } from "@/hooks/useTenant";
import {
  paymentPlanCreateEditSchema,
  paymentPlanCreateEditSchemaWithoutTiming,
  paymentPlanDescription,
} from "@/types/finance";
import { TransactionScreenshotStrategy } from "@/types/organization";
import { useMemo } from "react";

const PaymentPlanCreatePage: React.FC = () => {
  const { tenant } = useTenant();
  const showLegacyDiscountFields = Boolean(tenant?.is_legacy_discount_visible);
  const showPaymentTiming =
    tenant?.transaction_screenshot_strategy !==
    TransactionScreenshotStrategy.admin_upload;

  const groups = useMemo<AutoFormGroup[]>(() => {
    const planGroup: AutoFormGroup = {
      id: "plan",
      title: "Plan",
      description: "Name and pricing for this payment plan.",
      fields: showLegacyDiscountFields
        ? ["name", "price", "billing_type", "discount_price", "per_hour_price"]
        : ["name", "price", "billing_type"],
    };

    if (!showPaymentTiming) {
      return [planGroup];
    }

    return [
      planGroup,
      {
        id: "timing",
        title: "Payment timing",
        description: "When students can pay and when the course locks.",
        fields: ["early_payment_days", "days_before_course_locked"],
      },
    ];
  }, [showLegacyDiscountFields, showPaymentTiming]);

  const schema = showPaymentTiming
    ? paymentPlanCreateEditSchema
    : paymentPlanCreateEditSchemaWithoutTiming;

  return (
    <PageContainer width="narrow" className="space-y-3">
      <BackButton href="/payment-plans"></BackButton>
      <TypographyH1>Create Payment Plan</TypographyH1>
      <GenericForm
        schema={schema}
        entityName="payment-plan"
        apiUrl="payment-plans"
        redirectUrl="/payment-plans"
        groups={groups}
        fieldConfig={{
          ...paymentPlanDescription,
        }}
      />
    </PageContainer>
  );
};

export default PaymentPlanCreatePage;
