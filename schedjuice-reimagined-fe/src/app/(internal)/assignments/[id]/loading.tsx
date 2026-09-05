import { PageContainer } from "@/components/layout/page-container";
import { TableSkeleton } from "@/components/loading/structured-skeletons";
import { Card, CardContent, CardHeader } from "@/components/courses/ui/card";
import { Skeleton } from "@/components/primitives";

export default function AssignmentDetailLoading() {
  return (
    <PageContainer width="default" className="space-y-4" aria-busy="true">
      <Skeleton className="h-6 w-28" />
      <Card>
        <CardHeader className="space-y-2">
          <Skeleton className="h-8 w-64 max-w-full" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-40 w-full rounded-xl" />
          <TableSkeleton columns={4} rows={5} />
        </CardContent>
      </Card>
    </PageContainer>
  );
}
