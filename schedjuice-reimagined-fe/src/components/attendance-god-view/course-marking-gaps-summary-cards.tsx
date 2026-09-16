import { Skeleton } from "@/components/primitives";
import type { AttendanceGodViewCourseGapSummary } from "@/types/attendance-god-view";

type Props = {
  summary?: AttendanceGodViewCourseGapSummary;
  isLoading: boolean;
};

function SummaryCard({
  label,
  value,
  isLoading,
}: {
  label: string;
  value: string | number;
  isLoading: boolean;
}) {
  return (
    <div className="min-w-[160px] flex-1">
      <div className="pb-2">
        <h3 className="text-sm font-medium">{label}</h3>
      </div>
      <div>
        {isLoading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <p className="text-2xl font-semibold tabular-nums">{value}</p>
        )}
      </div>
    </div>
  );
}

export function CourseMarkingGapsSummaryCards({ summary, isLoading }: Props) {
  const worstCourse = summary?.worst_course;
  return (
    <div className="flex flex-wrap gap-3">
      <SummaryCard
        label="Courses affected"
        value={summary?.courses_affected_count ?? 0}
        isLoading={isLoading}
      />
      <SummaryCard
        label="Unregistered slots"
        value={summary?.unregistered_slots_count ?? 0}
        isLoading={isLoading}
      />
      <SummaryCard
        label="Worst course"
        value={
          worstCourse
            ? `${worstCourse.course_title} (${worstCourse.unregistered_rate}%)`
            : "None"
        }
        isLoading={isLoading}
      />
    </div>
  );
}
