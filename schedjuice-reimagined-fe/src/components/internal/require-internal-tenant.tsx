"use client";

import { EmptyState } from "@/components/primitives/empty";
import { useInternalTenant } from "@/hooks/useInternalTenant";
import type { ReactNode } from "react";
import { useEffect } from "react";

export function RequireInternalTenant({ children }: { children: ReactNode }) {
  const { tenantId, organizationId, setTenantId } = useInternalTenant();

  useEffect(() => {
    if (tenantId != null && organizationId == null) {
      setTenantId(null);
    }
  }, [tenantId, organizationId, setTenantId]);

  if (organizationId == null) {
    return (
      <EmptyState>
        <p className="text-text-muted">Select a tenant</p>
        <p className="text-sm text-text-muted">
          Use the tenant control in the header.
        </p>
      </EmptyState>
    );
  }

  return <>{children}</>;
}
