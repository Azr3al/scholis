"use client";

import { PageContainer } from "@/components/layout/page-container";
import DeleteZone from "@/components/form/delete-zone";
import { DiscountForm } from "@/components/finance/discount-form";
import type { AutoFormGroup } from "@/components/auto-form";
import BackButton from "@/components/misc/back-button";
import { TypographyH1 } from "@/components/typography/h1";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import {
  appendActiveStatusGroup,
  canManageActiveStatus,
  highRiskFieldsWithActive,
} from "@/lib/form/field-visibility";
import { useParams } from "next/navigation";
import { useMemo } from "react";

const ELIGIBILITY_FIELDS = [
  "eligibility_type",
  "early_bird_days",
  "bulk_min_courses",
] as const;

const BASE_PRICING_FIELDS = [
  "discount_type",
  "percent_value",
  "fixed_amount",
  "scope",
] as const;

const DiscountUpdatePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { tenant } = useTenant();
  const { user } = useUser();
  const eligibilityEnabled = tenant?.is_discount_eligibility_enabled !== false;
  const canManageActive = canManageActiveStatus(user);

  const highRiskFields = useMemo(() => {
    const fields = [
      ...BASE_PRICING_FIELDS,
      ...(eligibilityEnabled ? ELIGIBILITY_FIELDS : []),
    ];
    return highRiskFieldsWithActive(fields, canManageActive);
  }, [eligibilityEnabled, canManageActive]);

  const groups = useMemo((): AutoFormGroup[] => {
    const pricingFields = [
      ...BASE_PRICING_FIELDS,
      ...(eligibilityEnabled ? ELIGIBILITY_FIELDS : []),
    ];

    return appendActiveStatusGroup(
      [
        {
          id: "identity",
          title: "Discount",
          description: "Name and optional notes.",
          fields: ["name", "description"],
        },
        {
          id: "pricing",
          title: eligibilityEnabled
            ? "Amount, scope, and eligibility"
            : "Amount and scope",
          description: eligibilityEnabled
            ? "Money and eligibility — save explicitly."
            : "Money and scope — save explicitly.",
          fields: pricingFields,
        },
      ],
      canManageActive,
    );
  }, [eligibilityEnabled, canManageActive]);

  return (
    <PageContainer width="narrow" className="space-y-3">
      <BackButton href={`/discounts/${id}`} />
      <TypographyH1>Edit Discount</TypographyH1>
      <DiscountForm
        isEdit
        autosave
        entityId={id}
        entityName="Discount"
        apiUrl="discounts"
        groups={groups}
        shouldAutosaveField={(name) => !highRiskFields.includes(name)}
        explicitSaveFields={highRiskFields}
        explicitSaveLabel="Save pricing"
      />
      <DeleteZone
        validate_input="delete discount"
        entityName="Discount"
        entityId={id}
        deleteApiUrl="discounts"
        redirectUrl="/discounts"
      />
    </PageContainer>
  );
};

export default DiscountUpdatePage;
