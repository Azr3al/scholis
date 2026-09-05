import { PageContainer } from "@/components/layout/page-container";
import { StudentsSubNav } from "@/components/course/students-sub-nav";
import {
  COURSE_HUB_PAGE_WIDTH,
  courseRecordTabStackClassName,
} from "@/lib/ui-remediation/r9-course-record-layout-classes";

export default function StudentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PageContainer
      width={COURSE_HUB_PAGE_WIDTH}
      className={courseRecordTabStackClassName()}
    >
      <StudentsSubNav />
      {children}
    </PageContainer>
  );
}
