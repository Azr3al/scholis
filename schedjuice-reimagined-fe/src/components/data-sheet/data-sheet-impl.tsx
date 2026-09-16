"use client";

import "@glideapps/glide-data-grid/dist/index.css";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import {
  CompactSelection,
  DataEditor,
  type DataEditorProps,
  type DataEditorRef,
  type GridColumn,
  type GridSelection,
  type Item,
} from "@glideapps/glide-data-grid";
import type { CellClickedEventArgs } from "@glideapps/glide-data-grid";

import { cn } from "@/lib/utils";
import { useGlideTheme } from "./lib/use-glide-theme";
import {
  FONT_SIZE_PX,
  fontCellPaddingFor,
  fontLineHeightFor,
  fontThemeFieldsFor,
  headerHeightFor,
  rowHeightFor,
  type SheetAdapter,
  type SheetCapabilities,
  type SheetMenuConfig,
} from "./types";
import { setActiveFontPx } from "./lib/glide-theme";
import { useGridHistory } from "./hooks/use-grid-history";
import {
  useGridClipboard,
  type SelectionRange,
} from "./hooks/use-grid-clipboard";
import { useDisplaySettings } from "./hooks/use-display-settings";
import { useColumnLayout } from "./hooks/use-column-layout";
import { computeSelectionStats } from "./lib/selection-stats";
import {
  buildSortedRowIndices,
} from "./lib/sort-rows";
import { buildDisplayColumnLayout } from "./lib/build-display-column-layout";
import {
  SheetToolbar,
  TOOLBAR_ICONS,
  type ToolbarAction,
} from "./menu-bar/sheet-toolbar";
import { DensityMenu, FontSizeMenu } from "./menu-bar/display-menu";
import { ColumnsMenu } from "./menu-bar/columns-menu";
import { GotoRowPopover } from "./menu-bar/goto-row-popover";
import { SheetStatusBar } from "./status-bar/sheet-status-bar";
import {
  SheetContextMenu,
  type ContextMenuTarget,
} from "./context-menu/sheet-context-menu";
import type { PendingWrite } from "./hooks/use-grid-history";
import { useContainerOverflowCompact } from "@/hooks/use-container-overflow-compact";

const TOOLBAR_HEIGHT = 36;
const STATUS_BAR_HEIGHT = 28;

export interface DataSheetProps {
  adapter: SheetAdapter;
  columns: GridColumn[];
  /** Field id per grid column index (aligned 1:1 with `columns`); null for non-data columns. */
  fieldByColumn: (string | null)[];
  getCellContent: DataEditorProps["getCellContent"];
  customRenderers?: DataEditorProps["customRenderers"];
  displayToSource?: (displayRow: number) => number;
  numericFields?: string[];
  menus: SheetMenuConfig;
  capabilities?: SheetCapabilities;
  height: number;
  className?: string;
  fullscreenSlot?: ReactNode;
  /** Rendered between toolbar and grid (e.g. custom column header row). */
  headerSlot?: ReactNode;
  /** Extra node rendered at the left of the toolbar (e.g. Columns dropdown). */
  toolbarLeading?: ReactNode;
  formatNumber?: (value: number) => string;
  onSelectionChange?: (selection: GridSelection) => void;
  gridProps?: Partial<DataEditorProps>;
  /** Optional ref filled with sort helpers from the sheet's column layout. */
  columnLayoutApiRef?: MutableRefObject<DataSheetColumnLayoutApi | null>;
}

export type DataSheetColumnLayoutApi = {
  setSort: (field: string, direction: "asc" | "desc" | null) => void;
  getSort: () => { field: string; direction: "asc" | "desc" } | null;
};

const DEFAULT_CAPS: SheetCapabilities = {
  undo: true,
  copyPaste: true,
  statusBar: true,
  density: true,
  fontSize: true,
  columnVisibility: false,
  columnReorder: false,
  columnResize: false,
  sortable: false,
  contextMenu: true,
  gotoRow: true,
};

