"use client";

import * as React from "react";
import { buttonVariants } from "@/components/primitives";
import { cn } from "@/lib/utils";
import { NavArrowLeft, NavArrowRight } from "iconoir-react";
import { DayPicker, DropdownProps } from "react-day-picker";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function CalendarDropdown({
  value,
  onChange,
  children,
  name,
  "aria-label": ariaLabel,
}: DropdownProps) {
  return (
    <select
      name={name}
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange?.(event)}
      className={cn(
        buttonVariants({ variant: "ghost" }),
        "h-7 appearance-none rounded-md border bg-transparent pl-2 pr-6 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring",
      )}
    >
      {children}
    </select>
  );
}

const CALENDAR_COMPONENTS = {
  Dropdown: CalendarDropdown,
  IconLeft: () => <NavArrowLeft className="h-4 w-4" />,
  IconRight: () => <NavArrowRight className="h-4 w-4" />,
};

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  fixedWeeks = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      fixedWeeks={fixedWeeks}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-sm font-medium",
        caption_dropdowns: "flex justify-center gap-1",
        nav: "space-x-1 flex items-center",
        nav_button: cn(
          buttonVariants({ variant: "secondary" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        head_cell:
          "text-text-muted rounded-md w-9 font-normal text-[0.8rem]",
        row: "flex w-full mt-2",
        cell: "text-center text-sm p-0 relative [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 p-0 font-normal aria-selected:opacity-100",
        ),
        day_selected:
          "bg-[var(--action,var(--data-green-strong,#2f6e58))] text-[var(--action-foreground,#ffffff)] hover:bg-[color-mix(in_srgb,var(--action,var(--data-green-strong,#2f6e58))_88%,#000)] hover:text-[var(--action-foreground,#ffffff)] focus:bg-[var(--action,var(--data-green-strong,#2f6e58))] focus:text-[var(--action-foreground,#ffffff)]",
        day_today:
          "[&:not([aria-selected])]:bg-surface-hover [&:not([aria-selected])]:text-text-primary [&:not([aria-selected])]:font-medium [&:not([aria-selected])]:ring-1 [&:not([aria-selected])]:ring-brand/30",
        day_outside:
          "!text-text-muted opacity-50 aria-selected:!text-[var(--action-foreground,#ffffff)] aria-selected:opacity-100",
        day_disabled: "!text-text-muted",
        day_range_middle:
          "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={CALENDAR_COMPONENTS}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
