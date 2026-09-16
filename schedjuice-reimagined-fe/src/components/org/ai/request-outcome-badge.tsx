"use client";

import type { AiUsageRequestOutcome } from "@/types/ai-usage";

const OUTCOME_LABELS: Record<AiUsageRequestOutcome, string> = {
  success: "Success",
  tool_limit_exceeded: "Tool limit",
  capability_gap: "Capability gap",
  error: "Error",
  blocked: "Blocked",
  rate_limited: "Rate limited",
};

const OUTCOME_VARIANT: Record<
  AiUsageRequestOutcome,
  "default" | "secondary" | "destructive" | "outline"
> = {
  success: "secondary",
  tool_limit_exceeded: "destructive",
  capability_gap: "outline",
  error: "destructive",
  blocked: "outline",
  rate_limited: "outline",
};

export function RequestOutcomeBadge({
  outcome,
}: {
  outcome: AiUsageRequestOutcome;
}) {
  return (
    <span className="inline-flex items-center rounded-md border border-border bg-surface-hover px-2 py-0.5 text-xs font-medium text-text-secondary text-xs">
      {OUTCOME_LABELS[outcome]}
    </span>
  );
}
