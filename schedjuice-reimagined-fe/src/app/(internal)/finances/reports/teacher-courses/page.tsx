"use client";

import "@glideapps/glide-data-grid/dist/index.css";

import { encodeQueryData, makePostRequest } from "@/app/client-api/utils";
import { axiosClient } from "@/lib/api";
import {
  courseChipsRenderer,
  findStackedCourseChipIndex,
  measureStackedCourseChips,
} from "@/components/data-sheet/cells/course-chips-cell";
import { CourseSummaryPopover } from "@/components/data-sheet/cells/course-summary-popover";
import { ecUserChipRenderer } from "@/components/data-sheet/cells/excellent-choice-user-chip-cell";
import { DataSheet } from "@/components/data-sheet/data-sheet";
import {
  FilterToolbar,
  FilterToolbarAction,
} from "@/components/filters/filter-toolbar";
import YearMonthSelector from "@/components/form/selectors/year-month-selector";
import { FullscreenToggle } from "@/components/layout/fullscreen-toggle";
import { PageContainer } from "@/components/layout/page-container";
import { SheetFullscreenShell } from "@/components/layout/sheet-fullscreen-shell";
import CopyInput from "@/components/misc/copy-input";
import { Button, Skeleton } from "@/components/primitives";
import { usePageHeader } from "@/components/shell/use-page-header";
import {
  UserSummaryPopover,
  type UserSummaryTarget,
} from "@/components/users/user-summary-card";
import {
  getDateISOString,
  getFirstDayOfMonth,
  getLastDayOfMonth,
} from "@/helpers/date";
import { useContainerHeight } from "@/hooks/use-container-height";
import { useFullscreen } from "@/hooks/use-fullscreen";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import { makeReadOnlyAdapter } from "@/lib/data-sheets/read-only-adapter";
import {
  buildTeacherCoursesColumns,
  teacherCoursesFromRow,
  teacherCoursesRowHeight,
  toTeacherCoursesFieldByColumn,
  toTeacherCoursesGridColumns,
  type TeacherCoursesColumnMeta,
  type TeacherCoursesReportRow,
} from "@/lib/data-sheets/teacher-courses-columns";
import { cn } from "@/lib/utils";
import { ReportStyle } from "@/types/organization";
import {
  GridCellKind,
  type GridCell,
  type GridMouseEventArgs,
  type Item,
} from "@glideapps/glide-data-grid";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { NavArrowLeft } from "iconoir-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { parseAsIsoDateTime, useQueryState } from "nuqs";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

const EMPTY_ROWS: TeacherCoursesReportRow[] = [];

