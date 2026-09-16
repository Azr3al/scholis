import { assignmentType } from "@/types/assignment";
import { formatDate } from "@/helpers/date";
import { buttonVariants } from "@/components/primitives";
import { cn } from "@/lib/utils";
import { Group as Users, Calendar } from "iconoir-react";
import Link from "next/link";

interface IAssignmentCardProps {
  canEditAssignment: boolean;
  refetch?: () => void;
  assignment: assignmentType;
  totalStudents?: number;
}

const AssignmentCard: React.FC<IAssignmentCardProps> = ({
  assignment,
  totalStudents = 0,
}) => {
  return (
    <div
      className={cn({
        "flex flex-col justify-between items-between shadow-none min-w-[320px] rounded-lg border border-border bg-surface":
          true,
      })}
    >
      <div className="p-6">
        <h3 className="font-medium">
          {assignment.title.length > 25
            ? assignment.title.slice(0, 25) + "..."
            : assignment.title}
        </h3>
      </div>
      <div className="p-6 pt-0">
        <div className="text-sm text-text-secondary">
          <div className="flex flex-col gap-1">
            <p className="mb-2">
              {assignment.title.length > 25
                ? assignment.title.slice(0, 25) + "..."
                : assignment.title}
            </p>
            <p className="flex items-center ">
              <Calendar className="mr-2" width={16} height={16} />
              <span>Due:</span> {formatDate(assignment.due_datetime)}
            </p>
            {/* need to fetch total students quantity */}

            <p className="flex items-center ">
              <Users className="mr-2" width={16} height={16} />
              {`${assignment.submissions?.length || 0}`}/{totalStudents}
              <span className="ml-1"> submitted</span>
            </p>
          </div>
        </div>
      </div>
      <div className="p-6 pt-0">
        <div className="w-full">
          <Link
            className={buttonVariants({
              variant: "secondary",
              className: "w-full",
            })}
            href={`/assignments/${assignment.id}`}
          >
            Details
          </Link>
        </div>
      </div>
    </div>
  );
};

export default AssignmentCard;
