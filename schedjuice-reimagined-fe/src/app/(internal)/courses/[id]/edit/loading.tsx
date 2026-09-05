import { AutoFormFieldsSkeleton } from "@/components/form/auto-form-fields-skeleton";
import { PageContainer } from "@/components/layout/page-container";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/courses/ui/card";
import { Skeleton } from "@/components/primitives";

export default function CourseEditLoading() {
  return (
    <PageContainer
      width="narrow"
      className="space-y-5"
      aria-busy="true"
      aria-label="Loading class editor"
    >
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-10 w-40" />
      </div>
      <Skeleton className="h-28 w-full rounded-2xl" />
      <Skeleton className="h-12 w-full rounded-2xl" />
      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 sm:px-6">
        {[5, 2, 4].map((rows, index) => (
          <Card key={index} className="border-border/70 shadow-none">
            <CardHeader>
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-72 max-w-full" />
            </CardHeader>
            <CardContent>
              <AutoFormFieldsSkeleton rows={rows} />
            </CardContent>
          </Card>
        ))}
        <Card className="border-border/70 shadow-none">
          <CardHeader>
            <Skeleton className="h-6 w-44" />
            <Skeleton className="h-4 w-64 max-w-full" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-36 w-full rounded-xl" />
          </CardContent>
        </Card>
        <Skeleton className="h-10 w-36" />
      </div>
    </PageContainer>
  );
}
