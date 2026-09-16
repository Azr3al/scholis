"use client";

import {
  CompactSelection,
  GridCellKind,
  type DataEditorRef,
  type EditableGridCell,
  type GridCell,
  type GridSelection,
  type Item,
} from "@glideapps/glide-data-grid";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import { DataSheet } from "@/components/data-sheet/data-sheet";
import { RequiredMark } from "@/components/form/required-mark";
import { Button, Field, useToast } from "@/components/primitives";
import { gridToPastePayload } from "@/lib/mark-sheets/grid-to-paste";
import { useMarkSheetPasteGrid } from "@/lib/data-sheets/mark-sheet-paste-adapter";
import { cn } from "@/lib/utils";

export type MarkSheetPasteGridHandle = {
  getPastePayload: () => string | null;
};

type MarkSheetPasteGridProps = {
  onFileSelected: (file: File) => void;
  onPasteApplied?: () => void;
  isParsing?: boolean;
  height?: number;
  className?: string;
};

const DEFAULT_GRID_HEIGHT = 320;

function initialGridSelection(): GridSelection {
  return {
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
    current: {
      cell: [0, 0],
      range: { x: 0, y: 0, width: 1, height: 1 },
      rangeStack: [],
    },
  };
}

function damageAllCells(rowCount: number, colCount: number): { cell: Item }[] {
  const damage: { cell: Item }[] = [];
  const rowCap = Math.min(rowCount, 100);
  for (let r = 0; r < rowCap; r++) {
    for (let c = 0; c < colCount; c++) {
      damage.push({ cell: [c, r] });
    }
  }
  return damage;
}

export const MarkSheetPasteGrid = forwardRef<
  MarkSheetPasteGridHandle,
  MarkSheetPasteGridProps
>(function MarkSheetPasteGrid(
  {
    onFileSelected,
    onPasteApplied,
    isParsing = false,
    height = DEFAULT_GRID_HEIGHT,
    className,
  },
  ref,
) {
  const toast = useToast();
  const gridRef = useRef<DataEditorRef>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectionRef = useRef({ row: 0, col: 0 });
  const [gridSelection, setGridSelection] = useState(initialGridSelection);
  const {
    adapter,
    cells,
    columns,
    fieldByColumn,
    applyPasteFromText,
  } = useMarkSheetPasteGrid();

  useImperativeHandle(
    ref,
    () => ({
      getPastePayload: () => gridToPastePayload(cells),
    }),
    [cells],
  );

  const focusFirstCell = useCallback(() => {
    const editor = gridRef.current;
    if (!editor) return;

    const selection = initialGridSelection();
    setGridSelection(selection);
    selectionRef.current = { col: 0, row: 0 };
    editor.scrollTo(0, 0, "both", 0, 0, {
      hAlign: "start",
      vAlign: "start",
    });
    editor.focus();
  }, []);

  const setGridRef = useCallback(
    (editor: DataEditorRef | null) => {
      gridRef.current = editor;
      if (!editor) return;
      requestAnimationFrame(() => {
        requestAnimationFrame(focusFirstCell);
      });
    },
    [focusFirstCell],
  );

  const refreshVisibleCells = useCallback(() => {
    const editor = gridRef.current;
    if (!editor) return;
    const damage = damageAllCells(cells.length, fieldByColumn.length);
    if (damage.length > 0) {
      editor.updateCells(damage);
    }
  }, [cells.length, fieldByColumn.length]);

  useEffect(() => {
    refreshVisibleCells();
  }, [cells, fieldByColumn.length, refreshVisibleCells]);

  const handleSelectionChange = useCallback((selection: GridSelection) => {
    setGridSelection(selection);
    const cell = selection.current?.cell;
    if (cell) {
      selectionRef.current = { col: cell[0], row: cell[1] };
    }
  }, []);

  const notifyPasteApplied = useCallback(() => {
    onPasteApplied?.();
  }, [onPasteApplied]);

  const pasteTextAtSelection = useCallback(
    (text: string) => {
      if (!text.trim()) {
        toast.add({
          description: "Clipboard is empty. Copy cells from Excel first.",
        });
        return false;
      }

      const { row, col } = selectionRef.current;
      const applied = applyPasteFromText(text, row, col);
      if (!applied) {
        toast.add({ description: "Could not parse clipboard data." });
        return false;
      }

      requestAnimationFrame(refreshVisibleCells);
      notifyPasteApplied();
      return true;
    },
    [applyPasteFromText, refreshVisibleCells, notifyPasteApplied, toast],
  );

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      pasteTextAtSelection(text);
    } catch {
      toast.add({
        description:
          "Could not read the clipboard. Click a cell and use ⌘V / Ctrl+V, or allow clipboard access.",
      });
    }
  }, [pasteTextAtSelection, toast]);

  const getCellContent = useCallback(
    ([col, row]: Item): GridCell => {
      const value = cells[row]?.[col] ?? "";
      return {
        kind: GridCellKind.Text,
        data: value,
        displayData: value,
        allowOverlay: true,
        readonly: false,
      };
    },
    [cells],
  );

  const onCellEdited = useCallback(
    (cell: Item, newValue: EditableGridCell) => {
      const [col, row] = cell;
      const field = fieldByColumn[col];
      if (!field || newValue.kind !== GridCellKind.Text) return;

      const text = newValue.data;
      if (/[\t\n\r]/.test(text)) {
        selectionRef.current = { col, row };
        pasteTextAtSelection(text);
        return;
      }

      adapter.setCellValue(row, field, text);
    },
    [adapter, fieldByColumn, pasteTextAtSelection],
  );

  const onCellClicked = useCallback((cell: Item) => {
    selectionRef.current = { col: cell[0], row: cell[1] };
  }, []);

  return (
    <Field.Root className={cn("min-h-0 flex-1", className)}>
      <Field.Label>
        Paste spreadsheet data
        <RequiredMark />
      </Field.Label>
      <Field.Description>
        Click any cell in the grid below, then paste from Excel (include header row).
      </Field.Description>
      <div className="relative min-h-0 w-full flex-1">
        <DataSheet
          ref={setGridRef}
          adapter={adapter}
          columns={columns}
          fieldByColumn={fieldByColumn}
          getCellContent={getCellContent}
          onSelectionChange={handleSelectionChange}
          menus={{
            roleLabel: "Mark sheet paste",
            onPaste: handlePaste,
            toolbarRight: (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.csv,.xls"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onFileSelected(file);
                    e.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isParsing}
                >
                  Upload file
                </Button>
              </>
            ),
          }}
          capabilities={{
            undo: true,
            copyPaste: true,
            statusBar: false,
            density: false,
            fontSize: false,
            contextMenu: true,
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
            onCellClicked,
            onCellEdited,
          }}
        />
        {isParsing ? (
          <div
            className="absolute inset-0 flex items-center justify-center bg-surface/70"
            aria-busy
            aria-live="polite"
          >
            <span className="text-sm text-text-secondary">Parsing spreadsheet…</span>
          </div>
        ) : null}
      </div>
    </Field.Root>
  );
});

export default MarkSheetPasteGrid;