function TeacherCoursesReportPageInner() {
  const router = useRouter();
  const { tenant, isLoading: tenantLoading, isFetching: tenantFetching } = useTenant();
  const { user, isLoading: userLoading } = useUser();
  const { effectiveFullscreen, setAvailability } = useFullscreen();
  const defaultDateParser = useMemo(
    () => parseAsIsoDateTime.withDefault(new Date()),
    [],
  );
  const [monthDate, setMonthDate] = useQueryState("date", defaultDateParser);
  const [userSummaryTarget, setUserSummaryTarget] =
    useState<UserSummaryTarget | null>(null);
  const [courseSummaryTarget, setCourseSummaryTarget] = useState<{
    courseId: number;
    rect: { x: number; y: number; width: number; height: number };
  } | null>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);

  const dateFrom = getDateISOString(getFirstDayOfMonth(monthDate));
  const dateTo = getDateISOString(getLastDayOfMonth(monthDate));
  const rangeLabel = format(monthDate, "MMMM yyyy");

  const allowed = tenant?.report_style === ReportStyle.TR_SU_STYLE;
  const tenantSettled = !tenantLoading && !tenantFetching;

  const dataQuery = useQuery({
    queryKey: ["teacher-courses-report", dateFrom, dateTo],
    queryFn: async () => {
      const res = await axiosClient.get(
        `reports/teacher-courses${encodeQueryData({
          date_from: dateFrom,
          date_to: dateTo,
        })}`,
      );
      const payload = res.data ?? {};
      return {
        rows: (payload.data ?? []) as TeacherCoursesReportRow[],
        columns: (payload.columns ?? []) as TeacherCoursesColumnMeta[],
      };
    },
    enabled: allowed,
  });

  const sheetColumns = useMemo(
    () => buildTeacherCoursesColumns(dataQuery.data?.columns),
    [dataQuery.data?.columns],
  );
  const columns = useMemo(
    () => toTeacherCoursesGridColumns(sheetColumns),
    [sheetColumns],
  );
  const fieldByColumn = useMemo(
    () => toTeacherCoursesFieldByColumn(sheetColumns),
    [sheetColumns],
  );
  const rows = dataQuery.data?.rows ?? EMPTY_ROWS;

  const getCellValue = useCallback(
    (rowIndex: number, field: string) => {
      const row = rows[rowIndex];
      if (!row) return "";
      if (field === "assigned_classes") {
        return row.assigned_classes ?? "";
      }
      const value = row[field as keyof TeacherCoursesReportRow];
      if (typeof value === "string" || typeof value === "number") {
        return String(value);
      }
      return "";
    },
    [rows],
  );

  const adapter = useMemo(
    () =>
      makeReadOnlyAdapter({
        rowCount: rows.length,
        getCellValue,
      }),
    [rows.length, getCellValue],
  );

  const getCellContent = useCallback(
    ([col, row]: Item): GridCell => {
      const field = fieldByColumn[col];
      const rowData = rows[row];
      const value = getCellValue(row, field);

      if (field === "name" && rowData?.user_id) {
        const label = rowData.name || "—";
        return {
          kind: GridCellKind.Custom,
          allowOverlay: false,
          readonly: true,
          copyData: label,
          data: {
            kind: "ec-user-chip-cell",
            userId: rowData.user_id,
            name: label,
            email: rowData.email ?? "",
            label,
          },
        };
      }

      if (field === "assigned_classes") {
        const courses = teacherCoursesFromRow(rowData);
        return {
          kind: GridCellKind.Custom,
          allowOverlay: false,
          readonly: true,
          copyData: value,
          data: {
            kind: "course-chips-cell",
            courses,
            layout: "stack",
          },
        };
      }

      return {
        kind: GridCellKind.Text,
        data: value,
        displayData: value,
        allowOverlay: false,
        readonly: true,
      };
    },
    [fieldByColumn, getCellValue, rows],
  );

  const getRowHeight = useCallback(
    (rowIndex: number) =>
      teacherCoursesRowHeight(teacherCoursesFromRow(rows[rowIndex]).length),
    [rows],
  );

  const onItemHovered = useCallback(
    (args: GridMouseEventArgs) => {
      if (args.kind !== "cell") {
        setUserSummaryTarget(null);
        return;
      }
      const [col, rowIndex] = args.location;
      const field = fieldByColumn[col];
      const rowData = rows[rowIndex];
      if (field !== "name" || !rowData?.user_id || !args.bounds) {
        setUserSummaryTarget(null);
        return;
      }
      setUserSummaryTarget({
        user: {
          id: rowData.user_id,
          name: rowData.name || "Teacher",
          email: rowData.email,
        },
        rect: {
          x: args.bounds.x,
          y: args.bounds.y,
          width: args.bounds.width,
          height: args.bounds.height,
        },
      });
    },
    [fieldByColumn, rows],
  );

  const handleCellClicked = useCallback(
    (
      cell: Item,
      event: {
        localEventY: number;
        bounds: { x: number; y: number; width: number; height: number };
      },
    ) => {
      const [col, row] = cell;
      const field = fieldByColumn[col];
      const rowData = rows[row];
      if (field !== "assigned_classes" || !rowData) return;
      const courses = teacherCoursesFromRow(rowData);
      if (!courses.length) return;
      const chipIndex = findStackedCourseChipIndex(
        courses.length,
        event.localEventY,
        event.bounds.height,
      );
      if (chipIndex < 0) return;
      const segment = measureStackedCourseChips(
        courses.length,
        event.bounds.height,
      )[chipIndex];
      if (!segment) return;
      setCourseSummaryTarget({
        courseId: courses[chipIndex]!.id,
        rect: {
          x: event.bounds.x,
          y: event.bounds.y + segment.start,
          width: event.bounds.width,
          height: segment.height,
        },
      });
    },
    [fieldByColumn, rows],
  );

  const gridHeight = useContainerHeight(gridContainerRef, [
    rows.length,
    dataQuery.isLoading,
  ]);

  const { mutate: downloadExcel, isPending: isDownloading } = useMutation({
    mutationFn: async () => {
      const res = await makePostRequest(
        "reports/teacher-courses",
        { date_from: dateFrom, date_to: dateTo },
        {},
        {},
        { responseType: "blob" },
      );
      return res.data as Blob;
    },
    onSuccess: (blob) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `teacher_courses_${dateFrom}_${dateTo}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    },
  });

  const reportToolbar = useMemo(
    () => (
      <FilterToolbar>
        <YearMonthSelector
          layout="toolbar"
          label="Month"
          date={monthDate}
          setDate={(date) => void setMonthDate(date)}
        />
        <FilterToolbarAction>
          <Button
            onClick={() => downloadExcel()}
            disabled={isDownloading || dataQuery.isLoading}
            isLoading={isDownloading}
          >
            Download Excel
          </Button>
        </FilterToolbarAction>
      </FilterToolbar>
    ),
    [monthDate, setMonthDate, downloadExcel, isDownloading, dataQuery.isLoading],
  );

  usePageHeader(
    useMemo(
      () =>
        allowed
          ? {
              breadcrumb: (
                <h1 className="font-serif text-lg text-text-primary">
                  Teacher Courses
                </h1>
              ),
              toolbar: reportToolbar,
            }
          : null,
      [allowed, reportToolbar],
    ),
  );

  useEffect(() => {
    if (!allowed) return;
    setAvailability({
      enabled: true,
      label: "Teacher Courses report fullscreen",
    });
    return () => setAvailability({ enabled: false });
  }, [allowed, setAvailability]);

  useEffect(() => {
    if (!tenantSettled || userLoading || !user) return;
    if (!allowed) {
      router.replace("/finances/reports");
    }
  }, [tenantSettled, userLoading, user, allowed, router]);

  if (userLoading || !tenantSettled) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Skeleton className="h-10 w-48" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (!allowed) {
    return null;
  }

  const reportSummary =
    dataQuery.isLoading || dataQuery.isError
      ? undefined
      : `${rows.length} class${rows.length === 1 ? "" : "es"} · ${rangeLabel}`;

  const sheetPanel =
    rows.length > 0 ? (
      <div
        className={cn(
          "flex min-h-0 flex-col overflow-hidden",
          effectiveFullscreen ? "h-full flex-1" : "flex-1 rounded-md border",
        )}
      >
        <div ref={gridContainerRef} className="relative min-h-0 flex-1 overflow-hidden">
          <DataSheet
            adapter={adapter}
            columns={columns}
            fieldByColumn={fieldByColumn}
            getCellContent={getCellContent}
            customRenderers={[ecUserChipRenderer, courseChipsRenderer]}
            menus={{ roleLabel: "Teacher Courses Report" }}
            capabilities={{
              undo: false,
              copyPaste: true,
              statusBar: true,
              density: true,
              fontSize: true,
              contextMenu: true,
              gotoRow: true,
              columnResize: true,
            }}
            height={gridHeight}
            fullscreenSlot={
              effectiveFullscreen ? undefined : <FullscreenToggle />
            }
            className={
              effectiveFullscreen ? "h-full rounded-none border-0" : "h-full"
            }
            gridProps={{
              rowHeight: getRowHeight,
              onItemHovered,
              onCellClicked: handleCellClicked,
            }}
          />
          <UserSummaryPopover
            target={userSummaryTarget}
            onClose={() => setUserSummaryTarget(null)}
          />
          <CourseSummaryPopover
            target={courseSummaryTarget}
            onClose={() => setCourseSummaryTarget(null)}
          />
        </div>
      </div>
    ) : null;

  const bodyContent = dataQuery.isLoading ? (
    <Skeleton className="h-64 w-full" aria-busy />
  ) : dataQuery.isError ? (
    <p className="text-sm text-danger" role="alert">
      Failed to load Teacher Courses report. Please try again.
    </p>
  ) : rows.length === 0 ? (
    <p className="rounded-lg border py-4 text-center text-sm text-balance text-text-muted">
      No teacher course assignments overlap this month.
    </p>
  ) : (
    sheetPanel
  );

  if (effectiveFullscreen) {
    return (
      <SheetFullscreenShell
        className="min-h-0 flex-1"
        layout="grid-first"
        title="Teacher Courses"
        summary={reportSummary}
        actions={reportToolbar}
        main={
          rows.length > 0 ? (
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
    <PageContainer width="full" className="flex min-h-[70vh] flex-col gap-4">
      <Link
        href="/finances/reports"
        className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text-primary"
      >
        <NavArrowLeft className="size-4" />
        Back to Reports
      </Link>
      <p className="text-sm text-text-secondary">
        Teacher assignments that overlap the selected month, including teachers
        who left during the month.
      </p>
      <CopyInput label="Share report link" text={window.location.href} />
      {bodyContent}
    </PageContainer>
  );
}

const TeacherCoursesReportPage = () => (
  <Suspense
    fallback={
      <div className="flex min-h-[40vh] items-center justify-center">
        <Skeleton className="h-10 w-48" />
      </div>
    }
  >
    <TeacherCoursesReportPageInner />
  </Suspense>
);

export default TeacherCoursesReportPage;
