"use client";

import { PageContainer } from "@/components/layout/page-container";
import CourseCalendar from "@/components/calendar/calendars/course-calendar";
import { CourseTabEditBar } from "@/components/course/course-section-header";
import { useCourseHub } from "@/contexts/course-hub-context";
import { canEditCourse } from "@/helpers/authorization";
import { getCreatedByIdFromCourse } from "@/helpers/course-hub";
import { useUser } from "@/hooks/useUser";
import { Skeleton } from "@/components/primitives";
import {
  COURSE_HUB_PAGE_WIDTH,
  courseRecordTabStackClassName,
} from "@/lib/ui-remediation/r9-course-record-layout-classes";

export default function CourseSchedulePage() {
  const { user } = useUser();
  const {
    courseId,
    course,
    isCourseLoading,
    eventData,
    teacherMemberIds,
  } = useCourseHub();

  const canEditCourseDetails = Boolean(
    user &&
      course &&
      canEditCourse(user, teacherMemberIds, getCreatedByIdFromCourse(course)),
  );

  if (isCourseLoading) {
    return <Skeleton className="min-h-[240px] w-full rounded-xl" aria-busy />;
  }

  if (!course.id) {
    return (
      <p className="text-sm text-text-secondary" role="alert">
        Course could not be loaded.
      </p>
    );
  }

  return (
    <PageContainer
      width={COURSE_HUB_PAGE_WIDTH}
      className={courseRecordTabStackClassName()}
    >
      <CourseTabEditBar
        showEdit={canEditCourseDetails}
        editHref={`/courses/${courseId}/edit?tab=edit-schedule`}
      />
      {eventData ? (
        <CourseCalendar courseId={courseId} />
      ) : (
        <Skeleton className="min-h-[200px] w-full rounded-xl" />
      )}
    </PageContainer>
);
}
