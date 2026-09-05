"use client";

import { Suspense, useMemo } from "react";
import { Button, Skeleton } from "@/components/primitives";
import { EmptyCopy, EmptyState } from "@/components/primitives/empty";
import { EMPTY_COPY_PRESETS } from "@/components/primitives/empty/empty-copy-presets";
import { PageContainer } from "@/components/layout/page-container";
import { CourseRange } from "@/components/course/course-range";
import { Table, column, type Column } from "@/components/data-table";
import { usePageHeader } from "@/components/shell/use-page-header";
import { AdmissionsCoursesToolbar } from "./admissions-courses-toolbar";
import { useHubFilters } from "@/hooks/academic-hub/use-hub-filters";
import { useHubPrograms } from "@/hooks/academic-hub/use-programs";
import {
  useAdmissionsCourses,
  type AdmissionsCourseRow,
} from "@/hooks/admissions/use-admissions-courses";
import { formatSessionClock } from "@/helpers/date";
import {
  convertTimePatternToUserTimezone,
  convertWeekdayPatternToUserTimezone,
} from "@/helpers/timeslot";
import { formatCurrentUnitDisplay } from "@/lib/data-sheets/format-current-unit-display";
import { useTenant } from "@/hooks/useTenant";
import {
  orgTimeDateFnsPattern,
  resolveTimeDisplayFormat,
} from "@/helpers/time-format";

function headerLabel(label: string) {
  return (
    <span className="text-xs tracking-wider [font-variant:small-caps]">
      {label}
    </span>
  );
}

function formatCourseTime(
  row: AdmissionsCourseRow,
  timezone: string | undefined,
  timeFormat: ReturnType<typeof resolveTimeDisplayFormat>,
): string {
  const weekday = row.weekday_pattern
    ? convertWeekdayPatternToUserTimezone(row.weekday_pattern, timezone)
    : "";
  const clock =
    row.first_event_time_from && row.first_event_time_to
      ? `${formatSessionClock(row.first_event_time_from, timeFormat)} – ${formatSessionClock(row.first_event_time_to, timeFormat)}`
      : row.time_pattern
        ? convertTimePatternToUserTimezone(
            row.time_pattern,
            timezone,
            orgTimeDateFnsPattern(timeFormat),
          )
        : "";
  return [weekday, clock].filter(Boolean).join(" ") || "—";
}

function AdmissionsCoursesPageInner() {
  const filters = useHubFilters();
  const { state } = filters;
  const list = useAdmissionsCourses({ state });
  const programsQuery = useHubPrograms();
  const { tenant } = useTenant();
  const timeFormat = resolveTimeDisplayFormat(tenant?.time_display_format);

  const headerConfig = useMemo(
    () => ({
      breadcrumb: (
        <h1 className="font-serif text-lg text-text-primary">Courses</h1>
      ),
      toolbar: (
        <AdmissionsCoursesToolbar programs={programsQuery.data ?? []} />
      ),
    }),
    [programsQuery.data],
  );
  usePageHeader(headerConfig);

  const columns: Column<AdmissionsCourseRow>[] = useMemo(
    () => [
      column.text({
        id: "title",
        header: headerLabel("Title"),
        accessor: (row) => row.title,
        sizing: { role: "prose" },
        enableSorting: false,
      }),
      {
        id: "dates",
        header: headerLabel("Dates"),
        accessor: (row) => row.start_date,
        sizing: { role: "date" },
        enableSorting: false,
        cell: ({ row }) => (
          <CourseRange startDate={row.start_date} endDate={row.end_date} />
        ),
      },
      column.text({
        id: "time",
        header: headerLabel("Time"),
        accessor: (row) =>
          formatCourseTime(row, tenant?.timezone, timeFormat),
        sizing: { role: "date", tabular: true },
        enableSorting: false,
      }),
      column.text({
        id: "unit",
        header: headerLabel("Most recent unit"),
        accessor: (row) =>
          formatCurrentUnitDisplay(
            row.current_unit,
            row.current_unit_updated_at,
          ) || "—",
        sizing: { role: "numeric", tabular: true },
        enableSorting: false,
      }),
    ],
    [tenant?.timezone, timeFormat],
  );

  const isListPending = list.isLoading || list.isFetching;
  const isEmpty = !isListPending && (list.data?.rows.length ?? 0) === 0;

  return (
    <PageContainer width="full" className="space-y-4 pb-20 pt-4">
      {list.isError ? (
        <p className="text-sm text-text-secondary">Could not load courses.</p>
      ) : isEmpty && state.q ? (
        <EmptyState>
          <EmptyCopy {...EMPTY_COPY_PRESETS.noMatchBase} />
        </EmptyState>
      ) : isEmpty ? (
        <EmptyState>
          <EmptyCopy {...EMPTY_COPY_PRESETS.noCoursesFound} />
        </EmptyState>
      ) : (
        <div aria-busy={isListPending || undefined}>
          <Table
            columns={columns}
            rows={list.data?.rows ?? []}
            getRowId={(row) => String(row.id)}
            bodyMinHeightClassName="min-h-[12rem]"
          />
          {(list.data?.pageCount ?? 1) > 1 && (
            <div className="flex justify-center gap-2 pt-4">
              <Button
                variant="secondary"
                size="sm"
                disabled={isListPending || state.page <= 1}
                onClick={() => filters.setPage(state.page - 1)}
              >
                Previous
              </Button>
              <span className="self-center text-sm text-text-muted">
                Page {state.page} of {list.data?.pageCount ?? 1}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={
                  isListPending || state.page >= (list.data?.pageCount ?? 1)
                }
                onClick={() => filters.setPage(state.page + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}
    </PageContainer>
  );
}

export function AdmissionsCoursesPage() {
  return (
    <Suspense
      fallback={
        <PageContainer width="full" className="space-y-4 pb-20 pt-4" aria-busy="true">
          <Skeleton className="h-8 w-full max-w-sm" />
        </PageContainer>
      }
    >
      <AdmissionsCoursesPageInner />
    </Suspense>
  );
}
