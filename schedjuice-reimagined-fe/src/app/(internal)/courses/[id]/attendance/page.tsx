"use client";

import { PageContainer } from "@/components/layout/page-container";
import { fetchEntity } from "@/app/client-api/utils";
import {
  getCourseAttendanceSummary,
  getMonthlyAttendanceMatrix,
} from "@/app/client-api/attendance-dashboard";
import { AttendanceDashboardToolbar } from "@/components/attendance/attendance-dashboard-toolbar";
import { AttendanceMatrixTable } from "@/components/attendance/attendance-matrix-table";
import { AttendanceMonthlySummaryTable } from "@/components/attendance/attendance-monthly-summary-table";
import { AttendancePerfectList } from "@/components/attendance/attendance-perfect-list";
import { AttendanceSummaryStrip } from "@/components/attendance/attendance-summary-strip";
import { TableSkeleton } from "@/components/loading/structured-skeletons";
import {
  EmptyCopy,
  EmptyState,
  EMPTY_COPY_PRESETS,
} from "@/components/primitives/empty";
import {
  buildCourseMonthOptions,
  derivePerfectAttendanceStudents,
  isViewingCurrentCalendarMonth,
  parseAttendanceMatrix,
  resolveDefaultMonth,
  resolveHighlightSessionDate,
} from "@/helpers/attendance-dashboard";
import { getTodayYmd } from "@/helpers/attendance-marking";
import { formatDate } from "@/helpers/date";
import {
  formatOrgTime,
  resolveTimeDisplayFormat,
} from "@/helpers/time-format";
import {
  canMarkAttendance,
  canViewOwnAttendance,
} from "@/helpers/authorization";
import { useTenant } from "@/hooks/useTenant";
import { useIncludeRemovedStudents } from "@/hooks/use-include-removed-students";
import { useUser } from "@/hooks/useUser";
import { crossfade } from "@/lib/sj/motion";
import type { courseType } from "@/types/course";
import { useQuery } from "@tanstack/react-query";
import { NavArrowLeft } from "iconoir-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQueryState } from "nuqs";
import { useCallback, useEffect, useMemo, useState } from "react";


function filterMatrixBySearch(
  data: string[][],
  students: Array<{ id: number; name: string; is_removed: boolean }>,
  searchTerm: string,
): { matrix: string[][]; students: Array<{ id: number; name: string; is_removed: boolean }> } {
  if (!data.length) return { matrix: data, students: [] };
  const trimmed = searchTerm.trim();
  if (!trimmed) return { matrix: data, students };

  const searchLower = trimmed.toLowerCase();
  const [header, ...body] = data;
  const filteredBody: string[][] = [];
  const filteredStudents: typeof students = [];
  body.forEach((row, index) => {
    const name = String(row[0] ?? "").toLowerCase();
    const id = String(row[1] ?? "");
    if (name.includes(searchLower) || id.includes(searchLower)) {
      filteredBody.push(row);
      if (students[index]) filteredStudents.push(students[index]);
    }
  });

  return { matrix: [header, ...filteredBody], students: filteredStudents };
}

