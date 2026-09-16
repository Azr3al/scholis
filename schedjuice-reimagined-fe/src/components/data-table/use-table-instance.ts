"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnSizingState,
  type Header,
  type OnChangeFn,
  type SortingState,
} from "@tanstack/react-table";

import {
  mergeColumnSizingWithStored,
  readColumnResizeWidths,
  writeColumnResizeWidths,
} from "./column-resize-storage";

import {
  cssLengthToPx,
  resolveColumnLayout,
  type ColumnLayoutModel,
} from "./column-layout";
import type { Column } from "./types";

/** Plain sort descriptor — no TanStack types on the public surface. */
export type TableSortDescriptor = { id: string; desc: boolean };

/** Convert ResourceTableState `sorts` (`["name"]` / `["-created_at"]`) → descriptors. */
export function sortsToDescriptors(sorts: string[] = []): TableSortDescriptor[] {
  return sorts.map((entry) => {
    const desc = entry.startsWith("-");
    return { id: desc ? entry.slice(1) : entry, desc };
  });
}

/** Convert descriptors → ResourceTableState `sorts` strings. */
export function descriptorsToSorts(sorting: TableSortDescriptor[]): string[] {
  return sorting.map((s) => (s.desc ? `-${s.id}` : s.id));
}

/** Cycle single-column sorts: none → asc → desc → none. */
export function cycleColumnSorts(sorts: string[], columnId: string): string[] {
  const current = sortsToDescriptors(sorts)[0];
  if (!current || current.id !== columnId) {
    return descriptorsToSorts([{ id: columnId, desc: false }]);
  }
  if (!current.desc) {
    return descriptorsToSorts([{ id: columnId, desc: true }]);
  }
  return [];
}

/** Explicit single-column sort setters for header overflow menus. */
export function setColumnSortAsc(columnId: string): string[] {
  return [columnId];
}

export function setColumnSortDesc(columnId: string): string[] {
  return [`-${columnId}`];
}

export function clearSorts(): string[] {
  return [];
}

type ColumnDefMeta = {
  alignClass?: string;
  enableSorting?: boolean;
  layout?: ColumnLayoutModel;
  headerMenu?: Column<unknown>["headerMenu"];
};

function toColumnDef<T>(
  column: Column<T>,
  enableColumnResizing?: boolean,
): ColumnDef<T> {
  const layout = resolveColumnLayout(column.sizing, column.align);
  const def: ColumnDef<T> = {
    id: column.id,
    accessorFn: (row) => column.accessor(row),
    enableSorting: column.enableSorting ?? false,
    header: () => column.header,
    cell: (info) => {
      const row = info.row.original;
      const value = info.getValue();
      if (column.cell) return column.cell({ row, value });
      if (value == null || value === "") return "—";
      return String(value);
    },
    meta: {
      align: column.align,
      alignClass: layout.thClass,
      enableSorting: column.enableSorting ?? false,
      layout,
      headerMenu: column.headerMenu,
    },
  };

  if (enableColumnResizing) {
    const size =
      cssLengthToPx(layout.colStyle.width) ??
      cssLengthToPx(layout.colStyle.minWidth) ??
      150;
    const minSize = cssLengthToPx(layout.colStyle.minWidth) ?? 48;
    const explicitMax = column.sizing?.width?.max;
    const maxSize = cssLengthToPx(explicitMax);
    def.size = size;
    def.minSize = minSize;
    if (maxSize != null) def.maxSize = maxSize;
    def.enableResizing = true;
  }

  return def;
}

export type TableHeaderCellModel = {
  id: string;
  columnId: string;
  content: ReactNode;
  alignClass: string;
  layoutClass: string;
  enableSorting: boolean;
  sorted: false | "asc" | "desc";
  headerMenu?: Column<unknown>["headerMenu"];
  sticky?: "left";
  stickyLeft?: number;
  isLastStickyLeft?: boolean;
  pixelWidth?: number;
  getResizeHandler?: () => (event: unknown) => void;
  isResizing?: boolean;
};

export type TableBodyCellModel = {
  id: string;
  content: ReactNode;
  alignClass: string;
  layoutClass: string;
  sticky?: "left";
  stickyLeft?: number;
  isLastStickyLeft?: boolean;
};

export type TableRowModel = {
  id: string;
  cells: TableBodyCellModel[];
};

export type ResolvedColumnLayout = ColumnLayoutModel & {
  stickyLeft?: number;
  isLastStickyLeft?: boolean;
  pixelWidth?: number;
};

export type UseTableInstanceOptions<T> = {
  columns: Column<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  sorts?: string[];
  enableColumnResizing?: boolean;
  /** Persists drag-resized widths under `schedjuice:table-column-widths:<key>`. */
  columnResizeStorageKey?: string;
};

