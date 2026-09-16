"use client";

import { updateEntity } from "@/app/client-api/utils";
import { Button } from "@/components/primitives";
import {
  AlertDialog,
} from "@/components/primitives";
import { useToast } from "@/components/primitives";
import { invalidateCourseSummaryCaches } from "@/lib/course-cache";
import { queryClient } from "@/lib/query";
import { courseStatus, courseType } from "@/types/course";
import { useMutation } from "@tanstack/react-query";
import { WhiteFlag as Flag } from "iconoir-react";
import { useState } from "react";

type CourseEndButtonProps = {
  course: courseType;
};

export function CourseEndButton({ course }: CourseEndButtonProps) {
  const toast = useToast();
  const [open, setOpen] = useState(false);

  const endCourseMutation = useMutation({
    mutationKey: [`endCourse${course.id}`],
    mutationFn: () =>
      updateEntity("courses", course.id, { status: courseStatus.ended }),
    onSuccess: () => {
      toast.add({
        title: "Course ended",
        description: "This course is now marked as ended.",
      });
      void invalidateCourseSummaryCaches(queryClient, course.id);
      setOpen(false);
    },
    onError: () => {
      toast.add({
        title: "Could not end course",
        description: "Try again or contact your administrator.",
      });
    },
  });

  if (course.status === courseStatus.ended) {
    return null;
  }

  const isPending = endCourseMutation.isPending;

  return (
    <AlertDialog.Root open={open} onOpenChange={setOpen}>
      <AlertDialog.Trigger
        render={<Button
          type="button"
          variant="secondary"
          size="sm"
          className="flex shrink-0 items-center gap-2 active:scale-[0.98]"
          disabled={isPending}
        />}
      >
          <Flag className="size-4" aria-hidden />
          End course
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop />
        <AlertDialog.Popup>
          <AlertDialog.Title>End this course?</AlertDialog.Title>
          <AlertDialog.Description>
            The course will be marked as ended. You can still open it, but it
            will no longer count as active.
          </AlertDialog.Description>
        <div className="flex justify-end gap-2">
          <AlertDialog.Close
            render={<Button type="button" variant="ghost" disabled={isPending} />}
          >
            Cancel
          </AlertDialog.Close>
          <Button
            type="button"
            variant="danger"
            disabled={isPending}
            onClick={() => endCourseMutation.mutate()}
          >
            {isPending ? "Ending…" : "End course"}
          </Button>
        </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
