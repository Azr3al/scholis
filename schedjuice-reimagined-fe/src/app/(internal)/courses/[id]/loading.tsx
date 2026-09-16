import { TableSkeleton } from "@/components/loading/structured-skeletons";
import { PageContainer } from "@/components/layout/page-container";
import { Skeleton } from "@/components/primitives";

export default function CourseHubLoading() {
  return (
    <PageContainer width="default" className="space-y-4" aria-busy="true">
      <Skeleton className="h-10 w-full max-w-2xl rounded-xl" />
      <div className="min-w-0 overflow-x-auto">
        <div className="flex w-max gap-1 rounded-xl bg-surface-hover/40 p-1">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-8 w-24 rounded-md" />
          ))}
        </div>
      </div>
      <TableSkeleton columns={4} rows={6} showPagination />
    </PageContainer>
  );
}
