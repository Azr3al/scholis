"use client";

import { Loader } from "@/components/form/loader";
import { AcademicHubCourseCard, type HubCourse } from "./course-card";
import { AcademicHubCourseGridSkeleton } from "./course-grid-skeleton";
import { HubStatusFilter } from "@/types/academic-hub";

interface Props {
  rows: HubCourse[];
  selectedStatuses: HubStatusFilter[];
  isLoading: boolean;
  isRefetching?: boolean;
}

export function CourseGrid({
  rows,
  selectedStatuses,
  isLoading,
  isRefetching = false,
}: Props) {
  if (isLoading) {
    return <AcademicHubCourseGridSkeleton />;
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
