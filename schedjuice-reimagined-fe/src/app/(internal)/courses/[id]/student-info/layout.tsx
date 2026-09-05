"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { CourseStudentInfoTabs } from "@/components/course/student-info/course-student-info-tabs";
import { Skeleton } from "@/components/primitives";
import { useCourseHub } from "@/contexts/course-hub-context";
import { canViewStudentInfoSection } from "@/helpers/authorization";
import { useUser } from "@/hooks/useUser";
import { courseRecordTabStackClassName, COURSE_HUB_PAGE_WIDTH } from "@/lib/ui-remediation/r9-course-record-layout-classes";

export default function CourseStudentInfoLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user } = useUser();
  const { courseId, isCourseLoading } = useCourseHub();

  useEffect(() => {
    if (user && !canViewStudentInfoSection(user)) {
      router.replace(`/courses/${courseId}`);
    }
  }, [courseId, router, user]);

  if (isCourseLoading) {
    return (
      <PageContainer width={COURSE_HUB_PAGE_WIDTH} className={courseRecordTabStackClassName()}>
        <Skeleton className="h-9 w-72 max-w-full rounded-md" aria-hidden />
        <Skeleton className="min-h-70 w-full rounded-xl" aria-busy />
      </PageContainer>
    );
  }

  if (!user || !canViewStudentInfoSection(user)) {
    return null;
  }

  return (
    <PageContainer width={COURSE_HUB_PAGE_WIDTH} className={courseRecordTabStackClassName()}>
      <CourseStudentInfoTabs courseId={String(courseId)} />
      {children}
    </PageContainer>
  );
}
