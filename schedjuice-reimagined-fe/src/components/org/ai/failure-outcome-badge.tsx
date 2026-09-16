"use client";

import { AiUsageFailureItem } from "@/types/ai-usage";

export function FailureOutcomeBadge({
  outcome,
}: {
  outcome: AiUsageFailureItem["outcome"];
}) {
  if (outcome === "capability_gap") {
    return (
      <span className="inline-flex items-center rounded-md border border-border bg-surface-hover px-2 py-0.5 text-xs font-medium text-text-secondary text-xs">
        Capability gap
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-md border border-transparent bg-danger/15 px-2 py-0.5 text-xs font-medium text-danger text-xs">
      Tool limit
    </span>
  );
}
