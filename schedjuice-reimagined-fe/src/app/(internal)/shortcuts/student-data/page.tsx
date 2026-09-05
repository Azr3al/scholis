"use client";

import "@glideapps/glide-data-grid/dist/index.css";

import { axiosClient } from "@/lib/api";
import { AttendanceAutosaveStatusBar } from "@/components/attendance/attendance-autosave-status";
import { FullscreenToggle } from "@/components/layout/fullscreen-toggle";
import { PageContainer } from "@/components/layout/page-container";
import { usePageHeader } from "@/components/shell/use-page-header";
import { SheetFullscreenShell } from "@/components/layout/sheet-fullscreen-shell";
import CopyInput from "@/components/misc/copy-input";
import {
  courseChipsRenderer,
  findCourseChipIndex,
  measureCourseChips,
} from "@/components/data-sheet/cells/course-chips-cell";
import {
  CourseSummaryPopover,
  type CourseSummaryTarget,
} from "@/components/data-sheet/cells/course-summary-popover";
import { idPhotoRenderer } from "@/components/data-sheet/cells/id-photo-cell";
import { IdPhotoPanel } from "@/components/data-sheet/cells/id-photo-panel";
import { IdCardsExportButton } from "@/components/data-sheet/id-cards-export-button";
import { DataSheet } from "@/components/data-sheet/data-sheet";
import { fontCellPaddingFor } from "@/components/data-sheet/types";
import { getActiveFontPx } from "@/components/data-sheet/lib/glide-theme";
import {
  ChoiceCellEditor,
  type ChoiceCellEditorTarget,
} from "@/components/import-grid/cell-editors/choice-cell-editor";
import {
  DateCellEditor,
  type DateCellEditorTarget,
} from "@/components/import-grid/cell-editors/date-cell-editor";
import { editorKindForField } from "@/components/import-grid/cell-editors/editor-kind";
import { EntityComboboxList as Combobox } from "@/components/form/entity-combobox-list";
import {
  canAccessStaffShortcuts,
  canAccessStudentDataSheet,
  permissionsFor,
} from "@/helpers/authorization";
import { useStudentDataSheetAutosave } from "@/hooks/use-student-data-sheet-autosave";
import { useIdPhotoUrlCache } from "@/hooks/use-id-photo-url-cache";
import { useSheetIdPhotoLoader } from "@/hooks/use-sheet-id-photo-loader";
import { useFormConfig } from "@/hooks/use-form-config";
import { useFullscreen } from "@/hooks/use-fullscreen";
import { useContainerHeight } from "@/hooks/use-container-height";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import { getStudentDataSheetCellContent } from "@/lib/data-sheets/student-data-sheet-cell";
import { makeStudentDataSheetAdapter } from "@/lib/data-sheets/student-data-sheet-adapter";
import {
  buildStudentDataSheetColumns,
  flattenFormConfigFields,
  formConfigFieldByPath,
  STUDENT_SHEET_READ_ONLY_FIELDS,
  toFieldByColumn,
  toGridColumns,
} from "@/lib/data-sheets/student-data-sheet-columns";
import { makeReadOnlyAdapter } from "@/lib/data-sheets/read-only-adapter";
import {
  formFieldToImportDef,
  studentFieldText,
} from "@/lib/data-sheets/student-data-sheet-field-utils";
import type { StudentDataSheetRow } from "@/types/data-sheets";
import { role } from "@/types/user";
import {
  GridCellKind,
  type EditableGridCell,
  type GridCell,
  type DataEditorRef,
  type Item,
} from "@glideapps/glide-data-grid";
import { useQuery } from "@tanstack/react-query";
import { NavArrowLeft, Search } from "iconoir-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import { cn } from "@/lib/utils";
import { FilterToolbar } from "@/components/filters/filter-toolbar";
import { Input, Skeleton, Spinner, useToast } from "@/components/primitives";

function noMatchMessage(courseId: string, search: string): string {
  const hasCourse = Boolean(courseId);
  const hasSearch = Boolean(search.trim());
  if (hasCourse && hasSearch) {
    return "No students match the selected course and search.";
  }
  if (hasCourse) {
    return "No students are enrolled in the selected course.";
  }
  return `No students match "${search.trim()}".`;
}

