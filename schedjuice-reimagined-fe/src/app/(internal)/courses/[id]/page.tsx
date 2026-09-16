"use client";

import { CourseRecordOverview } from "@/components/course/record/course-record-overview";
import { useCourseHub } from "@/contexts/course-hub-context";
import { courseType } from "@/types/course";
import { Skeleton } from "@/components/primitives";

export default function CourseOverviewPage() {
  const { course, isCourseLoading } = useCourseHub();

  if (isCourseLoading) {
    return (
      <div className="flex w-full flex-col gap-3" aria-busy="true">
        <Skeleton className="min-h-[220px] w-full rounded-2xl" />
      </div>
    );
  }

  if (!course.id) {
    return (
      <p className="text-sm text-text-secondary" role="alert">
        Course could not be loaded.
      </p>
    );
  }

  return <CourseRecordOverview course={course as unknown as courseType} />;
}
