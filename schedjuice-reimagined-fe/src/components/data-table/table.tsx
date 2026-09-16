"use client";

import type { CSSProperties, ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { crossfadeOpacity, crossfadeInstant } from "@/lib/sj/motion";
import { cn } from "@/lib/utils";

import { SortableHeader } from "./parts/sortable-header";
import { ColumnHeaderMenu } from "./parts/column-header-menu";
import {
  clearSorts,
  cycleColumnSorts,
  setColumnSortAsc,
  setColumnSortDesc,
  useTableInstance,
} from "./use-table-instance";
import type { Column } from "./types";

export type TableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  /** ResourceTableState-compatible sorts, e.g. `["name"]` / `["-created_at"]`. */
  sorts?: string[];
  onSortsChange?: (sorts: string[]) => void;
  /** When set, replaces only `<tbody>` content (loading / empty / error). Header stays. */
  bodySlot?: ReactNode;
  /** Opt-in opacity crossfade when `bodySlot` ↔ rows swap. */
  crossfade?: boolean;
  className?: string;
  /** Reserved min-height for the table region (avoids layout jump). Always applied. */
  bodyMinHeightClassName?: string;
  /** Fires with the row on enter; `null` when the pointer leaves the table. */
  onRowHover?: (row: T | null) => void;
  /** Opt-in drag-to-resize column widths (TanStack onChange). */
  enableColumnResizing?: boolean;
  /** Persists resized widths to localStorage (requires `enableColumnResizing`). */
  columnResizeStorageKey?: string;
  /** `inset` drops outer border/radius when nested in unified list chrome. */
  chrome?: "standalone" | "inset";
};

export function columnResizeHandleClassName(isResizing?: boolean): string {
  return cn(
    "absolute right-0 top-0 z-[1] h-full w-px cursor-col-resize touch-none select-none",
    "border-r-2 border-border",
    "after:absolute after:inset-y-0 after:-right-1.5 after:w-3 after:content-['']",
    "hover:border-primary",
    isResizing && "border-primary bg-primary/20",
  );
}

function stickyCellStyle(
  sticky?: "left",
  stickyLeft?: number,
  isHeader = false,
): CSSProperties | undefined {
  if (sticky !== "left") return undefined;
  return {
    position: "sticky",
    left: stickyLeft ?? 0,
    zIndex: isHeader ? 3 : 2,
  };
}

function stickyCellClassName(
  sticky?: "left",
  isLastStickyLeft?: boolean,
  isHeader = false,
): string {
  if (sticky !== "left") return "";
  return cn(
    "bg-surface",
    !isHeader && "group-hover:bg-surface-hover",
    isLastStickyLeft &&
      "border-r border-border-subtle shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]",
  );
}

/**
 * Render-only table. No fetch, URL, or SDK — columns + rows + controlled sorts.
 * Pagination / search live in `parts/` and are composed by ResourceTable later.
 */
