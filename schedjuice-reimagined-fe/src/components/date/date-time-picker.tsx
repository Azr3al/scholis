"use client";

import * as React from "react";
import { Calendar as CalendarIcon } from "iconoir-react";
import { format } from "date-fns";

import { cn } from "@/lib/utils";
import { dropdownPositionerClassName } from "@/lib/ui/overlay-classnames";
import { buttonVariants, Popover, Select } from "@/components/primitives";
import { Calendar } from "@/components/date/calendar";
import { ClearFieldButton } from "@/components/form/clear-field-button";
import { isFieldClearable } from "@/components/form/is-field-clearable";
import {
  resolveTimeDisplayFormat,
  type TimeDisplayFormatValue,
} from "@/helpers/time-format";
import { useTenant } from "@/hooks/useTenant";
import { forwardRef, useMemo, useState } from "react";

type DateTimePickerProps = {
  date?: Date | null;
  setDate: (date: Date | null) => void;
  /** Shown on the trigger when no date is selected */
  emptyPlaceholder?: string;
  timeDisplayFormat?: TimeDisplayFormatValue;
  required?: boolean;
  clearable?: boolean;
} & Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "value" | "onChange" | "type"
>;

const fromYear = 1940;
const toYear = new Date().getFullYear() + 20;
const calendarFromDate = new Date(fromYear, 0, 1);
const calendarToDate = new Date(toYear, 11, 31);

const pad2 = (n: number) => String(n).padStart(2, "0");

const DateTimePicker = forwardRef<HTMLButtonElement, DateTimePickerProps>(
  (
    {
      date,
      setDate,
      emptyPlaceholder,
      timeDisplayFormat,
      disabled,
      className,
      required,
      clearable,
      ...rest
    },
    ref,
  ) => {
    const { tenant } = useTenant();
    const timeFormat = resolveTimeDisplayFormat(
      timeDisplayFormat ?? tenant?.time_display_format,
    );
    const is24h = timeFormat === "24h";
    const placeholder =
      emptyPlaceholder ??
      (is24h ? "MM/DD/YYYY HH:mm" : "MM/DD/YYYY hh:mm aa");

    const [isOpen, setIsOpen] = useState(false);
    const hours12 = useMemo(
      () => Array.from({ length: 12 }, (_, i) => i + 1),
      [],
    );
    const hours24 = useMemo(
      () => Array.from({ length: 24 }, (_, i) => i),
      [],
    );
    const hourItems = useMemo(
      () =>
        (is24h ? hours24 : hours12).map((hour) => ({
          value: is24h ? pad2(hour) : String(hour),
          label: is24h ? pad2(hour) : String(hour),
        })),
      [hours12, hours24, is24h],
    );
    const minuteItems = useMemo(
      () =>
        Array.from({ length: 60 }, (_, minute) => ({
          value: String(minute),
          label: pad2(minute),
        })),
      [],
    );
    const ampmItems = useMemo(
      () => [
        { value: "AM", label: "AM" },
        { value: "PM", label: "PM" },
      ],
      [],
    );

    const showClear = isFieldClearable({ clearable, required }) && Boolean(date);

    const handleDateSelect = (selectedDate: Date | undefined) => {
      if (selectedDate) {
        setDate(selectedDate);
      }
    };

    const handleTimeChange = (
      type: "hour" | "minute" | "ampm",
      value: string,
    ) => {
      if (date) {
        const newDate = new Date(date);
        if (type === "hour") {
          if (is24h) {
            newDate.setHours(parseInt(value, 10));
          } else {
            newDate.setHours(
              (parseInt(value, 10) % 12) + (newDate.getHours() >= 12 ? 12 : 0),
            );
          }
        } else if (type === "minute") {
          newDate.setMinutes(parseInt(value, 10));
        } else if (type === "ampm") {
          const currentHours = newDate.getHours();
          newDate.setHours(
            value === "PM" ? currentHours + 12 : currentHours - 12,
          );
        }
        setDate(newDate);
      }
    };

    return (
      <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
        <div className="relative w-full">
          <Popover.Trigger
            ref={ref}
            type="button"
            disabled={disabled}
            className={cn(
              buttonVariants({ variant: "secondary" }),
              "h-10 w-full justify-start px-3 text-left font-normal",
              !date && "text-muted-foreground",
              showClear && "pr-8",
              className,
            )}
            {...rest}
          >
            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
            {date ? (
              <span className="truncate">
                {format(
                  date,
                  is24h ? "MM/dd/yyyy HH:mm" : "MM/dd/yyyy hh:mm aa",
                )}
              </span>
            ) : (
              <span>{placeholder}</span>
            )}
          </Popover.Trigger>
          {showClear ? (
            <ClearFieldButton
              label="Clear date"
              disabled={disabled}
              onClear={() => setDate(null)}
            />
          ) : null}
        </div>
        <Popover.Portal>
          <Popover.Positioner className={dropdownPositionerClassName}>
            <Popover.Popup className="w-auto p-0">
              <div className="flex flex-col">
                <Calendar
                  mode="single"
                  selected={date ?? undefined}
                  captionLayout="dropdown-buttons"
                  fromDate={calendarFromDate}
                  toDate={calendarToDate}
                  fromYear={fromYear}
                  toYear={toYear}
                  onSelect={handleDateSelect}
                  initialFocus
                />
                <div className="flex gap-2 p-3">
                  <Select
                    className="min-w-0"
                    value={
                      date != null
                        ? is24h
                          ? pad2(date.getHours())
                          : (date.getHours() % 12 || 12).toString()
                        : undefined
                    }
                    onValueChange={(val) =>
                      handleTimeChange("hour", String(val ?? ""))
                    }
                    items={hourItems}
                    placeholder="hh"
                  />
                  <Select
                    className="min-w-0"
                    value={date != null ? date.getMinutes().toString() : undefined}
                    onValueChange={(val) =>
                      handleTimeChange("minute", String(val ?? ""))
                    }
                    items={minuteItems}
                    placeholder="mm"
                  />
                  {is24h ? null : (
                    <Select
                      className="min-w-0"
                      value={
                        date != null
                          ? date.getHours() >= 12
                            ? "PM"
                            : "AM"
                          : undefined
                      }
                      onValueChange={(val) =>
                        handleTimeChange("ampm", String(val ?? ""))
                      }
                      items={ampmItems}
                      placeholder="am/pm"
                    />
                  )}
                </div>
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    );
  },
);

DateTimePicker.displayName = "DateTimePicker";

export { DateTimePicker };
