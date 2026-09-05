"use client";

import { makePostRequest } from "@/app/client-api/utils";
import { PageContainer } from "@/components/layout/page-container";
import { SubmissionTrackerDetailSheet } from "@/components/submission-tracker/submission-tracker-detail-sheet";
import { SubmissionTrackerFilters } from "@/components/submission-tracker/submission-tracker-filters";
import { SubmissionTrackerSummaryCards } from "@/components/submission-tracker/submission-tracker-summary-cards";
import { SubmissionTrackerTable } from "@/components/submission-tracker/submission-tracker-table";
import { TypographyH1 } from "@/components/typography/h1";
import { TableSkeleton } from "@/components/loading/structured-skeletons";
import { Button } from "@/components/primitives";
import { queryParamDefault } from "@/config/defaults";
import { resolveDateRange } from "@/helpers/date-range-presets";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";
import {
  canAccessSubmissionTracker,
  presetForSubmissionTracker,
  SUBMISSION_TRACKER_MIN_MISSED_DEFAULT,
  SUBMISSION_TRACKER_PAGE_SIZE,
} from "@/helpers/submission-tracker";
import { useUser } from "@/hooks/useUser";
import {
  SubmissionTrackerSort,
  type SubmissionTrackerDetailItem,
  type SubmissionTrackerDetailResponse,
  type SubmissionTrackerRow,
  type SubmissionTrackerSearchBody,
  type SubmissionTrackerSearchResponse,
} from "@/types/submission-tracker";
import { useQuery } from "@tanstack/react-query";
import { parseAsInteger, parseAsString, useQueryState } from "nuqs";
import { Suspense, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";

const SubmissionTrackerPageInner = () => {
  const router = useRouter();
  const { user, isLoading: userLoading } = useUser();
  const allowed = user ? canAccessSubmissionTracker(user) : false;

  const [datePresetRaw, setDatePreset] = useQueryState(
    "datePreset",
    parseAsString.withDefault("last30d"),
  );
  const datePreset = presetForSubmissionTracker(datePresetRaw);

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
  const [activeCoursesOnlyRaw, setActiveCoursesOnly] = useQueryState(
    "activeCoursesOnly",
    parseAsString.withDefault("false"),
  );
  const [showAllRaw, setShowAll] = useQueryState(
    "showAll",
    parseAsString.withDefault("false"),
  );
  const [sort, setSort] = useQueryState(
    "sort",
    parseAsString.withDefault(SubmissionTrackerSort.MissedCountDesc),
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
    if (!userLoading && user && !canAccessSubmissionTracker(user)) {
      router.replace("/home");
    }
  }, [userLoading, user, router]);

  const resolvedRange = useMemo(
    () => resolveDateRange(datePreset, dateFrom, dateTo),
    [datePreset, dateFrom, dateTo],
  );

  const effectiveDateFrom = resolvedRange?.start ?? "";
  const effectiveDateTo = resolvedRange?.end ?? "";
  const activeCoursesOnly = activeCoursesOnlyRaw === "true";
  const showAll = showAllRaw === "true";

  const searchBody: SubmissionTrackerSearchBody = useMemo(() => {
    const body: SubmissionTrackerSearchBody = {
      date_from: effectiveDateFrom,
      date_to: effectiveDateTo,
      active_courses_only: activeCoursesOnly,
      show_all: showAll,
      min_missed_count: SUBMISSION_TRACKER_MIN_MISSED_DEFAULT,
      sort,
    };
    if (courseId) body.course_id = courseId;
    if (studentId) body.student_id = studentId;
    return body;
  }, [
    effectiveDateFrom,
    effectiveDateTo,
    activeCoursesOnly,
    showAll,
    sort,
    courseId,
    studentId,
  ]);

  const searchQuery = useQuery({
    queryKey: ["submissionTracker", searchBody, page],
    enabled: allowed && !!resolvedRange,
    queryFn: async () => {
      const res = await makePostRequest(
        "assessments/submission-tracker/search",
        searchBody,
        { ...queryParamDefault, page, size: SUBMISSION_TRACKER_PAGE_SIZE },
      );
      return res.data as SubmissionTrackerSearchResponse;
    },
  });

  const rows = searchQuery.data?.data?.results ?? [];
  const summary = searchQuery.data?.data?.summary;
  const totalCount = searchQuery.data?.count ?? 0;
  const totalPages = Math.max(
    1,
    Math.ceil(totalCount / SUBMISSION_TRACKER_PAGE_SIZE),
  );

  const detailQuery = useQuery({
    queryKey: [
      "submissionTrackerDetail",
      detailStudentId,
      detailCourseId,
      effectiveDateFrom,
      effectiveDateTo,
    ],
    enabled:
      allowed &&
      !!resolvedRange &&
      detailOpen === "1" &&
      !!detailStudentId &&
      !!detailCourseId,
    queryFn: async () => {
      const res = await makePostRequest(
        "assessments/submission-tracker/detail",
        {
          student_id: detailStudentId,
          course_id: detailCourseId,
          date_from: effectiveDateFrom,
          date_to: effectiveDateTo,
        },
        queryParamDefault,
      );
      return res.data as SubmissionTrackerDetailResponse;
    },
  });

  const detailItems: SubmissionTrackerDetailItem[] =
    detailQuery.data?.data?.items ?? [];

  const selectedRow =
    rows.find(
      (row) =>
        String(row.student_id) === detailStudentId &&
        String(row.course_id) === detailCourseId,
    ) ?? null;

  const openDetail = (row: SubmissionTrackerRow) => {
    setDetailStudentId(String(row.student_id));
    setDetailCourseId(String(row.course_id));
    setDetailOpen("1");
  };

  const closeDetail = () => {
    setDetailOpen("");
    setDetailStudentId("");
    setDetailCourseId("");
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

  return (
    <div className="space-y-4">
      <div>
        <TypographyH1>Submission Tracker</TypographyH1>
        <p className="text-text-muted text-sm">
          Students who have missed several assessments in a course — for parent
          follow-up.
        </p>
      </div>

      <div className="space-y-3 border-b border-border pb-4">
        <h2 className="text-base font-medium text-text-primary">Filters</h2>
        <div>
          <SubmissionTrackerFilters
            datePreset={datePreset}
            onDatePresetChange={(v) => void setDatePreset(v)}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFromChange={(v) => void setDateFrom(v)}
            onDateToChange={(v) => void setDateTo(v)}
            resolvedRange={resolvedRange}
            courseId={courseId}
            onCourseIdChange={(v) => void setCourseId(v)}
            studentId={studentId}
            onStudentIdChange={(v) => void setStudentId(v)}
            activeCoursesOnly={activeCoursesOnly}
            onActiveCoursesOnlyChange={(v) =>
              void setActiveCoursesOnly(v ? "true" : "false")
            }
            showAll={showAll}
            onShowAllChange={(v) => void setShowAll(v ? "true" : "false")}
            sort={sort}
            onSortChange={(v) => void setSort(v)}
            onPageReset={() => void setPage(1)}
          />
        </div>
      </div>

      <SubmissionTrackerSummaryCards
        summary={summary}
        isLoading={searchQuery.isLoading}
      />

      <div className="space-y-3 border-b border-border pb-4" aria-busy={searchQuery.isFetching}>
        <h2 className="text-base font-medium text-text-primary">
            {showAll
              ? "All students with missed assessments"
              : `Students with ${SUBMISSION_TRACKER_MIN_MISSED_DEFAULT} or more missed assessments`}
        </h2>
        <div>
          {searchQuery.isLoading ? (
            <TableSkeleton columns={5} rows={6} showPagination />
          ) : searchQuery.isError ? (
            <div className="space-y-2">
              <p className="text-danger text-sm" role="alert">
                {parseSchedjuiceApiError(searchQuery.error)}
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
              <SubmissionTrackerTable rows={rows} onOpenDetail={openDetail} />
              <div className="mt-4 flex items-center justify-between">
                <p className="text-text-muted text-sm">
                  {totalCount} result{totalCount === 1 ? "" : "s"}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => void setPage(page - 1)}
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
                    onClick={() => void setPage(page + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <SubmissionTrackerDetailSheet
        open={detailOpen === "1"}
        onClose={closeDetail}
        row={selectedRow}
        items={detailItems}
        isLoading={detailQuery.isLoading}
        isError={detailQuery.isError}
        error={detailQuery.error}
      />
    </div>
  );
};

export default function SubmissionTrackerPage() {
  return (
    <PageContainer>
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
        <SubmissionTrackerPageInner />
      </Suspense>
    </PageContainer>
  );
}
