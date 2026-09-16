"use client";

import type { PointTransaction } from "@/types/points";

function formatDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  return String(delta);
}

export function TransactionList({
  transactions,
}: {
  transactions: PointTransaction[];
}) {
  if (transactions.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-sm text-text-muted">
        No transactions yet.
      </p>
    );
  }

  return (
    <ul className="divide-y rounded-md border">
      {transactions.map((tx) => {
        const pt = tx.point_type;
        const deltaClass =
          tx.delta > 0
            ? "text-emerald-600 dark:text-emerald-400"
            : tx.delta < 0
              ? "text-destructive"
              : "text-text-muted";

        return (
          <li
            key={tx.id}
            className="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-center sm:gap-3"
          >
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span
                style={{ backgroundColor: pt.color }}
                className={"inline-flex items-center rounded-full border border-border bg-surface-hover px-2.5 py-0.5 text-xs font-medium text-text-secondary " + ("shrink-0 text-white")}
              >
                {pt.name}
              </span>
              <span className={`shrink-0 font-mono text-sm font-medium tabular-nums ${deltaClass}`}>
                {formatDelta(tx.delta)}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">{tx.note}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-xs text-text-muted sm:justify-end">
              <span>{tx.actor_name ?? "System"}</span>
              <span aria-hidden>·</span>
              <time dateTime={tx.created_at}>
                {new Date(tx.created_at).toLocaleString()}
              </time>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
