"use client";

import "@glideapps/glide-data-grid/dist/index.css";

import { encodeQueryData } from "@/app/client-api/utils";
import { axiosClient } from "@/lib/api";
import { FullscreenToggle } from "@/components/layout/fullscreen-toggle";
import { PageContainer } from "@/components/layout/page-container";
import { usePageHeader } from "@/components/shell/use-page-header";
import {
  SheetFullscreenShell,
} from "@/components/layout/sheet-fullscreen-shell";
import YearMonthSelector from "@/components/form/selectors/year-month-selector";
import { labelChipsRenderer } from "@/components/data-sheet/cells/label-chips-cell";
import {
  courseChipsRenderer,
} from "@/components/data-sheet/cells/course-chips-cell";
import {
  CourseSummaryPopover,
  type CourseSummaryTarget,
} from "@/components/data-sheet/cells/course-summary-popover";
import { DataSheet } from "@/components/data-sheet/data-sheet";
import {
  canAccessCourseDataSheet,
  canAccessStaffShortcuts,
} from "@/helpers/authorization";
import {
  getDateISOString,
  getFirstDayOfMonth,
} from "@/helpers/date";
import { useFullscreen } from "@/hooks/use-fullscreen";
import { useContainerHeight } from "@/hooks/use-container-height";
import { useUser } from "@/hooks/useUser";
import { useTenant } from "@/hooks/useTenant";
import {
  buildCoursePairedDisplayRows,
  type CoursePairedDisplayRow,
} from "@/lib/data-sheets/course-data-paired-layout";
import { formatStudentAtRatio } from "@/lib/data-sheets/format-student-at-ratio";
import { formatCourseSheetDate } from "@/lib/data-sheets/format-course-sheet-date";
import { formatCurrentUnitDisplay } from "@/lib/data-sheets/format-current-unit-display";
import {
  blockHighlightTheme,
  COURSE_BLOCK_HIGHLIGHT_BG,
  computeCourseDataCategoryStats,
  type CourseDataCategoryStats,
  getCourseBlockHighlight,
} from "@/lib/data-sheets/course-data-month-highlight";
import {
  buildCourseDataSheetColumns,
  COURSE_DATA_DIVIDER_BG,
  isCourseDataDividerField,
} from "@/lib/data-sheets/course-data-sheet-columns";
import { precomputeCourseDataRowHeights } from "@/lib/data-sheets/course-data-row-heights";
import { parseTeacherNames } from "@/lib/data-sheets/parse-teacher-names";
import { resolveCourseChipClick } from "@/lib/data-sheets/resolve-course-chip-click";
import { makeReadOnlyAdapter } from "@/lib/data-sheets/read-only-adapter";
import type { CourseDataSheetRow } from "@/types/data-sheets";
import {
  GridCellKind,
  type DrawHeaderCallback,
  type GridCell,
  type GridColumn,
  type Item,
} from "@glideapps/glide-data-grid";
import { useQuery } from "@tanstack/react-query";
import { NavArrowLeft } from "iconoir-react";
import Link from "next/link";
import {
  parseAsBoolean,
  parseAsIsoDateTime,
  parseAsString,
  useQueryState,
} from "nuqs";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from "react";
import { cn } from "@/lib/utils";
import {
  FilterToolbar,
  FilterToolbarAction,
} from "@/components/filters/filter-toolbar";
import { Skeleton, Switch } from "@/components/primitives";

const SUMMARY_BG = "#fef9c3";
const BASE_ROW_HEIGHT = 36;

type FieldRole = "title" | "start" | "end" | "mt" | "at" | "students" | "ratio" | "total" | "unit";

type ParsedField =
  | { kind: "grand" }
  | { kind: "block"; index: number; role: FieldRole };

function parseField(field: string | null): ParsedField | null {
  if (!field || isCourseDataDividerField(field)) return null;
  if (field === "grand_total") return { kind: "grand" };
  const match = /^b(\d+)_(title|start|end|mt|at|students|ratio|total|unit)$/.exec(field);
  if (!match) return null;
  return {
    kind: "block",
    index: Number(match[1]),
    role: match[2] as FieldRole,
  };
}

