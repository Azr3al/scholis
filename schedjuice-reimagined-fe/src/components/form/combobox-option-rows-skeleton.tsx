import { Skeleton } from "@/components/primitives/skeleton";

export function ComboboxOptionRowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex h-full min-h-0 flex-col divide-y divide-border/60">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex flex-1 items-center gap-2 px-3 py-2.5">
          <Skeleton className="size-4 shrink-0 rounded-sm motion-reduce:animate-none" />
          <Skeleton className="h-4 w-2/3 motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}
