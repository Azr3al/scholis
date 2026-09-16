"use client";

import { useCallback } from "react";
import { useContextRail } from "@/components/shell/use-context-rail";
import type {
  OrgRecordContext,
  OrgRecordMode,
  OrgSectionId,
} from "@/config/org-record-sections";
import type { organizationType } from "@/types/organization";
import {
  OrgSectionRail,
  type OrgContextParent,
} from "./org-section-rail";

const TENANT_CONTEXT_PARENT: OrgContextParent = {
  label: "Home",
  href: "/home",
};

const PLATFORM_CONTEXT_PARENT: OrgContextParent = {
  label: "Organizations",
  href: "/internal/organizations",
};

export function orgRecordContextParent(mode: OrgRecordMode): OrgContextParent {
  return mode === "tenant" ? TENANT_CONTEXT_PARENT : PLATFORM_CONTEXT_PARENT;
}

export function useOrgRecordRail({
  mode,
  orgId,
  activeSection,
  org,
  ctx,
  isLoading,
  onSelect,
  enabled = true,
}: {
  mode: OrgRecordMode;
  orgId: string;
  activeSection: OrgSectionId | null;
  org: organizationType | null | undefined;
  ctx: OrgRecordContext | null;
  isLoading?: boolean;
  onSelect: (section: OrgSectionId) => void;
  enabled?: boolean;
}) {
  const contextParent = orgRecordContextParent(mode);
  const handleSelect = useCallback(
    (section: OrgSectionId) => {
      onSelect(section);
    },
    [onSelect],
  );

  useContextRail(
    OrgSectionRail,
    () =>
      enabled && ctx && orgId
        ? {
            org: org ?? null,
            ctx,
            section: activeSection ?? "overview",
            activeSection,
            onSelect: handleSelect,
            contextParent,
            isLoading,
          }
        : null,
    contextParent,
  );
}
