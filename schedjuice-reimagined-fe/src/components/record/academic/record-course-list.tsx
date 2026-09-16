"use client";
import { Button, Skeleton, buttonVariants } from "@/components/primitives";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import { Search } from "iconoir-react";
import { motion } from "motion/react";
import { canEditUser, userHasRoles } from "@/helpers/authorization";
import { mapUserCourseToRow } from "@/helpers/profile-courses/map-user-course-to-row";
import { mergeSearchWithEnrollments } from "@/helpers/profile-courses/merge-search-with-enrollments";
import { isStaffSubject } from "@/lib/points/visibility";
import type { ProfileCalendarEventLike } from "@/helpers/user-profile";
import type {
  UserCourseListScope,
  UserCourseListStatus,
} from "@/helpers/profile-courses/build-user-course-filter-params";
import { useProfileCourseFilters } from "@/hooks/profile-courses/use-profile-course-filters";
import { useProfileCourseSearch } from "@/hooks/profile-courses/use-profile-course-search";
import { useProfileCourseList } from "@/hooks/profile-courses/use-profile-course-list";
import { useProfileEnrollmentsByCourseIds } from "@/hooks/profile-courses/use-profile-enrollments-by-course-ids";
import { staggerList } from "@/lib/sj/motion";
import { role, type accountType } from "@/types/user";
import { Input } from "@/components/primitives/input";
import { ControlledPagination } from "@/components/users/controlled-pagination";
import { EmptyCopy, EmptyState } from "@/components/primitives/empty";
import { EMPTY_COPY_PRESETS } from "@/components/primitives/empty/empty-copy-presets";
import { cn } from "@/lib/utils";
import { RecordCourseRow, type RecordCourseRowData } from "./record-course-row";
import type { courseType } from "@/types/course";
import type { TimeDisplayFormatValue } from "@/helpers/time-format";

type RecordCourseListRow = RecordCourseRowData & {
  roleSeniority?: string | null;
};

type Props = {
  subjectId: string;
  viewer: accountType;
  subject: accountType;
  calendarEvents: ProfileCalendarEventLike[];
  sessionByCourseId?: Map<number, string>;
  tenantTimezone?: string | null;
  timeDisplayFormat?: TimeDisplayFormatValue;
  viewerTeachingCourseIds: number[];
  hasSharedCourses: boolean;
  enrollmentCounts?: { activeCount: number; totalCount: number };
  countsLoading?: boolean;
  onViewSchedule?: () => void;
};

