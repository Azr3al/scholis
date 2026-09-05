import type { DuplicateCluster, DuplicateMatchReason } from "@/types/user-insights";
import { isSuspiciousContact } from "./suspicious-contact";

export function matchReasonIsSuspicious(reason: DuplicateMatchReason): boolean {
  return isSuspiciousContact(reason.normalized_value, reason.field);
}

export function formatMatchReasonBadgeText(reason: DuplicateMatchReason): string {
  const parts = [`${reason.label} · ${reason.normalized_value}`];
  if (matchReasonIsSuspicious(reason)) {
    parts.push("placeholder");
  }
  if (reason.possible_sibling) {
    parts.push("name mismatch");
  }
  return parts.join(" · ");
}

export function isClusterLikelyFalsePositive(
  cluster: Pick<DuplicateCluster, "match_reasons">
): boolean {
  if (cluster.match_reasons.length === 0) return false;
  return cluster.match_reasons.every(matchReasonIsSuspicious);
}
