import { Skeleton } from "@/components/primitives";
import { cn } from "@/lib/utils";

export type LoadingStateProps = {
  rows?: number;
  columns?: number;
  className?: string;
  /** Reserved body height so loading ↔ content does not jump. */
  minHeightClassName?: string;
};

/** Skeleton rows matching ~52px row rhythm. */
export function LoadingState({
  rows = 5,
  columns = 4,
  className,
  minHeightClassName = "min-h-[16rem]",
}: LoadingStateProps) {
  return (
    <div
      className={cn(
        "w-full bg-surface",
        minHeightClassName,
        className,
      )}
      aria-busy="true"
      aria-live="polite"
    >
      <div className="border-b border-border-subtle px-3 py-3">
        <div className="flex gap-4">
          {Array.from({ length: columns }, (_, i) => (
            <Skeleton key={i} className="h-4 flex-1" />
          ))}
        </div>
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div
          key={r}
          className="flex min-h-[52px] items-center gap-4 border-b border-border-subtle/60 px-3"
        >
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton key={c} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}
