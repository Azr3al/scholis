"use client";

import { Button } from "@/components/primitives/button";
import { Tooltip } from "@/components/primitives/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { attendanceStatus } from "@/types/attendance";
import { ATTENDANCE_STATUS_OPTIONS } from "./attendance-status-config";

type AttendanceStatusControlProps = {
  value: attendanceStatus;
  onChange: (status: attendanceStatus) => void;
  disabled?: boolean;
  isMobile?: boolean;
  "aria-label"?: string;
};

export function AttendanceStatusControl({
  value,
  onChange,
  disabled = false,
  isMobile: isMobileProp,
  "aria-label": ariaLabel = "Attendance status",
}: AttendanceStatusControlProps) {
  const isMobileFallback = useIsMobile();
  const isMobile = isMobileProp ?? isMobileFallback;

  const group = (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "flex flex-wrap justify-start",
        isMobile ? "grid w-full grid-cols-2 gap-2" : "gap-1",
      )}
    >
      {ATTENDANCE_STATUS_OPTIONS.map((option) => {
        const isSelected = value === option.value;
        const btn = (
          <Button
            key={option.value}
            type="button"
            variant="secondary"
            size={isMobile ? "md" : "sm"}
            disabled={disabled}
            aria-pressed={isSelected}
            aria-label={option.label}
            onClick={() => onChange(option.value)}
            className={cn(
              "border transition-[background-color,color,border-color,transform] duration-[var(--duration-fast)] ease-[var(--ease-quiet)]",
              "active:scale-[0.94] active:border-border-strong motion-reduce:active:scale-100",
              isMobile
                ? "h-11 min-h-11 w-full justify-start gap-2 px-3"
                : "size-9 shrink-0 p-0",
              isSelected ? option.selectedClass : option.idleClass,
            )}
          >
            <option.Icon width={16} height={16} aria-hidden />
            {isMobile ? (
              <span className="font-medium">{option.label}</span>
            ) : (
              <span className="sr-only">{option.label}</span>
            )}
          </Button>
        );

        if (isMobile) return btn;

        return (
          <Tooltip.Root key={option.value}>
            <Tooltip.Trigger render={<span className="inline-flex">{btn}</span>} />
            <Tooltip.Portal>
              <Tooltip.Positioner>
                <Tooltip.Popup>{option.label}</Tooltip.Popup>
              </Tooltip.Positioner>
            </Tooltip.Portal>
          </Tooltip.Root>
        );
      })}
    </div>
  );

  return group;
}