function courseCellText(
  course: CourseDataSheetRow,
  role: FieldRole,
): string {
  switch (role) {
    case "title":
      return course.title;
    case "start":
      return formatCourseSheetDate(course.start_date);
    case "end":
      return formatCourseSheetDate(course.end_date);
    case "mt":
      return course.main_teachers ?? "";
    case "at":
      return course.assistant_teachers ?? "";
    case "students":
      return course.student_count == null ? "" : String(course.student_count);
    case "ratio":
      return formatStudentAtRatio(
        course.student_count,
        course.assistant_teacher_count,
      );
    case "total":
      return "";
    case "unit":
      return formatCurrentUnitDisplay(
        course.current_unit,
        course.current_unit_updated_at,
      );
    default:
      return "";
  }
}

function cellText(d: CoursePairedDisplayRow, field: string | null): string {
  if (!field) return "";
  const parsed = parseField(field);
  if (!parsed) return "";

  if (parsed.kind === "grand") {
    return d.kind === "summary" ? String(d.grandTotal) : "";
  }

  const { index, role } = parsed;

  if (d.kind === "paired") {
    const course = d.cells[index];
    return course ? courseCellText(course, role) : "";
  }

  if (d.kind === "summary") {
    if (role === "title") return index === 0 ? "Total" : "";
    if (role === "total") return String(d.blockTotals[index] ?? "");
    return "";
  }

  if (d.kind === "other" && index === 0) {
    return courseCellText(d.row, role);
  }

  return "";
}

function cellNumericValue(
  d: CoursePairedDisplayRow,
  field: string | null,
): number | null {
  if (!field) return null;
  const parsed = parseField(field);
  if (!parsed) return null;

  if (parsed.kind === "grand") {
    return d.kind === "summary" ? d.grandTotal : null;
  }

  const { index, role } = parsed;

  if (d.kind === "paired" && role === "students") {
    return d.cells[index]?.student_count ?? null;
  }

  if (d.kind === "summary" && role === "total") {
    return d.blockTotals[index] ?? null;
  }

  if (d.kind === "other" && index === 0 && role === "students") {
    return d.row.student_count ?? null;
  }

  return null;
}

function getCourseForBlock(
  d: CoursePairedDisplayRow,
  blockIndex: number,
): CourseDataSheetRow | undefined {
  if (d.kind === "paired") return d.cells[blockIndex];
  if (d.kind === "other" && blockIndex === 0) return d.row;
  return undefined;
}

