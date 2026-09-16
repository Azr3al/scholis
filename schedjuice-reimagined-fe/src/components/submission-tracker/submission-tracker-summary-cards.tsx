import { Skeleton } from "@/components/primitives";
import type { SubmissionTrackerSummary } from "@/types/submission-tracker";

type Props = {
  summary?: SubmissionTrackerSummary;
  isLoading: boolean;
};

export function SubmissionTrackerSummaryCards({ summary, isLoading }: Props) {
  const cards: [string, number, boolean][] = [
    ["Student–course pairs needing follow-up", summary?.at_risk_pairs ?? 0, true],
    ["Students flagged", summary?.students_flagged ?? 0, false],
    ["Courses affected", summary?.courses_affected ?? 0, false],
  ];

  return (
    <div className="flex flex-wrap gap-3">
      {cards.map(([label, value, highlight]) => (
        <div key={label} className="min-w-[180px] flex-1">
          <div className="pb-2">
            <h3 className="text-sm font-medium">{label}</h3>
          </div>
          <div>
            {isLoading ? (
              <Skeleton className="h-8 w-20" aria-busy="true" />
            ) : (
              <p
                className={`text-2xl font-semibold tabular-nums ${
                  highlight ? "text-destructive" : ""
                }`}
              >
                {value}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
