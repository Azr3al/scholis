"use client";

import { Button } from "@/components/primitives";
import { cn } from "@/lib/utils";

export type PaginationProps = {
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  className?: string;
};

function pageWindow(current: number, totalPages: number): number[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages = new Set<number>([1, totalPages, current]);
  for (let d = 1; d <= 2; d++) {
    if (current - d > 1) pages.add(current - d);
    if (current + d < totalPages) pages.add(current + d);
  }
  return Array.from(pages).sort((a, b) => a - b);
}

/** Classic prev/next + page numbers. No runtime page-size selector. */
export function Pagination({
  page,
  pageSize,
  totalCount,
  onPageChange,
  className,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalCount / Math.max(1, pageSize)));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = totalCount === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, totalCount);
  const pages = pageWindow(safePage, totalPages);
  const showControls = totalPages > 1;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 py-3",
        className,
      )}
    >
      <p className="text-sm text-text-muted">
        Showing{" "}
        <span className="font-mono tabular-nums text-text-secondary">
          {from}–{to}
        </span>{" "}
        of{" "}
        <span className="font-mono tabular-nums text-text-secondary">
          {totalCount}
        </span>
      </p>

      {showControls ? (
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={safePage <= 1}
            onClick={() => onPageChange(safePage - 1)}
          >
            Prev
          </Button>
          {pages.map((p, i) => {
            const prev = pages[i - 1];
            const gap = prev != null && p - prev > 1;
            return (
              <span key={p} className="inline-flex items-center gap-1">
                {gap ? (
                  <span className="px-1 text-sm text-text-muted" aria-hidden>
                    …
                  </span>
                ) : null}
                <Button
                  type="button"
                  variant={p === safePage ? "secondary" : "ghost"}
                  size="sm"
                  aria-current={p === safePage ? "page" : undefined}
                  className={cn(
                    "min-w-8 font-mono tabular-nums",
                    p === safePage && "font-serif text-lg",
                  )}
                  onClick={() => onPageChange(p)}
                >
                  {p}
                </Button>
              </span>
            );
          })}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={safePage >= totalPages}
            onClick={() => onPageChange(safePage + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}
