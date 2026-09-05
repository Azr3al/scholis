"use client";

import { Tooltip } from "@/components/primitives/tooltip";
import { CapabilityGapCode } from "@/types/ai-usage";

const GAP_META: Record<
  CapabilityGapCode,
  {
    label: string;
    variant: "danger" | "secondary" | "outline";
    tooltip: string;
  }
> = {
  missing_tool: {
    label: "Missing tool",
    variant: "danger",
    tooltip: "No tool exists to answer this in-scope question",
  },
  data_not_exposed: {
    label: "Data not exposed",
    variant: "secondary",
    tooltip: "Data may exist in the platform but isn't available to the assistant",
  },
  access_policy: {
    label: "Access policy",
    variant: "secondary",
    tooltip: "Requester's permissions blocked this in-scope question",
  },
  feature_unavailable: {
    label: "Feature off",
    variant: "secondary",
    tooltip: "School feature is disabled or not configured",
  },
  unknown: {
    label: "Unknown",
    variant: "secondary",
    tooltip: "Gap detected but category unclear",
  },
};

export function CapabilityGapBadges({ gaps }: { gaps: CapabilityGapCode[] }) {
  if (gaps.length === 0) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {gaps.map((code) => {
        const meta = GAP_META[code];
        return (
          <Tooltip.Root key={code}>
            <Tooltip.Trigger
              render={
                <span className="inline-flex items-center rounded-md border border-border bg-surface-hover px-2 py-0.5 text-xs font-medium text-text-secondary cursor-default text-xs">
                  {meta.label}
                </span>
              }
            />
            <Tooltip.Portal>
              <Tooltip.Positioner>
                <Tooltip.Popup className="max-w-xs">{meta.tooltip}</Tooltip.Popup>
              </Tooltip.Positioner>
            </Tooltip.Portal>
          </Tooltip.Root>
        );
      })}
    </div>
  );
}
