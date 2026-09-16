"use client";

import type { ReactNode } from "react";

import type { OrgSectionId } from "@/config/org-record-sections";
import { orgSectionAnchorId } from "@/lib/org/org-section-anchors";
import { cn } from "@/lib/utils";

import { getOrgSchemaSectionMeta } from "@/config/organization-profile-sections";
import { ORG_SECTIONS } from "@/config/org-record-sections";

function sectionLabel(sectionId: OrgSectionId): string {
  const fromRail = ORG_SECTIONS.find((s) => s.id === sectionId)?.label;
  if (fromRail) return fromRail;
  return getOrgSchemaSectionMeta(sectionId)?.title ?? sectionId;
}

export function OrgSectionAnchor({
  sectionId,
  children,
  className,
}: {
  sectionId: OrgSectionId;
  children: ReactNode;
  className?: string;
}) {
  const label = sectionLabel(sectionId);
  return (
    <section
      id={orgSectionAnchorId(sectionId)}
      aria-labelledby={`${orgSectionAnchorId(sectionId)}-heading`}
      className={cn("scroll-mt-16", className)}
    >
      <h2 id={`${orgSectionAnchorId(sectionId)}-heading`} className="sr-only">
        {label}
      </h2>
      {children}
    </section>
  );
}
