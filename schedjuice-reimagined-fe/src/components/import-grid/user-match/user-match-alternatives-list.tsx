"use client";

import type { UserMatchCandidate } from "@/app/client-api/imports";
import { cn } from "@/lib/utils";

type Props = {
  candidates: UserMatchCandidate[];
  compact?: boolean;
  onPick: (userId: number) => void;
  className?: string;
};

export function UserMatchAlternativesList({
  candidates,
  compact = false,
  onPick,
  className,
}: Props) {
  if (candidates.length === 0) return null;

  return (
    <div className={cn(compact ? "mb-1.5 space-y-0.5" : "mb-2 space-y-1", className)}>
      <p
        className={cn(
          compact
            ? "text-[10px] uppercase tracking-wide text-text-secondary"
            : "text-xs text-slate-400",
        )}
      >
        Alternatives
      </p>
      {candidates.map((c) => (
        <button
          key={c.user.id}
          type="button"
          className={cn(
            "flex w-full items-center justify-between text-left active:scale-[0.99]",
            compact
              ? "rounded px-1.5 py-1 text-xs hover:bg-muted/50"
              : "rounded-md px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-900",
          )}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(c.user.id)}
        >
          <span className="truncate">{c.user.name}</span>
          <span
            className={cn(
              "ml-2 shrink-0",
              compact ? "text-[10px] text-text-secondary" : "text-xs text-slate-400",
            )}
          >
            {c.field} ≈ {Math.round(c.score)}
          </span>
        </button>
      ))}
    </div>
  );
}
