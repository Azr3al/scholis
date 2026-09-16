"use client";

import type { AutoFormGroup } from "@/components/auto-form";
import { PageContainer } from "@/components/layout/page-container";
import { categoryCreateUpdateSchema } from "@/types/course";
import { TypographyH1 } from "@/components/typography/h1";
import BackButton from "@/components/misc/back-button";
import GenericForm from "@/components/form/generic-form";
import { useTenant } from "@/hooks/useTenant";
import { useMemo } from "react";

const CategoryCreatePage: React.FC = () => {
  const { tenant } = useTenant();
  const isMsEnabled = Boolean(
    tenant?.is_microsoft_on && tenant?.is_teams_creation_enabled,
  );

  const groups = useMemo((): AutoFormGroup[] => {
    const base: AutoFormGroup[] = [
      {
        id: "identity",
        title: "Identity",
        description: "Name and description for this category.",
        fields: ["name", "description"],
      },
    ];
    if (isMsEnabled) {
      base.push({
        id: "eligibility",
        title: "Payment eligibility",
        description: "Whether this category can be assigned for payment.",
        fields: ["is_payment_assignment_eligible"],
      });
    }
    return base;
  }, [isMsEnabled]);

  return (
    <PageContainer width="narrow" className="space-y-3">
      <BackButton href="/categories"></BackButton>
      <TypographyH1>Create Category</TypographyH1>
      <GenericForm
        schema={categoryCreateUpdateSchema}
        entityName="category"
        apiUrl="categories"
        redirectUrl="/categories"
        groups={groups}
      />
    </PageContainer>
  );
};

export default CategoryCreatePage;
