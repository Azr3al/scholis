import { formatDate } from "@/helpers/date";
import { cn } from "@/lib/utils";

export type CourseRangeProps = {
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  className?: string;
};

/**
 * One-line course schedule: muted Start/End labels, bold dates, arrow between.
 */
export function CourseRange({
  startDate,
  endDate,
  className,
}: CourseRangeProps) {
  const start = startDate != null && startDate !== "" ? formatDate(startDate) : "—";
  const end = endDate != null && endDate !== "" ? formatDate(endDate) : "—";

  return (
    <div
      className={cn(
        "flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm",
        className,
      )}
      role="group"
      aria-label={`Course from ${start} to ${end}`}
    >
      <span className="text-muted-foreground">Start</span>
      <span className="tabular-nums font-medium text-foreground">{start}</span>
      <span className="text-muted-foreground/70" aria-hidden>
        →
      </span>
      <span className="text-muted-foreground">End</span>
      <span className="tabular-nums font-medium text-foreground">{end}</span>
    </div>
  );
}
