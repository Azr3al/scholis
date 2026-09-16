"use client";

import { Fragment, useLayoutEffect, useRef } from "react";

import type { Column } from "@/components/data-table";
import { resolveColumnLayout } from "@/components/data-table/column-layout";
import { TableSkeleton } from "@/components/loading/structured-skeletons";
import { EmptyState } from "@/components/primitives/empty";
import { Spinner } from "@/components/primitives/spinner";
import type { TransactionDaySection } from "@/lib/finances/group-transactions-by-day";
import {
  RECENT_TRANSACTIONS_MAX_AUTO_PREFETCH,
  shouldFetchNextPage,
} from "@/lib/finances/recent-transactions-prefetch";
import type { UserPayment } from "@/sdk";
import { cn } from "@/lib/utils";

function getScrollParent(node: HTMLElement | null): Element | null {
  if (!node) return null;
  let parent = node.parentElement;
  while (parent) {
    const { overflowY } = getComputedStyle(parent);
    if (overflowY === "auto" || overflowY === "scroll") return parent;
    parent = parent.parentElement;
  }
  return null;
}

export function RecentTransactionsTimeline({
  rows,
  sections,
  columns,
  hasNextPage,
  isFetchingNextPage,
  isLoading,
  fetchNextPage,
}: {
  rows: UserPayment[];
  sections: TransactionDaySection[];
  columns: Column<UserPayment>[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isLoading: boolean;
  fetchNextPage: () => void;
}) {
  const sentinelRef = useRef<HTMLTableRowElement>(null);
  const autoPrefetchCountRef = useRef(0);
  const hasUserScrolledRef = useRef(false);

  useLayoutEffect(() => {
    if (isLoading) {
      autoPrefetchCountRef.current = 0;
      hasUserScrolledRef.current = false;
    }
  }, [isLoading]);

  useLayoutEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const root = getScrollParent(el);

    const onScroll = () => {
      if (root && root.scrollTop > 0) {
        hasUserScrolledRef.current = true;
      }
    };
    root?.addEventListener("scroll", onScroll, { passive: true });

    const observer = new IntersectionObserver(
      (entries) => {
        const isIntersecting = entries.some((e) => e.isIntersecting);
        if (
          shouldFetchNextPage({
            isIntersecting,
            hasNextPage,
            isFetchingNextPage,
            hasUserScrolled: hasUserScrolledRef.current,
            autoPrefetchCount: autoPrefetchCountRef.current,
            maxAutoPrefetch: RECENT_TRANSACTIONS_MAX_AUTO_PREFETCH,
          })
        ) {
          if (!hasUserScrolledRef.current) {
            autoPrefetchCountRef.current += 1;
          }
          fetchNextPage();
        }
      },
      { root, rootMargin: "80px" },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      root?.removeEventListener("scroll", onScroll);
    };
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  if (isLoading) {
    return (
      <div className="p-3">
        <TableSkeleton columns={Math.max(columns.length, 6)} rows={8} />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="px-3 py-10">
        <EmptyState>
          <p className="text-sm text-muted-foreground">No transactions found.</p>
        </EmptyState>
      </div>
    );
  }

  const columnLayouts = columns.map((col) =>
    resolveColumnLayout(col.sizing, col.align),
  );

  return (
    <div className="min-w-0 w-full max-w-full overflow-x-auto sj-scroll">
      <table
        className="w-full border-collapse text-sm"
        style={{ minWidth: "max-content" }}
      >
        <colgroup>
          {columnLayouts.map((layout, index) => (
            <col key={columns[index]?.id ?? index} style={layout.colStyle} />
          ))}
        </colgroup>
        <thead className="bg-surface">
          <tr className="border-b border-border-subtle">
            {columns.map((col, index) => {
              const layout = columnLayouts[index];
              return (
                <th
                  key={col.id}
                  className={cn(
                    "bg-surface px-3 py-2.5 font-medium text-muted-foreground",
                    layout.thClass,
                    layout.wrapClass,
                  )}
                >
                  {col.header}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sections.map((section, sectionIndex) => (
            <Fragment key={section.dateKey}>
              <tr className="bg-muted/25">
                <td
                  colSpan={columns.length}
                  className={cn(
                    "px-3 py-2 text-xs font-medium text-muted-foreground",
                    sectionIndex > 0 && "border-t border-border-subtle",
                  )}
                >
                  {section.label}
                </td>
              </tr>
              {section.rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-border-subtle/60 hover:bg-muted/20"
                >
                  {columns.map((col, index) => {
                    const layout = columnLayouts[index];
                    const value = col.accessor(row);
                    return (
                      <td
                        key={col.id}
                        className={cn(
                          "px-3 py-2 align-middle",
                          layout.tdClass,
                          layout.wrapClass,
                        )}
                      >
                        {col.cell ? col.cell({ row, value }) : String(value ?? "")}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </Fragment>
          ))}
          <tr ref={sentinelRef}>
            <td
              colSpan={columns.length}
              className="py-4 text-center text-xs text-muted-foreground"
            >
              {isFetchingNextPage ? (
                <Spinner className="mx-auto h-5 w-5" />
              ) : null}
              {!hasNextPage && rows.length > 0 ? "No more transactions" : null}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
