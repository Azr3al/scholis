"use client";

import { RequireInternalTenant } from "@/components/internal/require-internal-tenant";
import { PageContainer } from "@/components/layout/page-container";
import { OrgAiSection } from "@/components/org/record/sections/org-ai-section";
import type { OrgAiPane } from "@/components/org/record/use-org-section";
import { useInternalTenant } from "@/hooks/useInternalTenant";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import { parseAsString, useQueryState } from "nuqs";
import { useMemo } from "react";

const AI_PANES: OrgAiPane[] = ["settings", "usage", "failures", "requests"];

function isOrgAiPane(value: string): value is OrgAiPane {
  return (AI_PANES as string[]).includes(value);
}

export default function InternalAiUsagePage() {
  const { organizationId } = useInternalTenant();
  const { user } = useUser();
  const { tenant } = useTenant();
  const [rawPane, setRawPane] = useQueryState(
    "pane",
    parseAsString.withDefault("usage"),
  );
  const pane: OrgAiPane = isOrgAiPane(rawPane) ? rawPane : "usage";

  const ctx = useMemo(
    () =>
      user
        ? {
            mode: "platform" as const,
            viewer: user,
            tenant,
          }
        : null,
    [user, tenant],
  );

  return (
    <PageContainer width="default" className="flex w-full flex-col gap-6">
      <RequireInternalTenant>
        {organizationId != null && ctx ? (
          <OrgAiSection
            orgId={organizationId}
            mode="platform"
            pane={pane}
            setPane={(next) => {
              void setRawPane(next);
            }}
            ctx={ctx}
          />
        ) : null}
      </RequireInternalTenant>
    </PageContainer>
  );
}
