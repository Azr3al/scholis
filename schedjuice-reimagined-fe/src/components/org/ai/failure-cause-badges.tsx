"use client";

import { Tooltip } from "@/components/primitives/tooltip";
import { LikelyCauseCode } from "@/types/ai-usage";

const CAUSE_META: Record<
  LikelyCauseCode,
  {
    label: string;
    variant: "danger" | "secondary" | "outline";
    tooltip: string;
  }
> = {
  tool_descriptions: {
    label: "Tool descriptions",
    variant: "danger",
    tooltip:
      "AI retried a tool with argument errors — consider improving tool schema/description",
  },
  complex_task: {
    label: "Complex task",
    variant: "secondary",
    tooltip:
      "Many different tools used — question may exceed current capability or iteration budget",
  },
  model_loop: {
    label: "Model loop",
    variant: "secondary",
    tooltip:
      "AI repeated the same tool without finishing — check prompt guidance for ambiguous or empty results",
  },
  unknown: {
    label: "Unknown",
    variant: "secondary",
    tooltip: "Historical row — no tool chain recorded",
  },
};

export function FailureCauseBadges({ causes }: { causes: LikelyCauseCode[] }) {
  if (causes.length === 0) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {causes.map((code) => {
        const meta = CAUSE_META[code];
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
