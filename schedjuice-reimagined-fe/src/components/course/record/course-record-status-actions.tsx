"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { NavArrowDown as ChevronDown, Pause, Xmark, Refresh, Play } from "iconoir-react";
import StatusBadge from "@/components/course/status-badge";
import { DatePicker } from "@/components/date/date-picker";
import { Button } from "@/components/primitives";
import {
  AlertDialog,
} from "@/components/primitives";
import {
  Dialog,
} from "@/components/primitives";
import {
  Menu,
} from "@/components/primitives";
import { Field } from "@/components/primitives";
import { useToast } from "@/components/primitives";
import { cleanDatesForBackend } from "@/helpers/date";
import { invalidateCourseSummaryCaches } from "@/lib/course-cache";
import {
  endCourse,
  pauseCourse,
  reactivateCourse,
  resumeCourse,
} from "@/lib/course-status-api";
import {
  getCourseStatusMenuItems,
  type CourseStatusMenuAction,
} from "@/lib/course-status-menu-items";
import { queryClient } from "@/lib/query";
import { type courseType } from "@/types/course";

const menuLabels: Record<
  CourseStatusMenuAction,
  { label: string; icon: React.ReactNode; destructive?: boolean }
> = {
  pause: { label: "Pause course", icon: <Pause width={16} height={16} /> },
  resume: { label: "Resume course", icon: <Play width={16} height={16} /> },
  end: {
    label: "End course",
    icon: <Xmark width={16} height={16} />,
    destructive: true,
  },
  reactivate: { label: "Reactivate course", icon: <Refresh width={16} height={16} /> },
};