export function Table<T>({
  columns,
  rows,
  getRowId,
  sorts = [],
  onSortsChange,
  bodySlot,
  crossfade: enableCrossfade = false,
  className,
  bodyMinHeightClassName = "min-h-[16rem]",
  onRowHover,
  enableColumnResizing = false,
  columnResizeStorageKey,
  chrome = "standalone",
}: TableProps<T>) {
  const reducedMotion = useReducedMotion();
  const { headerGroups, bodyRows, columnCount, columnLayouts } = useTableInstance({
    columns,
    rows,
    getRowId,
    sorts,
    enableColumnResizing,
    columnResizeStorageKey,
  });

  const showRows = bodySlot == null;
  const variants = reducedMotion ? crossfadeInstant : crossfadeOpacity;
  const colSpan = Math.max(1, columnCount);

  const rowBody = bodyRows.map((row) => (
    <tr
      key={row.id}
      className="group border-b border-border-subtle/60 text-text-primary last:border-b-0 hover:bg-surface-hover/60"
      onMouseEnter={() => {
        if (!onRowHover) return;
        const source = rows.find((r) => getRowId(r) === row.id);
        onRowHover(source ?? null);
      }}
    >
      {row.cells.map((cell) => (
        <td
          key={cell.id}
          style={stickyCellStyle(cell.sticky, cell.stickyLeft, false)}
          className={cn(
            "h-[52px] px-3 py-3 align-middle",
            cell.layoutClass,
            enableColumnResizing && !cell.sticky && "relative z-0",
            stickyCellClassName(cell.sticky, cell.isLastStickyLeft),
          )}
        >
          {cell.content}
        </td>
      ))}
    </tr>
  ));

  const slotBody = (
    <tr>
      <td colSpan={colSpan} className="p-0 align-top">
        {bodySlot}
      </td>
    </tr>
  );

  const tbodyChildren = showRows ? rowBody : slotBody;

  return (
    <div
      data-slot="table-container"
      className={cn(
        "overflow-x-auto sj-scroll",
        chrome === "inset"
          ? "rounded-none border-0 bg-transparent"
          : "rounded-md border border-border-subtle bg-surface",
        className,
      )}
      onMouseLeave={() => {
        onRowHover?.(null);
      }}
    >
      {/* Always reserve height so slot ↔ rows does not jump (crossfade on or off). */}
      <div className={cn(bodyMinHeightClassName)}>
        <table
          className="w-full border-collapse text-sm"
          style={{
            tableLayout: enableColumnResizing ? "fixed" : "auto",
            width: "100%",
            minWidth: enableColumnResizing ? undefined : "max-content",
          }}
        >
          {columnLayouts.length > 0 ? (
            <colgroup>
              {columnLayouts.map((layout, index) => (
                <col
                  key={headerGroups[0]?.headers[index]?.columnId ?? index}
                  style={layout.colStyle}
                />
              ))}
            </colgroup>
          ) : null}
          <thead>
            {headerGroups.map((group) => (
              <tr key={group.id} className="border-b border-border-subtle">
                {group.headers.map((headerCell) => {
                  const ariaSort =
                    headerCell.sorted === "asc"
                      ? "ascending"
                      : headerCell.sorted === "desc"
                        ? "descending"
                        : headerCell.enableSorting
                          ? "none"
                          : undefined;

                  return (
                    <th
                      key={headerCell.id}
                      scope="col"
                      aria-sort={ariaSort}
                      style={stickyCellStyle(
                        headerCell.sticky,
                        headerCell.stickyLeft,
                        true,
                      )}
                      className={cn(
                        "px-3 py-3 font-sans text-sm font-medium text-text-secondary",
                        headerCell.layoutClass,
                        enableColumnResizing && "relative",
                        enableColumnResizing && !headerCell.sticky && "z-0",
                        stickyCellClassName(
                          headerCell.sticky,
                          headerCell.isLastStickyLeft,
                          true,
                        ),
                      )}
                    >
                      {headerCell.headerMenu ? (
                        <ColumnHeaderMenu
                          label={headerCell.content}
                          columnId={headerCell.columnId}
                          sorted={headerCell.sorted}
                          enableSorting={Boolean(
                            headerCell.enableSorting && onSortsChange,
                          )}
                          enableCopy={Boolean(headerCell.headerMenu.copy)}
                          onSortAsc={() =>
                            onSortsChange?.(
                              setColumnSortAsc(headerCell.columnId),
                            )
                          }
                          onSortDesc={() =>
                            onSortsChange?.(
                              setColumnSortDesc(headerCell.columnId),
                            )
                          }
                          onClearSort={() => onSortsChange?.(clearSorts())}
                          onCopy={() => headerCell.headerMenu?.onCopy?.()}
                        />
                      ) : headerCell.enableSorting && onSortsChange ? (
                        <SortableHeader
                          sorted={headerCell.sorted}
                          onSort={() =>
                            onSortsChange(
                              cycleColumnSorts(sorts, headerCell.columnId),
                            )
                          }
                        >
                          {headerCell.content}
                        </SortableHeader>
                      ) : (
                        headerCell.content
                      )}
                      {enableColumnResizing && headerCell.getResizeHandler ? (
                        <div
                          role="separator"
                          aria-orientation="vertical"
                          aria-label={`Resize ${headerCell.columnId} column`}
                          onMouseDown={headerCell.getResizeHandler()}
                          onTouchStart={headerCell.getResizeHandler()}
                          onClick={(e) => e.stopPropagation()}
                          className={columnResizeHandleClassName(
                            headerCell.isResizing,
                          )}
                        />
                      ) : null}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          {enableCrossfade ? (
            <AnimatePresence mode="wait" initial={false}>
              <motion.tbody
                key={showRows ? "rows" : "slot"}
                variants={variants}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                {tbodyChildren}
              </motion.tbody>
            </AnimatePresence>
          ) : (
            <tbody>{tbodyChildren}</tbody>
          )}
        </table>
      </div>
    </div>
  );
}