export function RecordCourseList({
  subjectId,
  viewer,
  subject,
  calendarEvents,
  sessionByCourseId,
  tenantTimezone,
  timeDisplayFormat = "12h",
  viewerTeachingCourseIds,
  hasSharedCourses,
  enrollmentCounts,
  countsLoading = false,
}: Props) {
  const {
    state: urlFilters,
    setQ,
    setPage: setUrlPage,
    clearQ,
  } = useProfileCourseFilters();
  const debouncedQ = urlFilters.q.trim();
  const isSearchMode = debouncedQ.length > 0;

  const setQDebounced = useDebouncedCallback(setQ, 200);
  const [draftQ, setDraftQ] = useState(urlFilters.q);
  useEffect(() => setDraftQ(urlFilters.q), [urlFilters.q]);

  const hasShared = hasSharedCourses;
  const [scopeOverride, setScopeOverride] =
    useState<UserCourseListScope | null>(null);
  const scope: UserCourseListScope =
    scopeOverride ?? (hasShared ? "your" : "all");
  const [statusFilter, setStatusFilter] =
    useState<UserCourseListStatus>("active");
  const [page, setPage] = useState(1);

  const teachingSet = useMemo(
    () => new Set(viewerTeachingCourseIds),
    [viewerTeachingCourseIds],
  );

  const searchQuery = useProfileCourseSearch({
    subjectId,
    q: debouncedQ,
    page: urlFilters.page,
    scope,
    sharedIds: viewerTeachingCourseIds,
    enabled: isSearchMode,
  });

  const searchCourseIds = useMemo(
    () =>
      (searchQuery.data?.rows ?? [])
        .map((c) => c.id)
        .filter((id): id is number => id != null),
    [searchQuery.data?.rows],
  );

  const enrollmentsForSearch = useProfileEnrollmentsByCourseIds(
    subjectId,
    searchCourseIds,
    isSearchMode && searchCourseIds.length > 0,
  );

  const listQuery = useProfileCourseList({
    subjectId,
    page,
    scope,
    status: statusFilter,
    viewerTeachingCourseIds,
    enabled: !isSearchMode,
  });

  const browseRows = useMemo(() => {
    if (!listQuery.data) return [];
    return listQuery.data.rows.flatMap(
      (row: Parameters<typeof mapUserCourseToRow>[0]) => {
        const course = row.course;
        const courseId =
          typeof course === "object" && course != null
            ? (course.id ?? -1)
            : typeof course === "number"
              ? course
              : -1;
        const mapped = mapUserCourseToRow(row, {
          isShared: teachingSet.has(courseId),
          nextSessionLabel: sessionByCourseId?.get(courseId) ?? null,
        });
        return mapped ? [mapped] : [];
      },
    );
  }, [listQuery.data, teachingSet, sessionByCourseId]);

  const searchRowData = useMemo(() => {
    if (!isSearchMode || !searchQuery.data) return [];
    return mergeSearchWithEnrollments({
      courses: searchQuery.data.rows as courseType[],
      enrollments: enrollmentsForSearch.data ?? [],
      sharedIds: viewerTeachingCourseIds,
      calendarEvents,
      tenantTimezone,
      sessionByCourseId,
      timeDisplayFormat,
    });
  }, [
    isSearchMode,
    searchQuery.data,
    enrollmentsForSearch.data,
    viewerTeachingCourseIds,
    calendarEvents,
    tenantTimezone,
    sessionByCourseId,
    timeDisplayFormat,
  ]);

  const displayRowData: RecordCourseListRow[] = isSearchMode
    ? searchRowData
    : browseRows;
  const displayTotalPages = isSearchMode
    ? (searchQuery.data?.totalPages ?? 1)
    : (listQuery.data?.totalPages ?? 1);
  const displayPage = isSearchMode ? urlFilters.page : page;

  useEffect(() => {
    setPage(1);
    setUrlPage(1);
  }, [scope, statusFilter, subjectId, setUrlPage]);

  useEffect(() => {
    if (!isSearchMode && listQuery.data && page > listQuery.data.totalPages) {
      setPage(listQuery.data.totalPages);
    }
  }, [page, listQuery.data, isSearchMode]);

  useEffect(() => {
    if (isSearchMode && urlFilters.page > displayTotalPages) {
      setUrlPage(displayTotalPages);
    }
  }, [urlFilters.page, displayTotalPages, isSearchMode, setUrlPage]);

  const activeCount = enrollmentCounts?.activeCount;
  const totalCount = enrollmentCounts?.totalCount;

  const scopeBlocksSearch = isSearchMode && scope === "your" && !hasShared;
  const scopeBlocksBrowse =
    !isSearchMode && scope === "your" && viewerTeachingCourseIds.length === 0;

  function renderEmptyState() {
    if (isSearchMode) {
      if (scopeBlocksSearch) {
        return (
          <EmptyState
            action={
              <button
                type="button"
                onClick={() => setScopeOverride("all")}
                className="text-sm text-accent hover:underline"
              >
                Show all courses
              </button>
            }
          >
            <EmptyCopy
              enBefore="Not in "
              enHighlight="your"
              enAfter=" classes"
              myBefore="သင်၏ အတန်းများ"
              myHighlight="မပါ"
              myAfter=""
            />
          </EmptyState>
        );
      }

      return (
        <EmptyState
          action={
            <button
              type="button"
              onClick={clearQ}
              className="text-sm text-accent hover:underline"
            >
              Clear search
            </button>
          }
        >
          <EmptyCopy {...EMPTY_COPY_PRESETS.noCoursesFound} />
        </EmptyState>
      );
    }

    if (totalCount === 0) {
      return (
        <EmptyState>
          <EmptyCopy {...EMPTY_COPY_PRESETS.notEnrolled} />
        </EmptyState>
      );
    }

    if (scope === "your" && hasShared) {
      return (
        <EmptyState
          action={
            <button
              type="button"
              onClick={() => setScopeOverride("all")}
              className="text-sm text-accent hover:underline"
            >
              Show all courses
            </button>
          }
        >
          <EmptyCopy
            enBefore="Not in "
            enHighlight="your"
            enAfter=" classes"
            myBefore="သင်၏ အတန်းများ"
            myHighlight="မပါ"
            myAfter=""
          />
        </EmptyState>
      );
    }

    if (statusFilter === "active") {
      return (
        <EmptyState
          action={
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className="text-sm text-accent hover:underline"
            >
              Show all courses
            </button>
          }
        >
          <EmptyCopy
            enBefore="No "
            enHighlight="active"
            enAfter=" classes"
            myBefore=""
            myHighlight="တက်ရောက်နေ"
            myAfter="သော အတန်းမရှိ"
          />
        </EmptyState>
      );
    }

    return (
      <EmptyState>
        <EmptyCopy
          enBefore="No "
          enHighlight="courses"
          enAfter=" to show"
          myBefore="ပြရန် အတန်း "
          myHighlight="မရှိ"
          myAfter="ပါ"
        />
      </EmptyState>
    );
  }

  const listLoading =
    (isSearchMode && searchQuery.isLoading && !searchQuery.data) ||
    (!isSearchMode && listQuery.isLoading && !listQuery.data);

  const showListLoading = listLoading && !scopeBlocksBrowse;
  const hasRows = displayRowData.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex w-full flex-wrap items-center gap-3 text-sm sm:w-auto">
          <div className="relative w-full min-w-52 max-w-xs sm:w-auto">
            <Search
              width={15}
              height={15}
              aria-hidden
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <Input
              aria-label="Search courses"
              placeholder="Search title, code, subject, level, section…"
              value={draftQ}
              onChange={(e) => {
                setDraftQ(e.target.value);
                setQDebounced(e.target.value);
              }}
              className="h-8 w-full pl-8 text-sm sm:w-64"
            />
          </div>
          {hasShared ? (
            <div className="inline-flex gap-1 rounded-md border border-border p-0.5">
              {(["your", "all"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setScopeOverride(value)}
                  className={cn(
                    "rounded px-2.5 py-1 text-sm transition-colors",
                    scope === value
                      ? "bg-surface-active font-medium text-text-primary"
                      : "text-text-muted hover:text-text-primary",
                  )}
                >
                  {value === "your" ? "Your classes" : "All courses"}
                </button>
              ))}
            </div>
          ) : null}
          <div
            className={cn("inline-flex gap-1", isSearchMode && "opacity-50")}
            aria-hidden={isSearchMode}
          >
            {(["active", "all"] as const).map((value) => (
              <button
                key={value}
                type="button"
                disabled={isSearchMode}
                onClick={() => setStatusFilter(value)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs transition-colors",
                  statusFilter === value
                    ? "bg-accent text-accent-foreground"
                    : "bg-surface-hover text-text-secondary hover:text-text-primary",
                  isSearchMode && "cursor-default",
                )}
              >
                {value === "active" ? "Active" : "All"}
              </button>
            ))}
          </div>
        </div>
        {userHasRoles(subject, [role.teacher, role.student]) ? (
          <div className="flex flex-wrap items-center gap-2">
            {isStaffSubject(subject) &&
            (viewer.id === subject.id || canEditUser(viewer, subject.id)) ? (
              <Link
                href={`/users/${subjectId}/teaching-subjects`}
                className={buttonVariants({ variant: "primary", size: "sm" })}
              >
                {viewer.id === subject.id ? "My Subjects" : "Teaching subjects"}
              </Link>
            ) : null}
            <Link
              href={`/users/${subjectId}/assign-courses`}
              className={buttonVariants({ variant: "primary", size: "sm" })}
            >
              Assign courses
            </Link>
          </div>
        ) : null}
      </div>

      <p className="text-xs text-text-muted">
        {isSearchMode ? (
          <>
            {searchQuery.data?.totalCount ?? 0} match
            {(searchQuery.data?.totalCount ?? 0) === 1 ? "" : "es"}
            {searchQuery.data?.usedFallback ? " (showing close matches)" : ""}
          </>
        ) : countsLoading || activeCount == null || totalCount == null ? (
          <>— active · — total</>
        ) : (
          <>
            {activeCount} active · {totalCount} total
          </>
        )}
      </p>

      {searchQuery.isError && isSearchMode ? (
        <div
          className="rounded-md border border-border bg-card p-3 text-sm"
          role="alert"
        >
          <p className="font-medium text-destructive">
            Could not search courses.
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-2"
            onClick={() => void searchQuery.refetch()}
          >
            Retry
          </Button>
        </div>
      ) : null}

      {showListLoading ? (
        <div className="flex flex-col gap-2 py-4" aria-busy="true">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : scopeBlocksBrowse ? (
        renderEmptyState()
      ) : !hasRows ? (
        renderEmptyState()
      ) : (
        <>
          <motion.div
            variants={staggerList}
            initial="hidden"
            animate="show"
            className={cn(
              "flex flex-col gap-2 transition-opacity",
              isSearchMode && searchQuery.isFetching && "opacity-60",
              !isSearchMode && listQuery.isFetching && "opacity-60",
            )}
          >
            {displayRowData.map((row) => (
              <RecordCourseRow key={row.userCourseId} row={row} />
            ))}
          </motion.div>
          <ControlledPagination
            page={displayPage}
            totalPages={displayTotalPages}
            onPageChange={isSearchMode ? setUrlPage : setPage}
            className="pt-2"
          />
        </>
      )}
    </div>
  );
}
