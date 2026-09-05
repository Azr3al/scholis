import { cn } from "@/lib/utils";
import { assignmentStatus } from "@/types/assignment";

export const AssignmentStatusBadge = ({
  status,
}: {
  status: assignmentStatus;
}) => {
  return (
    <span
      className={cn("inline-flex items-center rounded-full border border-border bg-surface-hover px-2.5 py-0.5 text-xs font-medium text-text-secondary", 
        "relative px-3 py-2 rounded-lg font-normal",
        {
          "bg-blue-50 text-blue-600":
            status === assignmentStatus.available_to_submit ||
            status === assignmentStatus.ready_to_be_graded,
          "bg-red-50 text-red-600":
            status === assignmentStatus.overdue ||
            status === assignmentStatus.require_resubmission,
          "bg-slate-300 text-black":
            status === assignmentStatus.locked ||
            status === assignmentStatus.submitted,
          "bg-green-50 text-green-600": status === assignmentStatus.graded,
        },
        {
          "h-[25px] capitalize gap-1 ": true,
        }
      )}
    >
      {status}
    </span>
  );
};
