import { fetchEntity } from "@/app/client-api/utils";
import { organizationType } from "@/types/organization";
import { useQuery } from "@tanstack/react-query";

/** Fetches full organization details for admin org settings and similar flows. */
export const useOrganization = (orgId: number | string | undefined) => {
  const { data, isLoading, isSuccess, refetch } = useQuery({
    queryKey: ["organization", orgId],
    queryFn: () => fetchEntity("organizations", String(orgId), []),
    enabled: Boolean(orgId),
  });

  const organization: organizationType | null = data?.data?.data ?? null;

  return {
    organization,
    isLoading,
    isSuccess,
    refetch,
  };
};
