"use client";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "iconoir-react";
import { cn } from "@/lib/utils";
import { dropdownPositionerClassName } from "@/lib/ui/overlay-classnames";
import { buttonVariants, Popover } from "@/components/primitives";
import { inputClassName } from "@/components/primitives/input";
import { Calendar } from "@/components/date/calendar";
import { ClearFieldButton } from "@/components/form/clear-field-button";
import { isFieldClearable } from "@/components/form/is-field-clearable";
import { forwardRef } from "react";
import { controlSizeClassName } from "@/lib/ui/control-sizing";
import type {
  DatePickerProps,
  NativeDatePickerInputProps,
  NativeDatePickerProps,
  PopoverDatePickerProps,
} from "./date-picker-types";

export type {
  DatePickerProps,
  DatePickerVariant,
  NativeDatePickerInputProps,
  NativeDatePickerProps,
  PopoverDatePickerProps,
  SharedDatePickerProps,
} from "./date-picker-types";

const DatePickerCmp = forwardRef<HTMLButtonElement, PopoverDatePickerProps>(
  function DatePickerCmp(
    {
      date,
      setDate,
      disabled = false,
      fromDate,
      toDate,
      defaultMonth,
      showTriggerIcon = true,
      size = "full",
      popoverAlign,
      popoverSide,
      className,
      required,
      clearable,
      ...rest
    },
    ref,
  ) {
    const showClear =
      isFieldClearable({ clearable, required }) && Boolean(date);
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
    const calendarFromDate = convertedFromDate ?? new Date(fromYear, 0, 1);
    const calendarToDate = convertedToDate ?? new Date(toYear, 11, 31);
    const disabledDays =
      convertedFromDate && convertedToDate
        ? [
            ...(convertedFromDate ? [{ before: convertedFromDate }] : []),
            ...(convertedToDate ? [{ after: convertedToDate }] : []),
          ]
        : undefined;
    return (
      <Popover.Root>
        <div className={cn("relative", size === "full" && "w-full")}>
          <Popover.Trigger
            ref={ref}
            type="button"
            disabled={disabled}
            className={cn(
              buttonVariants({ variant: "secondary" }),
              controlSizeClassName(size),
              "justify-start text-left font-normal",
              !date && "text-text-muted",
              showClear && "pr-8",
              className,
            )}
            {...rest}
          >
            {showTriggerIcon ? (
              <CalendarIcon className="mr-2 h-4 w-4" aria-hidden />
            ) : null}
            {date ? format(new Date(date), "PPP") : <span>Pick a date</span>}
          </Popover.Trigger>
          {showClear ? (
            <ClearFieldButton
              label="Clear date"
              disabled={disabled}
              onClear={() => setDate(undefined)}
            />
          ) : null}
        </div>
        <Popover.Portal>
          <Popover.Positioner
            className={dropdownPositionerClassName}
            align={popoverAlign}
            side={popoverSide}
          >
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
DatePickerCmp.displayName = "DatePickerCmp";

export const NativeDatePicker = forwardRef<
  HTMLInputElement,
  NativeDatePickerInputProps
>(function NativeDatePickerCmp(
  {
    date,
    setDate,
    disabled = false,
    fromDate,
    toDate,
    className,
    size = "full",
    defaultMonth: _defaultMonth,
    clearable: _clearable,
    ...rest
  },
  ref,
) {
  const min = fromDate ? format(new Date(fromDate), "yyyy-MM-dd") : undefined;
  const max = toDate ? format(new Date(toDate), "yyyy-MM-dd") : undefined;
  return (
    <input
      ref={ref}
      type="date"
      disabled={disabled}
      min={min}
      max={max}
      className={cn(inputClassName, controlSizeClassName(size), "w-full", className)}
      value={date ? format(new Date(date), "yyyy-MM-dd") : ""}
      onChange={(e) => {
        const v = e.target.value;
        setDate(v ? new Date(`${v}T00:00:00`) : undefined);
      }}
      {...rest}
    />
  );
});
NativeDatePicker.displayName = "NativeDatePicker";

export const DatePicker = forwardRef<
  HTMLButtonElement | HTMLInputElement,
  DatePickerProps
>(function DatePicker(props, ref) {
  if (props.variant === "native") {
    const { variant: _v, ...nativeProps } = props;
    return (
      <NativeDatePicker
        ref={ref as React.Ref<HTMLInputElement>}
        {...nativeProps}
      />
    );
  }
  return (
    <DatePickerCmp
      ref={ref as React.Ref<HTMLButtonElement>}
      {...props}
    />
  );
});
DatePicker.displayName = "DatePicker";
