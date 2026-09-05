"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { orgSectionHref, type OrgAiPane } from "@/lib/org/org-section-href";
import type { OrgRecordMode } from "@/config/org-record-sections";

function tabClass(active: boolean) {
  return cn(
    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
    active
      ? "bg-surface-active text-text-primary"
      : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
  );
}

export function OrgAiPaneTabs({
  mode,
  orgId,
  pane,
  dateParam,
  onSelectPane,
  recordBasePath,
}: {
  mode: OrgRecordMode;
  orgId: string | number;
  pane: OrgAiPane;
  dateParam?: string;
  onSelectPane: (pane: OrgAiPane) => void;
  recordBasePath?: string;
}) {
  const date = dateParam ? { date: dateParam } : undefined;

  const tabs: { id: OrgAiPane; label: string }[] = [
    { id: "settings", label: "Settings" },
    { id: "usage", label: "Usage" },
    { id: "requests", label: "Requests" },
    { id: "failures", label: "Failures" },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={orgSectionHref(mode, orgId, "ai", {
            pane: tab.id,
            ...date,
            basePath: recordBasePath,
          })}
          className={tabClass(pane === tab.id)}
          onClick={(e) => {
            e.preventDefault();
            onSelectPane(tab.id);
          }}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
