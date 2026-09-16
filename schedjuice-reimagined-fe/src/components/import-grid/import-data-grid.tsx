"use client";
import { Button, buttonVariants } from "@/components/primitives";

import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  CompactSelection,
  GridCellKind,
  type DataEditorRef,
  type EditableGridCell,
  type GridCell,
  type GridColumn,
  type GridSelection,
  type Item,
  type Rectangle,
} from "@glideapps/glide-data-grid";

import { useImportFields } from "@/hooks/imports/use-import-fields";
import useImportStore from "@/store/import-store";
import { normalizeCell } from "@/lib/imports/normalize-cell";
import type { CellStatus } from "@/lib/imports/resolution";
import {
  cellKey,
  detectCourseConflicts,
  type DuplicateEmailResolution,
} from "@/lib/imports/resolution";
import { importFieldLabel } from "@/lib/imports/wizard-logic";
import type { ImportValidationError } from "@/lib/imports/validation-errors";
import { getActiveLinkColors } from "@/components/import-grid/glide-theme";

import { cn } from "@/lib/utils";
import { Trash as Trash2 } from "iconoir-react";
import type { UserLinkCellData } from "./cells/types";
import { userLinkRenderer } from "./cells/user-link-cell";
import { courseLinkRenderer } from "./cells/course-link-cell";
import { ChoiceCellEditor } from "./cell-editors/choice-cell-editor";
import { DateCellEditor } from "./cell-editors/date-cell-editor";
import { editorKindForField } from "./cell-editors/editor-kind";
import { useColumnLayout } from "./use-column-layout";
import { useGlideTheme } from "./use-glide-theme";
import { useShimmerLoop } from "./use-shimmer-loop";
import { DataSheet } from "@/components/data-sheet/data-sheet";
import type { SheetAdapter } from "@/components/data-sheet/types";
import { ColumnsMenu } from "@/components/data-sheet/menu-bar/columns-menu";
import { estimateColumnWidth } from "@/components/data-sheet/lib/measure-column";
import {
  UserSummaryPopover,
  type UserSummaryTarget,
} from "@/components/users/user-summary-card";

const ROW_HEIGHT = 36;
const HEADER_HEIGHT = 36;
const MIN_GRID_HEIGHT = 400;
const MAX_GRID_HEIGHT_RATIO = 0.7;
const ROW_NUM_FIELD = "__row_num__";
const ROW_NUM_WIDTH = 52;
const FROZEN_COLUMNS = 2;

type SortState = { field: string; dir: "asc" | "desc" } | null;

type MappedCol = { idx: number; field: string };

function formatColumnTitle(label: string, field: string, sort: SortState): string {
  if (sort?.field !== field) return label;
  return `${label} ${sort.dir === "asc" ? "↑" : "↓"}`;
}

