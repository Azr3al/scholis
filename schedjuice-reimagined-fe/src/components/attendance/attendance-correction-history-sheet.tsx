"use client";

import { fetchAttendanceCorrections } from "@/app/client-api/attendance-self-correction";
import {
  AttendanceCorrectionHistoryCards,
  AttendanceCorrectionHistorySkeleton,
} from "@/components/attendance/attendance-correction-history";
import { Sheet } from "@/components/primitives";
import { EmptyCopy, EmptyState } from "@/components/primitives/empty";
import { EMPTY_COPY_PRESETS } from "@/components/primitives/empty/empty-copy-presets";
import { useQuery } from "@tanstack/react-query";

export function AttendanceCorrectionHistorySheet({
  attendanceId,
  teacherName,
  sessionLabel,
  onClose,
}: {
  attendanceId: number;
  teacherName: string;
  sessionLabel?: string;
  onClose: () => void;
}) {
  const open = attendanceId > 0;

  const { data = [], isLoading, isError } = useQuery({
    queryKey: ["attendance-corrections", attendanceId],
    queryFn: () => fetchAttendanceCorrections(attendanceId),
    enabled: open,
  });

  const description = sessionLabel
    ? `${sessionLabel} · Correction history for this check-in`
    : "Correction history for this check-in";

  return (
    <Sheet.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Sheet.Portal>
        <Sheet.Backdrop />
        <Sheet.Popup
          side="right"
          className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-none md:w-[720px] lg:w-[820px]"
        >
          <div className="space-y-1 border-b border-border px-6 py-5 pr-12 text-left">
            <Sheet.Title className="text-lg font-semibold text-text-primary">
              {teacherName || "Teacher"}
            </Sheet.Title>
            <Sheet.Description className="text-xs text-text-muted">
              {description}
            </Sheet.Description>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {isLoading ? (
              <AttendanceCorrectionHistorySkeleton />
            ) : isError ? (
              <p className="text-sm text-destructive" role="alert">
                Failed to load correction history. Please try again.
              </p>
            ) : data.length === 0 ? (
              <EmptyState>
                <EmptyCopy {...EMPTY_COPY_PRESETS.nothingHere} />
              </EmptyState>
            ) : (
              <AttendanceCorrectionHistoryCards items={data} />
            )}
          </div>
        </Sheet.Popup>
      </Sheet.Portal>
    </Sheet.Root>
  );
}
