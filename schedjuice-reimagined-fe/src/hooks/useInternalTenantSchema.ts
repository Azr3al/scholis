"use client";

import { fetchEntity } from "@/app/client-api/utils";
import { schemaNameFromDomainUrl } from "@/helpers/internal-tenant-schema";
import { useInternalTenant } from "@/hooks/useInternalTenant";
import { useQuery } from "@tanstack/react-query";

type OrgDomainRow = {
  id: number;
  domain_url?: string | null;
};

/**
 * Resolve django-tenant schema_name for the selected internal tenant.
 * `schema_name` is write-only on OrganizationSerializer, so we derive it from domain_url.
 */
export function useInternalTenantSchema() {
  const { organizationId, tenantId } = useInternalTenant();

  const query = useQuery({
    queryKey: ["internal-tenant-schema", organizationId],
    queryFn: async () => {
      const res = await fetchEntity("organizations", organizationId!);
      const org = res.data?.data as OrgDomainRow | undefined;
      const domain = org?.domain_url?.trim();
      if (!domain) {
        throw new Error("Selected organization has no domain_url");
      }
      return schemaNameFromDomainUrl(domain);
    },
    enabled: organizationId != null,
    staleTime: 5 * 60 * 1000,
  });

  return {
    tenantId,
    organizationId,
    schemaName: query.data ?? null,
    isLoading: organizationId != null && query.isLoading,
    error: query.error,
  };
}
