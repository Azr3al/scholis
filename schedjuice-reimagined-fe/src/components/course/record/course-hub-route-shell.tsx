"use client";

import { CourseRecordIdentityStrip } from "@/components/course/record/course-record-identity-strip";
import { isCourseHubRoute } from "@/config/course-record-nav";
import { pageContentInsetClassName } from "@/components/layout/page-container";
import { COURSE_HUB_PAGE_WIDTH } from "@/lib/ui-remediation/r9-course-record-layout-classes";
import { cn } from "@/lib/utils";
import type { courseType } from "@/types/course";
import { useParams, usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function CourseHubRouteShell({
  course,
  children,
}: {
  course: courseType;
  children: ReactNode;
}) {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const showHeader = isCourseHubRoute(pathname, id);

  return (
    <>
      {showHeader ? (
        <div
          className={cn(
            pageContentInsetClassName(COURSE_HUB_PAGE_WIDTH),
            "pb-2 pt-4",
          )}
        >
          <CourseRecordIdentityStrip course={course} />
        </div>
      ) : null}
      {children}
    </>
  );
}
