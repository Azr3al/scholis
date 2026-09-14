import { Skeleton } from "@/components/primitives";
import { cn } from "@/lib/utils";

function AcademicHubCourseCardSkeleton() {
  return (
    <div className="flex h-full min-h-52 flex-col">
      <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border shadow-xs">
        <div className="flex flex-1 flex-col space-y-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <Skeleton className="h-3 w-28 max-w-[55%]" />
            <Skeleton className="h-6 w-16 shrink-0 rounded-full" />
          </div>

          <div className="space-y-2">
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="h-3 w-24" />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="ml-auto h-3 w-16 max-w-[40%]" />
          </div>

          <div className="flex flex-1 flex-col space-y-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3 w-44" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-32" />
            <div className="mt-auto flex flex-wrap gap-3 pt-1">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AcademicHubCourseGridSkeleton({
  count = 6,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3",
        className,
      )}
      aria-busy="true"
    >
      {Array.from({ length: count }).map((_, index) => (
        <AcademicHubCourseCardSkeleton key={index} />
      ))}
    </div>
  );
}
