"use client";

import { cn } from "@/lib/utils";

type Props = {
  label: string;
  compact?: boolean;
  className?: string;
};

export function UserMatchSuggestedBlock({ label, compact = false, className }: Props) {
  return (
    <div
      className={cn(
        compact
          ? "mb-1.5 truncate rounded bg-muted/40 px-2 py-1 text-xs"
          : "mb-2 rounded-md bg-slate-50 px-2 py-1.5 text-sm dark:bg-slate-900",
        className,
      )}
    >
      Suggested: <span className="font-medium">{label}</span>
    </div>
  );
}
