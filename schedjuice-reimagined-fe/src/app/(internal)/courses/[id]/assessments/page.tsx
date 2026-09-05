"use client";

import { CourseAssessmentsHub } from "@/components/course/course-assessments-hub";
import { PageContainer } from "@/components/layout/page-container";
import { useCourseHub } from "@/contexts/course-hub-context";
import {
  getCourseMemberIdsFromCourse,
  getCreatedByIdFromCourse,
} from "@/helpers/course-hub";
import { canEditCourse } from "@/helpers/authorization";
import { useUser } from "@/hooks/useUser";
import { Skeleton } from "@/components/primitives";

export default function CourseAssessmentsPage() {
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

  const memberIds = getCourseMemberIdsFromCourse(course);

  return (
    <PageContainer width="wide">
      <CourseAssessmentsHub
        courseId={Number(courseId)}
        canCreateAssignment={canEditCourse(
          user,
          memberIds,
          getCreatedByIdFromCourse(course),
        )}
      />
    </PageContainer>
  );
}