function buildStickyLayoutMeta<T>(
  headers: Header<T, unknown>[],
  enableColumnResizing: boolean,
): ResolvedColumnLayout[] {
  let stickyLeftAccum = 0;
  const stickyIndices: number[] = [];

  headers.forEach((header, index) => {
    const meta = header.column.columnDef.meta as ColumnDefMeta | undefined;
    if (meta?.layout?.sticky === "left") stickyIndices.push(index);
  });
  const lastStickyIndex = stickyIndices.at(-1);

  return headers.map((header, index) => {
    const meta = header.column.columnDef.meta as ColumnDefMeta | undefined;
    const base = meta?.layout ?? resolveColumnLayout(undefined);
    const isStickyLeft = base.sticky === "left";
    const stickyLeft = isStickyLeft ? stickyLeftAccum : undefined;
    if (isStickyLeft) stickyLeftAccum += header.getSize();

    const pixelWidth = enableColumnResizing ? header.getSize() : undefined;
    const colStyle = { ...base.colStyle };
    if (pixelWidth != null) {
      colStyle.width = `${pixelWidth}px`;
    }

    return {
      ...base,
      colStyle,
      stickyLeft,
      isLastStickyLeft: index === lastStickyIndex && isStickyLeft,
      pixelWidth,
    };
  });
}

/**
 * Maps our `Column<T>` → TanStack ColumnDef and builds a table instance.
 * This is the only data-table module that imports `@tanstack/react-table`.
 */
export function useTableInstance<T>({
  columns,
  rows,
  getRowId,
  sorts = [],
  enableColumnResizing = false,
  columnResizeStorageKey,
}: UseTableInstanceOptions<T>) {
  const columnDefs = useMemo(
    () => columns.map((c) => toColumnDef(c, enableColumnResizing)),
    [columns, enableColumnResizing],
  );

  const columnIdsKey = useMemo(
    () => columns.map((c) => c.id).join("\0"),
    [columns],
  );

  const sorting = useMemo(
    () => sortsToDescriptors(sorts) as SortingState,
    [sorts],
  );

  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});

  useEffect(() => {
    if (!enableColumnResizing || !columnResizeStorageKey) return;
    const stored = readColumnResizeWidths(columnResizeStorageKey);
    const columnIds = columnIdsKey.length > 0 ? columnIdsKey.split("\0") : [];
    setColumnSizing(mergeColumnSizingWithStored({}, stored, columnIds));
  }, [columnResizeStorageKey, enableColumnResizing, columnIdsKey]);

  const onColumnSizingChange: OnChangeFn<ColumnSizingState> = useCallback(
    (updater) => {
      setColumnSizing((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        if (columnResizeStorageKey) {
          writeColumnResizeWidths(columnResizeStorageKey, next);
        }
        return next;
      });
    },
    [columnResizeStorageKey],
  );

  const table = useReactTable({
    data: rows,
    columns: columnDefs,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => getRowId(row),
    manualSorting: true,
    state: {
      sorting,
      ...(enableColumnResizing ? { columnSizing } : {}),
    },
    onColumnSizingChange: enableColumnResizing
      ? onColumnSizingChange
      : undefined,
    enableColumnResizing,
    columnResizeMode: "onChange",
  });

  const headerRow = table.getHeaderGroups()[0];
  const resolvedLayouts: ResolvedColumnLayout[] = headerRow
    ? buildStickyLayoutMeta(headerRow.headers, enableColumnResizing)
    : columns.map((col) => resolveColumnLayout(col.sizing, col.align));

  const headerGroups = table.getHeaderGroups().map((group) => ({
    id: group.id,
    headers: group.headers.map((header, index): TableHeaderCellModel => {
      const meta = header.column.columnDef.meta as ColumnDefMeta | undefined;
      const resolved = resolvedLayouts[index];
      const layoutClass = [
        meta?.alignClass ?? "text-left",
        meta?.layout?.wrapClass ?? "",
      ]
        .filter(Boolean)
        .join(" ");
      return {
        id: header.id,
        columnId: header.column.id,
        content: flexRender(header.column.columnDef.header, header.getContext()),
        alignClass: meta?.alignClass ?? "text-left",
        layoutClass,
        enableSorting: meta?.enableSorting ?? false,
        sorted: header.column.getIsSorted(),
        headerMenu: meta?.headerMenu,
        sticky: resolved?.sticky,
        stickyLeft: resolved?.stickyLeft,
        isLastStickyLeft: resolved?.isLastStickyLeft,
        pixelWidth: resolved?.pixelWidth,
        getResizeHandler: enableColumnResizing
          ? () => header.getResizeHandler()
          : undefined,
        isResizing: header.column.getIsResizing(),
      };
    }),
  }));

  const bodyRows: TableRowModel[] = table.getRowModel().rows.map((row) => ({
    id: row.id,
    cells: row.getVisibleCells().map((cell, index): TableBodyCellModel => {
      const meta = cell.column.columnDef.meta as ColumnDefMeta | undefined;
      const resolved = resolvedLayouts[index];
      const layoutClass = [
        meta?.alignClass ?? "text-left",
        meta?.layout?.wrapClass ?? "",
        meta?.layout?.tdClass ?? "",
      ]
        .filter(Boolean)
        .join(" ");
      return {
        id: cell.id,
        content: flexRender(cell.column.columnDef.cell, cell.getContext()),
        alignClass: meta?.alignClass ?? "text-left",
        layoutClass,
        sticky: resolved?.sticky,
        stickyLeft: resolved?.stickyLeft,
        isLastStickyLeft: resolved?.isLastStickyLeft,
      };
    }),
  }));

  const columnCount = headerGroups[0]?.headers.length ?? columns.length;

  return {
    headerGroups,
    bodyRows,
    columnCount,
    columnLayouts: resolvedLayouts,
    enableColumnResizing,
  };
}
