"use client";

import { PageContainer } from "@/components/layout/page-container";
import { usePageHeader } from "@/components/shell/use-page-header";
import { useMemo } from "react";
import Link from "next/link";
import {
  parseAsInteger,
  parseAsString,
  useQueryStates,
} from "nuqs";
import { useCourseSearch } from "@/hooks/course-search/use-course-search";
import { AcademicHubCourseCard } from "@/components/academic-hub/course-card";
import { Skeleton } from "@/components/primitives";
import { Button } from "@/components/primitives";
import { Input } from "@/components/primitives";
import { HUB_STATUS_VALUES } from "@/types/academic-hub";
import { EmptyCopy, EmptyState } from "@/components/primitives/empty";
import { EMPTY_COPY_PRESETS } from "@/components/primitives/empty/empty-copy-presets";
import {
  globalRoutePageWidth,
  resolveGlobalRouteLayout,
} from "@/lib/ui-remediation/r6-global-route-classes";

const PAGE_WIDTH = globalRoutePageWidth(
  resolveGlobalRouteLayout("/(internal)/search"),
);

function SearchPagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-2 pt-4">
      <Button
        variant="secondary"
        size="sm"
        className="w-auto min-w-[8rem]"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        Previous
      </Button>
      <span className="text-sm text-text-muted">
        Page {page} of {totalPages}
      </span>
      <Button
        variant="secondary"
        size="sm"
        className="w-auto min-w-[8rem]"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        Next
      </Button>
    </div>
  );
}

export default function SearchPage() {
  const [params, setParams] = useQueryStates(
    {
      q: parseAsString.withDefault(""),
      page: parseAsInteger.withDefault(1),
    },
    { history: "replace" },
  );

  const q = params.q ?? "";
  const page = params.page ?? 1;
  const { data, isLoading, isFetching } = useCourseSearch(q, page);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / 20)) : 1;
  const hasQuery = Boolean(q.trim());

  const headerConfig = useMemo(() => {
    if (!hasQuery) return null;
    return {
      breadcrumb: (
        <h1 className="truncate font-serif text-lg text-text-primary">
          {`Results for “${q}”`}
        </h1>
      ),
      toolbarSecondary: data ? (
        <span className="text-sm text-text-muted">
          {data.total} match{data.total === 1 ? "" : "es"}
          {data.used_fallback ? " (showing close matches)" : ""}
        </span>
      ) : undefined,
    };
  }, [hasQuery, q, data]);
  usePageHeader(headerConfig);

  if (!hasQuery) {
    return (
      <PageContainer width={PAGE_WIDTH} className="space-y-4">
        <div className="space-y-1">
          <h1 className="font-serif text-lg text-text-primary">Search courses</h1>
          <p className="text-sm text-text-muted">
            Enter at least two characters to search.
          </p>
        </div>
        <Input
          className="w-full"
          placeholder="Search courses…"
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.currentTarget.value.trim().length >= 2) {
              setParams({ q: e.currentTarget.value.trim(), page: 1 });
            }
          }}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer width={PAGE_WIDTH} className="space-y-4">
      <div aria-live="polite" className="sr-only">
        {data ? `${data.total} results` : ""}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-52 w-full rounded-xl" />
          ))}
        </div>
      ) : !data?.results.length ? (
        <EmptyState>
          <EmptyCopy {...EMPTY_COPY_PRESETS.noCoursesFound} />
        </EmptyState>
      ) : (
        <div
          className={`grid grid-cols-1 gap-4 md:grid-cols-2 transition-opacity ${
            isFetching ? "opacity-60" : ""
          }`}
        >
          {data.results.map((course) => (
            <AcademicHubCourseCard
              key={course.id}
              course={course}
              selectedStatuses={HUB_STATUS_VALUES}
            />
          ))}
        </div>
      )}

      {data && data.total > 20 && (
        <SearchPagination
          page={page}
          totalPages={totalPages}
          onChange={(p) => setParams({ page: p })}
        />
      )}

      <p className="text-sm text-text-muted">
        <Link href="/courses" className="underline">
          Back to Academic Hub
        </Link>
      </p>
    </PageContainer>
  );
}
