"use client";

import { fetchAiUsageSummary } from "@/app/client-api/ai-usage";
import { OrgAiPaneTabs } from "@/components/org/ai/ai-usage-tabs";
import type { OrgRecordContext, OrgRecordMode } from "@/config/org-record-sections";
import { canAccessPlatformOrganizations } from "@/helpers/authorization";
import { getDateISOString } from "@/helpers/date";
import { orgRecordBasePath } from "@/lib/org/org-section-href";
import { canViewOrgAiUsagePane } from "@/lib/org/org-ai-visibility";
import type { AiAnalyticsFeature } from "@/types/ai-usage-analytics";
import { useQuery } from "@tanstack/react-query";
import { parseAsIsoDateTime, parseAsString, useQueryState } from "nuqs";
import { useMemo } from "react";
import type { OrgAiPane } from "../use-org-section";
import { OrgAiFailuresPane } from "./org-ai-failures-pane";
import { OrgAiRequestsPane } from "./org-ai-requests-pane";
import { OrgAiSettingsPane } from "./org-ai-settings-pane";
import { OrgAiUsagePane } from "./org-ai-usage-pane";

export function OrgAiSection({
  orgId,
  mode,
  pane,
  setPane,
  ctx,
  recordBasePath,
}: {
  orgId: string | number;
  mode: OrgRecordMode;
  pane: OrgAiPane;
  setPane: (pane: OrgAiPane) => void;
  ctx: OrgRecordContext;
  recordBasePath?: string;
}) {
  const [date] = useQueryState(
    "date",
    parseAsIsoDateTime.withDefault(new Date()),
  );
  const [feature, setFeature] = useQueryState(
    "feature",
    parseAsString.withDefault("telegram_query"),
  );
  const [tenant, setTenant] = useQueryState("tenant", parseAsString.withDefault("all"));

  const dateParam = getDateISOString(date);
  const canViewUsage = canViewOrgAiUsagePane(ctx);
  const monthDate = useMemo(
    () => new Date(date.getFullYear(), date.getMonth(), 1),
    [date],
  );
  const activeFeature = feature as AiAnalyticsFeature;
  const showTenantFilter =
    Boolean(ctx.tenant && canAccessPlatformOrganizations(ctx.viewer, ctx.tenant)) &&
    orgRecordBasePath(mode, orgId) === "/organizations/profile";
  const tenantId = tenant === "all" ? null : Number(tenant);

  const summaryQuery = useQuery({
    queryKey: [
      "aiUsageSummary",
      monthDate.getFullYear(),
      monthDate.getMonth() + 1,
    ],
    enabled:
      showTenantFilter && (pane === "usage" || pane === "requests") && canViewUsage,
    queryFn: () =>
      fetchAiUsageSummary({
        year: monthDate.getFullYear(),
        month: monthDate.getMonth() + 1,
      }),
  });

  const tenantOptions =
    summaryQuery.data?.organizations.map((org) => ({
      id: org.organization_id,
      name: org.name,
    })) ?? [];

  const analyticsProps = {
    orgId,
    mode,
    monthDate,
    feature: activeFeature,
    onFeatureChange: (value: AiAnalyticsFeature) => void setFeature(value),
    showTenantFilter,
    tenantId: Number.isFinite(tenantId) ? tenantId : null,
    onTenantChange: (value: number | null) =>
      void setTenant(value == null ? "all" : String(value)),
    tenantOptions,
  };

  return (
    <div className="flex flex-col gap-6">
      <OrgAiPaneTabs
        mode={mode}
        orgId={orgId}
        pane={pane}
        dateParam={dateParam}
        onSelectPane={setPane}
        recordBasePath={recordBasePath}
      />

      {pane === "settings" ? <OrgAiSettingsPane orgId={orgId} /> : null}

      {pane === "usage" ? (
        canViewUsage ? (
          <OrgAiUsagePane orgId={orgId} mode={mode} analytics={analyticsProps} />
        ) : (
          <p className="text-sm text-text-muted">
            You do not have permission to view AI usage for this organization.
          </p>
        )
      ) : null}

      {pane === "failures" ? (
        canViewUsage ? (
          <OrgAiFailuresPane orgId={orgId} />
        ) : (
          <p className="text-sm text-text-muted">
            You do not have permission to view AI usage failures for this
            organization.
          </p>
        )
      ) : null}

      {pane === "requests" ? (
        canViewUsage ? (
          <OrgAiRequestsPane orgId={orgId} analytics={analyticsProps} />
        ) : (
          <p className="text-sm text-text-muted">
            You do not have permission to view AI requests for this organization.
          </p>
        )
      ) : null}
    </div>
  );
}
