import { PageContainer } from "@/components/layout/page-container";
import { AcademicHubCourseGridSkeleton } from "@/components/academic-hub/course-grid-skeleton";
import { Skeleton } from "@/components/primitives";

export default function CoursesLoading() {
  return (
    <PageContainer
      width="wide"
      className="space-y-6"
      aria-busy="true"
      aria-label="Loading courses"
    >
      <div className="space-y-2">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-10 w-full max-w-sm" />
        <Skeleton className="h-10 w-36" />
        <Skeleton className="h-10 w-36" />
        <Skeleton className="h-10 w-28" />
      </div>
      <AcademicHubCourseGridSkeleton />
    </PageContainer>
  );
}
