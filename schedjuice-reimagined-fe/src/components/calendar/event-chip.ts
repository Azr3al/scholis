import { cn } from "@/lib/utils";
import { assignmentStatus } from "@/types/assignment";
import { eventType } from "@/types/course";

export const eventChipClass = cn(
  "relative flex flex-col justify-start overflow-hidden rounded-md border border-border-strong bg-surface-elevated px-1.5 py-1 text-left shadow-xs transition-colors hover:bg-surface-hover",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);

/** Month grid + week view — transparent until hover, no border/shadow. */
export const borderlessEventChipClass = cn(
  "appearance-none border-0 bg-transparent text-left",
  "hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-[var(--ring)]",
  "min-w-0 overflow-hidden rounded-sm px-0.5 py-0.5",
);

type EventLike = Partial<
  Pick<eventType, "type" | "status" | "assignment">
>;

export function eventAccentBorder(
  event: EventLike,
  isSelected = false,
): string {
  if (isSelected) {
    return "border-l-[3px] border-l-success bg-success/10";
  }

  if (
    event.type === "assignment_available" ||
    event.type === "assignment_due"
  ) {
    switch (event.status) {
      case assignmentStatus.locked:
        return "border-l-[3px] border-l-warning";
      case assignmentStatus.submitted:
        return "border-l-[3px] border-l-success";
      case assignmentStatus.ready_to_be_graded:
        return "border-l-[3px] border-l-status-blue";
      case assignmentStatus.overdue:
        return "border-l-[3px] border-l-destructive";
      default:
        break;
    }
  }

  if (!event.assignment) {
    return "border-l-[3px] border-l-brand";
  }

  return "";
}
