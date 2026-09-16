"use client";

import { fetchAiSettings } from "@/app/client-api/ai-settings";
import { Avatar } from "@/components/primitives/avatar";
import { OrgSectionLink } from "@/components/org/record/org-section-link";
import type { OrgRecordMode } from "@/config/org-record-sections";
import {
  ORG_SETTINGS_REGISTRY,
  OVERVIEW_CHIP_GROUP_LABELS,
  OVERVIEW_CHIP_GROUP_ORDER,
  type OrgOverviewChipGroup,
  type OrgSectionId,
} from "@/config/org-settings-registry";
import { cn } from "@/lib/utils";
import type { organizationType } from "@/types/organization";
import { useQuery } from "@tanstack/react-query";

function StatusChip({
  label,
  value,
  mode,
  orgId,
  section,
  recordBasePath,
  pane,
}: {
  label: string;
  value: string;
  mode: OrgRecordMode;
  orgId: string | number;
  section: OrgSectionId;
  recordBasePath?: string;
  pane?: "settings" | "usage" | "failures" | "requests";
}) {
  return (
    <OrgSectionLink
      mode={mode}
      orgId={orgId}
      section={section}
      pane={pane}
      recordBasePath={recordBasePath}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-sm",
        "transition-colors hover:bg-surface-hover",
      )}
    >
      <span className="text-text-muted">{label}</span>
      <span className="font-medium text-text-primary">{value}</span>
    </OrgSectionLink>
  );
}

function ChipGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-medium uppercase tracking-wide text-text-muted">
        {label}
      </h3>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  );
}

export function OrgOverview({
  org,
  mode,
  orgId,
  recordBasePath,
}: {
  org: organizationType;
  mode: OrgRecordMode;
  orgId: string | number;
  recordBasePath?: string;
}) {
  const aiQuery = useQuery({
    queryKey: ["organizationAiSettings", orgId],
    queryFn: () => fetchAiSettings(orgId),
    enabled: orgId != null,
  });

  const chipsByGroup = OVERVIEW_CHIP_GROUP_ORDER.reduce(
    (acc, group) => {
      acc[group] = [];
      return acc;
    },
    {} as Record<OrgOverviewChipGroup, React.ReactNode[]>,
  );

  for (const entry of ORG_SETTINGS_REGISTRY) {
    if (!entry.overviewChips?.length) continue;
    for (const chip of entry.overviewChips) {
      const value =
        entry.id === "ai"
          ? aiQuery.data?.is_ai_enabled === false
            ? "Disabled"
            : "Enabled"
          : chip.value(org);
      chipsByGroup[chip.chipGroup].push(
        <StatusChip
          key={`${entry.id}-${chip.label}`}
          label={chip.label}
          value={value}
          mode={mode}
          orgId={orgId}
          section={entry.id}
          pane={chip.pane}
          recordBasePath={recordBasePath}
        />,
      );
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <section className="space-y-3">
        <div className="flex items-start gap-4">
          <Avatar
            src={org.logo ?? undefined}
            name={org.name ?? "?"}
            className="size-14 rounded-md"
          />
          <div className="space-y-1">
            <h2 className="font-serif text-2xl text-text-primary">{org.name}</h2>
            {org.tagline ? (
              <p className="text-text-secondary">{org.tagline}</p>
            ) : null}
            {org.domain_url ? (
              <a
                href={`https://${org.domain_url}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-accent hover:underline"
              >
                {org.domain_url}
              </a>
            ) : null}
            {org.description ? (
              <p className="text-sm text-text-muted">{org.description}</p>
            ) : null}
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-6">
        {OVERVIEW_CHIP_GROUP_ORDER.map((group) =>
          chipsByGroup[group].length ? (
            <ChipGroup key={group} label={OVERVIEW_CHIP_GROUP_LABELS[group]}>
              {chipsByGroup[group]}
            </ChipGroup>
          ) : null,
        )}
      </div>

      <section className="flex flex-wrap gap-4 text-sm">
        <OrgSectionLink
          mode={mode}
          orgId={orgId}
          section="profile"
          recordBasePath={recordBasePath}
          className="text-accent hover:underline"
        >
          Edit profile
        </OrgSectionLink>
        <OrgSectionLink
          mode={mode}
          orgId={orgId}
          section="microsoft"
          recordBasePath={recordBasePath}
          className="text-accent hover:underline"
        >
          Integrations
        </OrgSectionLink>
        <OrgSectionLink
          mode={mode}
          orgId={orgId}
          section="library"
          recordBasePath={recordBasePath}
          className="text-accent hover:underline"
        >
          Feature toggles
        </OrgSectionLink>
        <OrgSectionLink
          mode={mode}
          orgId={orgId}
          section="ai"
          pane="usage"
          recordBasePath={recordBasePath}
          className="text-accent hover:underline"
        >
          AI usage
        </OrgSectionLink>
      </section>
    </div>
  );
}
