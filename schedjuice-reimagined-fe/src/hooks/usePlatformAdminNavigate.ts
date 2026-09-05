"use client";
import { useToast } from "@/components/primitives";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

import { isSuperAdmin } from "@/helpers/authorization";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import { fetchPlatformContext } from "@/lib/product-docs-api";
import { redirectToPlatformAdminLogin } from "@/lib/platform-admin-url";

export function usePlatformAdminNavigate() {
  const router = useRouter();
  const toast = useToast();
  const { realUser, isLoading: userLoading } = useUser();
  const { tenant, isLoading: tenantLoading } = useTenant();

  const isSuperadmin = isSuperAdmin(realUser);
  const isOnAdminTenant = Boolean(tenant?.is_admin);

  const platformContextQuery = useQuery({
    queryKey: ["platform-context"],
    queryFn: fetchPlatformContext,
    enabled: isSuperadmin && !isOnAdminTenant,
    staleTime: 1000 * 60 * 30,
  });

  const isReady =
    !userLoading &&
    !tenantLoading &&
    (isOnAdminTenant || platformContextQuery.isSuccess);

  const navigateToPlatformPath = useCallback(
    (path: string) => {
      if (!path.startsWith("/")) {
        throw new Error(`Expected absolute path, got: ${path}`);
      }

      if (isOnAdminTenant) {
        router.push(path);
        return;
      }

      const adminDomain = platformContextQuery.data?.admin_org.domain_url;
      if (!adminDomain) {
        toast.add({
          type: "error",
          description: platformContextQuery.isError
            ? "Could not load platform settings."
            : "Platform admin organization is not configured.",
        });
        return;
      }

      redirectToPlatformAdminLogin(adminDomain, path);
    },
    [
      isOnAdminTenant,
      platformContextQuery.data,
      platformContextQuery.isError,
      router,
      toast,
    ],
  );

  return {
    isSuperadmin,
    isOnAdminTenant,
    isReady,
    isLoadingContext: platformContextQuery.isLoading,
    navigateToPlatformPath,
  };
}
