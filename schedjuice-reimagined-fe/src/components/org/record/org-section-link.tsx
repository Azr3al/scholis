"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { parseAsString, useQueryState } from "nuqs";

import type { OrgSectionId, OrgRecordMode } from "@/config/org-record-sections";
import type { OrgAiPane } from "@/components/org/record/use-org-section";
import { orgSectionHref } from "@/lib/org/org-section-href";

import { useOrgRecordNavigation } from "./org-record-navigation-context";

export function OrgSectionLink({
  mode,
  orgId,
  section,
  pane,
  recordBasePath,
  className,
  children,
}: {
  mode: OrgRecordMode;
  orgId: string | number;
  section: string;
  pane?: OrgAiPane;
  recordBasePath?: string;
  className?: string;
  children: ReactNode;
}) {
  const navigation = useOrgRecordNavigation();
  const [, setPane] = useQueryState(
    "pane",
    parseAsString.withDefault("settings"),
  );
  const href = orgSectionHref(mode, orgId, section, {
    pane,
    basePath: recordBasePath,
  });

  return (
    <Link
      href={href}
      className={className}
      onClick={(event) => {
        if (!navigation) return;
        event.preventDefault();
        if (pane) void setPane(pane);
        navigation.navigateToSection(section as OrgSectionId);
      }}
    >
      {children}
    </Link>
  );
}
