"use client";

import { Spinner } from "@/components/primitives/spinner";
import { makePostRequest } from "@/app/client-api/utils";
import { CourseInsightsFilters } from "@/components/course-insights/course-insights-filters";
import { CourseInsightsTable } from "@/components/course-insights/course-insights-table";
import { PageContainer } from "@/components/layout/page-container";
import { usePageHeader } from "@/components/shell/use-page-header";
import { TableSkeleton } from "@/components/loading/structured-skeletons";
import { Button } from "@/components/primitives";
import { queryParamDefault } from "@/config/defaults";
import { hasSchoolWideCourseAccess, canFixOverlappingSessions } from "@/helpers/authorization";
import { useUser } from "@/hooks/useUser";
import { cn } from "@/lib/utils";
import {
  COURSE_INSIGHTS_ISSUES,
  type CourseInsightsIssue,
  type CourseInsightsSearchBody,
  type CourseInsightsSearchResponse,
} from "@/types/course-insights";
import { useQuery } from "@tanstack/react-query";
import { NavArrowLeft } from "iconoir-react";
import Link from "next/link";
import {
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  useQueryState,
} from "nuqs";
import { Suspense, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";

function parseIssues(values: string[] | null): CourseInsightsIssue[] {
  if (!values?.length) return [];
  return values.filter((value): value is CourseInsightsIssue =>
    (COURSE_INSIGHTS_ISSUES as readonly string[]).includes(value),
  );
}

const CourseInsightsPageInner = () => {
  const router = useRouter();
  const { user, isLoading: userLoading } = useUser();
  const allowed = user ? hasSchoolWideCourseAccess(user) : false;
  const canFixOverlaps = user ? canFixOverlappingSessions(user) : false;

  const [issuesRaw, setIssuesRaw] = useQueryState(
    "issues",
    parseAsArrayOf(parseAsString).withDefault([]),
  );
  const [search, setSearch] = useQueryState("q", parseAsString.withDefault(""));
  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(1));
  const [categoryId, setCategoryId] = useQueryState(
    "category",
    parseAsInteger,
  );

  const selectedIssues = useMemo(() => parseIssues(issuesRaw), [issuesRaw]);

  useEffect(() => {
    if (!userLoading && user && !allowed) {
      router.replace("/home");
    }
  }, [allowed, router, user, userLoading]);

  const searchBody: CourseInsightsSearchBody = useMemo(
    () => ({
      ...(selectedIssues.length ? { issues: selectedIssues } : {}),
      ...(search.trim() ? { q: search.trim() } : {}),
      ...(categoryId != null ? { category_id: categoryId } : {}),
      page,
      size: 25,
    }),
    [page, search, selectedIssues, categoryId],
  );

  const searchQuery = useQuery({
    queryKey: ["courseInsights", searchBody],
    enabled: allowed,
    keepPreviousData: true,
    queryFn: async () => {
      const res = await makePostRequest(
        "courses/insights/search",
        searchBody,
        { ...queryParamDefault, page, size: 25 },
      );
      return res.data as CourseInsightsSearchResponse;
    },
  });

  const isInitialLoading = searchQuery.isLoading && !searchQuery.data;
  const isRefetching = searchQuery.isFetching && !isInitialLoading;

  const summary = searchQuery.data?.data?.summary;
  const rows = searchQuery.data?.data?.results ?? [];
  const totalCount = searchQuery.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / 25));

  const toggleIssue = (issue: CourseInsightsIssue) => {
    void setPage(1);
    void setIssuesRaw((current) => {
      const parsed = parseIssues(current);
      if (parsed.includes(issue)) {
        return parsed.filter((value) => value !== issue);
      }
      return [...parsed, issue];
    });
  };


  usePageHeader(
    useMemo(
      () => ({
        breadcrumb: (
          <h1 className="font-serif text-lg text-text-primary">Course insights</h1>
        ),
      }),
      [],
    ),
  );
  if (userLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner className="h-8 w-8 text-text-muted" />
      </div>
    );
  }

  if (!allowed) {
    return null;
  }

  return (
    <PageContainer width="default" className="space-y-6">
      <Link
        href="/shortcuts"
        className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text-primary"
      >
        <NavArrowLeft className="h-4 w-4" />
        Back to Shortcuts
      </Link>

      <div className="space-y-2">
        <p className="max-w-3xl text-sm text-text-muted">
          Active courses with missing schedule, roster, or recent session
          attendance/check-in data. Select issue chips to filter (courses must
          match all selected issues).
        </p>
      </div>

      <p className="min-h-5 text-sm text-text-muted">
        {summary
          ? `${summary.faulty_courses} of ${summary.total_active_courses} active courses have at least one issue.`
          : "\u00a0"}
      </p>

      <CourseInsightsFilters
        summary={summary}
        selectedIssues={selectedIssues}
        onToggleIssue={toggleIssue}
        search={search}
        onSearchChange={(value) => {
          void setPage(1);
          void setSearch(value);
        }}
        categoryId={categoryId != null ? String(categoryId) : ""}
        onCategoryIdChange={(value) => {
          void setPage(1);
          void setCategoryId(value ? Number(value) : null);
        }}
        isRefetching={isRefetching}
      />

      {searchQuery.isError ? (
        <p className="text-sm text-danger" role="alert">
          Failed to load course insights. Please try again.
        </p>
      ) : isInitialLoading ? (
        <TableSkeleton columns={4} rows={8} />
      ) : (
        <div
          className={cn(
            "transition-opacity",
            isRefetching && "pointer-events-none opacity-60",
          )}
        >
          <CourseInsightsTable rows={rows} canFixOverlaps={canFixOverlaps} />
        </div>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-text-muted">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={page <= 1}
              onClick={() => void setPage(page - 1)}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={page >= totalPages}
              onClick={() => void setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </PageContainer>
  );
};

const CourseInsightsPage = () => (
  <Suspense
    fallback={
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner className="h-8 w-8 text-text-muted" />
      </div>
    }
  >
    <CourseInsightsPageInner />
  </Suspense>
);

export default CourseInsightsPage;
