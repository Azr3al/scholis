"use client";

import { PublicTenantShell } from "@/components/public/public-tenant-shell";
import { useTenant } from "@/hooks/useTenant";

export function BookConsultationChrome({
  children,
}: {
  children: React.ReactNode;
}) {
  const { tenant, isLoading } = useTenant();

  return (
    <PublicTenantShell tenant={tenant} isBrandingLoading={isLoading}>
      {children}
    </PublicTenantShell>
  );
}
