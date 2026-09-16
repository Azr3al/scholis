"use client";

import { useQuery } from "@tanstack/react-query";

import type { ResourceListResult } from "@/components/data-table/types";

import type { OrganizationAdmin } from "../_types/organization-admins";
import {
  listOrganizationAdmins,
  organizationAdminsKeys,
  type ListOrganizationAdminsArgs,
} from "../resources/organization-admins";

export type UseOrganizationAdminsListArgs = ListOrganizationAdminsArgs & {
  enabled?: boolean;
};

export function useOrganizationAdminsList(
  args: UseOrganizationAdminsListArgs,
): ResourceListResult<OrganizationAdmin> {
  const { enabled = true, ...listArgs } = args;
  const query = useQuery({
    queryKey: organizationAdminsKeys.list(listArgs),
    queryFn: () => listOrganizationAdmins(listArgs),
    enabled: enabled && listArgs.orgId != null && listArgs.orgId !== "",
  });

  return {
    rows: query.data?.rows ?? [],
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error instanceof Error ? query.error : null,
    refetch: () => {
      void query.refetch();
    },
  };
}
