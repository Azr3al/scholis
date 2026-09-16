"use client";

import { Button } from "@/components/primitives/button";
import { AttendanceAutosaveStatusBar } from "@/components/attendance/attendance-autosave-status";
import { IncludeRemovedStudentsToggle } from "@/components/attendance/include-removed-students-toggle";
import type { AttendanceAutosaveStatus } from "@/components/attendance/use-attendance-autosave";
import { attendanceMarkingToolbarClassName } from "@/lib/ui-remediation/r9-course-record-layout-classes";
import { cn } from "@/lib/utils";

type AttendanceMarkingToolbarProps = {
  presentCount: number;
  totalCount: number;
  presentPercent: number;
  autosaveStatus: AttendanceAutosaveStatus;
  hasPendingChanges: boolean;
  savingIndicatorVisible: boolean;
  lastSavedAt: number | null;
  onRetryAutosave: () => void;
  onMarkAllPresent: () => void;
  onMarkUnregisteredAbsent: () => void;
  onCopyAbsenceList: () => void;
  onUndoMarkAll: () => void;
  markAllDisabled: boolean;
  markUnregisteredDisabled: boolean;
  copyAbsenceListDisabled: boolean;
  undoVisible: boolean;
  canToggleIncludeRemoved?: boolean;
  includeRemoved?: boolean;
  onIncludeRemovedChange?: (value: boolean) => void;
  className?: string;
};

export function AttendanceMarkingToolbar({
  presentCount,
  totalCount,
  presentPercent,
  autosaveStatus,
  hasPendingChanges,
  savingIndicatorVisible,
  lastSavedAt,
  onRetryAutosave,
  onMarkAllPresent,
  onMarkUnregisteredAbsent,
  onCopyAbsenceList,
  onUndoMarkAll,
  markAllDisabled,
  markUnregisteredDisabled,
  copyAbsenceListDisabled,
  undoVisible,
  canToggleIncludeRemoved,
  includeRemoved,
  onIncludeRemovedChange,
  className,
}: AttendanceMarkingToolbarProps) {
  return (
    <div
      className={cn(attendanceMarkingToolbarClassName(), className)}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            className="w-full border-success sm:w-auto"
            onClick={onMarkAllPresent}
            disabled={markAllDisabled}
          >
            Mark all as present
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="w-full sm:w-auto"
            onClick={onMarkUnregisteredAbsent}
            disabled={markUnregisteredDisabled}
          >
            Mark unregistered as absent
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="w-full sm:w-auto"
            onClick={onCopyAbsenceList}
            disabled={copyAbsenceListDisabled}
          >
            Copy absence list
          </Button>
          {undoVisible ? (
            <span
              role="button"
              tabIndex={0}
              onClick={onUndoMarkAll}
              onKeyDown={(e) => {
                if (e.key === "Enter") onUndoMarkAll();
              }}
              className="cursor-pointer text-sm text-accent underline-offset-2 hover:underline"
            >
              Undo
            </span>
          ) : null}
          {canToggleIncludeRemoved && onIncludeRemovedChange ? (
            <IncludeRemovedStudentsToggle
              checked={includeRemoved ?? false}
              onCheckedChange={onIncludeRemovedChange}
            />
          ) : null}
          <p className="font-mono text-sm font-medium tabular-nums sm:hidden">
            Present ({presentCount}/{totalCount}) {presentPercent}%
          </p>
        </div>

        <p className="hidden text-center text-sm font-medium font-mono tabular-nums sm:block">
          Present ({presentCount}/{totalCount}) {presentPercent}%
        </p>

        <div className="flex justify-end sm:min-w-[10rem]">
          <AttendanceAutosaveStatusBar
            status={autosaveStatus}
            hasPendingChanges={hasPendingChanges}
            savingIndicatorVisible={savingIndicatorVisible}
            lastSavedAt={lastSavedAt}
            onRetry={onRetryAutosave}
          />
        </div>
      </div>
    </div>
  );
}
