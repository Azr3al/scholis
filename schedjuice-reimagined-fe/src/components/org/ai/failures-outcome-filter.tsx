"use client";

import { cn } from "@/lib/utils";
import { FailuresOutcomeFilter } from "@/types/ai-usage";

const OPTIONS: {
  value: FailuresOutcomeFilter;
  label: string;
}[] = [
  { value: "all", label: "All" },
  { value: "tool_limit_exceeded", label: "Tool limit" },
  { value: "capability_gap", label: "Capability gap" },
];

export function FailuresOutcomeFilterControl({
  value,
  counts,
  onChange,
}: {
  value: FailuresOutcomeFilter;
  counts: {
    all: number;
    tool_limit_exceeded: number;
    capability_gap: number;
  };
  onChange: (value: FailuresOutcomeFilter) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border bg-muted/30 p-1">
      {OPTIONS.map((option) => {
        const count =
          option.value === "all"
            ? counts.all
            : counts[option.value];
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onChange(option.value)}
          >
            {option.label}
            <span className="ml-1.5 tabular-nums text-muted-foreground">({count})</span>
          </button>
        );
      })}
    </div>
  );
}
