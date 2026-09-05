import { Skeleton } from "@/components/primitives/skeleton";
import { cn } from "@/lib/utils";

type TableSkeletonProps = {
  columns: number;
  rows?: number;
  showPagination?: boolean;
  className?: string;
  cellClassName?: string;
};

export function TableSkeleton({
  columns,
  rows = 6,
  showPagination = false,
  className,
  cellClassName,
}: TableSkeletonProps) {
  return (
    <div className={cn("space-y-4", className)} aria-busy="true">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-left">
              {Array.from({ length: columns }).map((_, index) => (
                <th key={index} className="px-3 py-2">
                  <Skeleton className="h-4 w-24 max-w-full motion-reduce:animate-none" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, rowIndex) => (
              <tr key={rowIndex} className="border-b border-border-subtle">
                {Array.from({ length: columns }).map((_, columnIndex) => (
                  <td key={columnIndex} className={cn("px-3 py-3", cellClassName)}>
                    <Skeleton
                      className={cn(
                        "h-4 max-w-full motion-reduce:animate-none",
                        columnIndex === 0 ? "w-40" : "w-24",
                      )}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showPagination ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Skeleton className="h-4 w-24" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-9 w-16" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function StatCardsSkeleton({
  count = 3,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index}>
          <div className="pb-2">
            <Skeleton className="h-4 w-28" />
          </div>
          <div>
            <Skeleton className="h-8 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function CardGridSkeleton({
  count = 6,
  cardClassName,
  className,
}: {
  count?: number;
  cardClassName?: string;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3", className)}>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className={cn("h-full", cardClassName)}>
          <div className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
            <div className="flex flex-wrap gap-1 pt-2">
              <Skeleton className="h-5 w-14 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-12 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ListRowsSkeleton({
  rows = 5,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-xl border p-3">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-8 w-16" />
        </div>
      ))}
    </div>
  );
}

export function ReportSkeleton({
  statCount = 3,
  tableColumns = 5,
  tableRows = 6,
}: {
  statCount?: number;
  tableColumns?: number;
  tableRows?: number;
}) {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-10 w-full max-w-xs" />
        <Skeleton className="h-10 w-36" />
        <Skeleton className="h-10 w-36" />
      </div>
      <StatCardsSkeleton count={statCount} />
      <TableSkeleton columns={tableColumns} rows={tableRows} showPagination />
    </div>
  );
}
