import { Skeleton } from "@/components/primitives";
import {
  DAILY_STATUS_FILTER_CARD_CONFIG,
  getAttendanceGodViewStatusLabel,
} from "@/helpers/attendance-god-view";
import { cn } from "@/lib/utils";
import type {
  AttendanceGodViewDailySummary,
  AttendanceGodViewMonthlySummary,
  AttendanceGodViewSummary,
  DailyAttendanceStatusFilter,
} from "@/types/attendance-god-view";

type Props =
  | {
      mode: "daily_absences";
      summary?: AttendanceGodViewDailySummary;
      isLoading: boolean;
      activeStatusFilter?: DailyAttendanceStatusFilter | null;
      onStatusFilterChange?: (filter: DailyAttendanceStatusFilter) => void;
    }
  | {
      mode: "monthly_students";
      summary?: AttendanceGodViewMonthlySummary;
      isLoading: boolean;
    }
  | {
      mode: "risk";
      summary?: AttendanceGodViewSummary;
      isLoading: boolean;
    };

type SummaryCardProps = {
  label: string;
  value: string | number;
  isLoading: boolean;
  isActive?: boolean;
  onClick?: () => void;
};

function SummaryCard({
  label,
  value,
  isLoading,
  isActive = false,
  onClick,
}: SummaryCardProps) {
  const content = (
    <>
      <div className="pb-2">
        <h3 className="text-sm font-medium">{label}</h3>
      </div>
      <div>
        {isLoading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <p
            className={cn(
              "text-2xl font-semibold tabular-nums",
              label === "At-risk pairs" && "text-destructive",
            )}
          >
            {value}
          </p>
        )}
      </div>
    </>
  );

  return (
    <div
      className={cn(
        "min-w-[160px] flex-1 transition-colors",
        isActive && "border-primary ring-1 ring-primary",
      )}
    >
      {onClick ? (
        <button
          type="button"
          className="w-full text-left"
          aria-pressed={isActive}
          onClick={onClick}
        >
          {content}
        </button>
      ) : (
        content
      )}
    </div>
  );
}

export function AttendanceGodViewSummaryCards(props: Props) {
  if (props.mode === "daily_absences") {
    return (
      <div className="flex flex-wrap gap-3">
        {DAILY_STATUS_FILTER_CARD_CONFIG.map(({ filter, countKey }) => (
          <SummaryCard
            key={filter}
            label={getAttendanceGodViewStatusLabel(filter)}
            value={props.summary?.[countKey] ?? 0}
            isLoading={props.isLoading}
            isActive={props.activeStatusFilter === filter}
            onClick={() => props.onStatusFilterChange?.(filter)}
          />
        ))}
        <SummaryCard
          label="Courses affected"
          value={props.summary?.courses_affected_count ?? 0}
          isLoading={props.isLoading}
        />
        <SummaryCard
          label="Students with streaks"
          value={props.summary?.students_with_streaks_count ?? 0}
          isLoading={props.isLoading}
        />
      </div>
    );
  }

  const cards: [string, string | number][] =
    props.mode === "monthly_students"
      ? [
          ["Students at risk", props.summary?.students_at_risk_count ?? 0],
          ["Total absences", props.summary?.total_absences ?? 0],
          ["Unregistered", props.summary?.unregistered_count ?? 0],
          [
            "Worst course",
            props.summary?.worst_course?.course_title ?? "None",
          ],
        ]
      : [
          [
            "Avg attendance",
            `${props.summary?.average_attendance_rate ?? 0}%`,
          ],
          ["At-risk pairs", props.summary?.at_risk_count ?? 0],
          ["Absent (7 days)", props.summary?.absent_last_7_days_total ?? 0],
          ["Late-heavy", props.summary?.late_heavy_count ?? 0],
        ];

  return (
    <div className="flex flex-wrap gap-3">
      {cards.map(([label, value]) => (
        <SummaryCard
          key={label}
          label={label}
          value={value}
          isLoading={props.isLoading}
        />
      ))}
    </div>
  );
}
