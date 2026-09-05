"use client";

import { PageContainer } from "@/components/layout/page-container";
import { CourseMaterialsPanel } from "@/components/course/materials/course-materials-panel";
import { useCourseHub } from "@/contexts/course-hub-context";
import { useUser } from "@/hooks/useUser";
import { Skeleton } from "@/components/primitives";
import type { courseType } from "@/types/course";

export default function CourseMaterialsPage() {
  const { user } = useUser();
  const { course, isCourseLoading, courseId } = useCourseHub();

  if (isCourseLoading) {
    return <Skeleton className="min-h-[200px] w-full rounded-xl" aria-busy />;
  }

  if (!user) {
    return null;
  }

  if (!course.id) {
    return (
      <p className="text-sm text-text-secondary" role="alert">
        Course could not be loaded.
      </p>
    );
  }

  return (
    <PageContainer width="default">
      <CourseMaterialsPanel
        courseId={courseId}
        course={course as unknown as courseType}
        user={user}
      />
    </PageContainer>
  );
}
