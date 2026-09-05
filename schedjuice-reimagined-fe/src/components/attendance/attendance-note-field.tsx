"use client";

import { Input } from "@/components/primitives/input";
import { cn } from "@/lib/utils";
import { attendanceStatus } from "@/types/attendance";

type AttendanceNoteFieldProps = {
  id: string;
  value: string;
  status: attendanceStatus;
  onChange: (value: string) => void;
  disabled?: boolean;
};

export function AttendanceNoteField({
  id,
  value,
  status,
  onChange,
  disabled = false,
}: AttendanceNoteFieldProps) {
  const isUnregistered = status === attendanceStatus.unregistered;
  const isDisabled = disabled || isUnregistered;
  const hintText =
    "Notes are available after marking a status other than unregistered.";

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <Input
        id={id}
        disabled={isDisabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={isUnregistered ? "Select a status first" : "Add a note"}
        {...(isUnregistered ? { "aria-describedby": `${id}-hint` } : {})}
        title={isUnregistered ? hintText : undefined}
        className={cn("min-w-0", isUnregistered && "cursor-not-allowed opacity-50")}
      />
      <p
        id={`${id}-hint`}
        className={cn(
          "min-h-[1.125rem] text-xs leading-snug text-text-muted",
          !isUnregistered && "invisible",
        )}
        aria-hidden={!isUnregistered}
      >
        {hintText}
      </p>
    </div>
  );
}