const CourseAttendanceDashboardPage: React.FC = () => {
  const { tenant } = useTenant();
  const { user } = useUser();
  const timeFormat = resolveTimeDisplayFormat(tenant?.time_display_format);
  const { id } = useParams<{ id: string }>();
  const [searchTerm, setSearchTerm] = useState("");
  const [dateRange, setDateRange] = useQueryState("dateRange");
  const [highlightStudentId, setHighlightStudentId] = useState<number | null>(
    null,
  );

  const viewOwnMode = Boolean(
    user && canViewOwnAttendance(user) && !canMarkAttendance(user),
  );

  const { includeRemoved, setIncludeRemoved, canToggle } =
    useIncludeRemovedStudents(id);

  const clearHighlightStudent = useCallback(() => {
    setHighlightStudentId(null);
  }, []);

  const getCourse = useQuery({
    queryKey: ["getCourse", id],
    queryFn: async () => {
      const res = await fetchEntity("courses", Number(id), []);
      const body = res.data as { isError?: boolean; data?: courseType };
      return body.data ?? null;
    },
  });

  const course: courseType | null = getCourse.data ?? null;

  const monthOptions = useMemo(
    () => buildCourseMonthOptions(course?.start_date, course?.end_date),
    [course?.start_date, course?.end_date],
  );

  useEffect(() => {
    if (dateRange != null || !course) return;
    void setDateRange(resolveDefaultMonth(course));
  }, [course, dateRange, setDateRange]);

  useEffect(() => {
    if (!viewOwnMode || dateRange !== "all" || !course) return;
    void setDateRange(resolveDefaultMonth(course));
  }, [viewOwnMode, dateRange, course, setDateRange]);

  const effectiveDateRange =
    dateRange ?? (course ? resolveDefaultMonth(course) : null);

  useEffect(() => {
    setHighlightStudentId(null);
  }, [effectiveDateRange]);

  const getMonthlyAttendance = useQuery({
    queryKey: ["getMonthlyAttendance", id, effectiveDateRange, includeRemoved],
    enabled: Boolean(id && effectiveDateRange && effectiveDateRange !== "all"),
    queryFn: () =>
      getMonthlyAttendanceMatrix(id, effectiveDateRange!, includeRemoved),
  });

  const getCourseSummary = useQuery({
    queryKey: ["getCourseAttendanceSummary", id, includeRemoved],
    enabled: Boolean(id && course && !viewOwnMode),
    queryFn: () => getCourseAttendanceSummary(id, includeRemoved),
  });

  const matrixData: string[][] = getMonthlyAttendance.data?.matrix ?? [];
  const matrixStudents = getMonthlyAttendance.data?.students ?? [];

  const effectiveSearchTerm = viewOwnMode ? "" : searchTerm;

  const { matrix: filteredData, students: filteredStudents } = useMemo(
    () => filterMatrixBySearch(matrixData, matrixStudents, effectiveSearchTerm),
    [matrixData, matrixStudents, effectiveSearchTerm],
  );

  const perfectStudents = useMemo(() => {
    if (!effectiveDateRange || effectiveDateRange === "all") return [];
    const asOfYmd = isViewingCurrentCalendarMonth(effectiveDateRange)
      ? getTodayYmd()
      : null;
    return derivePerfectAttendanceStudents(
      matrixData,
      matrixStudents,
      asOfYmd,
    );
  }, [effectiveDateRange, matrixData, matrixStudents]);

  const highlightDate = useMemo(() => {
    if (!effectiveDateRange || !isViewingCurrentCalendarMonth(effectiveDateRange)) {
      return null;
    }
    const parsed = parseAttendanceMatrix(filteredData);
    if (!parsed) return null;
    return resolveHighlightSessionDate(parsed.sessionHeaders, getTodayYmd());
  }, [effectiveDateRange, filteredData]);

  const loading =
    getCourse.isLoading ||
    (!viewOwnMode && getCourseSummary.isLoading) ||
    (effectiveDateRange !== "all" && getMonthlyAttendance.isLoading);
  const error =
    getCourse.isError ||
    (!viewOwnMode && getCourseSummary.isError) ||
    getMonthlyAttendance.isError;
  const summary = getCourseSummary.data ?? null;
  const viewingAllMonths = !viewOwnMode && effectiveDateRange === "all";
  const hasMatrix = !viewingAllMonths && matrixData.length > 1;
  const showPerfectList = !viewOwnMode && hasMatrix;
  const hasSummaryTable =
    viewingAllMonths && summary != null && summary.students.length > 0;
  const hasAttendanceData = hasMatrix || hasSummaryTable;

  const scheduleMeta =
    course?.first_event_time_from && course?.first_event_time_to
      ? `${formatOrgTime(course.first_event_time_from, timeFormat)} – ${formatOrgTime(course.first_event_time_to, timeFormat)}`
      : null;
  const dateMeta =
    course?.start_date || course?.end_date
      ? `${course.start_date ? formatDate(course.start_date) : "—"} – ${course.end_date ? formatDate(course.end_date) : "—"}`
      : null;

  return (
    <PageContainer width="wide" className="space-y-6">
      <Link
        href={`/courses/${id}`}
        className="inline-flex w-fit items-center gap-2 text-sm text-text-muted hover:text-text-primary"
      >
        <NavArrowLeft width={16} height={16} aria-hidden />
        Back to course
      </Link>

      <header className="space-y-1">
        <h1 className="font-serif text-2xl text-text-primary">
          {viewOwnMode ? "My attendance" : "Attendance"}
        </h1>
        {course ? (
          <>
            <p className="text-sm text-text-secondary">{course.title}</p>
            {scheduleMeta || dateMeta ? (
              <p className="text-sm text-text-muted">
                {[scheduleMeta, dateMeta].filter(Boolean).join(" · ")}
              </p>
            ) : null}
          </>
        ) : null}
      </header>

      {loading ? (
        <div className="space-y-4" aria-busy="true">
          <div className="h-10 w-full max-w-md animate-pulse rounded-md bg-surface-hover" />
          <TableSkeleton columns={6} rows={8} />
        </div>
      ) : error ? (
        <p className="text-sm text-danger" role="alert">
          Failed to load attendance. Please try again.
        </p>
      ) : course && effectiveDateRange ? (
        <>
          {!viewOwnMode ? (
            <AttendanceSummaryStrip
              summary={summary}
              selectedMonthAnchor={viewingAllMonths ? null : effectiveDateRange}
              isLoading={getCourseSummary.isLoading}
            />
          ) : null}
          {showPerfectList ? (
            <AttendancePerfectList
              students={perfectStudents}
              monthKey={effectiveDateRange}
              onSelectStudent={(studentId) => setHighlightStudentId(studentId)}
            />
          ) : null}
          <AttendanceDashboardToolbar
            courseId={id}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            dateRange={effectiveDateRange}
            onDateRangeChange={(value) => void setDateRange(value)}
            months={monthOptions}
            canToggleIncludeRemoved={viewOwnMode ? false : canToggle}
            includeRemoved={includeRemoved}
            onIncludeRemovedChange={setIncludeRemoved}
            showSearch={!viewOwnMode}
            showMarkLink={!viewOwnMode}
            allowAllMonths={!viewOwnMode}
          />
          {hasAttendanceData ? (
            <AnimatePresence mode="wait">
              <motion.div
                key={effectiveDateRange}
                variants={crossfade}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                {viewingAllMonths && summary ? (
                  <AttendanceMonthlySummaryTable
                    summary={summary}
                    searchTerm={searchTerm}
                  />
                ) : (
                  <AttendanceMatrixTable
                    data={filteredData}
                    rowMeta={filteredStudents}
                    dateRange={effectiveDateRange}
                    highlightDate={highlightDate}
                    highlightStudentId={highlightStudentId}
                    onHighlightStudentConsumed={clearHighlightStudent}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          ) : (
            <EmptyState
              action={
                <Link
                  href={`/courses/${id}`}
                  className="text-sm text-accent hover:underline"
                >
                  Set up course schedule
                </Link>
              }
            >
              <EmptyCopy {...EMPTY_COPY_PRESETS.noSessions} />
            </EmptyState>
          )}
        </>
      ) : null}
    </PageContainer>
  );
};

export default CourseAttendanceDashboardPage;
