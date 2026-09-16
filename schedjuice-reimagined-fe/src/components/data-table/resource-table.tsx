"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { NavArrowRight } from "iconoir-react";
import { useDebouncedCallback } from "use-debounce";

import { CellAutosaveInput, useCellAutosave } from "@/components/edit-kit";
import { cn } from "@/lib/utils";

import {
  ErrorState,
  LoadingState,
  Pagination,
  resourceTableListChromeClassName,
  SearchInput,
  TableEmptyState,
  Toolbar,
} from "./parts";
import { Table } from "./table";
import type { Column, ResourceListResult, ResourceTableState } from "./types";

export type ResourceTableProps<T> = {
  list: ResourceListResult<T>;
  columns: Column<T>[];
  tableState: ResourceTableState & {
    setState: (p: Partial<ResourceTableState>) => void;
  };
  getRowId: (row: T) => string;
  rowHref?: (row: T) => string;
  filterSlot?: ReactNode;
  toolbarActions?: ReactNode;
  toolbarFooter?: ReactNode;
  className?: string;
  onRowHover?: (row: T | null) => void;
  /** `embedded` pins toolbar/pagination and scrolls only the table body (bounded shells). */
  layout?: "page" | "embedded";
  /** Opt-in drag-to-resize column widths. */
  enableColumnResizing?: boolean;
  /** Persists resized widths to localStorage (requires `enableColumnResizing`). */
  columnResizeStorageKey?: string;
  /** `unified` wraps toolbar + table in one bordered surface. */
  listChrome?: "default" | "unified";
};

function EditableTextCell<T>({
  row,
  value,
  onSave,
  formatDisplay,
  displayClassName,
}: {
  row: T;
  value: unknown;
  onSave: (row: T, value: unknown) => Promise<void>;
  formatDisplay?: (value: string) => ReactNode;
  displayClassName?: string;
}) {
  const stringValue = value == null ? "" : String(value);
  const autosave = useCellAutosave({
    value: stringValue,
    onSave: (next) => onSave(row, next),
  });

  return (
    <CellAutosaveInput
      autosave={autosave}
      formatDisplay={formatDisplay}
      inputClassName="h-8 w-full min-w-[8rem] flex-1 text-sm"
      displayClassName={displayClassName}
    />
  );
}

function wireColumns<T>(
  columns: Column<T>[],
  rowHref?: (row: T) => string,
): Column<T>[] {
  const wired = columns.map((col) => {
    if (col.editable?.kind !== "text") return col;
    const { onSave, formatDisplay } = col.editable;
    const tabular = col.sizing?.tabular ?? col.sizing?.role === "numeric";
    const displayClassName = tabular ? "tabular-nums" : undefined;
    return {
      ...col,
      cell: ({ row, value }: { row: T; value: unknown }) => (
        <EditableTextCell
          row={row}
          value={value}
          onSave={onSave}
          formatDisplay={formatDisplay}
          displayClassName={displayClassName}
        />
      ),
    };
  });

  if (!rowHref) return wired;

  return [
    ...wired,
    {
      id: "__open",
      header: "",
      accessor: () => null,
      sizing: { role: "action" },
      cell: ({ row }) => (
        <Link
          href={rowHref(row)}
          aria-label="Open details"
          className={cn(
            "inline-flex size-8 items-center justify-center rounded-md text-text-secondary",
            "transition-colors hover:bg-surface-hover hover:text-text-primary",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
          )}
        >
          <NavArrowRight width={16} height={16} aria-hidden />
        </Link>
      ),
    },
  ];
}

/**
 * Opinionated list surface: controlled table state + list-hook result + chrome.
 * Does not fetch — pass `list` from an SDK list hook.
 */
export function ResourceTable<T>({
  list,
  columns,
  tableState,
  getRowId,
  rowHref,
  filterSlot,
  toolbarActions,
  toolbarFooter,
  className,
  onRowHover,
  layout = "page",
  enableColumnResizing = false,
  columnResizeStorageKey,
  listChrome = "default",
}: ResourceTableProps<T>) {
  const unifiedChrome = listChrome === "unified";
  const { rows, total, isLoading, isError, error, refetch } = list;
  const { page, pageSize, sorts, q, setState } = tableState;

  const [draftQ, setDraftQ] = useState(q);
  useEffect(() => {
    setDraftQ(q);
  }, [q]);

  const commitSearch = useDebouncedCallback((next: string) => {
    setState({ q: next, page: 1 });
  }, 300);

  const resolvedColumns = useMemo(
    () => wireColumns(columns, rowHref),
    [columns, rowHref],
  );

  let bodySlot: ReactNode | undefined;
  if (isError) {
    bodySlot = (
      <ErrorState
        detail={error?.message}
        onRetry={() => {
          refetch();
        }}
      />
    );
  } else if (isLoading) {
    bodySlot = (
      <LoadingState columns={Math.max(1, resolvedColumns.length)} />
    );
  } else if (rows.length === 0) {
    bodySlot = <TableEmptyState />;
  }

  const toolbar = (
    <Toolbar
      sticky={layout !== "embedded"}
      unified={unifiedChrome}
      search={
        <SearchInput
          value={draftQ}
          onValueChange={(next) => {
            setDraftQ(next);
            commitSearch(next);
          }}
        />
      }
      filterSlot={filterSlot}
      actions={toolbarActions}
      footer={toolbarFooter}
    />
  );

  const table = (
    <Table
      columns={resolvedColumns}
      rows={bodySlot == null ? rows : []}
      getRowId={getRowId}
      sorts={sorts}
      onSortsChange={(next) => setState({ sorts: next, page: 1 })}
      bodySlot={bodySlot}
      crossfade
      onRowHover={onRowHover}
      enableColumnResizing={enableColumnResizing}
      columnResizeStorageKey={columnResizeStorageKey}
      chrome={unifiedChrome ? "inset" : "standalone"}
    />
  );

  const pagination = (
    <Pagination
      page={page}
      pageSize={pageSize}
      totalCount={total}
      onPageChange={(next) => setState({ page: next })}
    />
  );

  const listBody = unifiedChrome ? (
    <div
      className={cn(
        resourceTableListChromeClassName(),
        layout === "embedded" && "flex min-h-0 flex-1 flex-col",
      )}
    >
      {toolbar}
      {layout === "embedded" ? (
        <div className="min-h-0 flex-1 overflow-auto sj-scroll">{table}</div>
      ) : (
        table
      )}
    </div>
  ) : (
    <>
      {toolbar}
      {layout === "embedded" ? (
        <div className="min-h-0 flex-1 overflow-auto sj-scroll">{table}</div>
      ) : (
        table
      )}
    </>
  );

  if (layout === "embedded") {
    return (
      <div className={cn("flex h-full min-h-0 flex-col", className)}>
        {listBody}
        <div className="shrink-0">{pagination}</div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-0", className)}>
      {listBody}
      {pagination}
    </div>
  );
}
