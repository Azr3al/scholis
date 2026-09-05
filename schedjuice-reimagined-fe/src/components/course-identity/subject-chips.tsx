"use client";

import {
  selectSubjectChips,
  truncateSubjectChips,
  type SubjectChipSource,
} from "@/helpers/course-identity";

type Props = {
  source: SubjectChipSource;
  maxVisible: number;
  variant?: "hub" | "record";
};

export function SubjectChips({
  source,
  maxVisible,
  variant = "hub",
}: Props) {
  const all = selectSubjectChips(source);
  const { visible, overflow } = truncateSubjectChips(all, maxVisible);
  if (visible.length === 0) return null;

  if (variant === "record") {
    return (
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {visible.map((chip) => (
          <span
            key={chip.id}
            className="rounded-full bg-surface-sunken px-2 py-0.5 text-xs text-text-secondary"
          >
            {chip.name}
          </span>
        ))}
        {overflow > 0 ? (
          <span className="text-xs text-text-muted">+{overflow} more</span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {visible.map((chip) => (
        <span className="inline-flex items-center rounded-full border border-border bg-surface-hover px-2.5 py-0.5 text-xs font-medium text-text-secondary" key={chip.id} >
          {chip.name}
        </span>
      ))}
      {overflow > 0 ? <span className="inline-flex items-center rounded-full border border-border bg-surface-hover px-2.5 py-0.5 text-xs font-medium text-text-secondary" >+{overflow} more</span> : null}
    </div>
  );
}
