"use client";

import {
  AlertDialog,
} from "@/components/primitives";
import { Button } from "@/components/primitives";

import type { CourseStudentRemoveTarget } from "./course-student-remove-dialog";

type CourseStudentBulkRemoveDialogProps = {
  students: CourseStudentRemoveTarget[] | null;
  isLoading: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export function CourseStudentBulkRemoveDialog({
  students,
  isLoading,
  onOpenChange,
  onConfirm,
}: CourseStudentBulkRemoveDialogProps) {
  const count = students?.length ?? 0;

  const handleOpenChange = (open: boolean) => {
    if (!open && isLoading) {
      return;
    }
    onOpenChange(open);
  };

  return (
    <AlertDialog.Root open={students !== null && count > 0} onOpenChange={handleOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop />
        <AlertDialog.Popup>
          <AlertDialog.Title>Remove from class?</AlertDialog.Title>
          <AlertDialog.Description>
            {count > 0
              ? `${count} student${count === 1 ? "" : "s"} will no longer be on this class roster. You can add them again later if needed.`
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
            disabled={isLoading || count === 0}
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