function sheetSummary(
  rowCount: number,
  totalCount: number,
  courseId: string,
  search: string,
): string {
  const hasCourse = Boolean(courseId);
  const hasSearch = Boolean(search.trim());
  if (hasCourse || hasSearch) {
    return `${rowCount} matching students`;
  }
  return `${totalCount} current students`;
}

function buildStudentDataSheetParams(q: string, courseId: string): string {
  const params = new URLSearchParams();
  const trimmed = q.trim();
  if (trimmed) params.set("q", trimmed);
  if (courseId) params.set("course_id", courseId);
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

type StudentDataSheetCourseOption = {
  id: number;
  title: string;
};

type StudentDataSheetQueryResult = {
  rows: StudentDataSheetRow[];
  courses: StudentDataSheetCourseOption[];
};

const EMPTY_CUSTOM_DATA: Record<string, unknown> = {};

function normalizeSheetRows(raw: StudentDataSheetRow[]): StudentDataSheetRow[] {
  return raw.map((r) => ({
    ...r,
    custom_data: r.custom_data ?? EMPTY_CUSTOM_DATA,
  }));
}

export default function StudentDataPage() {
  const { user, isLoading: userLoading } = useUser();
  const { tenant } = useTenant();
  const toast = useToast();
  const { effectiveFullscreen, setAvailability } = useFullscreen();
  const router = useRouter();
  const [shareUrl, setShareUrl] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const setDebouncedSearch = useDebouncedCallback(setDebouncedQ, 150);
  const [courseId, setCourseId] = useState("");
  const [summaryTarget, setSummaryTarget] = useState<CourseSummaryTarget | null>(
    null,
  );
  const [photoTarget, setPhotoTarget] = useState<StudentDataSheetRow | null>(
    null,
  );
  const [dateEditorTarget, setDateEditorTarget] =
    useState<DateCellEditorTarget | null>(null);
  const [choiceEditorTarget, setChoiceEditorTarget] =
    useState<ChoiceCellEditorTarget | null>(null);
  const gridRef = useRef<DataEditorRef>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);

  const allowed = user ? canAccessStudentDataSheet(user) : false;
  const canEditSheet = Boolean(
    user && permissionsFor(user).can("user.update"),
  );

  const formConfigQuery = useFormConfig("edit", [role.student], undefined, {
    enabled: allowed,
  });

  const sheetColumns = useMemo(
    () => buildStudentDataSheetColumns(formConfigQuery.data),
    [formConfigQuery.data],
  );
  const configFields = useMemo(
    () => flattenFormConfigFields(formConfigQuery.data),
    [formConfigQuery.data],
  );
  const fieldByPath = useMemo(
    () => formConfigFieldByPath(configFields),
    [configFields],
  );
  const columns = useMemo(() => toGridColumns(sheetColumns), [sheetColumns]);
  const fieldByColumn = useMemo(
    () => toFieldByColumn(sheetColumns),
    [sheetColumns],
  );

  const importFieldDefs = useMemo(
    () => configFields.map(formFieldToImportDef),
    [configFields],
  );

  const importFieldByKey = useMemo(() => {
    const map = new Map<string, (typeof importFieldDefs)[number]>();
    for (const def of importFieldDefs) {
      map.set(def.field_key, def);
    }
    return map;
  }, [importFieldDefs]);

  useEffect(() => {
    setShareUrl(typeof window !== "undefined" ? window.location.href : "");
  }, []);

  useEffect(() => {
    if (!userLoading && user && !canAccessStaffShortcuts(user)) {
      router.replace("/home");
    }
  }, [userLoading, user, router]);

  useEffect(() => {
    if (
      !userLoading &&
      user &&
      canAccessStaffShortcuts(user) &&
      !canAccessStudentDataSheet(user)
    ) {
      router.replace("/shortcuts");
    }
  }, [userLoading, user, router]);

  useEffect(() => {
    if (!allowed) return;
    setAvailability({ enabled: true, label: "Student data fullscreen" });
    return () => setAvailability({ enabled: false });
  }, [allowed, setAvailability]);

  const dataQuery = useQuery({
    queryKey: ["student-data-sheet", debouncedQ, courseId],
    queryFn: async ({ queryKey }) => {
      const [, q, course] = queryKey as [string, string, string];
      const res = await axiosClient.get(
        `reports/student-data-sheet${buildStudentDataSheetParams(q, course)}`,
      );
      const payload = res.data ?? {};
      return {
        rows: normalizeSheetRows(
          (payload.data ?? []) as StudentDataSheetRow[],
        ),
        courses: (payload.courses ?? []) as StudentDataSheetCourseOption[],
      } satisfies StudentDataSheetQueryResult;
    },
    enabled: allowed,
    keepPreviousData: true,
  });

  const isSheetRefetching = dataQuery.isFetching && dataQuery.isPreviousData;

  const [rows, setRows] = useState<StudentDataSheetRow[]>([]);

  // Clear immediately when selecting a course so stale unfiltered rows never linger.
  useEffect(() => {
    if (courseId) setRows([]);
  }, [courseId]);

  useEffect(() => {
    if (!dataQuery.data || dataQuery.isPreviousData) return;
    setRows(dataQuery.data.rows);
  }, [
    dataQuery.data,
    dataQuery.dataUpdatedAt,
    dataQuery.isPreviousData,
    courseId,
    debouncedQ,
  ]);

  const visibleRows = useMemo(() => {
    if (!courseId) return rows;
    const id = Number(courseId);
    if (!Number.isFinite(id)) return rows;
    return rows.filter((r) => r.courses.some((c) => c.id === id));
  }, [rows, courseId]);

  const courseFilterOptions = useMemo(() => {
    return (dataQuery.data?.courses ?? [])
      .slice()
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((course) => ({
        value: String(course.id),
        label: course.title,
      }));
  }, [dataQuery.data?.courses]);

  useEffect(() => {
    if (!dataQuery.isSuccess || courseFilterOptions.length === 0) return;
    if (dataQuery.isPreviousData) return;
    if (
      courseId &&
      !courseFilterOptions.some((option) => option.value === courseId)
    ) {
      setCourseId("");
    }
  }, [
    courseId,
    courseFilterOptions,
    dataQuery.isSuccess,
    dataQuery.isPreviousData,
  ]);

  const hasActiveFilters = Boolean(debouncedQ.trim() || courseId);

  const onValidationError = useCallback(
    (message: string) => {
      toast.add({ title: message });
    },
    [toast],
  );

  const autosave = useStudentDataSheetAutosave({
    enabled: canEditSheet,
    setRows,
    fieldByPath,
    tenant: tenant ?? null,
    queryKey: ["student-data-sheet"],
    onValidationError,
  });

  const livePhotoTarget = useMemo(() => {
    if (!photoTarget) return null;
    return visibleRows.find((r) => r.id === photoTarget.id) ?? photoTarget;
  }, [photoTarget, visibleRows]);

  const idPhotoCache = useIdPhotoUrlCache();
  const loadVisibleIdPhotos = useSheetIdPhotoLoader(visibleRows, idPhotoCache);

  useEffect(() => {
    if (visibleRows.length > 0) {
      loadVisibleIdPhotos({ y: 0, height: 30 });
    }
  }, [visibleRows.length, loadVisibleIdPhotos]);

  const getCellContent = useCallback(
    (cell: Item): GridCell =>
      getStudentDataSheetCellContent(cell, {
        rows: visibleRows,
        fieldByColumn,
        fieldByPath,
        canEdit: canEditSheet,
        errorCells: autosave.errorCells,
        getIdPhotoUrl: (userId) =>
          idPhotoCache.getUrl(userId, "thumb") ?? null,
      }),
    [
      visibleRows,
      fieldByColumn,
      fieldByPath,
      canEditSheet,
      autosave.errorCells,
      idPhotoCache.revision,
      idPhotoCache.getUrl,
    ],
  );

  const editableAdapter = useMemo(
    () =>
      makeStudentDataSheetAdapter({
        rows: visibleRows,
        fieldByPath,
        canEdit: canEditSheet,
        viewer: user ?? null,
        onCellChange: autosave.queueCellSave,
      }),
    [visibleRows, fieldByPath, canEditSheet, user, autosave.queueCellSave],
  );

  const readOnlyAdapter = useMemo(
    () =>
      makeReadOnlyAdapter({
        rowCount: visibleRows.length,
        getCellValue: (row, field) => {
          const r = visibleRows[row];
          return r
            ? studentFieldText(r, field, fieldByPath.get(field))
            : "";
        },
      }),
    [visibleRows, fieldByPath],
  );

  const adapter = canEditSheet ? editableAdapter : readOnlyAdapter;

  const gridHeight = useContainerHeight(gridContainerRef, [
    effectiveFullscreen,
    visibleRows.length,
    search,
    courseId,
    sheetColumns.length,
  ]);

  const searchInput = (
    <div className="relative w-full min-w-[14rem] max-w-sm">
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-muted"
        aria-hidden
      />
      <Input
        type="search"
        placeholder="Search by name, code, or phone…"
        value={search}
        onChange={(e) => {
          const next = e.target.value;
          setSearch(next);
          setDebouncedSearch(next);
        }}
        className="h-9 pl-8 text-sm"
        aria-label="Filter students"
      />
    </div>
  );

  const idCardsDownloadSlot = courseId ? (
    <IdCardsExportButton audience="student" rows={visibleRows} />
  ) : (
    <p className="text-sm text-text-muted">
      Select a course to download ID cards for its students.
    </p>
  );

  const filtersRow = (
    <div className="flex flex-wrap items-center gap-2">
      {searchInput}
      <div className="w-full min-w-[14rem] max-w-sm">
        <span className="sr-only">Course</span>
        <Combobox
          options={courseFilterOptions}
          value={courseId}
          setValue={setCourseId}
          label="Course"
          placeholder="All courses"
          allowDeselect
          triggerClassName="w-full min-w-[14rem] max-w-sm"
        />
      </div>
      {isSheetRefetching ? (
        <Spinner className="size-4 text-text-muted" />
      ) : null}
      {idCardsDownloadSlot}
    </div>
  );

  const handleCellClicked = useCallback(
    (cell: Item, event: { localEventX: number; bounds: { x: number; y: number; height: number } }) => {
      const [col, row] = cell;
      const field = fieldByColumn[col];
      const r = visibleRows[row];
      if (!r) return;

      if (field === "id_photo") {
        setPhotoTarget(r);
        return;
      }

      if (field !== "courses") return;
      if (!r.courses.length) return;

      const padX = fontCellPaddingFor(getActiveFontPx()).cellHorizontalPadding;
      const titles = r.courses.map((c) => c.title);
      const chipIndex = findCourseChipIndex(titles, event.localEventX, padX);
      if (chipIndex < 0) return;

      const layout = measureCourseChips(titles);
      const segment = layout[chipIndex];
      if (!segment) return;

      setSummaryTarget({
        courseId: r.courses[chipIndex]!.id,
        rect: {
          x: event.bounds.x + segment.start + padX,
          y: event.bounds.y,
          width: segment.width,
          height: event.bounds.height,
        },
      });
    },
    [fieldByColumn, visibleRows],
  );

  const commitCellValue = useCallback(
    (rowIndex: number, fieldId: string, value: string, colIndex?: number) => {
      const record = visibleRows[rowIndex];
      if (!record || !canEditSheet) return;
      if (!editableAdapter.isCellEditable(rowIndex, fieldId)) return;
      autosave.queueCellSave(rowIndex, fieldId, value, record);
      const col =
        colIndex ?? fieldByColumn.indexOf(fieldId);
      if (col >= 0) {
        gridRef.current?.updateCells([{ cell: [col, rowIndex] }]);
      }
    },
    [visibleRows, canEditSheet, editableAdapter, autosave, fieldByColumn],
  );

  const onCellEdited = useCallback(
    (cell: Item, newValue: EditableGridCell) => {
      const [col, row] = cell;
      const fieldId = fieldByColumn[col];
      if (!fieldId || STUDENT_SHEET_READ_ONLY_FIELDS.has(fieldId)) return;
      if (!editableAdapter.isCellEditable(row, fieldId)) return;

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

      commitCellValue(row, fieldId, value, col);
    },
    [fieldByColumn, editableAdapter, commitCellValue],
  );

  const onCellActivated = useCallback(
    (
      cell: Item,
      bounds?: {
        x: number;
        y: number;
        width: number;
        height: number;
      } | null,
    ) => {
      if (!canEditSheet || !bounds) return;

      const [col, row] = cell;
      const fieldId = fieldByColumn[col];
      if (!fieldId || STUDENT_SHEET_READ_ONLY_FIELDS.has(fieldId)) return;
      if (!editableAdapter.isCellEditable(row, fieldId)) return;

      const record = visibleRows[row];
      if (!record) return;

      const field = fieldByPath.get(fieldId);
      const lookupKey = fieldId.startsWith("custom_data.")
        ? fieldId.slice("custom_data.".length)
        : fieldId;
      const editorKind = editorKindForField(lookupKey, importFieldByKey);
      const value = studentFieldText(record, fieldId, field);

      if (editorKind === "date") {
        setChoiceEditorTarget(null);
        setDateEditorTarget({
          sourceRow: row,
          field: lookupKey,
          value,
          rect: bounds,
        });
        return;
      }

      if (editorKind === "choice") {
        setDateEditorTarget(null);
        setChoiceEditorTarget({
          sourceRow: row,
          field: lookupKey,
          value,
          rect: bounds,
        });
      }
    },
    [
      canEditSheet,
      fieldByColumn,
      editableAdapter,
      visibleRows,
      fieldByPath,
      importFieldByKey,
    ],
  );

  const statusSlot = canEditSheet ? (
    <AttendanceAutosaveStatusBar
      status={autosave.status}
      lastSavedAt={autosave.lastSavedAt}
      onRetry={autosave.retryNow}
    />
  ) : undefined;

  const sheetPanel =
    visibleRows.length > 0 ? (
      <div
        className={cn(
          "flex min-h-0 flex-col overflow-hidden",
          effectiveFullscreen ? "h-full flex-1" : "flex-1 rounded-md border",
        )}
      >
        <div ref={gridContainerRef} className="min-h-0 flex-1 overflow-hidden">
          <DataSheet
            ref={gridRef}
            adapter={adapter}
            columns={columns}
            fieldByColumn={fieldByColumn}
            getCellContent={getCellContent}
            customRenderers={[courseChipsRenderer, idPhotoRenderer]}
            menus={{ roleLabel: "Student data", statusSlot }}
            capabilities={{
              undo: canEditSheet,
              copyPaste: true,
              statusBar: true,
              density: true,
              fontSize: true,
              contextMenu: true,
              gotoRow: true,
              columnReorder: true,
              columnResize: true,
              sortable: true,
              columnVisibility: true,
            }}
            height={gridHeight}
            fullscreenSlot={effectiveFullscreen ? undefined : <FullscreenToggle />}
            className={
              effectiveFullscreen ? "h-full rounded-none border-0" : "h-full"
            }
            gridProps={{
              freezeColumns: 1,
              onCellClicked: handleCellClicked,
              onCellEdited: canEditSheet ? onCellEdited : undefined,
              onCellActivated: canEditSheet ? onCellActivated : undefined,
              onVisibleRegionChanged: (region) => {
                loadVisibleIdPhotos({ y: region.y, height: region.height });
              },
            }}
          />
        </div>
        {canEditSheet ? (
          <>
            <DateCellEditor
              target={dateEditorTarget}
              fields={importFieldDefs}
              onClose={() => setDateEditorTarget(null)}
              onPick={(sourceRow, field, value) => {
                const fieldId =
                  fieldByPath.has(`custom_data.${field}`)
                    ? `custom_data.${field}`
                    : field;
                commitCellValue(sourceRow, fieldId, value);
                setDateEditorTarget(null);
              }}
            />
            <ChoiceCellEditor
              target={choiceEditorTarget}
              fields={importFieldDefs}
              onClose={() => setChoiceEditorTarget(null)}
              onPick={(sourceRow, field, value) => {
                const fieldId =
                  fieldByPath.has(`custom_data.${field}`)
                    ? `custom_data.${field}`
                    : field;
                commitCellValue(sourceRow, fieldId, value);
                setChoiceEditorTarget(null);
              }}
            />
          </>
        ) : null}
        <CourseSummaryPopover
          target={summaryTarget}
          onClose={() => setSummaryTarget(null)}
        />
        {livePhotoTarget && user ? (
          <IdPhotoPanel
            row={livePhotoTarget}
            user={user}
            onClose={() => setPhotoTarget(null)}
            subjectLabel="student"
            audience="student"
            onIdPhotoCacheInvalidate={idPhotoCache.invalidate}
          />
        ) : null}
      </div>
    ) : null;

  usePageHeader(
    useMemo(
      () =>
        user && canAccessStaffShortcuts(user) && allowed
          ? {
              breadcrumb: (
                <h1 className="font-serif text-lg text-text-primary">
                  Student Data
                </h1>
              ),
              toolbar: (
                <FilterToolbar>
                  {filtersRow}
                </FilterToolbar>
              ),
            }
          : null,
      [
        user,
        allowed,
        search,
        debouncedQ,
        courseId,
        courseFilterOptions,
        isSheetRefetching,
        visibleRows,
      ],
    ),
  );

  const showSheetLoading =
    dataQuery.isLoading ||
    formConfigQuery.isLoading ||
    (Boolean(courseId) && isSheetRefetching);

  const bodyContent = showSheetLoading ? (
    <Skeleton className="h-64 w-full" aria-busy />
  ) : dataQuery.isError ? (
    <p className="text-sm text-danger" role="alert">
      Failed to load student data. Please try again.
    </p>
  ) : !hasActiveFilters && visibleRows.length === 0 ? (
    <p className="rounded-lg border py-4 text-center text-sm text-balance text-text-muted">
      No students with active course assignments.
    </p>
  ) : visibleRows.length === 0 ? (
    <p className="rounded-lg border py-4 text-center text-sm text-balance text-text-muted">
      {noMatchMessage(courseId, debouncedQ)}
    </p>
  ) : (
    sheetPanel
  );

  if (userLoading || (user && !canAccessStaffShortcuts(user))) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Skeleton className="h-10 w-48" />
      </div>
    );
  }

  if (!user) return null;

  if (effectiveFullscreen) {
    return (
      <SheetFullscreenShell
        className="min-h-0 flex-1"
        layout="grid-first"
        title="Student Data"
        summary={
          dataQuery.isLoading || (Boolean(courseId) && isSheetRefetching)
            ? "Loading…"
            : sheetSummary(
                visibleRows.length,
                visibleRows.length,
                courseId,
                debouncedQ,
              )
        }
        actions={filtersRow}
        main={
          visibleRows.length > 0 ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {bodyContent}
            </div>
          ) : (
            bodyContent
          )
        }
      />
    );
  }

  return (
    <PageContainer width="default" className="flex min-h-0 flex-1 max-w-full min-w-0 flex-col gap-4">
      <header className="shrink-0 space-y-2">
        <Link
          href="/shortcuts"
          className="inline-flex w-fit items-center gap-2 text-sm font-medium text-text-muted hover:text-text-primary"
        >
          <NavArrowLeft className="size-4 shrink-0" aria-hidden />
          Shortcuts
        </Link>
        <p className="max-w-2xl text-xs leading-snug text-text-muted sm:text-sm">
          {canEditSheet
            ? "Current students with assigned active courses. Edit profile fields inline; changes save automatically."
            : "Current students with assigned active courses."}
        </p>
      </header>

      <CopyInput
        className="shrink-0 space-y-1.5"
        label="Share this sheet"
        text={shareUrl}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {bodyContent}
      </div>
    </PageContainer>
  );
}
