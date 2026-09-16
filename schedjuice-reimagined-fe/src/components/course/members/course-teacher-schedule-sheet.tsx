"use client";

import TeacherScheduleBadges from "@/components/course/teacher-schedule-badges";
import { Button } from "@/components/primitives";
import {
  Sheet,
} from "@/components/primitives";

export interface CourseTeacherScheduleSheetProps {
  courseId: string | number;
  userId?: number;
  events?: any[];
  /** Used for SheetTitle (e.g. staff member name). */
  personName?: string;
}

export function CourseTeacherScheduleSheet({
  courseId,
  userId,
  events,
  personName,
}: CourseTeacherScheduleSheetProps) {
  const title = personName?.trim()
    ? `Schedule — ${personName.trim()}`
    : "Schedule";

  return (
    <Sheet.Root>
      <Sheet.Trigger
        render={<Button
          type="button"
          variant="secondary"
          size="sm"
          className="transition-colors active:scale-[0.98]"
          onClick={(e) => e.stopPropagation()}
        />}
      >
          View schedule
      </Sheet.Trigger>
      <Sheet.Portal>
        <Sheet.Backdrop />
        <Sheet.Popup
          side="right"
          className="flex w-full flex-col overflow-y-auto sm:max-w-md"
        >
        <Sheet.Title>{title}</Sheet.Title>
        <div className="flex flex-col gap-4 pt-4">
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <TeacherScheduleBadges
              courseId={courseId}
              userId={userId}
              events={events}
            />
          </div>
        </div>
        </Sheet.Popup>
      </Sheet.Portal>
    </Sheet.Root>
  );
}