export const DataSheet = forwardRef<DataEditorRef, DataSheetProps>(
  function DataSheet(
    {
      adapter,
      columns,
      fieldByColumn,
      getCellContent,
      customRenderers,
      displayToSource = (r) => r,
      numericFields = [],
      menus,
      capabilities,
      height,
      className,
      fullscreenSlot,
      headerSlot,
      toolbarLeading,
      formatNumber,
      onSelectionChange,
      gridProps,
      columnLayoutApiRef,
    },
    forwardedRef,
  ) {
    const caps = { ...DEFAULT_CAPS, ...capabilities };
    const userGridPaste = gridProps?.onPaste;
    const baseTheme = useGlideTheme();
    const roleLabel = menus?.roleLabel ?? "Sheet";
    const { density, setDensity, fontSize, setFontSize } = useDisplaySettings(
      roleLabel,
    );
    const gridRef = useRef<DataEditorRef>(null);
    const headerSlotRef = useRef<HTMLDivElement>(null);
    const [headerSlotHeight, setHeaderSlotHeight] = useState(0);
    useImperativeHandle(forwardedRef, () => gridRef.current as DataEditorRef, []);

    useLayoutEffect(() => {
      const el = headerSlotRef.current;
      if (!el || !headerSlot) {
        setHeaderSlotHeight(0);
        return;
      }
      const measure = () => {
        const next = Math.ceil(el.getBoundingClientRect().height);
        setHeaderSlotHeight((prev) => (prev === next ? prev : next));
      };
      measure();
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return () => ro.disconnect();
    }, [headerSlot]);

    const layoutEnabled =
      caps.columnReorder ||
      caps.columnResize ||
      caps.sortable ||
      caps.columnVisibility;

    const fieldIds = useMemo(
      () => fieldByColumn.filter((f): f is string => f != null),
      [fieldByColumn],
    );

    const defaultWidths = useMemo(() => {
      const out: Record<string, number> = {};
      columns.forEach((col, i) => {
        const field = fieldByColumn[i];
        if (field) {
          out[field] = "width" in col && col.width != null ? col.width : 160;
        }
      });
      return out;
    }, [columns, fieldByColumn]);

    const columnLayout = useColumnLayout(
      roleLabel,
      fieldIds,
      defaultWidths,
    );

    useEffect(() => {
      if (!columnLayoutApiRef) return;
      columnLayoutApiRef.current = {
        setSort: columnLayout.setSort,
        getSort: () => columnLayout.layout.sort,
      };
      return () => {
        columnLayoutApiRef.current = null;
      };
    }, [columnLayoutApiRef, columnLayout.setSort, columnLayout.layout.sort]);

    const titleByField = useMemo(() => {
      const map = new Map<string, string>();
      columns.forEach((col, i) => {
        const field = fieldByColumn[i];
        if (field) map.set(field, col.title ?? field);
      });
      return map;
    }, [columns, fieldByColumn]);

    const freezeCount = gridProps?.freezeColumns ?? 0;

    const displayLayout = useMemo(() => {
      if (!layoutEnabled) {
        return {
          colSourceIndex: columns.map((_, index) => index),
          displayColumns: columns,
          displayFields: [...fieldByColumn],
        };
      }
      return buildDisplayColumnLayout({
        columns,
        fieldByColumn,
        layoutOrder: columnLayout.layout.order,
        hiddenFields: columnLayout.layout.hidden,
        titleByField,
        defaultWidths,
        layoutWidths: columnLayout.layout.widths,
        sort: columnLayout.layout.sort,
        sortable: caps.sortable ?? false,
      });
    }, [
      layoutEnabled,
      columns,
      fieldByColumn,
      columnLayout.layout.order,
      columnLayout.layout.hidden,
      columnLayout.layout.widths,
      columnLayout.layout.sort,
      titleByField,
      defaultWidths,
      caps.sortable,
    ]);

    const { colSourceIndex, displayColumns, displayFields: effectiveFieldByColumn } =
      displayLayout;

    const sortedRowIndices = useMemo(() => {
      if (!layoutEnabled || !caps.sortable) {
        return Array.from({ length: adapter.rowCount }, (_, i) => i);
      }
      return buildSortedRowIndices(
        adapter.rowCount,
        columnLayout.layout.sort,
        adapter,
        numericFields,
        displayToSource,
      );
    }, [
      layoutEnabled,
      caps.sortable,
      adapter,
      columnLayout.layout.sort,
      numericFields,
      displayToSource,
      adapter.rowCount,
    ]);

    const effectiveDisplayToSource = useCallback(
      (displayRow: number) => {
        const intermediate = sortedRowIndices[displayRow] ?? displayRow;
        return displayToSource(intermediate);
      },
      [sortedRowIndices, displayToSource],
    );

    const remappedGetCellContent = useCallback(
      (item: Item) => {
        if (!layoutEnabled) return getCellContent(item);
        const [displayCol, displayRow] = item;
        const sourceCol = colSourceIndex[displayCol] ?? displayCol;
        const sourceRow = sortedRowIndices[displayRow] ?? displayRow;
        return getCellContent([sourceCol, sourceRow]);
      },
      [layoutEnabled, getCellContent, colSourceIndex, sortedRowIndices],
    );

    const px = FONT_SIZE_PX[fontSize];
    const fontFamily = baseTheme.fontFamily ?? "sans-serif";

    const fontThemeFields = useMemo(
      () => fontThemeFieldsFor(px, fontFamily),
      [px, fontFamily],
    );

    useLayoutEffect(() => {
      setActiveFontPx(px);
    }, [px]);

    useLayoutEffect(() => {
      const ref = gridRef.current;
      if (!ref) return;
      const rowCap = Math.min(adapter.rowCount, 100);
      const colCap = displayColumns.length;
      const damage: { cell: Item }[] = [];
      for (let c = 0; c < colCap; c++) {
        for (let r = 0; r < rowCap; r++) {
          damage.push({ cell: [c, r] });
        }
      }
      if (damage.length > 0) {
        ref.updateCells(damage);
      }
    }, [fontSize, density, px, displayColumns.length, adapter.rowCount]);

    const theme = useMemo(() => {
      const padding = fontCellPaddingFor(px);
      return {
        ...baseTheme,
        ...fontThemeFields,
        editorFontSize: `${px}px`,
        lineHeight: fontLineHeightFor(px),
        ...padding,
      };
    }, [baseTheme, px, fontThemeFields]);

    const wrappedGetCellContent = useCallback(
      (item: Item) => {
        const cell = remappedGetCellContent(item);
        return {
          ...cell,
          themeOverride: { ...cell.themeOverride, ...fontThemeFields },
        };
      },
      [remappedGetCellContent, fontThemeFields],
    );

    const externalSelection = gridProps?.gridSelection;
    const [internalSelection, setInternalSelection] = useState<GridSelection>({
      columns: CompactSelection.empty(),
      rows: CompactSelection.empty(),
    });
    const selection = externalSelection ?? internalSelection;

    const [ctxTarget, setCtxTarget] = useState<ContextMenuTarget | null>(null);

    const history = useGridHistory(adapter);

    const handleSelectionChange = useCallback(
      (s: GridSelection) => {
        setInternalSelection(s);
        onSelectionChange?.(s);
        gridProps?.onGridSelectionChange?.(s);
      },
      [onSelectionChange, gridProps],
    );

    const getSelectionRange = useCallback((): SelectionRange | null => {
      const cur = selection.current;
      if (!cur) return null;
      const { x, y, width, height: h } = cur.range;
      return {
        rowStart: y,
        rowEnd: y + h - 1,
        colStart: x,
        colEnd: x + width - 1,
        anchor: { row: cur.cell[1], col: cur.cell[0] },
      };
    }, [selection]);

    const canGrow = Boolean(adapter.appendRows);

    const clipboard = useGridClipboard({
      adapter,
      visibleFields: effectiveFieldByColumn,
      displayToSource: effectiveDisplayToSource,
      getSelectionRange,
      commitWrites: history.commitWrites,
      canGrow,
    });

    const clearSelection = useCallback(() => {
      const range = getSelectionRange();
      if (!range) return;
      const writes: PendingWrite[] = [];
      for (let r = range.rowStart; r <= range.rowEnd; r++) {
        const source = effectiveDisplayToSource(r);
        for (let c = range.colStart; c <= range.colEnd; c++) {
          const field = effectiveFieldByColumn[c];
          if (field && adapter.isCellEditable(source, field)) {
            writes.push({ row: source, field, value: "" });
          }
        }
      }
      history.commitWrites(writes, "Clear");
    }, [
      getSelectionRange,
      effectiveDisplayToSource,
      effectiveFieldByColumn,
      adapter,
      history,
    ]);

    const [gotoOpen, setGotoOpen] = useState(false);

    const scrollToRow = useCallback((n: number) => {
      gridRef.current?.scrollTo(0, n - 1, "vertical", 0, 0, {
        vAlign: "center",
      });
    }, []);

    const openGotoRow = useCallback(() => {
      if (adapter.rowCount === 0) return;
      setGotoOpen(true);
    }, [adapter.rowCount]);

    const stats = useMemo(() => {
      if (!caps.statusBar) return null;
      const range = getSelectionRange();
      if (!range) return null;
      const values: string[] = [];
      const numbers: (number | null)[] = [];
      for (let r = range.rowStart; r <= range.rowEnd; r++) {
        const source = effectiveDisplayToSource(r);
        for (let c = range.colStart; c <= range.colEnd; c++) {
          const field = effectiveFieldByColumn[c];
          if (!field) continue;
          values.push(adapter.getCellValue(source, field));
          if (numericFields.includes(field) && adapter.getNumericValue) {
            numbers.push(adapter.getNumericValue(source, field));
          }
        }
      }
      return computeSelectionStats({ values, numbers });
    }, [
      caps.statusBar,
      getSelectionRange,
      effectiveDisplayToSource,
      effectiveFieldByColumn,
      adapter,
      numericFields,
    ]);

    const selectionDims = useMemo(() => {
      const range = getSelectionRange();
      if (!range) return null;
      return {
        rows: range.rowEnd - range.rowStart + 1,
        cols: range.colEnd - range.colStart + 1,
      };
    }, [getSelectionRange]);

    const hasDisplayMenus = caps.density || caps.fontSize;
    const hasColumnMenu = layoutEnabled && caps.columnVisibility;
    const hasToolbar =
      Boolean(menus.toolbarRight) ||
      Boolean(menus.statusSlot) ||
      Boolean(fullscreenSlot) ||
      Boolean(toolbarLeading) ||
      hasDisplayMenus ||
      hasColumnMenu ||
      caps.undo ||
      caps.copyPaste ||
      caps.gotoRow;

    const toolbarMeasureRef = useRef<HTMLDivElement>(null);
    const toolbarContentRef = useRef<HTMLDivElement>(null);
    const compact = useContainerOverflowCompact(
      toolbarMeasureRef,
      toolbarContentRef,
      [
        hasToolbar,
        caps.undo,
        caps.copyPaste,
        caps.gotoRow,
        hasColumnMenu,
        hasDisplayMenus,
        density,
        fontSize,
        gotoOpen,
        adapter.rowCount,
      ],
    );

    const toolbarActions = useMemo(() => {
      const actions: ToolbarAction[] = [];
      if (caps.undo) {
        actions.push(
          {
            id: "undo",
            label: "Undo",
            icon: TOOLBAR_ICONS.undo,
            disabled: !history.canUndo,
            onClick: history.undo,
          },
          {
            id: "redo",
            label: "Redo",
            icon: TOOLBAR_ICONS.redo,
            disabled: !history.canRedo,
            onClick: history.redo,
          },
        );
      }
      if (caps.copyPaste) {
        actions.push(
          {
            id: "copy",
            label: "Copy",
            icon: TOOLBAR_ICONS.copy,
            onClick: () => void clipboard.copySelection(),
          },
          {
            id: "paste",
            label: "Paste",
            icon: TOOLBAR_ICONS.paste,
            onClick: () => void (menus.onPaste ?? clipboard.paste.bind(clipboard))(),
          },
        );
      }
      if (caps.gotoRow) {
        actions.push({
          id: "goto",
          label: "Go to row",
          icon: TOOLBAR_ICONS.goto,
          node: (
            <GotoRowPopover
              compact={compact}
              open={gotoOpen}
              onOpenChange={setGotoOpen}
              rowCount={adapter.rowCount}
              onGo={scrollToRow}
              icon={TOOLBAR_ICONS.goto}
              label="Go to row"
            />
          ),
        });
      }
      return actions;
    }, [
      caps.undo,
      caps.copyPaste,
      caps.gotoRow,
      history.canUndo,
      history.canRedo,
      history.undo,
      history.redo,
      clipboard,
      menus.onPaste,
      gotoOpen,
      adapter.rowCount,
      scrollToRow,
      compact,
    ]);

    const onKeyDown = useCallback<NonNullable<DataEditorProps["onKeyDown"]>>(
      (e) => {
        const mod = e.metaKey || e.ctrlKey;
        if (!mod) return;
        const key = (e.key ?? "").toLowerCase();
        if (key === "z" && caps.undo) {
          e.preventDefault();
          if (e.shiftKey) history.redo();
          else history.undo();
        } else if (key === "y" && caps.undo) {
          e.preventDefault();
          history.redo();
        } else if (key === "c" && caps.copyPaste) {
          e.preventDefault();
          void clipboard.copySelection();
        } else if (key === "x" && caps.copyPaste) {
          e.preventDefault();
          void clipboard.cutSelection();
        } else if (key === "v" && caps.copyPaste) {
          if (typeof userGridPaste === "function") return;
          e.preventDefault();
          void (menus.onPaste ?? clipboard.paste.bind(clipboard))();
        } else if (key === "g" && caps.gotoRow) {
          e.preventDefault();
          openGotoRow();
        }
      },
      [caps, history, clipboard, menus.onPaste, userGridPaste, openGotoRow],
    );

    const rowHeight = rowHeightFor(density, fontSize);
    const headerHeight = headerHeightFor(density, fontSize);

    const toolbarHeight = hasToolbar ? TOOLBAR_HEIGHT : 0;
    const statusHeight = caps.statusBar ? STATUS_BAR_HEIGHT : 0;
    const editorHeight = Math.max(
      120,
      height - toolbarHeight - statusHeight - headerSlotHeight,
    );

    const {
      gridSelection: _ignored,
      onGridSelectionChange: _ignored2,
      onPaste: _ignoredOnPaste,
      onColumnMoved: userOnColumnMoved,
      onColumnResize: userOnColumnResize,
      onHeaderClicked: userOnHeaderClicked,
      onCellClicked: userOnCellClicked,
      onCellEdited: userOnCellEdited,
      onCellActivated: userOnCellActivated,
      cellActivationBehavior: userCellActivationBehavior,
      ...restGridProps
    } = gridProps ?? {};

    const resolvedCellActivationBehavior =
      userCellActivationBehavior ??
      (userOnCellActivated ? "single-click" : undefined);

    const useColumnMovedHandler = caps.columnReorder || Boolean(userOnColumnMoved);
    const useColumnResizeHandler = caps.columnResize || Boolean(userOnColumnResize);
    const useHeaderClickedHandler = caps.sortable || Boolean(userOnHeaderClicked);

    const handleCellClicked = useCallback(
      (cell: Item, event: CellClickedEventArgs) => {
        if (!userOnCellClicked) return;
        const [displayCol, displayRow] = cell;
        if (!layoutEnabled) {
          userOnCellClicked(cell, event);
          return;
        }
        const sourceCol = colSourceIndex[displayCol] ?? displayCol;
        const sourceRow = effectiveDisplayToSource(displayRow);
        userOnCellClicked([sourceCol, sourceRow], event);
      },
      [
        userOnCellClicked,
        layoutEnabled,
        colSourceIndex,
        effectiveDisplayToSource,
      ],
    );

    const remapCellIndices = useCallback(
      (cell: Item): Item => {
        const [displayCol, displayRow] = cell;
        if (!layoutEnabled) return cell;
        const sourceCol = colSourceIndex[displayCol] ?? displayCol;
        const sourceRow = effectiveDisplayToSource(displayRow);
        return [sourceCol, sourceRow];
      },
      [layoutEnabled, colSourceIndex, effectiveDisplayToSource],
    );

    const handleCellEdited = useCallback<
      NonNullable<DataEditorProps["onCellEdited"]>
    >(
      (cell, newValue) => {
        if (!userOnCellEdited) return;
        userOnCellEdited(remapCellIndices(cell), newValue);
      },
      [userOnCellEdited, remapCellIndices],
    );

    const handleCellActivated = useCallback<
      NonNullable<DataEditorProps["onCellActivated"]>
    >(
      (cell) => {
        if (!userOnCellActivated) return;
        const bounds = gridRef.current?.getBounds(cell[0], cell[1]) ?? null;
        const sourceCell = remapCellIndices(cell);
        (
          userOnCellActivated as (
            cell: Item,
            bounds: {
              x: number;
              y: number;
              width: number;
              height: number;
            } | null,
          ) => void
        )(sourceCell, bounds);
      },
      [userOnCellActivated, remapCellIndices],
    );

    const handleCellClickedWithActivation = useCallback(
      (cell: Item, event: CellClickedEventArgs) => {
        if (userOnCellClicked) {
          handleCellClicked(cell, event);
          return;
        }
        if (!userOnCellActivated) return;
        // Controlled gridSelection updates async, so Glide's onCellActivated often
        // does not fire on the first click (gridSelection.current is still undefined
        // on mouseup). Bridge activation through onCellClicked instead.
        handleCellActivated(cell);
        event.preventDefault();
      },
      [
        userOnCellClicked,
        userOnCellActivated,
        handleCellClicked,
        handleCellActivated,
      ],
    );

    const handleColumnMoved = useCallback(
      (startIndex: number, endIndex: number) => {
        if (caps.columnReorder) {
          columnLayout.moveColumn(startIndex, endIndex, freezeCount);
        }
        userOnColumnMoved?.(startIndex, endIndex);
      },
      [caps.columnReorder, columnLayout, freezeCount, userOnColumnMoved],
    );

    const handleColumnResize = useCallback(
      (
        _column: GridColumn,
        newSize: number,
        columnIndex: number,
        newSizeWithGrow: number,
      ) => {
        if (caps.columnResize) {
          const field = effectiveFieldByColumn[columnIndex];
          if (field) columnLayout.setWidth(field, newSize);
        }
        userOnColumnResize?.(
          _column,
          newSize,
          columnIndex,
          newSizeWithGrow,
        );
      },
      [caps.columnResize, effectiveFieldByColumn, columnLayout, userOnColumnResize],
    );

    const handleHeaderClicked = useCallback(
      (colIndex: number, event: Parameters<
        NonNullable<DataEditorProps["onHeaderClicked"]>
      >[1]) => {
        let prevented = false;
        const originalPreventDefault = event.preventDefault.bind(event);
        event.preventDefault = () => {
          prevented = true;
          originalPreventDefault();
        };
        userOnHeaderClicked?.(colIndex, event);
        event.preventDefault = originalPreventDefault;
        if (prevented) return;
        if (caps.sortable) {
          const field = effectiveFieldByColumn[colIndex];
          if (field) columnLayout.cycleSort(field);
        }
      },
      [caps.sortable, effectiveFieldByColumn, columnLayout, userOnHeaderClicked],
    );

    const toolbarLeadingContent = (
      <>
        {toolbarLeading}
        {hasColumnMenu ? (
          <ColumnsMenu
            compact={compact}
            columns={fieldIds.map((field) => ({
              field,
              title: titleByField.get(field) ?? field,
              hidden: columnLayout.layout.hidden.includes(field),
            }))}
            onToggle={(field, visible) => {
              const isHidden = columnLayout.layout.hidden.includes(field);
              if (visible !== !isHidden) columnLayout.toggleHidden(field);
            }}
            onFitAll={() => columnLayout.setColumnWidths(defaultWidths)}
            onReset={columnLayout.resetLayout}
          />
        ) : null}
        {caps.density ? (
          <DensityMenu
            compact={compact}
            value={density}
            onChange={setDensity}
          />
        ) : null}
        {caps.fontSize ? (
          <FontSizeMenu
            compact={compact}
            value={fontSize}
            onChange={setFontSize}
          />
        ) : null}
      </>
    );

    const toolbarRightContent = (
      <>
        {menus.toolbarRight}
        {menus.statusSlot}
        {fullscreenSlot}
      </>
    );

    return (
      <div
        className={cn(
          "flex w-full flex-col overflow-hidden rounded-md border border-border",
          className,
        )}
        style={{ height }}
      >
        {hasToolbar ? (
          <SheetToolbar
            compact={compact}
            containerRef={toolbarMeasureRef}
            contentRef={toolbarContentRef}
            actions={toolbarActions}
            leading={toolbarLeadingContent}
            right={toolbarRightContent}
          />
        ) : null}

        {headerSlot ? (
          <div ref={headerSlotRef} className="shrink-0">
            {headerSlot}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-hidden">
          <DataEditor
            ref={gridRef}
            theme={theme}
            width="100%"
            height={editorHeight}
            columns={displayColumns}
            rows={adapter.rowCount}
            rowHeight={rowHeight}
            headerHeight={headerHeight}
            smoothScrollX
            smoothScrollY
            getCellContent={wrappedGetCellContent}
            customRenderers={customRenderers}
            gridSelection={selection}
            onGridSelectionChange={handleSelectionChange}
            getCellsForSelection
            keybindings={{ search: true }}
            onKeyDown={onKeyDown}
            onCellContextMenu={(_cell, e) => {
              if (!caps.contextMenu) return;
              e.preventDefault();
              setCtxTarget({
                x: e.bounds.x + e.localEventX,
                y: e.bounds.y + e.localEventY,
              });
            }}
            onPaste={userGridPaste ?? false}
            {...restGridProps}
            {...(useColumnMovedHandler
              ? { onColumnMoved: handleColumnMoved }
              : {})}
            {...(useColumnResizeHandler
              ? { onColumnResize: handleColumnResize }
              : {})}
            {...(useHeaderClickedHandler
              ? { onHeaderClicked: handleHeaderClicked }
              : {})}
            {...(userOnCellClicked || userOnCellActivated
              ? { onCellClicked: handleCellClickedWithActivation }
              : {})}
            {...(userOnCellEdited ? { onCellEdited: handleCellEdited } : {})}
            {...(userOnCellActivated
              ? { onCellActivated: handleCellActivated }
              : {})}
            cellActivationBehavior={resolvedCellActivationBehavior}
          />
        </div>

        {caps.statusBar ? (
          <SheetStatusBar
            rowCount={adapter.rowCount}
            selectionDims={selectionDims}
            stats={stats}
            formatNumber={formatNumber}
          />
        ) : null}

        {caps.contextMenu ? (
          <SheetContextMenu
            target={ctxTarget}
            onClose={() => setCtxTarget(null)}
            onCut={caps.copyPaste ? () => void clipboard.cutSelection() : undefined}
            onCopy={caps.copyPaste ? () => void clipboard.copySelection() : undefined}
            onPaste={caps.copyPaste ? () => void (menus.onPaste ?? clipboard.paste.bind(clipboard))() : undefined}
            onClear={clearSelection}
            onInsertBelow={
              adapter.appendRows
                ? () => {
                    adapter.appendRows?.(1);
                  }
                : undefined
            }
            onDeleteRows={
              adapter.removeRows
                ? () => {
                    const range = getSelectionRange();
                    if (!range) return;
                    const rows: number[] = [];
                    for (let r = range.rowStart; r <= range.rowEnd; r++) {
                      rows.push(effectiveDisplayToSource(r));
                    }
                    adapter.removeRows?.(rows);
                  }
                : undefined
            }
          />
        ) : null}
      </div>
    );
  },
);
