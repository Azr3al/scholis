"use client";

import { PageContainer } from "@/components/layout/page-container";
import { makePostRequest, searchEntities } from "@/app/client-api/utils";
import { AttendanceGodViewDetailSheet } from "@/components/attendance-god-view/attendance-god-view-detail-sheet";
import { AttendanceGodViewFilters } from "@/components/attendance-god-view/attendance-god-view-filters";
import { AttendanceGodViewSummaryCards } from "@/components/attendance-god-view/attendance-god-view-summary-cards";
import { CourseMarkingGapDetailSheet } from "@/components/attendance-god-view/course-marking-gap-detail-sheet";
import { CourseMarkingGapsTable } from "@/components/attendance-god-view/course-marking-gaps-table";
import { DailyAbsencesTable } from "@/components/attendance-god-view/daily-absences-table";
import { MonthlyStudentSummaryTable } from "@/components/attendance-god-view/monthly-student-summary-table";
import { RiskOverviewTable } from "@/components/attendance-god-view/risk-overview-table";
import { TableSkeleton } from "@/components/loading/structured-skeletons";
import { Button } from "@/components/primitives";
import { TypographyH1 } from "@/components/typography/h1";
import { canAccessAttendanceGodView, godViewDateRangeFilenameSuffix, hasActiveOptionalFilters } from "@/helpers/attendance-god-view";
import {
  isDateRangePreset,
  resolveDateRange,
  type DateRangePreset,
} from "@/helpers/date-range-presets";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";
import { useUser } from "@/hooks/useUser";
import { axiosClient } from "@/lib/api";
import { queryParamDefault } from "@/config/defaults";
import {
  CourseMarkingProblemStatus,
  DailyAttendanceStatusFilter,
  type AttendanceGodViewCourseGapDetailResponse,
  type AttendanceGodViewCourseGapRow,
  type AttendanceGodViewCourseGapSearchResponse,
  type AttendanceGodViewDailyRow,
  type AttendanceGodViewDailySearchResponse,
  type AttendanceGodViewMode,
  type AttendanceGodViewMonthlyDetailResponse,
  type AttendanceGodViewMonthlyRow,
  type AttendanceGodViewMonthlySearchResponse,
  type AttendanceGodViewRow,
  type AttendanceGodViewSearchBody,
  type AttendanceGodViewSearchResponse,
} from "@/types/attendance-god-view";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download } from "iconoir-react";
import {
  parseAsArrayOf,
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  parseAsStringEnum,
  useQueryState,
} from "nuqs";
import { Suspense, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";

function parseMode(value: string | null): AttendanceGodViewMode {
  if (
    value === "monthly_students" ||
    value === "risk" ||
    value === "course_marking_gaps"
  ) {
    return value;
  }
  return "daily_absences";
}

const DAILY_PRESETS = new Set<DateRangePreset>(["today", "custom"]);
const MONTHLY_PRESETS = new Set<DateRangePreset>(["month", "custom"]);
const RISK_PRESETS = new Set<DateRangePreset>([
  "month",
  "last30d",
  "last3m",
  "week",
  "today",
  "custom",
]);
function defaultPresetForMode(mode: AttendanceGodViewMode): DateRangePreset {
  if (mode === "daily_absences" || mode === "course_marking_gaps") return "today";
  if (mode === "monthly_students") return "month";
  return "last30d";
}

function presetForMode(
  mode: AttendanceGodViewMode,
  raw: string | null,
): DateRangePreset {
  const fallback = defaultPresetForMode(mode);
  if (!isDateRangePreset(raw)) return fallback;
  if (mode === "daily_absences" && DAILY_PRESETS.has(raw)) return raw;
  if (mode === "course_marking_gaps" && DAILY_PRESETS.has(raw)) return raw;
  if (mode === "monthly_students" && MONTHLY_PRESETS.has(raw)) return raw;
  if (mode === "risk" && RISK_PRESETS.has(raw)) return raw;
  return fallback;
}

const AttendanceGodViewPageInner = () => {
  const router = useRouter();
  const { user, isLoading: userLoading } = useUser();
  const allowed = user ? canAccessAttendanceGodView(user) : false;

  const [modeRaw, setMode] = useQueryState(
    "mode",
    parseAsString.withDefault("daily_absences"),
  );
  const activeMode = parseMode(modeRaw);

  const [datePresetRaw, setDatePreset] = useQueryState(
    "datePreset",
    parseAsString.withDefault("today"),
  );
  const datePreset = presetForMode(activeMode, datePresetRaw);

  const [dateFrom, setDateFrom] = useQueryState("dateFrom", parseAsString);
  const [dateTo, setDateTo] = useQueryState("dateTo", parseAsString);
  const [courseId, setCourseId] = useQueryState(
    "courseId",
    parseAsString.withDefault(""),
  );
  const [studentId, setStudentId] = useQueryState(
    "studentId",
    parseAsString.withDefault(""),
  );
  // null = all categories (omit from request); [] = none; number[] = subset
  const [categoryIds, setCategoryIds] = useQueryState(
    "categoryIds",
    parseAsArrayOf(parseAsInteger),
  );
  const [programId, setProgramId] = useQueryState(
    "programId",
    parseAsString.withDefault(""),
  );
  const [stalledAfterMarking, setStalledAfterMarking] = useQueryState(
    "stalledAfterMarking",
    parseAsBoolean.withDefault(false),
  );
  const [minRate, setMinRate] = useQueryState(
    "minRate",
    parseAsString.withDefault(""),
  );
  const [maxRate, setMaxRate] = useQueryState(
    "maxRate",
    parseAsString.withDefault(""),
  );
  const [sort, setSort] = useQueryState(
    "sort",
    parseAsString.withDefault("attendance_rate_asc"),
  );
  const [dailyStatusFilter, setDailyStatus] = useQueryState(
    "dailyStatus",
    parseAsStringEnum(Object.values(DailyAttendanceStatusFilter)),
  );
  const [problemStatus, setProblemStatus] = useQueryState(
    "problemStatus",
    parseAsStringEnum(Object.values(CourseMarkingProblemStatus)).withDefault(
      CourseMarkingProblemStatus.Unregistered,
    ),
  );
  const [gapMinRate, setGapMinRate] = useQueryState(
    "gapMinRate",
    parseAsString.withDefault("80"),
  );
  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(1));

  const [detailOpen, setDetailOpen] = useQueryState(
    "detail",
    parseAsString.withDefault(""),
  );
  const [detailStudentId, setDetailStudentId] = useQueryState(
    "detailStudentId",
    parseAsString.withDefault(""),
  );
  const [detailCourseId, setDetailCourseId] = useQueryState(
    "detailCourseId",
    parseAsString.withDefault(""),
  );

  useEffect(() => {
    if (!userLoading && user && !canAccessAttendanceGodView(user)) {
      router.replace("/home");
    }
  }, [userLoading, user, router]);

  const resolvedRange = useMemo(
    () => resolveDateRange(datePreset, dateFrom, dateTo),
    [datePreset, dateFrom, dateTo],
  );

  const effectiveDateFrom = resolvedRange?.start ?? "";
  const effectiveDateTo = resolvedRange?.end ?? "";

  const categoriesQuery = useQuery({
    queryKey: ["godViewCategories"],
    queryFn: () =>
      searchEntities(
        "categories",
        { size: -1, fields: ["id", "name"], sorts: ["name"] },
        { filter_params: [], exclude_params: [] },
      ),
    enabled: allowed,
  });
  const allCategories = useMemo(
    () =>
      ((categoriesQuery.data?.data?.data ?? []) as { id: number; name: string }[]).map(
        (c) => ({ id: c.id, name: c.name }),
      ),
    [categoriesQuery.data],
  );
  const categoriesAllSelected = categoryIds === null;
  const selectedCategories = useMemo(() => {
    if (categoryIds === null) return allCategories;
    if (categoryIds.length === 0) return [];
    const allow = new Set(categoryIds);
    return allCategories.filter((c) => allow.has(c.id));
  }, [categoryIds, allCategories]);

  const searchBody: AttendanceGodViewSearchBody = useMemo(() => {
    const body: AttendanceGodViewSearchBody = {
      mode: activeMode,
      date_from: effectiveDateFrom,
      date_to: effectiveDateTo,
      sort,
    };
    if (courseId) body.course_id = courseId;
    if (studentId) body.student_id = studentId;
    if (categoryIds !== null) {
      body.category_ids = categoryIds;
    }
    if (programId) body.program_id = programId;
    if (minRate && activeMode === "risk") body.min_attendance_rate = minRate;
    if (maxRate && activeMode === "risk") body.max_attendance_rate = maxRate;
    if (activeMode === "daily_absences" && dailyStatusFilter) {
      body.daily_status_filter = dailyStatusFilter;
    }
    if (activeMode === "course_marking_gaps") {
      if (stalledAfterMarking) {
        body.stalled_after_marking = true;
      } else {
        body.problem_status = problemStatus;
        body.min_rate = gapMinRate === "" ? null : gapMinRate;
      }
    }
    return body;
  }, [
    activeMode,
    effectiveDateFrom,
    effectiveDateTo,
    courseId,
    studentId,
    categoryIds,
    programId,
    minRate,
    maxRate,
    sort,
    dailyStatusFilter,
    problemStatus,
    gapMinRate,
    stalledAfterMarking,
  ]);

  const searchQuery = useQuery({
    queryKey: ["attendanceGodView", searchBody, page],
    enabled: allowed && !!resolvedRange,
    queryFn: async () => {
      const res = await makePostRequest(
        "attendances/god-view/search",
        searchBody,
        { ...queryParamDefault, page, size: 25 },
      );
      return res.data;
    },
  });

  const dailyData = searchQuery.data as AttendanceGodViewDailySearchResponse | undefined;
  const courseGapData =
    searchQuery.data as AttendanceGodViewCourseGapSearchResponse | undefined;
  const monthlyData = searchQuery.data as AttendanceGodViewMonthlySearchResponse | undefined;
  const riskData = searchQuery.data as AttendanceGodViewSearchResponse | undefined;

  const dailyRows = dailyData?.data?.results ?? [];
  const courseGapRows = courseGapData?.data?.results ?? [];
  const monthlyRows = monthlyData?.data?.results ?? [];
  const riskRows = riskData?.data?.results ?? [];
  const totalCount = searchQuery.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / 25));

  const optionalFilterParams = useMemo(
    () => ({
      courseId,
      categoryIdsActive: categoryIds !== null,
      programId,
      studentId,
      minRate,
      maxRate,
      sort,
      gapMinRate,
      problemStatus,
      stalledAfterMarking,
    }),
    [
      courseId,
      categoryIds,
      programId,
      studentId,
      minRate,
      maxRate,
      sort,
      gapMinRate,
      problemStatus,
      stalledAfterMarking,
    ],
  );

  const hasActiveFilters = hasActiveOptionalFilters(
    activeMode,
    optionalFilterParams,
  );

  const clearOptionalFilters = () => {
    void setCourseId("");
    void setCategoryIds(null);
    void setProgramId("");
    void setStudentId("");
    void setMinRate("");
    void setMaxRate("");
    void setSort("attendance_rate_asc");
    void setGapMinRate("80");
    void setProblemStatus(CourseMarkingProblemStatus.Unregistered);
    void setStalledAfterMarking(false);
    void setPage(1);
  };

  const detailQuery = useQuery({
    queryKey: [
      "attendanceGodViewDetail",
      activeMode,
      detailStudentId,
      detailCourseId,
      effectiveDateFrom,
      effectiveDateTo,
      problemStatus,
    ],
    enabled:
      allowed &&
      !!resolvedRange &&
      detailOpen === "1" &&
      (activeMode === "course_marking_gaps"
        ? !!detailCourseId
        : !!detailStudentId &&
          (activeMode === "monthly_students" || !!detailCourseId)),
    queryFn: async () => {
      const params = new URLSearchParams({
        date_from: effectiveDateFrom,
        date_to: effectiveDateTo,
      });
      if (activeMode === "course_marking_gaps") {
        params.set("mode", "course_marking_gaps");
        params.set("course_id", detailCourseId);
        params.set("problem_status", problemStatus);
      } else {
        params.set("student_id", detailStudentId);
        if (activeMode === "monthly_students") {
          params.set("mode", "monthly_students");
        } else {
          params.set("course_id", detailCourseId);
        }
      }
      const res = await axiosClient.get(
        `attendances/god-view/details?${params.toString()}`,
      );
      return res.data?.data;
    },
  });

  const exportSummary = useMutation({
    mutationFn: async () => {
      const res = await axiosClient.post(
        `attendances/god-view/search?page=1&size=-1&csv=true`,
        searchBody,
        { responseType: "blob" },
      );
      return res.data as Blob;
    },
    onSuccess: (blob) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        activeMode === "daily_absences"
          ? `attendance-daily-absences-${effectiveDateFrom}.csv`
          : activeMode === "course_marking_gaps"
            ? `attendance-course-marking-gaps-${godViewDateRangeFilenameSuffix(effectiveDateFrom, effectiveDateTo)}.csv`
            : activeMode === "monthly_students"
              ? `attendance-monthly-summary-${effectiveDateFrom.slice(0, 7)}.csv`
              : `attendance-god-view-${effectiveDateFrom}_${effectiveDateTo}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    },
  });

  const exportDetail = useMutation({
    mutationFn: async () => {
      const params = new URLSearchParams({
        date_from: effectiveDateFrom,
        date_to: effectiveDateTo,
        csv: "true",
      });
      if (activeMode === "course_marking_gaps") {
        params.set("mode", "course_marking_gaps");
        params.set("course_id", detailCourseId);
        params.set("problem_status", problemStatus);
      } else {
        params.set("student_id", detailStudentId);
        if (activeMode !== "monthly_students") {
          params.set("course_id", detailCourseId);
        }
      }
      const res = await axiosClient.get(
        `attendances/god-view/details?${params.toString()}`,
        { responseType: "blob" },
      );
      return res.data as Blob;
    },
    onSuccess: (blob) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        activeMode === "course_marking_gaps"
          ? `attendance-course-marking-gaps-detail-${detailCourseId}-${godViewDateRangeFilenameSuffix(effectiveDateFrom, effectiveDateTo)}.csv`
          : activeMode === "monthly_students"
            ? `attendance-monthly-detail-${detailStudentId}.csv`
            : `attendance-detail-${detailStudentId}-${detailCourseId}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    },
  });

  const openCourseGapDetail = (row: AttendanceGodViewCourseGapRow) => {
    setDetailStudentId("");
    setDetailCourseId(String(row.course_id));
    setDetailOpen("1");
  };

  const openDailyDetail = (row: AttendanceGodViewDailyRow) => {
    setDetailStudentId(String(row.student_id));
    setDetailCourseId(String(row.course_id));
    setDetailOpen("1");
  };

  const openMonthlyDetail = (row: AttendanceGodViewMonthlyRow) => {
    setDetailStudentId(String(row.student_id));
    setDetailCourseId("");
    setDetailOpen("1");
  };

  const openRiskDetail = (row: AttendanceGodViewRow) => {
    setDetailStudentId(String(row.student_id));
    setDetailCourseId(String(row.course_id));
    setDetailOpen("1");
  };

  const closeDetail = () => {
    setDetailOpen("");
    setDetailStudentId("");
    setDetailCourseId("");
  };

  const switchMode = (nextMode: AttendanceGodViewMode) => {
    void setMode(nextMode);
    void setDatePreset(defaultPresetForMode(nextMode));
    void setDailyStatus(null);
    if (nextMode === "course_marking_gaps") {
      void setProblemStatus(CourseMarkingProblemStatus.Unregistered);
      void setGapMinRate("80");
    }
    void setPage(1);
    closeDetail();
  };

  const toggleDailyStatusFilter = (filter: DailyAttendanceStatusFilter) => {
    void setDailyStatus(dailyStatusFilter === filter ? null : filter);
    void setPage(1);
  };

  if (userLoading || !user) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
                <div
          role="status"
          aria-label="Loading"
          className="size-8 animate-spin rounded-full border-2 border-border border-t-text-primary motion-reduce:animate-none"
        />
      </div>
    );
  }

  if (!allowed) return null;

  const selectedCourseGapRow = courseGapRows.find(
    (r) => String(r.course_id) === detailCourseId,
  );
  const selectedDailyRow = dailyRows.find(
    (r) =>
      String(r.student_id) === detailStudentId &&
      String(r.course_id) === detailCourseId,
  );
  const selectedMonthlyRow = monthlyRows.find(
    (r) => String(r.student_id) === detailStudentId,
  );
  const selectedRiskRow = riskRows.find(
    (r) =>
      String(r.student_id) === detailStudentId &&
      String(r.course_id) === detailCourseId,
  );

  const detailTitle =
    activeMode === "monthly_students"
      ? selectedMonthlyRow?.student_name ?? "Student"
      : activeMode === "course_marking_gaps"
        ? selectedCourseGapRow?.course_title ?? "Course"
        : activeMode === "daily_absences"
          ? `${selectedDailyRow?.student_name ?? "Student"} - ${selectedDailyRow?.course_title ?? "Course"}`
          : `${selectedRiskRow?.student_name ?? "Student"} - ${selectedRiskRow?.course_title ?? "Course"}`;

  const monthlyDetail = detailQuery.data as
    | AttendanceGodViewMonthlyDetailResponse
    | undefined;
  const courseGapDetail = detailQuery.data as
    | AttendanceGodViewCourseGapDetailResponse
    | undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <TypographyH1>Attendance Overview</TypographyH1>
          <p className="text-sm text-text-muted">
            See who is absent today, find courses with marking gaps, review
            monthly attendance patterns, and scan at-risk student-course pairs.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={exportSummary.isPending || searchQuery.isFetching}
            onClick={() => exportSummary.mutate()}
          >
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["daily_absences", "Daily absences"],
            ["course_marking_gaps", "Course marking gaps"],
            ["monthly_students", "Monthly student summary"],
            ["risk", "Risk overview"],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            variant={activeMode === value ? "primary" : "secondary"}
            size="sm"
            onClick={() => switchMode(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      {activeMode === "daily_absences" ? (
        <AttendanceGodViewSummaryCards
          mode="daily_absences"
          summary={dailyData?.data?.summary}
          isLoading={searchQuery.isLoading}
          activeStatusFilter={dailyStatusFilter}
          onStatusFilterChange={toggleDailyStatusFilter}
        />
      ) : activeMode === "monthly_students" ? (
        <AttendanceGodViewSummaryCards
          mode="monthly_students"
          summary={monthlyData?.data?.summary}
          isLoading={searchQuery.isLoading}
        />
      ) : (
        <AttendanceGodViewSummaryCards
          mode="risk"
          summary={riskData?.data?.summary}
          isLoading={searchQuery.isLoading}
        />
      )}

      <div className="space-y-3 border-b border-border pb-4">
        <div className="flex flex-row items-center justify-between space-y-0">
          <h2 className="text-base font-medium text-text-primary">Filters</h2>
          {hasActiveFilters ? (
            <Button variant="ghost" size="sm" onClick={clearOptionalFilters}>
              Clear filters
            </Button>
          ) : null}
        </div>
        <div>
          <AttendanceGodViewFilters
            mode={activeMode}
            datePreset={datePreset}
            onDatePresetChange={(p) => void setDatePreset(p)}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFromChange={(v) => void setDateFrom(v)}
            onDateToChange={(v) => void setDateTo(v)}
            resolvedRange={resolvedRange}
            courseId={courseId}
            onCourseIdChange={(v) => void setCourseId(v)}
            studentId={studentId}
            onStudentIdChange={(v) => void setStudentId(v)}
            categoryEntities={allCategories}
            selectedCategories={selectedCategories}
            categoriesAllSelected={categoriesAllSelected}
            onSelectedCategoriesChange={(entities) => {
              if (
                allCategories.length > 0 &&
                entities.length === allCategories.length
              ) {
                void setCategoryIds(null);
                return;
              }
              void setCategoryIds(entities.map((e) => e.id));
            }}
            programId={programId}
            onProgramIdChange={(v) => void setProgramId(v)}
            minRate={minRate}
            onMinRateChange={(v) => void setMinRate(v)}
            maxRate={maxRate}
            onMaxRateChange={(v) => void setMaxRate(v)}
            sort={sort}
            onSortChange={(v) => void setSort(v)}
            problemStatus={problemStatus}
            onProblemStatusChange={(v) => void setProblemStatus(v)}
            gapMinRate={gapMinRate}
            onGapMinRateChange={(v) => void setGapMinRate(v)}
            stalledAfterMarking={stalledAfterMarking}
            onStalledAfterMarkingChange={(value) => {
              void setStalledAfterMarking(value);
              if (!value) {
                void setProblemStatus(CourseMarkingProblemStatus.Unregistered);
                void setGapMinRate("80");
              }
            }}
            onPageReset={() => void setPage(1)}
          />
        </div>
      </div>

      <div className="space-y-3 border-b border-border pb-4">
        <div>
          {searchQuery.isLoading ? (
            <TableSkeleton
              columns={
                activeMode === "daily_absences"
                  ? 7
                  : activeMode === "course_marking_gaps"
                    ? 7
                    : 5
              }
              rows={6}
              showPagination
            />
          ) : searchQuery.isError ? (
            <div
              className="flex flex-col items-center gap-3 py-8 text-center"
              role="alert"
            >
              <p className="text-danger text-sm max-w-md">
                {parseSchedjuiceApiError(
                  searchQuery.error,
                  "Failed to load attendance overview.",
                )}
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void searchQuery.refetch()}
              >
                Retry
              </Button>
            </div>
          ) : (
            <>
              {activeMode === "daily_absences" ? (
                <DailyAbsencesTable
                  rows={dailyRows}
                  statusFilter={dailyStatusFilter}
                  summary={dailyData?.data?.summary}
                  hasActiveFilters={hasActiveFilters}
                  onClearFilters={clearOptionalFilters}
                  onOpenDetail={openDailyDetail}
                />
              ) : activeMode === "course_marking_gaps" ? (
                <CourseMarkingGapsTable
                  rows={courseGapRows}
                  gapMinRate={gapMinRate}
                  problemStatus={problemStatus}
                  stalledAfterMarking={stalledAfterMarking}
                  summary={courseGapData?.data?.summary}
                  hasActiveFilters={hasActiveFilters}
                  onClearFilters={clearOptionalFilters}
                  onOpenDetail={openCourseGapDetail}
                />
              ) : activeMode === "monthly_students" ? (
                <MonthlyStudentSummaryTable
                  rows={monthlyRows}
                  hasActiveFilters={hasActiveFilters}
                  onClearFilters={clearOptionalFilters}
                  onOpenDetail={openMonthlyDetail}
                />
              ) : (
                <RiskOverviewTable
                  rows={riskRows}
                  hasActiveFilters={hasActiveFilters}
                  onClearFilters={clearOptionalFilters}
                  onOpenDetail={openRiskDetail}
                />
              )}
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-text-muted">
                  {totalCount} result{totalCount === 1 ? "" : "s"}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                  >
                    Previous
                  </Button>
                  <span className="flex items-center text-sm tabular-nums">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <CourseMarkingGapDetailSheet
        open={activeMode === "course_marking_gaps" && detailOpen === "1"}
        onClose={closeDetail}
        courseRow={selectedCourseGapRow}
        records={courseGapDetail?.records}
        isLoading={detailQuery.isLoading}
        isError={detailQuery.isError}
        error={detailQuery.error}
        onExport={() => exportDetail.mutate()}
        exportPending={exportDetail.isPending}
      />

      <AttendanceGodViewDetailSheet
        open={
          detailOpen === "1" && activeMode !== "course_marking_gaps"
        }
        onClose={closeDetail}
        mode={activeMode}
        title={detailTitle}
        isLoading={detailQuery.isLoading}
        isError={detailQuery.isError}
        error={detailQuery.error}
        courseDetailRecords={
          activeMode !== "monthly_students" ? detailQuery.data?.records : undefined
        }
        monthlyDetail={activeMode === "monthly_students" ? monthlyDetail : undefined}
        onExport={
          activeMode !== "monthly_students" &&
          activeMode !== "course_marking_gaps" &&
          detailCourseId
            ? () => exportDetail.mutate()
            : undefined
        }
        exportPending={exportDetail.isPending}
        selectedDailyRow={selectedDailyRow}
        selectedMonthlyRow={selectedMonthlyRow}
        selectedRiskRow={selectedRiskRow}
      />
    </div>
  );
};

export default function AttendanceGodViewPage() {
  return (
    <PageContainer width="full">
      <Suspense
        fallback={
          <div className="flex min-h-[40vh] items-center justify-center">
                    <div
          role="status"
          aria-label="Loading"
          className="size-8 animate-spin rounded-full border-2 border-border border-t-text-primary motion-reduce:animate-none"
        />
          </div>
        }
      >
        <AttendanceGodViewPageInner />
      </Suspense>
    </PageContainer>
  );
}
