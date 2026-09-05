"use client";

import { useMemo } from "react";
import { usePageHeader } from "@/components/shell/use-page-header";
import { RecordParentSectionBreadcrumb } from "@/components/shell/record-parent-section-breadcrumb";
import {
  ORG_SECTIONS,
  type OrgRecordMode,
} from "@/config/org-record-sections";
import type { organizationType } from "@/types/organization";

export function useOrgRecordPageHeader({
  org: _org,
  mode,
  section,
  enabled = true,
}: {
  org: organizationType | null | undefined;
  mode: OrgRecordMode;
  section: string;
  enabled?: boolean;
}) {
  const pageHeader = useMemo(() => {
    if (!enabled) return {};
    const parent =
      mode === "tenant"
        ? { label: "School settings", href: "/organizations/profile" }
        : { label: "Organizations", href: "/internal/organizations" };
    const sectionLabel =
      ORG_SECTIONS.find((entry) => entry.id === section)?.label ?? null;

    return {
      breadcrumb: (
        <RecordParentSectionBreadcrumb
          parent={parent}
          section={sectionLabel}
        />
      ),
    };
  }, [enabled, mode, section]);

  usePageHeader(pageHeader);
}
