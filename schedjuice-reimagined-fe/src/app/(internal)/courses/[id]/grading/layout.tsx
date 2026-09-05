import type { ReactNode } from "react";

import { CourseAwardsTabs } from "@/components/course/awards/course-awards-tabs";
import { PageContainer } from "@/components/layout/page-container";
import {
  COURSE_HUB_PAGE_WIDTH,
  courseRecordTabStackClassName,
} from "@/lib/ui-remediation/r9-course-record-layout-classes";

export default function GradingLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <PageContainer width={COURSE_HUB_PAGE_WIDTH} className={courseRecordTabStackClassName()}>
      <CourseAwardsTabs />
      {children}
    </PageContainer>
  );
}
