"use client";

import { Spinner } from "@/components/primitives/spinner";
import { PageContainer } from "@/components/layout/page-container";
import { getMicrosoftHealth, MicrosoftRepairJob } from "@/app/client-api/microsoft";
import { RequireInternalTenant } from "@/components/internal/require-internal-tenant";
import { MicrosoftStatusChip } from "@/components/microsoft/microsoft-status-chip";
import { withInternalTenantId } from "@/helpers/internal-tenant-schema";
import { useInternalTenant } from "@/hooks/useInternalTenant";
import { useQuery } from "@tanstack/react-query";
import { Activity, WarningTriangle as AlertTriangle } from "iconoir-react";
import Link from "next/link";

type HealthPayload = {
  is_microsoft_on: boolean;
  is_teams_creation_enabled: boolean;
  config_blockers: string[];
  users: { total: number; repairable: number; by_status: Record<string, number> };
  courses: { total: number; repairable: number; by_status: Record<string, number> };
  unlicensed_users: {
    total: number;
    repairable: number;
    by_status: Record<string, number>;
  };
  scope_team_owners?: {
    total: number;
    repairable: number;
    by_status: Record<string, number>;
  };
  recent_jobs: MicrosoftRepairJob[];
};

function SummaryCard({
  title,
  summary,
  repairHref,
}: {
  title: string;
  summary: HealthPayload["users"];
  repairHref: string;
}) {
  return (
    <div className="border border-border p-4">
      <div className="flex items-center justify-between">
        <span className="font-medium">{title}</span>
        <Link href={repairHref} className="text-xs underline text-muted-foreground">
          Open bulk repair
        </Link>
      </div>
      <p className="text-muted-foreground text-xs mt-1">
        {summary.total} missing link(s) · {summary.repairable} repairable
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {Object.entries(summary.by_status).map(([status, count]) => (
          <span key={status} className="inline-flex items-center gap-1">
            <MicrosoftStatusChip status={status} />
            <span className="text-xs text-muted-foreground">{count}</span>
          </span>
        ))}
        {Object.keys(summary.by_status).length === 0 ? (
          <span className="text-xs text-muted-foreground">Nothing missing.</span>
        ) : null}
      </div>
    </div>
  );
}

export default function MicrosoftHealthPage() {
  const { organizationId, tenantId } = useInternalTenant();
  const { data, isLoading: healthLoading } = useQuery({
    queryKey: ["microsoft-health", organizationId],
    queryFn: () => getMicrosoftHealth(organizationId!),
    enabled: organizationId != null,
  });

  const health = data?.data?.data as HealthPayload | undefined;

  return (
    <PageContainer width="wide" className="font-mono text-sm min-h-[70vh] max-w-2xl">
      <div className="border-b border-border pb-4 mb-6">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          <Activity className="h-4 w-4" />
          <span>SUPERADMIN TOOLS</span>
        </div>
        <h1 className="text-xl font-semibold tracking-tight">
          Microsoft provisioning health
        </h1>
        <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
          Tenant configuration status, missing-link counts, and recent repair jobs.
        </p>
      </div>

      <RequireInternalTenant>
        {healthLoading || !health ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Spinner className="h-4 w-4 " /> Loading health…
          </div>
        ) : (
          <div className="space-y-6">
            <div className="border border-border p-4">
              <span className="font-medium">Tenant configuration</span>
              <div className="mt-2 space-y-1 text-xs">
                <p>
                  Microsoft integration:{" "}
                  <span
                    className={
                      health.is_microsoft_on ? "text-emerald-600" : "text-destructive"
                    }
                  >
                    {health.is_microsoft_on ? "on" : "off"}
                  </span>
                </p>
                <p>
                  Teams creation:{" "}
                  <span
                    className={
                      health.is_teams_creation_enabled
                        ? "text-emerald-600"
                        : "text-muted-foreground"
                    }
                  >
                    {health.is_teams_creation_enabled ? "enabled" : "disabled"}
                  </span>
                </p>
              </div>
              {health.config_blockers.length > 0 ? (
                <div className="mt-3 space-y-1">
                  {health.config_blockers.map((b) => (
                    <p
                      key={b}
                      className="flex items-start gap-1 text-destructive text-xs"
                    >
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      {b}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-xs text-emerald-600">No configuration blockers.</p>
              )}
            </div>

            <SummaryCard
              title="Users missing Microsoft accounts"
              summary={health.users}
              repairHref={withInternalTenantId(
                "/internal/microsoft-bulk-repair?target=users",
                tenantId,
              )}
            />
            <SummaryCard
              title="Courses missing Microsoft Teams"
              summary={health.courses}
              repairHref={withInternalTenantId(
                "/internal/microsoft-bulk-repair?target=courses",
                tenantId,
              )}
            />
            {health.unlicensed_users ? (
              <SummaryCard
                title="Users missing Microsoft licenses"
                summary={health.unlicensed_users}
                repairHref={withInternalTenantId(
                  "/internal/microsoft-bulk-repair?target=unlicensed_users",
                  tenantId,
                )}
              />
            ) : null}
            {health.scope_team_owners ? (
              <SummaryCard
                title="Course oversight — missing Teams owners"
                summary={health.scope_team_owners}
                repairHref={withInternalTenantId(
                  "/internal/microsoft-bulk-repair?target=scope_team_owners",
                  tenantId,
                )}
              />
            ) : null}

            <div className="border border-border p-4">
              <span className="font-medium">Recent repair jobs</span>
              <div className="mt-3 space-y-2">
                {health.recent_jobs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No repair jobs yet.</p>
                ) : (
                  health.recent_jobs.map((job) => (
                    <Link
                      key={job.id}
                      href={withInternalTenantId(
                        `/internal/microsoft-bulk-repair?job=${job.id}`,
                        tenantId,
                      )}
                      className="flex items-center justify-between border border-border/60 p-2 hover:bg-muted/40"
                    >
                      <span className="text-xs">
                        #{job.id} · {job.target_type}
                      </span>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        <MicrosoftStatusChip status={job.status} />
                        {job.succeeded}/{job.total} ok
                      </span>
                    </Link>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </RequireInternalTenant>
    </PageContainer>
  );
}
