import { assignmentStatus, assignmentType } from "@/types/assignment";
import { dateToTimeValue, formatDate, formatDateTime } from "@/helpers/date";
import { useEffect, useState } from "react";
import { Button } from "@/components/primitives";
import { cn } from "@/lib/utils";
import { useUser } from "@/hooks/useUser";
import { useEditor } from "@tiptap/react";
import { getDefaultEditorOptions } from "../editor/config";
import { useToast } from "@/components/primitives";
import StatusBadge, { StatusBadgeProps } from "./status-badge";

import { Group as Users, Calendar } from "iconoir-react";

interface IAssignmentCardProps extends assignmentType {
  canEditAssignment: boolean;
  refetch?: () => void;
  totalStudents?: number;
}
// will replace the table
const AssignmentTable: React.FC<IAssignmentCardProps> = ({
  title,
  instructions,
  id,
  created_at,
  canEditAssignment,
  course,
  due_datetime,
  available_datetime,
  max_attempts,
  refetch,
  submissions,
  available_score,
  totalStudents = 0,
}) => {
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSubmitMode, setIsSubmitMode] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const toast = useToast();
  const editor = useEditor(getDefaultEditorOptions());

  const { user } = useUser();

  const [status, setStatus] = useState<assignmentStatus>(
    assignmentStatus.submitted
  );

  const getButtons = (status: assignmentStatus) => {
    switch (status) {
      case assignmentStatus.available_to_submit:
        return (
          <div className="flex justify-between w-full gap-2">
            <Button
              className={cn({
                " bg-background w-full h-9": true,
              })}
              variant="secondary"
            >
              Details
            </Button>
            <Button
              className={cn({
                "w-full h-9": true,
              })}
            >
              Grade
            </Button>
          </div>
        );

      case assignmentStatus.require_resubmission:
        return (
          <Button
            className={cn({
              " bg-background w-full h-9": true,
            })}
            variant="secondary"
          >
            Resubmit
          </Button>
        );
        break;

      case assignmentStatus.graded:
        return (
          <Button
            className={cn({
              " bg-background w-full h-9": true,
            })}
            variant="secondary"
          >
            View Grade
          </Button>
        );
        break;

      case assignmentStatus.overdue:
      case assignmentStatus.submitted:
      case assignmentStatus.locked:
        return (
          <Button
            className={cn({
              " bg-background w-full h-9": true,
            })}
            variant="secondary"
          >
            Details
          </Button>
        );
    }
  };

  useEffect(() => {
    document.body.style.pointerEvents = "";
  }, [isDeleteDialogOpen]);

  useEffect(() => {
    // check the status is overdue
    new Date(due_datetime) < new Date() &&
      (submissions?.length || 0) == 0 &&
      setStatus(assignmentStatus.overdue);

    // check the status is submitted
    (submissions?.length || 0) > 0 && setStatus(assignmentStatus.submitted);

    // check the status is graded
    // submissions.is_g

    //check the status is active
    new Date(available_datetime) < new Date() &&
      new Date(due_datetime) > new Date() &&
      setStatus(assignmentStatus.available_to_submit);
  }, [status]);

  {
    new Date(due_datetime) < new Date() && (submissions?.length || 0) === 0 && (
      <span className=" text-destructive"> (Over due)</span>
    );
  }
  {
    (submissions?.length || 0) > 0 && (
      <span className=" text-success"> (Submitted)</span>
    );
  }
  return (
    <div
      className={cn({
        "flex flex-col justify-between items-between h-full rounded-lg border border-border bg-surface": true,
        "bg-slate-50": status === assignmentStatus.submitted,
      })}
    >
      <div className="p-6">
        <h3 className="font-medium">{title}</h3>
      </div>
      <div className="p-6 pt-0">
        <div className="text-sm text-text-secondary">
          <div className="flex flex-col gap-1">
            <p className="mb-2">{title}</p>
            <p className="flex items-center ">
              <Calendar className="mr-2" width={16} height={16} />
              <span>Due:</span> {formatDate(due_datetime)}
            </p>
            {/* need to fetch total students quantity */}

            <p className="flex items-center ">
              <Users className="mr-2" width={16} height={16} />
              {submissions?.length || 0}/{totalStudents}
              <span className="ml-1"> submitted</span>
            </p>
          </div>
        </div>
      </div>
      <div className="p-6 pt-0">
        <div className="flex jusify-between gap-4 w-full">
          {getButtons(status)}
        </div>
      </div>
    </div>
  );
};

export default AssignmentTable;
