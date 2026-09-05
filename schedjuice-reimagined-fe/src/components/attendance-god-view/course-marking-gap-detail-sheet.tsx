"use client";
import { Spinner } from "@/components/primitives/spinner";
import { Button, Sheet, buttonVariants } from "@/components/primitives";

import { DailyAbsencesTable } from "@/components/attendance-god-view/daily-absences-table";
import {
  getDominantProblemLabel,
} from "@/helpers/attendance-god-view";
import { formatDateRange } from "@/helpers/date";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";
import type {
  AttendanceGodViewCourseGapRow,
  AttendanceGodViewDailyRow,
} from "@/types/attendance-god-view";
import { Download, OpenNewWindow as ExternalLink } from "iconoir-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  courseRow?: AttendanceGodViewCourseGapRow;
  records?: AttendanceGodViewDailyRow[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  onExport?: () => void;
  exportPending?: boolean;
};

export function CourseMarkingGapDetailSheet({
  open,
  onClose,
  courseRow,
  records = [],
  isLoading,
  isError,
  error,
  onExport,
  exportPending = false,
}: Props) {
  return (
    <Sheet.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Sheet.Portal>
        <Sheet.Backdrop />
        <Sheet.Popup className="w-full sm:max-w-2xl overflow-y-auto">
        <div>
          <Sheet.Title>{courseRow?.course_title ?? "Course"}</Sheet.Title>
          <Sheet.Description>
            {courseRow
              ? `${formatDateRange(courseRow.event_date_from, courseRow.event_date_to)} · ${getDominantProblemLabel(courseRow.dominant_problem)} dominant`
              : "Course marking gap details"}
          </Sheet.Description>
        </div>

        {courseRow ? (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <p className="text-text-muted">Scheduled</p>
                <p className="font-medium tabular-nums">{courseRow.scheduled_count}</p>
              </div>
              <div>
                <p className="text-text-muted">Unregistered</p>
                <p className="font-medium tabular-nums">
                  {courseRow.unregistered_count} ({courseRow.unregistered_rate}%)
                </p>
              </div>
              <div>
                <p className="text-text-muted">Present / Late / Absent</p>
                <p className="font-medium tabular-nums">
                  {courseRow.present_count} / {courseRow.late_count} /{" "}
                  {courseRow.absent_count}
                </p>
              </div>
              <div>
                <p className="text-text-muted">Dominant</p>
                <p className="font-medium">
                  {getDominantProblemLabel(courseRow.dominant_problem)}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href={`/courses/${courseRow.course_id}/attendance`}
                className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "inline-flex items-center")}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Open course attendance
              </Link>
              {onExport ? (
                <Button
                  variant="secondary" size="sm"
                  disabled={exportPending || isLoading}
                  onClick={onExport}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Export CSV
                </Button>
              ) : null}
            </div>

            {isLoading ? (
              <div className="flex justify-center py-8">
                <Spinner className="h-8 w-8 text-text-muted" />
              </div>
            ) : isError ? (
              <p className="text-sm text-destructive">
                {parseSchedjuiceApiError(error, "Failed to load course details.")}
              </p>
            ) : records.length === 0 ? (
              <p className="text-sm text-text-muted">
                No matching students for this problem type.
              </p>
            ) : (
              <DailyAbsencesTable
                rows={records}
                onOpenDetail={() => undefined}
              />
            )}
          </div>
        ) : null}
      </Sheet.Popup>
      </Sheet.Portal>
    </Sheet.Root>
  );
}
