import { LONG_COURSE_DURATION_WARNING_DAYS } from "@/helpers/course-duration-warning";

export function LongCourseDurationWarning({ className }: { className?: string }) {
  return (
    <div
      className={
        className ??
        "rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"
      }
      role="status"
    >
      This class runs longer than {LONG_COURSE_DURATION_WARNING_DAYS} days.
      Double-check the start and end dates.
    </div>
  );
}
