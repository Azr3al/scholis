"use client";

import InvoiceIndicator from "@/components/course/invoice-indicator";
import { CourseHubRouteShell } from "@/components/course/record/course-hub-route-shell";
import { CourseMobileSections } from "@/components/course/record/course-mobile-sections";
import { CourseRecordHeaderActions } from "@/components/course/record/course-record-header-actions";
import { CourseSectionRail } from "@/components/course/record/course-section-rail";
import { useCourseRecordPageHeader } from "@/components/course/record/use-course-record-page-header";
import { useContextRail } from "@/components/shell/use-context-rail";
import { COURSE_CONTEXT_PARENT, isCourseHubRoute } from "@/config/course-record-nav";
import { CourseHubProvider, useCourseHub } from "@/contexts/course-hub-context";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import { courseType } from "@/types/course";
import { pageContentInsetClassName } from "@/components/layout/page-container";
import { cn } from "@/lib/utils";
import { useParams, usePathname } from "next/navigation";
import { useMemo, type ReactNode } from "react";

function CourseShellLayoutInner({ children }: { children: ReactNode }) {
  const { id: courseId } = useParams<{ id: string }>();
  const pathname = usePathname();
  const { user } = useUser();
  const { tenant } = useTenant();
  const { course, isCourseLoading } = useCourseHub();

  const typedCourse = course as unknown as courseType;
  const hasCourse = Boolean(course.id);

  useContextRail(
    CourseSectionRail,
    () =>
      courseId
        ? {
            courseId,
            course: hasCourse ? typedCourse : null,
            user,
            tenant: tenant ?? null,
            pathname,
            isLoading: isCourseLoading,
          }
        : null,
    COURSE_CONTEXT_PARENT,
  );
  const headerActions = useMemo(() => {
    if (!hasCourse || !user) return null;
    return (
      <CourseRecordHeaderActions
        courseId={courseId}
        course={typedCourse}
        user={user}
        tenant={tenant ?? null}
      />
    );
  }, [hasCourse, courseId, user, typedCourse, tenant]);

  useCourseRecordPageHeader({
    courseId,
    course: hasCourse ? typedCourse : null,
    actions: headerActions,
  });

  const wrapHub = hasCourse && isCourseHubRoute(pathname, courseId);

  return (
    <>
      {!pathname.includes("locked") && <InvoiceIndicator courseId={courseId} />}
      {hasCourse ? (
        <div className={cn(pageContentInsetClassName(), "pt-4 md:hidden")}>
          <CourseMobileSections
            courseId={courseId}
            course={typedCourse}
            user={user}
            tenant={tenant ?? null}
          />
        </div>
      ) : null}
      {wrapHub ? (
        <CourseHubRouteShell course={typedCourse}>{children}</CourseHubRouteShell>
      ) : (
        children
      )}
    </>
  );
}

export default function CourseDetailsLayout({ children }: { children: ReactNode }) {
  return (
    <CourseHubProvider>
      <CourseShellLayoutInner>{children}</CourseShellLayoutInner>
    </CourseHubProvider>
  );
}
