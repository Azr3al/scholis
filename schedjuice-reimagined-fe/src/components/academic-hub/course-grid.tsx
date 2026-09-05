"use client";
import { Skeleton } from "@/components/primitives";

import { Loader } from "@/components/form/loader";
import { AcademicHubCourseCard, type HubCourse } from "./course-card";
import { HubStatusFilter } from "@/types/academic-hub";

interface Props {
  rows: HubCourse[];
  selectedStatuses: HubStatusFilter[];
  isLoading: boolean;
  isRefetching?: boolean;
}

function CourseCardSkeleton() {
  return (
    <div className="h-full rounded-xl border bg-card p-4">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-6 w-3/4" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
        <div className="flex flex-wrap gap-1">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
    </div>
  );
}

export function CourseGrid({
  rows,
  selectedStatuses,
  isLoading,
  isRefetching = false,
}: Props) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <CourseCardSkeleton key={i} />
        ))}
      </div>
    );
  }
  return (
    <div className="relative">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(rows ?? []).map((course) => (
          <AcademicHubCourseCard
            key={course.id}
            course={course}
            selectedStatuses={selectedStatuses}
          />
        ))}
      </div>
      {isRefetching ? (
        <div
          className="pointer-events-none absolute right-3 top-3 rounded-full bg-card/90 p-1.5 shadow-sm"
          aria-hidden
        >
          <Loader />
        </div>
      ) : null}
    </div>
  );
}
