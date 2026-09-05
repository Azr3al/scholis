import { PageContainer } from "@/components/layout/page-container";
import { CardGridSkeleton } from "@/components/loading/structured-skeletons";
import { Skeleton } from "@/components/primitives";

export default function UsersLoading() {
  return (
    <PageContainer
      width="wide"
      className="space-y-6"
      aria-busy="true"
      aria-label="Loading people"
    >
      <div className="space-y-2">
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-10 w-full max-w-sm" />
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-32" />
      </div>
      <CardGridSkeleton count={6} cardClassName="min-h-36" />
    </PageContainer>
  );
}
