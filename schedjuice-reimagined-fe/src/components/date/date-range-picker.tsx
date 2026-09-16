"use client";

import { Calendar } from "@/components/date/calendar";
import { buttonVariants, Popover } from "@/components/primitives";
import { controlSizeClassName, type ControlSize } from "@/lib/ui/control-sizing";
import { dropdownPositionerClassName } from "@/lib/ui/overlay-classnames";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "iconoir-react";
import { forwardRef } from "react";
import type { DateRange } from "react-day-picker";

export type DateRangePickerProps = {
  from?: Date;
  to?: Date;
  onRangeChange: (range: { from?: Date; to?: Date }) => void;
  disabled?: boolean;
  fromDate?: Date | string;
  toDate?: Date | string;
  size?: ControlSize;
  className?: string;
  showTriggerIcon?: boolean;
} & Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "value" | "onChange" | "type"
>;

function formatRangeLabel(from?: Date, to?: Date): React.ReactNode {
  if (from && to) {
    return `${format(from, "MMM d, yyyy")} – ${format(to, "MMM d, yyyy")}`;
  }
  if (from) {
    return `${format(from, "MMM d, yyyy")} – …`;
  }
  return <span>Pick a date range</span>;
}

export const DateRangePicker = forwardRef<HTMLButtonElement, DateRangePickerProps>(
  function DateRangePicker(
    {
      from,
      to,
      onRangeChange,
      disabled = false,
      fromDate,
      toDate,
      size = "full",
      className,
      showTriggerIcon = true,
      ...rest
    },
    ref,
  ) {
    const convertedFromDate = fromDate ? new Date(fromDate) : undefined;
    const convertedToDate = toDate ? new Date(toDate) : undefined;
    const selected: DateRange | undefined =
      from || to ? { from, to } : undefined;
    const calendarDefaultMonth = from ?? to ?? convertedFromDate;
    const fromYear = convertedFromDate?.getFullYear() ?? 1940;
    const toYear =
      convertedToDate?.getFullYear() ?? new Date().getFullYear() + 20;
    const calendarFromDate = convertedFromDate ?? new Date(fromYear, 0, 1);
    const calendarToDate = convertedToDate ?? new Date(toYear, 11, 31);
    const disabledDays =
      convertedFromDate || convertedToDate
        ? [
            ...(convertedFromDate ? [{ before: convertedFromDate }] : []),
            ...(convertedToDate ? [{ after: convertedToDate }] : []),
          ]
        : undefined;

    return (
      <Popover.Root>
        <Popover.Trigger
          ref={ref}
          type="button"
          disabled={disabled}
          className={cn(
            buttonVariants({ variant: "secondary" }),
            controlSizeClassName(size),
            "min-w-[min(100%,17rem)] justify-start text-left font-normal",
            !from && !to && "text-text-muted",
            className,
          )}
          {...rest}
        >
          {showTriggerIcon ? (
            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" aria-hidden />
          ) : null}
          {formatRangeLabel(from, to)}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner className={dropdownPositionerClassName}>
            <Popover.Popup className="w-auto p-0">
              <Calendar
                mode="range"
                numberOfMonths={2}
                captionLayout="dropdown-buttons"
                selected={selected}
                onSelect={(range) =>
                  onRangeChange({ from: range?.from, to: range?.to })
                }
                initialFocus
                disabled={disabledDays}
                defaultMonth={calendarDefaultMonth}
                fromDate={calendarFromDate}
                toDate={calendarToDate}
                fromYear={fromYear}
                toYear={toYear}
              />
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    );
  },
);
DateRangePicker.displayName = "DateRangePicker";
