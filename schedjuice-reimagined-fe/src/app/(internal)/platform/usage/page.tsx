"use client";

import { PageContainer } from "@/components/layout/page-container";
import { TenantUsageOverview } from "@/components/platform/tenant-usage-overview";
import { Spinner } from "@/components/primitives/spinner";
import { permissionsFor } from "@/helpers/authorization";
import { usePageHeader } from "@/components/shell/use-page-header";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, type ReactNode } from "react";

function UsageAccessGate({ children }: { children: ReactNode }) {
  const { user, isLoading: userLoading } = useUser();
  const { tenant, isLoading: tenantLoading } = useTenant();
  const router = useRouter();

  const allowed = permissionsFor(user).canAny([
    "ai.usage.view",
    "billing.manage",
  ]);
  const isLoading = userLoading || tenantLoading;

  useEffect(() => {
    if (!isLoading && !allowed) {
      router.replace("/home");
    }
  }, [allowed, isLoading, router]);

  if (isLoading || !allowed || !tenant) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner className="h-8 w-8 text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}

export default function PlatformUsagePage() {
  const { tenant } = useTenant();

  const headerConfig = useMemo(
    () => ({
      breadcrumb: (
        <h1 className="font-serif text-lg text-text-primary">Usage</h1>
      ),
    }),
    [],
  );
  usePageHeader(headerConfig);

  return (
    <UsageAccessGate>
      <PageContainer>
        <div className="py-6">
          <p className="mb-6 text-sm text-text-muted">
            Overview of your organization&apos;s Schedjuice and AI usage this
            month.
          </p>
          {tenant ? <TenantUsageOverview tenantId={tenant.id} /> : null}
        </div>
      </PageContainer>
    </UsageAccessGate>
  );
}
