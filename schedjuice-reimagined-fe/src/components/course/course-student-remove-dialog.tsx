"use client";

import {
  AlertDialog,
} from "@/components/primitives";
import { Button } from "@/components/primitives";

export type CourseStudentRemoveTarget = {
  id: number;
  name: string;
};

type CourseStudentRemoveDialogProps = {
  student: CourseStudentRemoveTarget | null;
  isLoading: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export function CourseStudentRemoveDialog({
  student,
  isLoading,
  onOpenChange,
  onConfirm,
}: CourseStudentRemoveDialogProps) {
  const handleOpenChange = (open: boolean) => {
    if (!open && isLoading) {
      return;
    }
    onOpenChange(open);
  };

  return (
    <AlertDialog.Root open={student !== null} onOpenChange={handleOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop />
        <AlertDialog.Popup>
          <AlertDialog.Title>Remove from class?</AlertDialog.Title>
          <AlertDialog.Description>
            {student
              ? `${student.name} will no longer be on this class roster. You can add them again later if needed.`
              : null}
          </AlertDialog.Description>
        <div className="flex justify-end gap-2">
          <AlertDialog.Close
            render={<Button type="button" variant="ghost" disabled={isLoading} />}
          >
            Cancel
          </AlertDialog.Close>
          <Button
            type="button"
            variant="danger"
            isLoading={isLoading}
            disabled={isLoading || !student}
            onClick={onConfirm}
          >
            Remove from class
          </Button>
        </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