function CourseDataLegendBar({ stats }: { stats: CourseDataCategoryStats }) {
  const legendItems = [
    { bg: COURSE_BLOCK_HIGHLIGHT_BG.start, label: "Starts this month" },
    { bg: COURSE_BLOCK_HIGHLIGHT_BG.end, label: "Ends this month" },
    { bg: COURSE_BLOCK_HIGHLIGHT_BG.both, label: "Starts & ends this month" },
  ] as const;

  const aggregateItems = [
    `${stats.totalClasses} ${stats.totalClasses === 1 ? "class" : "classes"}`,
    `${stats.totalStudents} ${stats.totalStudents === 1 ? "student" : "students"}`,
    `${stats.starting} starting`,
    `${stats.ending} ending`,
  ];

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-text-muted">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums">
        {aggregateItems.map((label, index) => (
          <Fragment key={label}>
            {index > 0 ? (
              <span className="text-border" aria-hidden>
                ·
              </span>
            ) : null}
            <span>{label}</span>
          </Fragment>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1">
        {legendItems.map(({ bg, label }) => (
          <span key={label} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block size-3 shrink-0 rounded-sm border border-border/60"
              style={{ backgroundColor: bg }}
              aria-hidden
            />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function CourseDataPage() {
  const { user, isLoading: userLoading } = useUser();
  const {
    tenant,
    isLoading: tenantLoading,
    isFetching: tenantFetching,
  } = useTenant();
  const tenantSettled = !tenantLoading && !tenantFetching;
  const router = useRouter();
  const { effectiveFullscreen, setAvailability } = useFullscreen();

  const defaultDateParser = useMemo(
    () => parseAsIsoDateTime.withDefault(new Date()),
    [],
  );
  const [date, setDate] = useQueryState("date", defaultDateParser);
  const [activeCategory, setActiveCategory] = useQueryState(
    "category",
    parseAsString,
  );
  const [groupByFmHm, setGroupByFmHm] = useQueryState(
    "fmhm",
    parseAsBoolean.withDefault(false),
  );
  const [groupByWdWe, setGroupByWdWe] = useQueryState(
    "wdwe",
    parseAsBoolean.withDefault(true),
  );
  const [summaryTarget, setSummaryTarget] = useState<CourseSummaryTarget | null>(
    null,
  );

  const monthDate = date ?? new Date();
  const firstIso = getDateISOString(getFirstDayOfMonth(monthDate));

  const allowed =
    !!user &&
    canAccessCourseDataSheet(user) &&
    tenant?.course_sheet_template != null;

  useEffect(() => {
    if (!userLoading && user && !canAccessStaffShortcuts(user)) {
      router.replace("/home");
    }
  }, [userLoading, user, router]);

  useEffect(() => {
    if (!tenantSettled || userLoading || !user) return;
    if (!canAccessStaffShortcuts(user)) return;
    if (!canAccessCourseDataSheet(user) || !tenant?.course_sheet_template) {
      router.replace("/shortcuts");
    }
  }, [tenantSettled, userLoading, user, tenant, router]);

  useEffect(() => {
    if (!allowed) return;
    setAvailability({ enabled: true, label: "Course data fullscreen" });
    return () => setAvailability({ enabled: false });
  }, [allowed, setAvailability]);

  const dataQuery = useQuery({
    queryKey: ["course-data-sheet", firstIso],
    queryFn: async () => {
      const res = await axiosClient.get(
        `reports/course-data-sheet${encodeQueryData({ date: firstIso })}`,
      );
      return (res.data?.data ?? []) as CourseDataSheetRow[];
    },
    enabled: allowed,
  });

  const tabs = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of dataQuery.data ?? []) {
      if (!map.has(r.category_name)) {
        map.set(r.category_name, r.category_sort_order);
      }
    }
    return Array.from(map.entries())
      .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
      .map(([name]) => name);
  }, [dataQuery.data]);

  const currentCategory =
    activeCategory && tabs.includes(activeCategory)
      ? activeCategory
      : tabs[0] ?? null;

  useEffect(() => {
    if (tabs.length === 0) return;
    if (activeCategory && tabs.includes(activeCategory)) return;
    void setActiveCategory(tabs[0]);
  }, [tabs, activeCategory, setActiveCategory]);

  const layout = useMemo(() => {
    if (!currentCategory) {
      return { blocks: [], displayRows: [] as CoursePairedDisplayRow[] };
    }
    const rows = (dataQuery.data ?? []).filter(
      (r) => r.category_name === currentCategory,
    );
    return buildCoursePairedDisplayRows(rows, groupByFmHm, groupByWdWe);
  }, [dataQuery.data, currentCategory, groupByFmHm, groupByWdWe]);

  const { blocks, displayRows } = layout;

  const categoryStats = useMemo(() => {
    if (!currentCategory) {
      return computeCourseDataCategoryStats([], monthDate);
    }
    const rows = (dataQuery.data ?? []).filter(
      (r) => r.category_name === currentCategory,
    );
    return computeCourseDataCategoryStats(rows, monthDate);
  }, [dataQuery.data, currentCategory, monthDate]);

  const { cols, centerFields, numericFields } = useMemo(
    () => buildCourseDataSheetColumns(blocks),
    [blocks],
  );

  const columns = useMemo<GridColumn[]>(
    () => cols.map((c) => ({ id: c.id, title: c.title, width: c.width })),
    [cols],
  );
  const fieldByColumn = useMemo(
    () => cols.map((c) => (isCourseDataDividerField(c.id) ? null : c.id)),
    [cols],
  );

  const drawDividerHeader = useCallback<DrawHeaderCallback>((args, draw) => {
    if (!isCourseDataDividerField(args.column.id)) {
      draw();
      return;
    }
    const { ctx, rect } = args;
    ctx.fillStyle = COURSE_DATA_DIVIDER_BG;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  }, []);

  const rowHeights = useMemo(
    () => precomputeCourseDataRowHeights(displayRows, blocks.length, BASE_ROW_HEIGHT),
    [displayRows, blocks.length],
  );

  const getRowHeight = useCallback(
    (rowIndex: number) => rowHeights[rowIndex] ?? BASE_ROW_HEIGHT,
    [rowHeights],
  );

  const getCellContent = useCallback(
    ([col, row]: Item): GridCell => {
      const d = displayRows[row];
      const field = fieldByColumn[col];
      const columnId = cols[col]?.id ?? null;

      if (isCourseDataDividerField(columnId)) {
        return {
          kind: GridCellKind.Text,
          data: "",
          displayData: "",
          allowOverlay: false,
          readonly: true,
          themeOverride: { bgCell: COURSE_DATA_DIVIDER_BG },
        };
      }

      const value = d ? cellText(d, field) : "";
      const isSummary = d?.kind === "summary";
      const parsed = parseField(field);

      let themeOverride: GridCell["themeOverride"];
      if (isSummary) {
        themeOverride = {
          bgCell: SUMMARY_BG,
          textDark: "#0f172a",
          baseFontStyle: "600 13px",
        };
      } else if (parsed?.kind === "block" && d) {
        const course = getCourseForBlock(d, parsed.index);
        const highlight = getCourseBlockHighlight(course, monthDate);
        if (highlight) {
          themeOverride = blockHighlightTheme(highlight);
        }
      }

      if (
        parsed?.kind === "block" &&
        d &&
        !isSummary &&
        (parsed.role === "title" || parsed.role === "mt" || parsed.role === "at")
      ) {
        const course = getCourseForBlock(d, parsed.index);
        if (course) {
          if (parsed.role === "title" && value) {
            return {
              kind: GridCellKind.Custom,
              allowOverlay: false,
              readonly: true,
              copyData: value,
              data: {
                kind: "course-chips-cell",
                courses: [{ id: course.course_id, title: value }],
              },
              themeOverride,
            };
          }
          if (parsed.role === "mt" || parsed.role === "at") {
            const labels = parseTeacherNames(
              parsed.role === "mt"
                ? course.main_teachers
                : course.assistant_teachers,
            );
            if (labels.length > 0) {
              return {
                kind: GridCellKind.Custom,
                allowOverlay: false,
                readonly: true,
                copyData: labels.join(", "),
                data: {
                  kind: "label-chips-cell",
                  labels,
                  layout: "stack",
                },
                themeOverride,
              };
            }
          }
        }
      }

      return {
        kind: GridCellKind.Text,
        data: value,
        displayData: value,
        allowOverlay: false,
        readonly: true,
        contentAlign: field && centerFields.has(field) ? "center" : undefined,
        themeOverride,
      };
    },
    [displayRows, fieldByColumn, centerFields, monthDate, cols],
  );

  const adapter = useMemo(
    () =>
      makeReadOnlyAdapter({
        rowCount: displayRows.length,
        getCellValue: (row, field) => {
          const d = displayRows[row];
          return d ? cellText(d, field) : "";
        },
        getNumericValue: (row, field) => {
          const d = displayRows[row];
          return d ? cellNumericValue(d, field) : null;
        },
      }),
    [displayRows],
  );

  const handleCellClicked = useCallback(
    (
      cell: Item,
      event: {
        localEventX: number;
        bounds: { x: number; y: number; width: number; height: number };
      },
    ) => {
      const [col, row] = cell;
      const field = fieldByColumn[col];
      const d = displayRows[row];
      const courseId = resolveCourseChipClick(d, field);
      if (courseId == null) return;

      setSummaryTarget({
        courseId,
        rect: {
          x: event.bounds.x,
          y: event.bounds.y,
          width: event.bounds.width,
          height: event.bounds.height,
        },
      });
    },
    [fieldByColumn, displayRows],
  );

  const gridContainerRef = useRef<HTMLDivElement>(null);
  const gridHeight = useContainerHeight(gridContainerRef, [
    effectiveFullscreen,
    tabs.length,
    currentCategory,
    displayRows.length,
    groupByFmHm,
    groupByWdWe,
    rowHeights,
  ]);

  const shortcutsBackLink = (
    <Link
      href="/shortcuts"
      className="inline-flex items-center gap-2 text-sm font-medium text-text-muted hover:text-text-primary"
    >
      <NavArrowLeft className="size-4 shrink-0" aria-hidden />
      Shortcuts
    </Link>
  );

  const filterFields = (
    <>
      <FilterToolbarAction>
        <label
          htmlFor="group-by-wdwe"
          className="flex h-10 items-center gap-2"
        >
          <Switch
            id="group-by-wdwe"
            checked={groupByWdWe}
            onCheckedChange={(checked) => void setGroupByWdWe(checked)}
          />
          <span className="whitespace-nowrap text-sm font-normal">
            Group by WD/WE
          </span>
        </label>
      </FilterToolbarAction>
      <FilterToolbarAction>
        <label
          htmlFor="group-by-fmhm"
          className="flex h-10 items-center gap-2"
        >
          <Switch
            id="group-by-fmhm"
            checked={groupByFmHm}
            onCheckedChange={(checked) => void setGroupByFmHm(checked)}
          />
          <span className="whitespace-nowrap text-sm font-normal">
            Group by FM/HM
          </span>
        </label>
      </FilterToolbarAction>
      <YearMonthSelector
        layout="toolbar"
        label="Month"
        date={monthDate}
        setDate={(d) => setDate(d)}
      />
    </>
  );

  const filterToolbarRow = (
    <div className="flex w-full min-w-0 items-end justify-between gap-3">
      <FilterToolbar className="min-w-0 flex-1">{filterFields}</FilterToolbar>
      {!effectiveFullscreen ? <FullscreenToggle prominent /> : null}
    </div>
  );

  const categoryTabs = (
    <div
      className="flex shrink-0 overflow-x-auto border-b bg-surface"
      role="tablist"
      aria-label="Course categories"
    >
      {tabs.map((name) => (
        <button
          key={name}
          type="button"
          role="tab"
          aria-selected={name === currentCategory}
          onClick={() => void setActiveCategory(name)}
          className={cn(
            "shrink-0 border-r px-4 py-2 text-sm transition-colors last:border-r-0",
            name === currentCategory
              ? "font-medium text-text-primary"
              : "text-text-muted hover:bg-surface/60 hover:text-text-primary",
          )}
          style={
            name === currentCategory
              ? { backgroundColor: COURSE_BLOCK_HIGHLIGHT_BG.end }
              : undefined
          }
        >
          {name}
        </button>
      ))}
    </div>
  );

  const sheetPanel =
    tabs.length > 0 ? (
      <div
        className={cn(
          "flex min-h-0 flex-col gap-0 overflow-hidden",
          effectiveFullscreen ? "h-full flex-1" : "flex-1 rounded-md border",
        )}
      >
        {categoryTabs}
        <div className="shrink-0 border-b px-3 py-2">
          <CourseDataLegendBar stats={categoryStats} />
        </div>
        <div ref={gridContainerRef} className="min-h-0 flex-1 overflow-hidden">
          <DataSheet
            adapter={adapter}
            columns={columns}
            fieldByColumn={fieldByColumn}
            getCellContent={getCellContent}
            customRenderers={[courseChipsRenderer, labelChipsRenderer]}
            numericFields={numericFields}
            menus={{ roleLabel: "Course data" }}
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
            className="h-full rounded-none border-0"
            gridProps={{
              rowHeight: getRowHeight,
              drawHeader: drawDividerHeader,
              onCellClicked: handleCellClicked,
            }}
          />
        </div>
        <CourseSummaryPopover
          target={summaryTarget}
          onClose={() => setSummaryTarget(null)}
        />
      </div>
    ) : null;

  usePageHeader(
    useMemo(
      () =>
        user && canAccessStaffShortcuts(user) && allowed
          ? {
              breadcrumb: shortcutsBackLink,
              toolbar: filterToolbarRow,
            }
          : null,
      [
        user,
        allowed,
        groupByFmHm,
        groupByWdWe,
        monthDate,
        setDate,
        setGroupByFmHm,
        setGroupByWdWe,
        effectiveFullscreen,
      ],
    ),
  );

  const bodyContent = dataQuery.isLoading ? (
    <Skeleton className="h-64 w-full" aria-busy />
  ) : dataQuery.isError ? (
    <p className="text-sm text-danger" role="alert">
      Failed to load course data. Please try again.
    </p>
  ) : tabs.length === 0 ? (
    <p className="rounded-lg border py-4 text-center text-sm text-balance text-text-muted">
      No courses overlap this month.
    </p>
  ) : (
    sheetPanel
  );

  if (userLoading || !tenantSettled || (user && !canAccessStaffShortcuts(user))) {
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
        title={shortcutsBackLink}
        actions={filterToolbarRow}
        main={
          tabs.length > 0 ? (
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
    <PageContainer
      width="default"
      className="flex h-full min-h-0 flex-1 max-w-full min-w-0 flex-col"
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {bodyContent}
      </div>
    </PageContainer>
  );
}
