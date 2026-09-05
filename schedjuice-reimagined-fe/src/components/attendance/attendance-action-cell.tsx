"use client";

import { memo } from "react";
import { AttendanceNoteField } from "@/components/attendance/attendance-note-field";
import { AttendanceRowSaveIndicator } from "@/components/attendance/attendance-row-save-indicator";
import { AttendanceStatusControl } from "@/components/attendance/attendance-status-control";
import type { RowSaveState } from "@/components/attendance/use-attendance-autosave";
import { cn } from "@/lib/utils";
import { attendanceStatus } from "@/types/attendance";

type AttendanceActionCellProps = {
  rowId: number;
  status: attendanceStatus;
  note: string;
  studentName: string;
  alternateName: string | null;
  isDroppedOut: boolean;
  rowSaveState: RowSaveState;
  recentlyChanged: boolean;
  isMobile: boolean;
  onStatusChange: (rowId: number, status: attendanceStatus) => void;
  onNoteChange: (rowId: number, note: string) => void;
};

function AttendanceActionCellComponent({
  rowId,
  status,
  note,
  studentName,
  alternateName,
  isDroppedOut,
  rowSaveState,
  recentlyChanged,
  isMobile,
  onStatusChange,
  onNoteChange,
}: AttendanceActionCellProps) {
  const enrollmentLabel = isDroppedOut ? "removed" : "active student";

  return (
    <div
      className={cn(
        "flex w-full min-w-0 flex-col gap-3 md:flex-row md:items-start",
        status === attendanceStatus.unregistered &&
          !recentlyChanged &&
          "rounded-md bg-surface-sunken",
        recentlyChanged && "rounded-md bg-brand/5",
      )}
    >
      <div className="min-h-14 space-y-0.5 md:hidden">
        <div className="flex min-w-0 items-baseline justify-between gap-2">
          <p className="truncate text-sm font-medium">{studentName}</p>
          <span
            className={cn(
              "shrink-0 text-xs",
              isDroppedOut ? "text-danger" : "text-text-muted",
            )}
          >
            {enrollmentLabel}
          </span>
        </div>
        <p
          className={cn(
            "truncate text-xs leading-snug",
            alternateName ? "text-text-muted" : "invisible",
          )}
          aria-hidden={!alternateName}
        >
          {alternateName || "No alternate name"}
        </p>
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <AttendanceRowSaveIndicator state={rowSaveState} />
        <AttendanceStatusControl
          value={status}
          isMobile={isMobile}
          onChange={(nextStatus) => onStatusChange(rowId, nextStatus)}
          aria-label={`Attendance status for ${studentName}`}
        />
      </div>
      <AttendanceNoteField
        id={`note-${rowId}`}
        value={note}
        status={status}
        onChange={(nextNote) => onNoteChange(rowId, nextNote)}
      />
    </div>
  );
}

export const AttendanceActionCell = memo(AttendanceActionCellComponent);
