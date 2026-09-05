"use client";

import { ATTENDANCE_STATUS_OPTIONS } from "@/components/attendance/attendance-status-config";
import { attendanceStatus } from "@/types/attendance";
import { cn } from "@/lib/utils";

const STATUS_CLASS: Record<string, string> = {
  [attendanceStatus.present]: "text-success",
  [attendanceStatus.late]: "text-warning-foreground",
  [attendanceStatus.absent]: "text-danger",
  [attendanceStatus.absentWithLeave]: "text-status-blue",
  [attendanceStatus.unregistered]: "text-text-muted",
};

const STATUS_LABEL_BY_VALUE = Object.fromEntries(
  ATTENDANCE_STATUS_OPTIONS.map((option) => [option.value, option.label]),
) as Record<string, string>;

function normalizeStatus(raw: string): string {
  return raw.trim().toLowerCase();
}

export function AttendanceStatusLabel({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const key = normalizeStatus(status);
  const colorClass = STATUS_CLASS[key] ?? "text-text-muted";
  const label = STATUS_LABEL_BY_VALUE[key] ?? key.charAt(0).toUpperCase() + key.slice(1);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-sm capitalize",
        colorClass,
        className,
      )}
    >
      <span aria-hidden className="text-[0.5rem] leading-none">
        ●
      </span>
      {label}
    </span>
  );
}
