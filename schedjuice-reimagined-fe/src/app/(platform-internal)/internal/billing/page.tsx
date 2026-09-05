"use client";

import { fetchEntity } from "@/app/client-api/utils";
import { RequireInternalTenant } from "@/components/internal/require-internal-tenant";
import { PageContainer } from "@/components/layout/page-container";
import { OrgBillingSection } from "@/components/org/record/sections/org-billing-section";
import { useInternalTenant } from "@/hooks/useInternalTenant";
import type { organizationType } from "@/types/organization";
import { useQuery } from "@tanstack/react-query";

export default function InternalBillingPage() {
  const { organizationId } = useInternalTenant();
  const orgQuery = useQuery({
    queryKey: ["getOrganization", organizationId],
    queryFn: () => fetchEntity("organizations", organizationId!),
    enabled: organizationId != null,
  });
  const org = (orgQuery.data?.data.data ?? undefined) as
    | organizationType
    | undefined;

  return (
    <PageContainer width="default" className="flex w-full flex-col gap-6">
      <RequireInternalTenant>
        {organizationId != null ? (
          <OrgBillingSection
            orgId={organizationId}
            currencySymbol={org?.currency_symbol}
            enablePlatformInvoices
            organizationName={org?.name}
          />
        ) : null}
      </RequireInternalTenant>
    </PageContainer>
  );
}
