"use client";

import dynamic from "next/dynamic";
import CourseHeader from "@/components/course/overveiw/course-header";
import { pageContentInsetClassName } from "@/components/layout/page-container";
import { COURSE_HUB_PAGE_WIDTH } from "@/lib/ui-remediation/r9-course-record-layout-classes";
import { canManageCourseFeed } from "@/helpers/authorization";
import { useUser } from "@/hooks/useUser";
import { cn } from "@/lib/utils";
import type { courseType } from "@/types/course";

const CourseFeed = dynamic(
  () =>
    import("@/components/course/feed/course-feed").then((m) => m.CourseFeed),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-40 w-full animate-pulse rounded-md bg-muted/40" />
    ),
  },
);

/** Overview body — legacy CourseHeader content in the new shell; primitive card rewrite is incremental. */
export function CourseRecordOverview({ course }: { course: courseType }) {
  const { user } = useUser();
  const canEdit = user ? canManageCourseFeed(user, course) : false;

  return (
    <div
      className={cn(
        pageContentInsetClassName(COURSE_HUB_PAGE_WIDTH),
        "sj-root flex flex-col gap-6 pb-20 pt-2",
      )}
    >
      <CourseHeader course={course} />
      {course.id ? (
        <CourseFeed
          courseId={course.id}
          canEdit={canEdit}
          microsoftGroupId={course.microsoft_group_id}
          microsoftChannelId={course.microsoft_channel_id}
        />
      ) : null}
    </div>
  );
}
