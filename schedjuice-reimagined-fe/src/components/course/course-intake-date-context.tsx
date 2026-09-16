import { formatDate } from "@/helpers/date";
import {
  courseDatesDifferFromIntake,
  type DateRange,
} from "@/helpers/intake-course-dates";
import { cn } from "@/lib/utils";
import { CourseRange } from "@/components/course/course-range";

export type CourseIntakeDateContextProps = {
  courseDates: DateRange;
  intakeDates?: DateRange | null;
  className?: string;
  showIntakeReference?: boolean;
};

export function CourseIntakeDateContext({
  courseDates,
  intakeDates,
  className,
  showIntakeReference = true,
}: CourseIntakeDateContextProps) {
  const differs = courseDatesDifferFromIntake(courseDates, intakeDates);

  return (
    <div className={cn("space-y-1", className)}>
      <CourseRange
        startDate={courseDates.start_date}
        endDate={courseDates.end_date}
      />
      {differs && showIntakeReference && intakeDates ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center rounded-full bg-surface-hover px-2 py-0.5 text-xs text-text-secondary">
            Differs from intake
          </span>
          <span>
            Intake: {formatDate(intakeDates.start_date ?? "")} –{" "}
            {formatDate(intakeDates.end_date ?? "")}
          </span>
        </div>
      ) : null}
    </div>
  );
}