export function CourseRecordStatusActions({
  course,
  canManageStatus,
}: {
  course: courseType;
  canManageStatus: boolean;
}) {
  const toast = useToast();
  const [endDialogOpen, setEndDialogOpen] = useState(false);
  const [reactivateDialogOpen, setReactivateDialogOpen] = useState(false);
  const [reactivateStartDate, setReactivateStartDate] = useState<Date | undefined>(
    undefined,
  );
  const [reactivateEndDate, setReactivateEndDate] = useState<Date | undefined>(
    undefined,
  );

  const invalidateCourse = () => {
    void invalidateCourseSummaryCaches(queryClient, course.id);
  };

  const openReactivateDialog = () => {
    setReactivateStartDate(
      course.start_date ? new Date(course.start_date as string | Date) : undefined,
    );
    setReactivateEndDate(
      course.end_date ? new Date(course.end_date as string | Date) : undefined,
    );
    setReactivateDialogOpen(true);
  };

  const pauseMutation = useMutation({
    mutationKey: [`pauseCourse${course.id}`],
    mutationFn: () => pauseCourse(course.id),
    onSuccess: () => {
      toast.add({ title: "Course paused" });
      invalidateCourse();
    },
    onError: () => {
      toast.add({
        title: "Could not pause course",
        description: "Try again or check your permissions.",
      });
    },
  });

  const resumeMutation = useMutation({
    mutationKey: [`resumeCourse${course.id}`],
    mutationFn: () => resumeCourse(course.id),
    onSuccess: () => {
      toast.add({ title: "Course resumed" });
      invalidateCourse();
    },
    onError: () => {
      toast.add({
        title: "Could not resume course",
        description: "Try again or check your permissions.",
      });
    },
  });

  const endMutation = useMutation({
    mutationKey: [`endCourse${course.id}`],
    mutationFn: () => endCourse(course.id),
    onSuccess: () => {
      toast.add({ title: "Course ended" });
      setEndDialogOpen(false);
      invalidateCourse();
    },
    onError: () => {
      toast.add({
        title: "Could not end course",
        description: "Try again or check your permissions.",
      });
    },
  });

  const reactivateMutation = useMutation({
    mutationKey: [`reactivateCourse${course.id}`],
    mutationFn: () => {
      const payload = cleanDatesForBackend(
        {
          start_date: reactivateStartDate,
          end_date: reactivateEndDate,
        },
        ["start_date", "end_date"],
      );
      return reactivateCourse(course.id, payload);
    },
    onSuccess: () => {
      toast.add({ title: "Course reactivated" });
      setReactivateDialogOpen(false);
      invalidateCourse();
    },
    onError: () => {
      toast.add({
        title: "Could not reactivate course",
        description: "Try again or check your permissions.",
      });
    },
  });

  const isPending =
    pauseMutation.isPending ||
    resumeMutation.isPending ||
    endMutation.isPending ||
    reactivateMutation.isPending;

  const reactivateDateError =
    reactivateStartDate &&
    reactivateEndDate &&
    reactivateStartDate > reactivateEndDate
      ? "End date must be on or after the start date."
      : null;

  if (!canManageStatus) {
    return <StatusBadge status={course.status} border={false} bg={false} />;
  }

  const menuItems = getCourseStatusMenuItems(course.status);

  const handleMenuAction = (action: CourseStatusMenuAction) => {
    switch (action) {
      case "pause":
        pauseMutation.mutate();
        break;
      case "resume":
        resumeMutation.mutate();
        break;
      case "end":
        setEndDialogOpen(true);
        break;
      case "reactivate":
        openReactivateDialog();
        break;
    }
  };

  return (
    <>
      <Menu.Root>
        <Menu.Trigger
          render={<button
            type="button"
            aria-label="Course status actions"
            className="inline-flex items-center gap-0.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />}
        >
            <StatusBadge status={course.status} border={false} bg={false} />
            <ChevronDown className="size-4 opacity-70" aria-hidden />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner align="start">
            <Menu.Popup className="min-w-[10rem]">
          {menuItems.map((action) => {
            const { label, icon, destructive } = menuLabels[action];
            return (
              <Menu.Item
                key={action}
                disabled={isPending}
                className={
                  destructive
                    ? "gap-2 text-destructive focus:bg-destructive/10 focus:text-destructive"
                    : "gap-2"
                }
                onClick={() => {
                  handleMenuAction(action);
                }}
              >
                {icon}
                {label}
              </Menu.Item>
            );
          })}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>

      <AlertDialog.Root open={endDialogOpen} onOpenChange={setEndDialogOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop />
          <AlertDialog.Popup>
            <AlertDialog.Title>End this course?</AlertDialog.Title>
            <AlertDialog.Description>
              This marks the course as ended immediately. It stays ended until
              dates are changed or status is updated again. Students will see
              the course as ended.
            </AlertDialog.Description>
          <div className="flex justify-end gap-2">
            <AlertDialog.Close render={<Button type="button" variant="ghost" />}>
              Cancel
            </AlertDialog.Close>
            <AlertDialog.Close
              render={
                <Button
                  type="button"
                  variant="danger"
                  disabled={endMutation.isPending}
                  onClick={() => endMutation.mutate()}
                />
              }
            >
              End course
            </AlertDialog.Close>
          </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>

      <Dialog.Root open={reactivateDialogOpen} onOpenChange={setReactivateDialogOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop />
          <Dialog.Popup>
            <Dialog.Title>Reactivate course</Dialog.Title>
            <Dialog.Description>
              Set a new date range for this course. It will become planned or
              active based on these dates.
            </Dialog.Description>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field.Root className="space-y-2">
              <Field.Label>Start date</Field.Label>
              <DatePicker
                date={reactivateStartDate}
                toDate={reactivateEndDate}
                setDate={(date) => {
                  setReactivateStartDate(date);
                  if (date && reactivateEndDate && reactivateEndDate < date) {
                    setReactivateEndDate(undefined);
                  }
                }}
              />
            </Field.Root>
            <Field.Root className="space-y-2">
              <Field.Label>End date</Field.Label>
              <DatePicker
                date={reactivateEndDate}
                fromDate={reactivateStartDate}
                setDate={setReactivateEndDate}
              />
            </Field.Root>
          </div>
          {reactivateDateError ? (
            <p className="text-sm text-destructive">{reactivateDateError}</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setReactivateDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              isLoading={reactivateMutation.isPending}
              disabled={
                !reactivateStartDate ||
                !reactivateEndDate ||
                Boolean(reactivateDateError) ||
                isPending
              }
              onClick={() => reactivateMutation.mutate()}
            >
              Reactivate course
            </Button>
          </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
