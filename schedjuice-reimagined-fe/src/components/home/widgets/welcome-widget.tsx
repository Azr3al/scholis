"use client";

import { DashboardCard } from "../dashboard-card";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";

export default function WelcomeWidget() {
  const { user, isLoading: userLoading } = useUser();
  const { tenant, isLoading: tenantLoading } = useTenant();

  const displayName = user?.name?.trim() || "there";
  const orgName = tenant?.name?.trim();

  return (
    <DashboardCard
      title="Welcome"
      span="lg"
      loading={userLoading || tenantLoading}
    >
      <div className="space-y-2">
        <p className="text-lg font-medium tracking-tight">
          Hello, {displayName}
        </p>
        {orgName ? (
          <p className="text-sm text-text-muted">{orgName}</p>
        ) : null}
        <p className="text-sm text-text-muted">
          Here&apos;s what needs your attention today.
        </p>
      </div>
    </DashboardCard>
  );
}
