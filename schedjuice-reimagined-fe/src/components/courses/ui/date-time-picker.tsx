"use client";

import * as React from "react";
import { Calendar as CalendarIcon } from "iconoir-react";
import { format } from "date-fns";

import { cn } from "@/lib/utils";
import { dropdownPositionerClassName } from "@/lib/ui/overlay-classnames";
import { buttonVariants, Popover, Select } from "@/components/primitives";
import { Calendar } from "@/components/courses/ui/calendar";
import {
  resolveTimeDisplayFormat,
  type TimeDisplayFormatValue,
} from "@/helpers/time-format";
import { useTenant } from "@/hooks/useTenant";
import { forwardRef, useMemo, useState } from "react";

type DateTimePickerProps = {
  date?: Date | null;
  setDate: (date: Date | null) => void;
  emptyPlaceholder?: string;
  timeDisplayFormat?: TimeDisplayFormatValue;
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
        (is24h ? [...hours24].reverse() : [...hours12].reverse()).map(
          (hour) => ({
            label: is24h ? pad2(hour) : String(hour),
            value: is24h ? pad2(hour) : String(hour),
          }),
        ),
      [hours12, hours24, is24h],
    );
    const minuteItems = useMemo(
      () =>
        Array.from({ length: 12 }, (_, i) => i * 5).map((minute) => ({
          label: String(minute),
          value: String(minute),
        })),
      [],
    );
    const ampmItems = useMemo(
      () => [
        { label: "AM", value: "AM" },
        { label: "PM", value: "PM" },
      ],
      [],
    );

    const handleDateSelect = (selectedDate: Date | undefined) => {
      if (selectedDate) {
        setDate(selectedDate);
      }
    };

    const handleTimeChange = (
      type: "hour" | "minute" | "ampm",
      value: string | null,
    ) => {
      if (!date || value == null) return;
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
    };

    return (
      <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
        <Popover.Trigger
          ref={ref}
          type="button"
          disabled={disabled}
          className={cn(
            buttonVariants({ variant: "secondary" }),
            "h-10 w-full justify-start px-3 text-left font-normal",
            !date && "text-text-muted",
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
                    items={hourItems}
                    placeholder="hh"
                    value={
                      date != null
                        ? is24h
                          ? pad2(date.getHours())
                          : (date.getHours() % 12 || 12).toString()
                        : null
                    }
                    onValueChange={(val) =>
                      handleTimeChange("hour", val != null ? String(val) : null)
                    }
                    className="min-w-0"
                  />
                  <Select
                    items={minuteItems}
                    placeholder="mm"
                    value={date != null ? date.getMinutes().toString() : null}
                    onValueChange={(val) =>
                      handleTimeChange(
                        "minute",
                        val != null ? String(val) : null,
                      )
                    }
                    className="min-w-0"
                  />
                  {is24h ? null : (
                    <Select
                      items={ampmItems}
                      placeholder="am/pm"
                      value={
                        date != null
                          ? date.getHours() >= 12
                            ? "PM"
                            : "AM"
                          : null
                      }
                      onValueChange={(val) =>
                        handleTimeChange(
                          "ampm",
                          val != null ? String(val) : null,
                        )
                      }
                      className="min-w-0"
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
