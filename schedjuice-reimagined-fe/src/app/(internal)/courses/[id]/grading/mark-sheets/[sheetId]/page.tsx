"use client";

import "@glideapps/glide-data-grid/dist/index.css";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import type { DataEditorRef, EditableGridCell, GridCell, Item } from "@glideapps/glide-data-grid";
import { GridCellKind } from "@glideapps/glide-data-grid";
import { NavArrowLeft } from "iconoir-react";

import { DataSheet } from "@/components/data-sheet/data-sheet";
import { FullscreenToggle } from "@/components/layout/fullscreen-toggle";
import { PageContainer } from "@/components/layout/page-container";
import { SheetFullscreenShell } from "@/components/layout/sheet-fullscreen-shell";
import { Skeleton } from "@/components/primitives";
import { formatDate } from "@/helpers/date";
import { useContainerHeight } from "@/hooks/use-container-height";
import { useFullscreen } from "@/hooks/use-fullscreen";
import { usePermissions } from "@/hooks/usePermissions";
import {
  applyLocalMarkSheetCellChange,
  makeMarkSheetAdapter,
} from "@/lib/data-sheets/mark-sheet-adapter";
import {
  buildMarkSheetColumns,
  markSheetFieldByColumn,
} from "@/lib/data-sheets/mark-sheet-columns";
import { getMarkSheetGrid, upsertMarkSheetCells } from "@/lib/mark-sheets-api";
import { cn } from "@/lib/utils";
import type { MarkSheetGrid } from "@/types/mark-sheets";

