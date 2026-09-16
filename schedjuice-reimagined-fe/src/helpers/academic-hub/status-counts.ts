import {
  HUB_STATUS_VALUES,
  HubStatusAggregate,
  HubStatusFilter,
} from "@/types/academic-hub";

export const STATUS_LABEL: Record<HubStatusFilter, string> = {
  active: "Active",
  planned: "Planned",
  ended: "Ended",
};

export function countForStatus(
  status: HubStatusFilter,
  counts?: HubStatusAggregate,
): number | undefined {
  if (!counts) return undefined;
  if (status === "active") return counts.active + counts.paused;
  if (status === "planned") return counts.planned;
  return counts.ended;
}

export function toggleStatusSelection(
  selected: HubStatusFilter[],
  status: HubStatusFilter,
): HubStatusFilter[] {
  const isOn = selected.includes(status);
  const next = isOn
    ? selected.filter((s) => s !== status)
    : [...selected, status];
  return next.length === 0 ? ["active"] : next;
}

export { HUB_STATUS_VALUES };
