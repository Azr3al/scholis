"use client";

import {
  visibleOrgSections,
  type OrgRecordContext,
  type OrgSectionId,
} from "@/config/org-record-sections";
import { cn } from "@/lib/utils";

export function OrgMobileSections({
  ctx,
  section,
  onSelect,
}: {
  ctx: OrgRecordContext;
  section: OrgSectionId;
  onSelect: (s: OrgSectionId) => void;
}) {
  return (
    <div className="-mx-4 mb-4 flex gap-1 overflow-x-auto border-b border-border px-4 pb-2 md:hidden">
      {visibleOrgSections(ctx).map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onSelect(s.id)}
          aria-current={section === s.id ? "page" : undefined}
          className={cn(
            "shrink-0 rounded-full px-3 py-1 text-sm transition-colors",
            section === s.id
              ? "bg-accent text-accent-foreground"
              : "text-text-secondary hover:bg-surface-hover",
          )}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
