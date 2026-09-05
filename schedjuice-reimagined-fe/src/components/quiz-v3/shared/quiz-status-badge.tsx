import { cn } from "@/lib/utils";
import { QuizStatus } from "@/types/quiz-v3";

const QUIZ_STATUS_BADGE: Record<
  QuizStatus,
  { label: string; className: string }
> = {
  [QuizStatus.Open]: {
    label: "Open",
    className:
      "border-success/30 bg-success/10 font-medium text-success border",
  },
  [QuizStatus.Draft]: {
    label: "Draft",
    className:
      "border-warning/35 bg-warning/10 font-medium text-warning-foreground border",
  },
  [QuizStatus.Closed]: {
    label: "Closed",
    className:
      "border-border bg-surface-sunken font-medium text-text-muted border",
  },
};

export function QuizStatusBadge({ status }: { status: QuizStatus }) {
  const { label, className } = QUIZ_STATUS_BADGE[status];
  return (
    <span className={cn("inline-flex items-center rounded-md border border-border bg-transparent px-2 py-0.5 text-xs font-medium text-text-secondary", className)}>
      {label}
    </span>
  );
}