function compareCellValues(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function buildSortedRowIndices(
  rowCount: number,
  sort: SortState,
  mappedCols: MappedCol[],
  rows: readonly (readonly unknown[])[],
): number[] {
  const indices = Array.from({ length: rowCount }, (_, i) => i);
  if (!sort) return indices;

  const mapped = mappedCols.find((c) => c.field === sort.field);
  if (!mapped) return indices;

  indices.sort((rowA, rowB) => {
    const rawA = rows[rowA]?.[mapped.idx];
    const rawB = rows[rowB]?.[mapped.idx];
    const a = rawA === null || rawA === undefined ? "" : String(rawA);
    const b = rawB === null || rawB === undefined ? "" : String(rawB);
    const cmp = compareCellValues(a, b);
    return sort.dir === "asc" ? cmp : -cmp;
  });

  return indices;
}

const EMPTY_GRID_SELECTION: GridSelection = {
  columns: CompactSelection.empty(),
  rows: CompactSelection.empty(),
};

function displayRowsToSourceRows(
  displayRows: readonly number[],
  sortedRowIndices: readonly number[],
): number[] {
  return Array.from(new Set(displayRows.map((d) => sortedRowIndices[d] ?? d)));
}

function isEditableField(field: string): boolean {
  return field !== ROW_NUM_FIELD && field !== "email" && field !== "courses";
}

function userLinkDisplayStatus(
  status: CellStatus | undefined,
): UserLinkCellData["status"] {
  switch (status) {
    case "pending_match":
    case "pending_candidates":
    case "confirmed":
    case "resolving":
    case "new":
    case "error":
    case "idle":
      return status;
    default:
      return "idle";
  }
}

export type ImportGridFocusTarget = {
  sourceRow: number;
  field: string;
  requestId: number;
};

export const ImportDataGrid = forwardRef<
  DataEditorRef,
  {
    duplicateResolution?: DuplicateEmailResolution | null;
    validationErrors?: ImportValidationError[];
    focusTarget?: ImportGridFocusTarget | null;
    onCellActivated?: (
      item: Item,
      bounds: Rectangle | null,
      field: string,
      sourceRow: number,
    ) => void;
    onCellEdited?: (sourceRow: number, field: string, value: string) => void;
    onRowsRemove?: (sourceIndices: number[]) => void;
    onSelectedSourceRowsChange?: (sourceIndices: number[]) => void;
    removeDisabled?: boolean;
    height?: number;
    className?: string;
    fullscreenSlot?: ReactNode;
  }
>(function ImportDataGrid(
  {
  duplicateResolution,
  validationErrors = [],
  focusTarget = null,
  onCellActivated,
  onCellEdited: onCellEditedExternal,
  onRowsRemove,
  onSelectedSourceRowsChange,
  removeDisabled = false,
  height,
  className,
  fullscreenSlot,
  },
  forwardedRef,
) {
  const gridRef = useRef<DataEditorRef | null>(null);
  const assignGridRef = useCallback(
    (node: DataEditorRef | null) => {
      gridRef.current = node;
      if (typeof forwardedRef === "function") {
        forwardedRef(node);
      } else if (forwardedRef) {
        forwardedRef.current = node;
      }
    },
    [forwardedRef],
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const theme = useGlideTheme();
  const linkColors = getActiveLinkColors();

  const parse = useImportStore((s) => s.parse);
  const mapping = useImportStore((s) => s.mapping);
  const rowIds = useImportStore((s) => s.rowIds);
  const resolution = useImportStore((s) => s.resolution);
  const role = useImportStore((s) => s.role);
  const setRowCellValue = useImportStore((s) => s.setRowCellValue);

  const { data: fields = [] } = useImportFields(role, Boolean(parse));

  const fieldByKey = useMemo(
    () => new Map(fields.map((f) => [f.field_key, f])),
    [fields],
  );

  const [sort, setSort] = useState<SortState>(null);
  const [viewportMaxHeight, setViewportMaxHeight] = useState(700);
  const [gridSelection, setGridSelection] =
    useState<GridSelection>(EMPTY_GRID_SELECTION);
  const [dateEditorTarget, setDateEditorTarget] = useState<{
    sourceRow: number;
    field: string;
    value: string;
    rect: { x: number; y: number; width: number; height: number };
  } | null>(null);
  const [choiceEditorTarget, setChoiceEditorTarget] = useState<{
    sourceRow: number;
    field: string;
    value: string;
    rect: { x: number; y: number; width: number; height: number };
  } | null>(null);
  const [userSummaryTarget, setUserSummaryTarget] = useState<UserSummaryTarget | null>(
    null,
  );

  const mappedColsBase = useMemo(
    () =>
      Object.entries(mapping)
        .filter(([, field]) => field)
        .map(([idx, field]) => ({ idx: Number(idx), field: field as string })),
    [mapping],
  );

  const fieldIds = useMemo(
    () => mappedColsBase.map((col) => col.field),
    [mappedColsBase],
  );

  const { layout, moveColumn, resizeColumn, setHidden, setColumnWidths, resetLayout } =
    useColumnLayout(fieldIds);

  const mappedCols = useMemo(() => {
    const byField = new Map(mappedColsBase.map((col) => [col.field, col]));
    return layout.order
      .filter((field) => byField.has(field) && !layout.hidden.includes(field))
      .map((field) => byField.get(field)!);
  }, [mappedColsBase, layout.order, layout.hidden]);

  const gridCols = useMemo<MappedCol[]>(
    () => [{ idx: -1, field: ROW_NUM_FIELD }, ...mappedCols],
    [mappedCols],
  );

  const sortedRowIndices = useMemo(() => {
    if (!parse) return [];
    return buildSortedRowIndices(parse.rows.length, sort, mappedCols, parse.rows);
  }, [parse, sort, mappedCols]);

  const adapter = useMemo<SheetAdapter>(() => {
    const fieldToSourceIdx = new Map(mappedCols.map((c) => [c.field, c.idx]));
    return {
      rowCount: parse?.rows.length ?? 0,
      getCellValue: (row, field) => {
        const idx = fieldToSourceIdx.get(field);
        if (idx === undefined) return "";
        const raw = useImportStore.getState().parse?.rows[row]?.[idx];
        return raw === null || raw === undefined ? "" : String(raw);
      },
      setCellValue: (row, field, value) => {
        const idx = fieldToSourceIdx.get(field);
        if (idx === undefined) return;
        setRowCellValue(row, idx, value);
        onCellEditedExternal?.(row, field, value);
      },
      isCellEditable: (_row, field) => isEditableField(field),
      appendRows: (count) =>
        useImportStore.getState().appendBlankRowsAtEnd(count),
      removeRows: (rows) => {
        onRowsRemove?.(rows);
      },
    };
  }, [
    mappedCols,
    parse?.rows.length,
    setRowCellValue,
    onCellEditedExternal,
    onRowsRemove,
  ]);

  const fieldByColumn = useMemo<(string | null)[]>(
    () => gridCols.map((c) => (c.field === ROW_NUM_FIELD ? null : c.field)),
    [gridCols],
  );

  const displayToSource = useCallback(
    (displayRow: number) => sortedRowIndices[displayRow] ?? displayRow,
    [sortedRowIndices],
  );

  const columnMenuItems = useMemo(
    () =>
      mappedColsBase.map((col) => ({
        field: col.field,
        title: importFieldLabel(fields, col.field),
        hidden: layout.hidden.includes(col.field),
      })),
    [mappedColsBase, fields, layout.hidden],
  );

  const handleFitAll = useCallback(() => {
    if (!parse) return;
    const widths: Record<string, number> = {};
    mappedCols.forEach(({ field, idx }) => {
      const values = parse.rows.map((r) => {
        const raw = r[idx];
        return raw === null || raw === undefined ? "" : String(raw);
      });
      widths[field] = estimateColumnWidth(
        values,
        importFieldLabel(fields, field),
        { charWidth: 7, padding: 24, min: 60, max: 400 },
      );
    });
    setColumnWidths(widths);
  }, [parse, mappedCols, fields, setColumnWidths]);

  useEffect(() => {
    setGridSelection(EMPTY_GRID_SELECTION);
    setUserSummaryTarget(null);
    onSelectedSourceRowsChange?.([]);
  }, [parse?.rows.length, onSelectedSourceRowsChange]);

  const updateUserSummaryFromSelection = useCallback(
    (selection: GridSelection) => {
      if (!parse) {
        setUserSummaryTarget(null);
        return;
      }

      const current = selection.current;
      if (!current?.cell) {
        setUserSummaryTarget(null);
        return;
      }

      const [col, displayRow] = current.cell;
      const field = gridCols[col]?.field;
      if (field !== "email") {
        setUserSummaryTarget(null);
        return;
      }

      const sourceRow = sortedRowIndices[displayRow] ?? displayRow;
      const res = resolution.get(cellKey(rowIds[sourceRow], "email"));
      const linkStatus = userLinkDisplayStatus(res?.status);

      if (linkStatus !== "confirmed" || !res?.entityRef) {
        setUserSummaryTarget(null);
        return;
      }

      const bounds = gridRef.current?.getBounds(col, displayRow);
      if (!bounds) {
        setUserSummaryTarget(null);
        return;
      }

      const raw = parse.rows[sourceRow]?.[gridCols[col].idx];
      const value = raw === null || raw === undefined ? "" : String(raw);

      setUserSummaryTarget({
        user: {
          id: res.entityRef.id,
          name: res.entityRef.label,
          email: value,
        },
        rect: bounds,
      });
    },
    [parse, gridCols, sortedRowIndices, resolution, rowIds],
  );

  const handleGridSelectionChange = useCallback(
    (selection: GridSelection) => {
      setGridSelection(selection);
      updateUserSummaryFromSelection(selection);
      if (!onSelectedSourceRowsChange) return;
      const sourceRows = displayRowsToSourceRows(
        selection.rows.toArray(),
        sortedRowIndices,
      );
      onSelectedSourceRowsChange(sourceRows);
    },
    [onSelectedSourceRowsChange, sortedRowIndices, updateUserSummaryFromSelection],
  );

  const selectedSourceRows = useMemo(
    () =>
      displayRowsToSourceRows(gridSelection.rows.toArray(), sortedRowIndices),
    [gridSelection, sortedRowIndices],
  );

  const performRemove = useCallback(
    (sourceRows: number[]) => {
      if (removeDisabled || !onRowsRemove || !parse) return;
      if (sourceRows.length === 0) return;
      if (parse.rows.length - sourceRows.length < 1) return;

      onRowsRemove(sourceRows);
      setGridSelection(EMPTY_GRID_SELECTION);
      setUserSummaryTarget(null);
      onSelectedSourceRowsChange?.([]);
    },
    [
      removeDisabled,
      onRowsRemove,
      parse,
      onSelectedSourceRowsChange,
    ],
  );

  const handleDelete = useCallback(
    (selection: GridSelection) => {
      const displayRows = selection.rows.toArray();
      if (displayRows.length === 0) return false;

      const sourceRows = displayRowsToSourceRows(displayRows, sortedRowIndices);
      performRemove(sourceRows);
      return false;
    },
    [sortedRowIndices, performRemove],
  );

  const removeToolbarDisabled =
    removeDisabled ||
    selectedSourceRows.length === 0 ||
    !parse ||
    parse.rows.length - selectedSourceRows.length < 1;

  const errorByCell = useMemo(() => {
    const map = new Map<string, ImportValidationError>();
    validationErrors.forEach((err) => {
      map.set(`${err.sourceRow}:${err.field}`, err);
    });
    return map;
  }, [validationErrors]);

  const errorRows = useMemo(() => {
    const rows = new Set<number>();
    validationErrors.forEach((err) => rows.add(err.sourceRow));
    return rows;
  }, [validationErrors]);

  const duplicateRoleByRow = useMemo(() => {
    const roles = new Map<number, "kept" | "skipped">();
    if (!duplicateResolution) return roles;
    duplicateResolution.skippedRowIndices.forEach((rowIndex) => {
      roles.set(rowIndex, "skipped");
    });
    duplicateResolution.keptRowByEmail.forEach((rowIndex) => {
      roles.set(rowIndex, "kept");
    });
    return roles;
  }, [duplicateResolution]);

  const columns: GridColumn[] = useMemo(
    () => [
      { title: "#", id: ROW_NUM_FIELD, width: ROW_NUM_WIDTH },
      ...mappedCols.map(({ field }) => {
        const label = importFieldLabel(fields, field);
        return {
          title: formatColumnTitle(label, field, sort),
          id: field,
          width: layout.widths[field] ?? 160,
        };
      }),
    ],
    [mappedCols, layout.widths, sort, fields],
  );

  const resolvingCells = useMemo(() => {
    const out: { cell: Item }[] = [];
    if (!parse) return out;
    sortedRowIndices.forEach((sourceRow, displayRow) => {
      mappedCols.forEach(({ field }, mappedCol) => {
        const res = resolution.get(cellKey(rowIds[sourceRow], field));
        const anyTokenResolving = res?.tokens?.some((t) => t.status === "resolving");
        if (res?.status === "resolving" || anyTokenResolving) {
          out.push({ cell: [mappedCol + 1, displayRow] });
        }
      });
    });
    return out;
  }, [parse, mappedCols, resolution, rowIds, sortedRowIndices]);

  useShimmerLoop(gridRef, resolvingCells);

  const conflictRaws = useMemo(() => {
    const set = new Set<string>();
    detectCourseConflicts(resolution, rowIds).forEach((c) => set.add(c.raw));
    return set;
  }, [resolution, rowIds]);

  useEffect(() => {
    const update = () => {
      setViewportMaxHeight(Math.floor(window.innerHeight * MAX_GRID_HEIGHT_RATIO));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    if (!focusTarget) return;

    const col = gridCols.findIndex((c) => c.field === focusTarget.field);
    if (col < 0) return;
    const displayRow = sortedRowIndices.indexOf(focusTarget.sourceRow);
    if (displayRow < 0) return;

    containerRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    const scrollGrid = () => {
      gridRef.current?.scrollTo(col, displayRow, "vertical", 8, 8, {
        vAlign: "center",
      });
    };
    const timeoutId = window.setTimeout(scrollGrid, 280);
    return () => window.clearTimeout(timeoutId);
  }, [focusTarget, gridCols, sortedRowIndices]);

  const gridHeight = useMemo(() => {
    if (!parse) return MIN_GRID_HEIGHT;
    const contentHeight = HEADER_HEIGHT + parse.rows.length * ROW_HEIGHT + 2;
    return Math.min(Math.max(contentHeight, MIN_GRID_HEIGHT), viewportMaxHeight);
  }, [parse, viewportMaxHeight]);

  const resolvedGridHeight = height ?? gridHeight;

  const commitCellValue = useCallback(
    (sourceRow: number, field: string, value: string, colIndex?: number) => {
      const mapped = gridCols.find((c) => c.field === field);
      const idx = mapped?.idx;
      if (idx === undefined || idx < 0) return;
      setRowCellValue(sourceRow, idx, value);
      onCellEditedExternal?.(sourceRow, field, value);
      if (colIndex !== undefined) {
        const displayRow = sortedRowIndices.indexOf(sourceRow);
        if (displayRow >= 0) {
          gridRef.current?.updateCells([{ cell: [colIndex, displayRow] }]);
        }
      }
    },
    [gridCols, setRowCellValue, onCellEditedExternal, sortedRowIndices],
  );

  const getCellContent = useCallback(
    ([col, displayRow]: Item): GridCell => {
      if (!parse) {
        return {
          kind: GridCellKind.Text,
          data: "",
          displayData: "",
          allowOverlay: false,
        };
      }

      const sourceRow = sortedRowIndices[displayRow] ?? displayRow;
      const { idx, field } = gridCols[col];
      if (field === ROW_NUM_FIELD) {
        const isSkipped = duplicateRoleByRow.get(sourceRow) === "skipped";
        const hasError = errorRows.has(sourceRow);
        return {
          kind: GridCellKind.Text,
          data: String(sourceRow + 1),
          displayData: String(sourceRow + 1),
          readonly: true,
          allowOverlay: false,
          themeOverride: isSkipped
            ? { bgCell: "#f4f4f5", textDark: theme.textMedium }
            : hasError
              ? { textDark: linkColors.error, bgCell: "#fef2f2" }
              : { textDark: theme.textMedium },
        };
      }
      const raw = parse.rows[sourceRow]?.[idx];
      const value = raw === null || raw === undefined ? "" : String(raw);
      const res = resolution.get(cellKey(rowIds[sourceRow], field));

      if (field === "email") {
        const linkStatus = userLinkDisplayStatus(res?.status);
        return {
          kind: GridCellKind.Custom,
          allowOverlay: false,
          readonly: true,
          copyData: value,
          data: {
            kind: "user-link-cell",
            raw: value,
            status: linkStatus,
            label: res?.entityRef?.label,
            candidateCount: res?.candidates?.length ?? 0,
            nameMismatch: res?.nameMismatch,
            duplicateRole: duplicateRoleByRow.get(sourceRow),
            user:
              linkStatus === "confirmed" && res?.entityRef
                ? {
                    id: res.entityRef.id,
                    name: res.entityRef.label,
                    email: value,
                  }
                : undefined,
          },
        } as GridCell;
      }

      if (field === "courses") {
        const tokens = (res?.tokens ?? []).map((t) => ({
          ...t,
          conflict: t.status === "linked" && conflictRaws.has(t.raw),
        }));
        return {
          kind: GridCellKind.Custom,
          allowOverlay: false,
          readonly: true,
          copyData: value,
          data: {
            kind: "course-link-cell",
            raw: value,
            status: res?.status ?? "idle",
            tokens,
          },
        } as GridCell;
      }

      const def = fieldByKey.get(field);
      const norm = def ? normalizeCell(value, def) : { status: "valid" as const, value };
      const isSkipped = duplicateRoleByRow.get(sourceRow) === "skipped";
      const cellError = errorByCell.get(`${sourceRow}:${field}`);
      const hasError = norm.status === "error" || Boolean(cellError);
      const isFocused =
        focusTarget?.sourceRow === sourceRow && focusTarget?.field === field;
      const editorKind = editorKindForField(field, fieldByKey);
      const themeOverride =
        isSkipped
          ? { bgCell: "#f4f4f5", textDark: theme.textMedium }
          : hasError
            ? {
                textDark: linkColors.error,
                bgCell: isFocused ? "#fee2e2" : "#fef2f2",
              }
            : norm.status === "adjusted"
              ? { textDark: theme.accentColor }
              : undefined;

      if (editorKind === "boolean") {
        return {
          kind: GridCellKind.Boolean,
          data:
            value === "true" ? true : value === "false" ? false : undefined,
          readonly: isSkipped,
          allowOverlay: false,
          themeOverride,
        };
      }

      if (editorKind === "number") {
        const parsed = Number(value.replace(/,/g, ""));
        return {
          kind: GridCellKind.Number,
          data: Number.isNaN(parsed) ? undefined : parsed,
          displayData: norm.value,
          readonly: isSkipped,
          allowOverlay: !isSkipped,
          contentAlign: "right",
          themeOverride,
        };
      }

      if (editorKind === "date" || editorKind === "choice") {
        return {
          kind: GridCellKind.Text,
          data: value,
          displayData: norm.value,
          allowOverlay: false,
          readonly: isSkipped,
          themeOverride,
        };
      }

      return {
        kind: GridCellKind.Text,
        data: value,
        displayData: norm.value,
        allowOverlay: !isSkipped,
        readonly: isSkipped,
        themeOverride,
      };
    },
    [
      parse,
      gridCols,
      resolution,
      rowIds,
      sortedRowIndices,
      conflictRaws,
      fieldByKey,
      duplicateRoleByRow,
      errorByCell,
      errorRows,
      focusTarget,
      linkColors.error,
      theme.accentColor,
      theme.textMedium,
    ],
  );

  const getRowThemeOverride = useCallback(
    (displayRow: number) => {
      const sourceRow = sortedRowIndices[displayRow] ?? displayRow;
      if (duplicateResolution?.skippedRowIndices.has(sourceRow)) {
        return { bgCell: "#f4f4f5", textDark: theme.textMedium };
      }
      if (errorRows.has(sourceRow)) {
        return { bgCell: "#fff1f2", textDark: theme.textDark };
      }
      return undefined;
    },
    [duplicateResolution, sortedRowIndices, errorRows, theme.textMedium, theme.textDark],
  );

  const onCellEdited = useCallback(
    (cell: Item, newValue: EditableGridCell) => {
      if (!parse) return;
      const [col, displayRow] = cell;
      const sourceRow = sortedRowIndices[displayRow] ?? displayRow;
      const { idx, field } = gridCols[col];
      if (!isEditableField(field)) return;

      let value: string | null = null;
      if (newValue.kind === GridCellKind.Text) {
        value = newValue.data;
      } else if (newValue.kind === GridCellKind.Boolean) {
        value = newValue.data ? "true" : "false";
      } else if (newValue.kind === GridCellKind.Number) {
        value =
          newValue.data === undefined || newValue.data === null
            ? ""
            : String(newValue.data);
      } else {
        return;
      }

      setRowCellValue(sourceRow, idx, value);
      onCellEditedExternal?.(sourceRow, field, value);
      gridRef.current?.updateCells([{ cell: [col, displayRow] }]);
    },
    [parse, gridCols, setRowCellValue, sortedRowIndices, onCellEditedExternal],
  );

  const onHeaderClicked = useCallback(
    (colIndex: number) => {
      if (colIndex === 0) return;
      const field = mappedCols[colIndex - 1]?.field;
      if (!field) return;
      setSort((prev) => {
        if (prev?.field !== field) return { field, dir: "asc" };
        if (prev.dir === "asc") return { field, dir: "desc" };
        return null;
      });
    },
    [mappedCols],
  );

  const onColumnMoved = useCallback(
    (startIndex: number, endIndex: number) => {
      if (startIndex < FROZEN_COLUMNS || endIndex < FROZEN_COLUMNS) return;
      moveColumn(startIndex - 1, endIndex - 1);
    },
    [moveColumn],
  );

  const onColumnResize = useCallback(
    (_column: GridColumn, newSize: number, colIndex: number) => {
      if (colIndex === 0) return;
      const field = mappedCols[colIndex - 1]?.field;
      if (!field) return;
      resizeColumn(field, newSize);
    },
    [mappedCols, resizeColumn],
  );

  const onFillPattern = useCallback(
    (event: { patternSource: Rectangle; fillDestination: Rectangle; preventDefault: () => void }) => {
      if (!parse) return;

      const { patternSource, fillDestination } = event;

      for (
        let displayRow = fillDestination.y;
        displayRow < fillDestination.y + fillDestination.height;
        displayRow += 1
      ) {
        for (
          let col = fillDestination.x;
          col < fillDestination.x + fillDestination.width;
          col += 1
        ) {
          const field = gridCols[col]?.field;
          if (!field || !isEditableField(field)) {
            event.preventDefault();
            return;
          }
        }
      }

      for (
        let displayRow = fillDestination.y;
        displayRow < fillDestination.y + fillDestination.height;
        displayRow += 1
      ) {
        for (
          let col = fillDestination.x;
          col < fillDestination.x + fillDestination.width;
          col += 1
        ) {
          const { idx, field } = gridCols[col];
          const sourceDisplayRow =
            patternSource.y +
            ((displayRow - fillDestination.y) % patternSource.height);
          const sourceCol =
            patternSource.x + ((col - fillDestination.x) % patternSource.width);
          const sourceRow = sortedRowIndices[sourceDisplayRow] ?? sourceDisplayRow;
          const { idx: sourceIdx } = gridCols[sourceCol];
          const raw = parse.rows[sourceRow]?.[sourceIdx];
          const value = raw === null || raw === undefined ? "" : String(raw);
          const targetRow = sortedRowIndices[displayRow] ?? displayRow;
          setRowCellValue(targetRow, idx, value);
        }
      }
    },
    [parse, gridCols, setRowCellValue, sortedRowIndices],
  );

  if (!parse) return null;

  const showRemoveToolbar = Boolean(onRowsRemove);

  return (
    <div ref={containerRef} className={cn("w-full", className)}>
      <DataSheet
        ref={assignGridRef}
        adapter={adapter}
        columns={columns}
        fieldByColumn={fieldByColumn}
        getCellContent={getCellContent}
        customRenderers={[userLinkRenderer, courseLinkRenderer]}
        displayToSource={displayToSource}
        menus={{
          roleLabel: "Import",
          toolbarRight: showRemoveToolbar ? (
            <Button
              type="button"
              variant="secondary" size="sm"
              disabled={removeToolbarDisabled}
              className="h-7 active:scale-[0.98] text-destructive hover:text-destructive"
              onClick={() => performRemove(selectedSourceRows)}
            >
              <Trash2 className="size-4 shrink-0" aria-hidden />
              Remove
              {selectedSourceRows.length > 0
                ? ` (${selectedSourceRows.length})`
                : ""}
            </Button>
          ) : undefined,
        }}
        capabilities={{
          undo: true,
          copyPaste: true,
          statusBar: true,
          density: true,
          columnVisibility: false,
          contextMenu: true,
          gotoRow: true,
        }}
        height={resolvedGridHeight}
        fullscreenSlot={fullscreenSlot}
        toolbarLeading={
          <ColumnsMenu
            columns={columnMenuItems}
            onToggle={(field, visible) => setHidden(field, !visible)}
            onFitAll={handleFitAll}
            onReset={resetLayout}
          />
        }
        onSelectionChange={handleGridSelectionChange}
        gridProps={{
          rowMarkers: "checkbox-visible",
          rowSelect: "multi",
          rowSelectionMode: "multi",
          freezeColumns: FROZEN_COLUMNS,
          gridSelection,
          getRowThemeOverride,
          onHeaderClicked,
          onColumnMoved,
          onColumnResize,
          onCellEdited,
          onDelete: handleDelete,
          fillHandle: true,
          onFillPattern,
          onCellActivated: (cell: Item) => {
            const field = gridCols[cell[0]]?.field ?? "";
            const sourceRow = sortedRowIndices[cell[1]] ?? cell[1];
            const bounds = gridRef.current?.getBounds(cell[0], cell[1]) ?? null;

            if (
              !bounds ||
              !isEditableField(field) ||
              duplicateRoleByRow.get(sourceRow) === "skipped"
            ) {
              onCellActivated?.(cell, bounds, field, sourceRow);
              return;
            }

            const raw = parse.rows[sourceRow]?.[gridCols[cell[0]].idx];
            const value = raw === null || raw === undefined ? "" : String(raw);
            const editorKind = editorKindForField(field, fieldByKey);

            if (editorKind === "date") {
              setChoiceEditorTarget(null);
              setDateEditorTarget({ sourceRow, field, value, rect: bounds });
              return;
            }

            if (editorKind === "choice") {
              setDateEditorTarget(null);
              setChoiceEditorTarget({ sourceRow, field, value, rect: bounds });
              return;
            }

            onCellActivated?.(cell, bounds, field, sourceRow);
          },
        }}
      />
      <DateCellEditor
        target={dateEditorTarget}
        fields={fields}
        onClose={() => setDateEditorTarget(null)}
        onPick={(sourceRow, field, value) => {
          const colIndex = gridCols.findIndex((c) => c.field === field);
          commitCellValue(sourceRow, field, value, colIndex >= 0 ? colIndex : undefined);
          setDateEditorTarget(null);
        }}
      />
      <ChoiceCellEditor
        target={choiceEditorTarget}
        fields={fields}
        onClose={() => setChoiceEditorTarget(null)}
        onPick={(sourceRow, field, value) => {
          const colIndex = gridCols.findIndex((c) => c.field === field);
          commitCellValue(sourceRow, field, value, colIndex >= 0 ? colIndex : undefined);
          setChoiceEditorTarget(null);
        }}
      />
      <UserSummaryPopover
        target={userSummaryTarget}
        onClose={() => setUserSummaryTarget(null)}
      />
    </div>
  );
});
