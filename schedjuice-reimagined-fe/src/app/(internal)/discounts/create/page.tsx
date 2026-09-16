"use client";

import type { AutoFormGroup } from "@/components/auto-form";
import { PageContainer } from "@/components/layout/page-container";
import { TypographyH1 } from "@/components/typography/h1";
import BackButton from "@/components/misc/back-button";
import { DiscountForm } from "@/components/finance/discount-form";
import { useTenant } from "@/hooks/useTenant";
import { useMemo } from "react";

const DiscountCreatePage: React.FC = () => {
  const { tenant } = useTenant();
  const eligibilityEnabled = tenant?.is_discount_eligibility_enabled !== false;

  const groups = useMemo((): AutoFormGroup[] => {
    const base: AutoFormGroup[] = [
      {
        id: "identity",
        title: "Identity",
        description: "Name and optional description for this discount.",
        fields: ["name", "description"],
      },
      {
        id: "amount",
        title: "Discount amount",
        description: "Percent or fixed amount and when it applies.",
        fields: ["discount_type", "percent_value", "fixed_amount", "scope"],
      },
    ];
    if (eligibilityEnabled) {
      base.push({
        id: "eligibility",
        title: "Eligibility",
        description:
          "Optional rule that must pass before this discount can be applied. Leave as none for freely selectable discounts.",
        fields: ["eligibility_type", "early_bird_days", "bulk_min_courses"],
      });
    }
    return base;
  }, [eligibilityEnabled]);

  return (
    <PageContainer width="narrow" className="space-y-3">
      <BackButton href="/discounts" />
      <TypographyH1>Create Discount</TypographyH1>
      <DiscountForm
        entityName="discount"
        apiUrl="discounts"
        redirectUrl="/discounts"
        groups={groups}
      />
    </PageContainer>
  );
};

export default DiscountCreatePage;
