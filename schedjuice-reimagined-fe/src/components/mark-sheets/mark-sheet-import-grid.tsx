"use client";

import {
  CompactSelection,
  GridCellKind,
  type DataEditorRef,
  type GridCell,
  type GridSelection,
  type Item,
  type Rectangle,
} from "@glideapps/glide-data-grid";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

import { DataSheet } from "@/components/data-sheet/data-sheet";
import { getActiveLinkColors } from "@/components/import-grid/glide-theme";
import type { UserLinkCellData } from "@/components/import-grid/cells/types";
import { userLinkRenderer } from "@/components/import-grid/cells/user-link-cell";
import { useShimmerLoop } from "@/components/import-grid/use-shimmer-loop";
import { MarkSheetStudentMatchPopover,
  type MarkSheetStudentMatchTarget,
} from "@/components/mark-sheets/mark-sheet-student-match-popover";
import { useScrollAnchoredOverlayPosition } from "@/components/import-grid/user-match/use-scroll-anchored-overlay-position";
import { MarkSheetColumnMapSelect } from "@/components/mark-sheets/mark-sheet-column-map-select";
import { MarkSheetColumnResizeHandle } from "@/components/mark-sheets/mark-sheet-column-resize-handle";
import {
  applyColumnMapRole,
  columnMapRoleToKind,
  isUserLinkRole,
  isValidColumnMapRole,
  mappingFieldForRole,
  resolveColumnMapRole,
  type ColumnMapRole,
} from "@/lib/mark-sheets/column-map-role";
import { cellKey, resolveRowUserResolution, type CellResolution } from "@/lib/imports/resolution";
import { slugKey } from "@/lib/mark-sheets/mark-sheet-import-inference";
import type { CourseRosterStudent } from "@/lib/mark-sheets-api";
import { formatMatchedUserChipLabel } from "@/lib/mark-sheets/user-chip-label";
import type { RubricColumn } from "@/types/mark-sheets";
import { cn } from "@/lib/utils";

type MarkSheetMatchTarget = MarkSheetStudentMatchTarget;

const DEFAULT_COL_WIDTH = 120;
const USER_LINK_COL_WIDTH = 160;
const IGNORED_ROW_BG = "#f4f4f5";
const IGNORED_ROW_TEXT = "#a1a1aa";

type Props = {
  headers: string[];
  rows: (string | number | null)[][];
  columns: RubricColumn[];
  columnMapping: Record<string, number>;
  columnRoles: Record<number, ColumnMapRole>;
  resolution: Map<string, CellResolution>;
  rowIds: string[];
  rosterStudents: CourseRosterStudent[];
  warnings: string[];
  height: number;
  className?: string;
  onColumnRoleChange: (colIndex: number, role: ColumnMapRole) => void;
  onMaxMarksChange: (colKey: string, maxMarks: number | null) => void;
  onResolutionChange: (next: Map<string, CellResolution>) => void;
};

function userLinkStatus(
  status: CellResolution["status"] | undefined,
): UserLinkCellData["status"] {
  switch (status) {
    case "pending_match":
    case "pending_candidates":
    case "confirmed":
    case "resolving":
    case "new":
    case "ignored":
    case "error":
    case "idle":
      return status;
    default:
      return "idle";
  }
}

