"use client";

import type { SelectionStats } from "../lib/selection-stats";

export interface StatusBarProps {
  rowCount: number;
  selectionDims: { rows: number; cols: number } | null;
  stats: SelectionStats | null;
  formatNumber?: (value: number) => string;
}

export function SheetStatusBar({
  rowCount,
  selectionDims,
  stats,
  formatNumber = (v) =>
    v.toLocaleString(undefined, { maximumFractionDigits: 2 }),
}: StatusBarProps) {
  return (
    <div className="flex min-h-7 shrink-0 items-center gap-3 border-t border-border bg-muted/30 px-3 font-mono text-[11px] text-muted-foreground">
      {selectionDims ? (
        <span>
          {selectionDims.rows} × {selectionDims.cols} selected
        </span>
      ) : (
        <span>{rowCount.toLocaleString()} rows</span>
      )}
      {stats ? (
        <>
          <span className="text-foreground/40">·</span>
          <span>Count {stats.count}</span>
          {stats.sum !== null ? (
            <>
              <span>Sum {formatNumber(stats.sum)}</span>
              <span>Avg {formatNumber(stats.avg ?? 0)}</span>
              <span>Min {formatNumber(stats.min ?? 0)}</span>
              <span>Max {formatNumber(stats.max ?? 0)}</span>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
