"use client";

import { format } from "date-fns";
import { Calendar as CalendarIcon } from "iconoir-react";
import { cn } from "@/lib/utils";
import { dropdownPositionerClassName } from "@/lib/ui/overlay-classnames";
import { buttonVariants, Popover } from "@/components/primitives";
import { Calendar } from "@/app/_chrome/calendar";
import { forwardRef } from "react";

export type DatePickerProps = {
  date?: Date;
  setDate: (date?: Date) => void;
  disabled?: boolean;
  fromDate?: Date | string;
  toDate?: Date | string;
  /** Initial calendar month when no date is selected. */
  defaultMonth?: Date | string;
  /** When false, the trigger omits the calendar icon (wizard / compact layouts). */
  showTriggerIcon?: boolean;
} & Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "value" | "onChange" | "type"
>;

export const DatePicker = forwardRef<HTMLButtonElement, DatePickerProps>(
  function DatePickerCmp(
    {
      date,
      setDate,
      disabled = false,
      fromDate,
      toDate,
      defaultMonth,
      showTriggerIcon = true,
      className,
      ...rest
    },
    ref,
  ) {
    const selectedDate = date ? new Date(date) : undefined;
    const convertedFromDate = fromDate ? new Date(fromDate) : undefined;
    const convertedToDate = toDate ? new Date(toDate) : undefined;
    const convertedDefaultMonth = defaultMonth
      ? new Date(defaultMonth)
      : undefined;
    const calendarDefaultMonth =
      selectedDate ?? convertedDefaultMonth ?? convertedFromDate;
    const fromYear = convertedFromDate?.getFullYear() ?? 1940;
    const toYear =
      convertedToDate?.getFullYear() ?? new Date().getFullYear() + 20;
    const calendarFromDate =
      convertedFromDate ?? new Date(fromYear, 0, 1);
    const calendarToDate = convertedToDate ?? new Date(toYear, 11, 31);
    const disabledDays =
      convertedFromDate && convertedToDate
        ? [
            ...(convertedFromDate ? [{ before: convertedFromDate }] : []),
            ...(convertedToDate ? [{ after: convertedToDate }] : []),
          ]
        : undefined;
    return (
      <Popover.Root modal>
        <Popover.Trigger
          ref={ref}
          type="button"
          disabled={disabled}
          className={cn(
            buttonVariants({ variant: "secondary"  }),
            "w-full justify-start text-left font-normal",
            !date && "text-muted-foreground",
            className,
          )}
          {...rest}
        >
          {showTriggerIcon ? (
            <CalendarIcon className="mr-2 h-4 w-4" aria-hidden />
          ) : null}
          {date ? format(new Date(date), "PPP") : <span>Pick a date</span>}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner className={dropdownPositionerClassName}>
            <Popover.Popup className="w-auto p-0">
              <Calendar
                mode="single"
                captionLayout="dropdown-buttons"
                selected={selectedDate}
                onSelect={setDate}
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
DatePicker.displayName = "DatePicker";
