"use client";

import { Calendar } from "@/components/date/calendar";
import { Skeleton } from "@/components/primitives";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useMemo } from "react";

export function formatConsultationMonthParam(date: Date): string {
  return format(date, "yyyy-MM");
}

type BookingMonthCalendarProps = {
  visibleMonth: Date;
  onVisibleMonthChange: (month: Date) => void;
  selectedDate: Date | undefined;
  onSelectDate: (date: Date | undefined) => void;
  availableDates: string[];
  isLoading: boolean;
};

function parseYmd(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function BookingMonthCalendar({
  visibleMonth,
  onVisibleMonthChange,
  selectedDate,
  onSelectDate,
  availableDates,
  isLoading,
}: BookingMonthCalendarProps) {
  const availableSet = useMemo(
    () => new Set(availableDates),
    [availableDates],
  );

  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  function isDateDisabled(date: Date): boolean {
    const ymd = format(date, "yyyy-MM-dd");
    if (date < today) {
      return true;
    }
    if (isLoading) {
      return true;
    }
    return !availableSet.has(ymd);
  }

  return (
    <div
      className="relative"
      aria-busy={isLoading}
      aria-label="Choose a date"
    >
      {isLoading ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-surface/70">
          <Skeleton className="h-8 w-32" />
        </div>
      ) : null}
      <Calendar
        mode="single"
        month={visibleMonth}
        onMonthChange={onVisibleMonthChange}
        selected={selectedDate}
        onSelect={onSelectDate}
        disabled={isDateDisabled}
        classNames={{
          day_disabled: cn(
            "!text-text-muted opacity-40",
          ),
        }}
      />
    </div>
  );
}

export function selectedDateToYmd(date: Date | undefined): string | null {
  if (!date) return null;
  return format(date, "yyyy-MM-dd");
}

export { parseYmd as parseConsultationYmd };
