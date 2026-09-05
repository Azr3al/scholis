"use client";

import { cn } from "@/lib/utils";
import type { PointType } from "@/types/points";

function balanceForType(
  balances: Record<string, number>,
  pointTypeId: number,
): number {
  return balances[String(pointTypeId)] ?? 0;
}

export function BalanceChips({
  pointTypes,
  balances,
}: {
  pointTypes: PointType[];
  balances: Record<string, number>;
}) {
  const visible = pointTypes
    .filter((pt) => pt.is_active || balanceForType(balances, pt.id) !== 0)
    .sort(
      (a, b) => a.sort_order - b.sort_order || a.id - b.id,
    );

  if (visible.length === 0) {
    return (
      <p className="text-sm text-text-muted">No point balances yet.</p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {visible.map((pt) => {
        const balance = balanceForType(balances, pt.id);
        const muted = !pt.is_active && balance !== 0;

        return (
          <span
            key={pt.id}
            style={{ backgroundColor: pt.color }}
            className={cn("inline-flex items-center rounded-full border border-border bg-surface-hover px-2.5 py-0.5 text-xs font-medium text-text-secondary", 
              "gap-1.5 text-white",
              muted && "opacity-50",
            )}
          >
            {pt.name}
            <span className="font-mono tabular-nums">{balance}</span>
          </span>
        );
      })}
    </div>
  );
}
