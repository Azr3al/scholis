"use client";
import { Spinner } from "@/components/primitives/spinner";
import { Button, buttonVariants } from "@/components/primitives";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import {
  canAccessPlatformOrganizations,
  isSuperAdmin,
} from "@/helpers/authorization";
import { usePlatformAdminNavigate } from "@/hooks/usePlatformAdminNavigate";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";

export function usePlatformAdminGate() {
  const router = useRouter();
  const { user, isLoading: userLoading } = useUser();
  const { tenant, isLoading: tenantLoading } = useTenant();
  const isLoading = userLoading || tenantLoading;

  const canAccess = Boolean(
    user && tenant && canAccessPlatformOrganizations(user, tenant),
  );

  const needsAdminTenant = Boolean(
    user && tenant && isSuperAdmin(user) && !tenant.is_admin,
  );

  useEffect(() => {
    if (isLoading) return;
    if (canAccess || needsAdminTenant) return;
    router.replace("/home");
  }, [isLoading, canAccess, needsAdminTenant, router]);

  return {
    user,
    tenant,
    isLoading,
    canAccess,
    needsAdminTenant,
  };
}

function PlatformAdminTenantSwitchPrompt() {
  const { isReady, isLoadingContext, navigateToPlatformPath } =
    usePlatformAdminNavigate();

  const handleSwitch = () => {
    const next =
      typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}`
        : "/platform/docs";
    navigateToPlatformPath(next);
  };

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">Switch to the admin organization</h1>
      <p className="text-sm text-muted-foreground">
        Product docs are managed from the Schedjuice platform admin organization.
        Continue to sign in there and return to this page automatically.
      </p>
      <Button
        type="button"
        disabled={!isReady || isLoadingContext}
        onClick={handleSwitch}
      >
        {isLoadingContext ? (
          <>
            <Spinner className="mr-2 h-4 w-4 " aria-hidden />
            Loading…
          </>
        ) : (
          "Switch & continue"
        )}
      </Button>
    </div>
  );
}

export function PlatformAdminGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isLoading, canAccess, needsAdminTenant } = usePlatformAdminGate();

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner className="h-8 w-8 text-muted-foreground" />
      </div>
    );
  }

  if (needsAdminTenant) {
    return <PlatformAdminTenantSwitchPrompt />;
  }

  if (!canAccess) {
    return null;
  }

  return <>{children}</>;
}