export function MarkSheetImportGrid({
  headers,
  rows,
  columns,
  columnMapping,
  columnRoles,
  resolution,
  rowIds,
  rosterStudents,
  warnings,
  height,
  className,
  onColumnRoleChange,
  onMaxMarksChange,
  onResolutionChange,
}: Props) {
  const gridRef = useRef<DataEditorRef>(null);
  const trackWrapRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const linkColors = getActiveLinkColors();
  const [matchTarget, setMatchTarget] = useState<MarkSheetMatchTarget | null>(null);
  const [gridSelection, setGridSelection] = useState<GridSelection>({
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
  });
  const [columnWidthsByIndex, setColumnWidthsByIndex] = useState<Record<number, number>>({});
  const headerWidthsCalibratedRef = useRef(false);
  const matchOverlayRef = useRef<HTMLDivElement>(null);

  const matchAnchorCell = useMemo(
    () =>
      matchTarget
        ? { col: matchTarget.anchorCol, row: matchTarget.sourceRow }
        : null,
    [matchTarget],
  );

  const syncMatchOverlayPosition = useScrollAnchoredOverlayPosition({
    open: Boolean(matchTarget),
    anchorCell: matchAnchorCell,
    gridRef,
    overlayRef: matchOverlayRef,
  });

  const colByIndex = useMemo(() => {
    const map = new Map<number, RubricColumn>();
    columns.forEach((col, i) => map.set(col.sort_order ?? i, col));
    return map;
  }, [columns]);

  const mappedColIndexes = useMemo(() => {
    const set = new Set<number>();
    headers.forEach((_, idx) => {
      const role = resolveColumnMapRole(idx, columnRoles, columns[idx]?.kind, columnMapping);
      if (role !== "ignore") set.add(idx);
    });
    return set;
  }, [columnMapping, columnRoles, columns, headers]);

  const resolvingCells = useMemo(() => {
    const out: { cell: Item }[] = [];
    rows.forEach((_, row) => {
      headers.forEach((_, col) => {
        const role = resolveColumnMapRole(col, columnRoles, columns[col]?.kind, columnMapping);
        if (!isUserLinkRole(role)) return;
        const rowId = rowIds[row];
        if (!rowId) return;
        const res = resolveRowUserResolution(resolution, rowId, columnMapping);
        if (res?.status === "resolving") {
          out.push({ cell: [col, row] });
        }
      });
    });
    return out;
  }, [columnMapping, columnRoles, columns, headers, resolution, rowIds, rows]);

  useShimmerLoop(gridRef, resolvingCells);

  useLayoutEffect(() => {
    gridRef.current?.scrollTo(0, 0);
  }, [rows.length]);

  const getCellContent = useCallback(
    ([col, row]: Item): GridCell => {
      const colDef = colByIndex.get(col) ?? columns[col];
      const role = resolveColumnMapRole(col, columnRoles, colDef?.kind, columnMapping);
      const raw = rows[row]?.[col];
      const value = raw == null ? "" : String(raw);
      const linked = mappedColIndexes.has(col);
      const rowId = rowIds[row];
      const rowRes = rowId
        ? resolveRowUserResolution(resolution, rowId, columnMapping)
        : undefined;
      const rowIgnored = rowRes?.status === "ignored";
      const tint = rowIgnored
        ? { bgCell: IGNORED_ROW_BG, textDark: IGNORED_ROW_TEXT }
        : linked
          ? { bgCell: linkColors.mappedColumnBg }
          : undefined;

      if (isUserLinkRole(role)) {
        const res = rowRes;
        const linkStatus = userLinkStatus(res?.status);
        const emailCol = columnMapping.email;
        const rowEmailRaw = emailCol != null ? rows[row]?.[emailCol] : null;
        const rowEmail =
          rowEmailRaw == null ? "" : String(rowEmailRaw).trim();
        const chipLabel =
          linkStatus === "confirmed" || linkStatus === "pending_match"
            ? formatMatchedUserChipLabel(res?.entityRef)
            : undefined;
        return {
          kind: GridCellKind.Custom,
          allowOverlay: false,
          readonly: true,
          copyData: value,
          themeOverride: tint,
          data: {
            kind: "user-link-cell",
            raw: value,
            status: linkStatus,
            variant: "roster",
            label: chipLabel,
            candidateCount: res?.candidates?.length ?? 0,
            nameMismatch: res?.nameMismatch,
            user:
              linkStatus === "confirmed" && res?.entityRef
                ? {
                    id: res.entityRef.id,
                    name: res.entityRef.label,
                    email: res.entityRef.email ?? rowEmail,
                  }
                : undefined,
          },
        } as GridCell;
      }

      return {
        kind: GridCellKind.Text,
        data: value,
        displayData: value,
        readonly: true,
        allowOverlay: false,
        themeOverride: role === "ignore"
          ? { bgCell: "#f4f4f5", textDark: "#a1a1aa" }
          : tint,
      };
    },
    [colByIndex, columnMapping, columnRoles, columns, linkColors.mappedColumnBg, mappedColIndexes, resolution, rowIds, rows],
  );

  const openMatchPopoverForCell = useCallback(
    (
      cell: Item,
      bounds: { x: number; y: number; width: number; height: number } | null,
    ) => {
      const [col, row] = cell;
      const role = resolveColumnMapRole(col, columnRoles, columns[col]?.kind, columnMapping);
      const rowId = rowIds[row];
      if (!bounds) return;
      if (!isUserLinkRole(role)) return;
      const field = mappingFieldForRole(role);
      if (!field) return;
      if (!rowId) return;
      const res = resolveRowUserResolution(resolution, rowId, columnMapping) ?? {
        status: "new" as const,
      };
      const raw = rows[row]?.[col];
      const rawEmail = raw == null ? "" : String(raw);
      const nameCol = columnMapping.name;
      const importedNameRaw = nameCol != null ? rows[row]?.[nameCol] : null;
      const importedName =
        importedNameRaw == null ? undefined : String(importedNameRaw).trim() || undefined;
      const emailCol = columnMapping.email;
      const emailRaw = emailCol != null ? rows[row]?.[emailCol] : null;
      const emailValue =
        emailRaw == null ? "" : String(emailRaw).trim();
      const target = {
        sourceRow: row,
        anchorCol: col,
        rawEmail: emailValue || rawEmail,
        importedName,
        rect: bounds,
        cell: res,
        field,
      };
      setMatchTarget(target);
    },
    [columnMapping, columnRoles, columns, resolution, rowIds, rows],
  );

  const onCellActivated = useCallback(
    (
      cell: Item,
      bounds?: { x: number; y: number; width: number; height: number } | null,
    ) => {
      const resolvedBounds =
        bounds ?? gridRef.current?.getBounds(cell[0], cell[1]) ?? null;
      openMatchPopoverForCell(cell, resolvedBounds);
    },
    [openMatchPopoverForCell],
  );

  const sheetColumns = useMemo(
    () =>
      headers.map((header, i) => {
        const role = resolveColumnMapRole(
          i,
          columnRoles,
          columns[i]?.kind,
          columnMapping,
        );
        const defaultWidth = isUserLinkRole(role) ? USER_LINK_COL_WIDTH : DEFAULT_COL_WIDTH;
        return {
          id: `col-${i}`,
          title: header || `Column ${i + 1}`,
          width: columnWidthsByIndex[i] ?? defaultWidth,
          grow: 0,
        };
      }),
    [headers, columnRoles, columns, columnMapping, columnWidthsByIndex],
  );

  const columnWidths = useMemo(
    () => sheetColumns.map((col) => col.width ?? DEFAULT_COL_WIDTH),
    [sheetColumns],
  );

  const setColumnWidth = useCallback((colIndex: number, width: number) => {
    setColumnWidthsByIndex((prev) => ({ ...prev, [colIndex]: width }));
  }, []);

  useLayoutEffect(() => {
    headerWidthsCalibratedRef.current = false;
  }, [headers.length, rows.length]);

  const syncHeaderLayout = useCallback((): boolean => {
    const grid = gridRef.current;
    const wrap = trackWrapRef.current;
    const track = trackRef.current;
    if (!grid || !wrap || !track || headers.length === 0) return false;

    const first =
      grid.getBounds(0, 0) ??
      grid.getBounds(0, -1);
    if (!first || typeof first.x !== "number") return false;

    const measuredWidths: number[] = [];
    for (let i = 0; i < headers.length; i++) {
      const bounds = grid.getBounds(i, 0);
      if (!bounds || typeof bounds.width !== "number" || !Number.isFinite(bounds.width)) {
        return false;
      }
      measuredWidths.push(Math.round(bounds.width));
    }

    if (measuredWidths[0] <= 0) return false;

    const offset = first.x - wrap.getBoundingClientRect().left;
    if (!Number.isFinite(offset)) return false;

    track.style.transform = `translateX(${offset}px)`;

    const widthDrift =
      measuredWidths.length === columnWidths.length &&
      measuredWidths.some((w, i) => w !== columnWidths[i]);

    if (
      widthDrift &&
      !headerWidthsCalibratedRef.current &&
      measuredWidths.every((w) => w > 0)
    ) {
      headerWidthsCalibratedRef.current = true;
      setColumnWidthsByIndex((prev) => {
        const next = { ...prev };
        measuredWidths.forEach((w, i) => {
          next[i] = w;
        });
        return next;
      });
    }

    return true;
  }, [columnWidths, headers.length]);

  useLayoutEffect(() => {
    let cancelled = false;
    let frame = 0;
    let attempts = 0;

    const trySync = () => {
      if (cancelled) return;
      const ready = syncHeaderLayout();
      if (!ready && attempts < 120) {
        attempts += 1;
        frame = requestAnimationFrame(trySync);
      }
    };

    trySync();

    const wrap = trackWrapRef.current;
    if (!wrap) {
      return () => {
        cancelled = true;
        cancelAnimationFrame(frame);
      };
    }

    const ro = new ResizeObserver(() => syncHeaderLayout());
    ro.observe(wrap);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [syncHeaderLayout, headers.length, columnWidths, height]);

  const handleVisibleRegionChanged = useCallback(
    (_range: Rectangle) => {
      syncHeaderLayout();
      syncMatchOverlayPosition();
    },
    [syncHeaderLayout, syncMatchOverlayPosition],
  );

  const fieldByColumn = useMemo(
    () => sheetColumns.map((col) => col.id),
    [sheetColumns],
  );

  const adapter = useMemo(
    () => ({
      rowCount: rows.length,
      getCellValue: (row: number, field: string) => {
        const col = Number(field.replace("col-", ""));
        const raw = rows[row]?.[col];
        return raw == null ? "" : String(raw);
      },
      setCellValue: () => {},
      isCellEditable: () => false,
    }),
    [rows],
  );

  const headerSlot = (
    <div ref={trackWrapRef} className="overflow-hidden pb-1" data-testid="selector-track-wrap">
      <div
        ref={trackRef}
        data-testid="selector-track"
        className="grid"
        style={{
          gridTemplateColumns: columnWidths.map((w) => `${w}px`).join(" "),
        }}
      >
        {headers.map((header, colIndex) => {
          const colDef = columns[colIndex];
          const role = resolveColumnMapRole(
            colIndex,
            columnRoles,
            colDef?.kind,
            columnMapping,
          );
          const colWidth = columnWidths[colIndex] ?? DEFAULT_COL_WIDTH;
          return (
            <div key={`${header}-${colIndex}`} className="relative min-w-0">
              <MarkSheetColumnMapSelect
                header={String(header ?? "")}
                role={role}
                maxMarks={colDef?.max_marks}
                onRoleChange={(nextRole) => onColumnRoleChange(colIndex, nextRole)}
                onMaxMarksChange={
                  colDef ? (max) => onMaxMarksChange(colDef.key, max) : undefined
                }
              />
              {colIndex < headers.length - 1 ? (
                <MarkSheetColumnResizeHandle
                  getWidth={() => colWidth}
                  onResize={(width) => setColumnWidth(colIndex, width)}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className={cn("flex min-h-0 flex-col gap-2", className)}>
      {warnings.length > 0 ? (
        <div className="rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm text-yellow-900 dark:border-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-100">
          {warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      ) : null}

      <DataSheet
        ref={gridRef}
        adapter={adapter}
        columns={sheetColumns}
        fieldByColumn={fieldByColumn}
        getCellContent={getCellContent}
        customRenderers={[userLinkRenderer]}
        onSelectionChange={setGridSelection}
        headerSlot={headerSlot}
        menus={{ roleLabel: "Mark sheet import" }}
        capabilities={{
          undo: false,
          copyPaste: true,
          statusBar: false,
          density: false,
          fontSize: false,
          contextMenu: false,
          gotoRow: false,
          columnVisibility: false,
          columnReorder: false,
          columnResize: false,
          sortable: false,
        }}
        height={height}
        gridProps={{
          gridSelection,
          rowMarkers: "number",
          headerHeight: 0,
          cellActivationBehavior: "single-click",
          onCellActivated,
          onVisibleRegionChanged: handleVisibleRegionChanged,
        }}
      />

      <MarkSheetStudentMatchPopover
        target={matchTarget}
        overlayRef={matchOverlayRef}
        rosterStudents={rosterStudents}
        onClose={() => setMatchTarget(null)}
        onResolve={(next) => {
          if (!matchTarget) return;
          const rowId = rowIds[matchTarget.sourceRow];
          const nextMap = new Map(resolution);
          for (const field of ["email", "name", "alternative_name"] as const) {
            if (columnMapping[field] != null) {
              nextMap.set(cellKey(rowId, field), next);
            }
          }
          onResolutionChange(nextMap);
          setMatchTarget(null);
        }}
      />
    </div>
  );
}

export function columnsFromRoles(
  headers: string[],
  columnRoles: Record<number, ColumnMapRole>,
  prev: RubricColumn[],
): RubricColumn[] {
  return headers.map((header, idx) => {
    const role = isValidColumnMapRole(columnRoles[idx]) ? columnRoles[idx]! : "ignore";
    const kind = columnMapRoleToKind(role);
    const existing = prev[idx];
    const title = String(header ?? "").trim() || `Column ${idx + 1}`;
    return {
      key: kind === "score" ? slugKey(title, idx) : existing?.key ?? slugKey(title, idx),
      title,
      kind,
      sort_order: idx,
      ...(kind === "score" && existing?.max_marks != null
        ? { max_marks: existing.max_marks }
        : {}),
    };
  });
}

export { applyColumnMapRole };