export default function MarkSheetEditorPage() {
  const { id, sheetId } = useParams<{ id: string; sheetId: string }>();
  const numericSheetId = Number(sheetId);
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canManage = can("grade.manage");
  const {
    effectiveFullscreen,
    isFullscreenAvailable,
    enter,
    setAvailability,
  } = useFullscreen();
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<DataEditorRef>(null);
  const autoEnteredRef = useRef(false);
  const [localGrid, setLocalGrid] = useState<MarkSheetGrid | null>(null);

  const gridQuery = useQuery({
    queryKey: ["mark-sheet-grid", sheetId],
    queryFn: () => getMarkSheetGrid(numericSheetId),
    enabled: Number.isFinite(numericSheetId),
  });

  useEffect(() => {
    if (gridQuery.data) {
      setLocalGrid(gridQuery.data);
    }
  }, [gridQuery.data]);

  const columns = useMemo(
    () => buildMarkSheetColumns(localGrid?.rubric.columns ?? []),
    [localGrid?.rubric.columns],
  );
  const fieldByColumn = useMemo(() => markSheetFieldByColumn(columns), [columns]);

  const saveMutation = useMutation({
    mutationFn: (cells: Array<{ student_id: number; column_key: string; marks: number | null }>) =>
      upsertMarkSheetCells(numericSheetId, cells),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mark-sheet-grid", sheetId] });
      queryClient.invalidateQueries({ queryKey: ["mark-sheets", id] });
    },
  });

  const debouncedSave = useDebouncedCallback(
    (cells: Array<{ student_id: number; column_key: string; marks: number | null }>) => {
      saveMutation.mutate(cells);
    },
    400,
  );

  const onMarksChange = useCallback(
    (columnKey: string, studentId: number, value: string) => {
      setLocalGrid((prev) => {
        if (!prev) return prev;
        const next = applyLocalMarkSheetCellChange(prev, columnKey, studentId, value);
        const trimmed = value.trim();
        const marks =
          trimmed === "" ? null : Number.isFinite(Number(trimmed)) ? Number(trimmed) : null;
        debouncedSave([{ student_id: studentId, column_key: columnKey, marks }]);
        return next;
      });
    },
    [debouncedSave],
  );

  const adapter = useMemo(() => {
    if (!localGrid) return null;
    return makeMarkSheetAdapter({
      grid: localGrid,
      canEdit: canManage,
      onMarksChange,
    });
  }, [localGrid, canManage, onMarksChange]);

  const getCellContent = useCallback(
    ([col, row]: Item): GridCell => {
      if (!adapter) {
        return {
          kind: GridCellKind.Text,
          data: "",
          displayData: "",
          allowOverlay: false,
          readonly: true,
        };
      }
      const field = fieldByColumn[col];
      if (!field) {
        return {
          kind: GridCellKind.Text,
          data: "",
          displayData: "",
          allowOverlay: false,
          readonly: true,
        };
      }
      const value = adapter.getCellValue(row, field);
      const editable = adapter.isCellEditable(row, field);
      return {
        kind: GridCellKind.Text,
        data: value,
        displayData: value,
        allowOverlay: editable,
        readonly: !editable,
      };
    },
    [adapter, fieldByColumn],
  );

  const onCellEdited = useCallback(
    ([col, row]: Item, newValue: EditableGridCell) => {
      if (!adapter || newValue.kind !== GridCellKind.Text) return;
      const field = fieldByColumn[col];
      if (!field) return;
      adapter.setCellValue(row, field, newValue.data);
    },
    [adapter, fieldByColumn],
  );

  const gridHeight = useContainerHeight(gridContainerRef, [
    effectiveFullscreen,
    localGrid,
  ]);

  useEffect(() => {
    setAvailability({
      enabled: Boolean(localGrid),
      label: "Mark sheet fullscreen",
    });
    return () => setAvailability({ enabled: false });
  }, [localGrid, setAvailability]);

  useEffect(() => {
    if (!localGrid || !isFullscreenAvailable || autoEnteredRef.current) return;
    autoEnteredRef.current = true;
    enter();
  }, [localGrid, isFullscreenAvailable, enter]);

  if (gridQuery.isLoading || !localGrid || !adapter) {
    return (
      <PageContainer
        width="full"
        density="dense"
        className="flex min-h-0 flex-1 max-w-full min-w-0 flex-col overflow-hidden"
      >
        <Skeleton className="min-h-0 flex-1 w-full" />
      </PageContainer>
    );
  }

  const sheetSummary = (
    <>
      {localGrid.rubric.title}
      {localGrid.sheet.exam_date
        ? ` · Exam ${formatDate(localGrid.sheet.exam_date, "d.M.yyyy")}`
        : ""}
    </>
  );

  const markSheetsHref = `/courses/${id}/grading/mark-sheets`;

  const gridPanel = (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden",
        effectiveFullscreen ? "h-full flex-1" : "flex-1 rounded-md border",
      )}
    >
      <div ref={gridContainerRef} className="min-h-0 flex-1 overflow-hidden">
        <DataSheet
          ref={gridRef}
          columns={columns}
          fieldByColumn={fieldByColumn}
          adapter={adapter}
          getCellContent={getCellContent}
          menus={{ roleLabel: "Mark sheet" }}
          capabilities={{
            undo: true,
            copyPaste: true,
            statusBar: true,
            density: true,
            fontSize: true,
            contextMenu: true,
            gotoRow: true,
            columnResize: true,
          }}
          height={gridHeight}
          fullscreenSlot={effectiveFullscreen ? undefined : <FullscreenToggle />}
          className={cn(
            "h-full",
            effectiveFullscreen && "rounded-none border-0",
          )}
          gridProps={{
            freezeColumns: 3,
            onCellEdited,
          }}
        />
      </div>
    </div>
  );

  if (effectiveFullscreen) {
    return (
      <SheetFullscreenShell
        layout="grid-first"
        className="min-h-0 flex-1"
        title={
          <span className="flex min-w-0 items-center gap-3">
            <Link
              href={markSheetsHref}
              className="text-muted-foreground inline-flex shrink-0 items-center gap-1.5 text-xs font-normal hover:underline sm:text-sm"
            >
              <NavArrowLeft className="size-4 shrink-0" aria-hidden />
              Mark sheets
            </Link>
            <span className="truncate">{localGrid.sheet.title}</span>
          </span>
        }
        summary={sheetSummary}
        main={
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {gridPanel}
          </div>
        }
      />
    );
  }

  return (
    <PageContainer
      width="full"
      density="dense"
      className="flex min-h-0 flex-1 max-w-full min-w-0 flex-col overflow-hidden"
    >
      <header className="flex shrink-0 items-center gap-3 pb-2">
        <Link
          href={markSheetsHref}
          className="text-muted-foreground inline-flex shrink-0 items-center gap-1.5 text-xs hover:underline sm:text-sm"
        >
          <NavArrowLeft className="size-4 shrink-0" aria-hidden />
          Mark sheets
        </Link>
        <div className="min-w-0 truncate text-sm">
          <span className="font-medium">{localGrid.sheet.title}</span>
          <span className="text-muted-foreground"> · {sheetSummary}</span>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {gridPanel}
      </div>
    </PageContainer>
  );
}
