"use client";

import { CapabilityGapBadges } from "@/components/org/ai/capability-gap-badges";
import { FailureCauseBadges } from "@/components/org/ai/failure-cause-badges";
import { AiUsageFailureItem } from "@/types/ai-usage";

export function FailuresDiagnosisCell({ item }: { item: AiUsageFailureItem }) {
  if (item.outcome === "capability_gap") {
    return <CapabilityGapBadges gaps={item.capability_gaps} />;
  }
  return <FailureCauseBadges causes={item.likely_causes} />;
}
