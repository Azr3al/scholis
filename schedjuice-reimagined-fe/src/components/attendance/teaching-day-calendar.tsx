"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/primitives/button";
import { Popover } from "@/components/primitives/popover";
import { Select } from "@/components/primitives/select";
import {
  buildMonthMatrix,
  isYmdWithinInclusive,
} from "@/helpers/teaching-day-calendar-utils";
import { formatDate } from "@/helpers/date";
import {
  dateOnlyFromLocalDate,
  formatEventTeachingDayLabel,
  formatSessionLabel,
  formatTeachingDayYmd,
  getEventIndicesForDate,
  getTodayYmd,
  isTeachingDay,
  resolveCourseDateBounds,
  resolveEventYmd,
  ymdToLocalDate,
  type MarkingEvent,
} from "@/helpers/attendance-marking";
import { Calendar, NavArrowLeft, NavArrowRight } from "iconoir-react";
import { cn } from "@/lib/utils";
import { resolveTimeDisplayFormat } from "@/helpers/time-format";
import { useTenant } from "@/hooks/useTenant";

type TeachingDayCalendarProps = {
  events: MarkingEvent[];
  selectedEventIndex: number;
  onSelectEventIndex: (index: number) => void;
  courseStartDate?: string | Date | null;
  courseEndDate?: string | Date | null;
  timezone?: string;
  disabled?: boolean;
};

const WEEK_DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

export function TeachingDayCalendar({
  events,
  selectedEventIndex,
  onSelectEventIndex,
  courseStartDate,
  courseEndDate,
  timezone = "UTC",
  disabled = false,
}: TeachingDayCalendarProps) {
  const { tenant } = useTenant();
  const timeFormat = resolveTimeDisplayFormat(tenant?.time_display_format);
  const [open, setOpen] = useState(false);
  const [pendingDateKey, setPendingDateKey] = useState<string | null>(null);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const d = events[selectedEventIndex]?.date;
    const ymd = d
      ? events[selectedEventIndex]
        ? resolveEventYmd(events[selectedEventIndex]!, timezone)
        : ""
      : "";
    return ymd ? ymdToLocalDate(ymd) : new Date();
  });

  const todayYmd = getTodayYmd(timezone);
  const selectedEvent = events[selectedEventIndex];
  const selectedDateKey = selectedEvent
    ? resolveEventYmd(selectedEvent, timezone)
    : "";

  const bounds = useMemo(
    () =>
      resolveCourseDateBounds(
        events,
        courseStartDate,
        courseEndDate,
        timezone,
      ),
    [courseStartDate, courseEndDate, events, timezone],
  );

  const matrix = buildMonthMatrix(visibleMonth.getFullYear(), visibleMonth.getMonth());

  const pendingIndices = pendingDateKey
    ? getEventIndicesForDate(events, pendingDateKey, timezone)
    : [];

  const handlePickDate = (date: Date) => {
    if (!isTeachingDay(events, date, timezone)) return;
    const key = dateOnlyFromLocalDate(date);
    const indices = getEventIndicesForDate(events, key, timezone);
    if (indices.length === 0) return;

    if (indices.length === 1) {
      setPendingDateKey(null);
      setOpen(false);
      onSelectEventIndex(indices[0]!);
      return;
    }

    setPendingDateKey(key);
  };

  const handleSessionSelect = (value: unknown) => {
    if (value == null) return;
    const index = Number(value);
    if (Number.isNaN(index)) return;
    setPendingDateKey(null);
    setOpen(false);
    onSelectEventIndex(index);
  };

  const dayLabel = selectedEvent
    ? formatEventTeachingDayLabel(selectedEvent, timezone)
    : "Select a teaching day";
  const sessionLabel = selectedEvent ? formatSessionLabel(selectedEvent, timeFormat) : null;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        render={
          <Button
            type="button"
            variant="secondary"
            disabled={disabled || events.length === 0}
            className="h-auto min-w-[220px] max-w-[min(100vw-2rem,320px)] whitespace-normal px-4 py-3"
          />
        }
      >
        <div className="flex w-full min-w-0 flex-col items-start gap-0.5 text-left">
          <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-text-muted">
            <Calendar width={14} height={14} aria-hidden />
            Marking attendance for
          </span>
          <span className="w-full min-w-0 break-words text-base font-semibold leading-tight text-text-primary">
            {dayLabel}
          </span>
          {sessionLabel ? (
            <span className="text-xs text-text-muted">{sessionLabel}</span>
          ) : null}
        </div>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner align="center">
          <Popover.Popup className="w-auto p-0">
            <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-3 py-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Previous month"
                onClick={() =>
                  setVisibleMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))
                }
              >
                <NavArrowLeft width={16} height={16} />
              </Button>
              <span className="text-sm font-medium">
                {formatDate(visibleMonth, "MMMM yyyy")}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Next month"
                onClick={() =>
                  setVisibleMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))
                }
              >
                <NavArrowRight width={16} height={16} />
              </Button>
            </div>

            <div className="grid grid-cols-7 gap-0 p-2 text-center text-xs text-text-muted">
              {WEEK_DAYS.map((d) => (
                <div key={d} className="py-1 font-medium uppercase tracking-wide">
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-0 px-2 pb-2">
              {matrix.flat().map((date, i) => {
                if (!date) return <div key={`empty-${i}`} className="h-9" />;

                const key = dateOnlyFromLocalDate(date);
                const teaching = isTeachingDay(events, date, timezone);
                const inBounds = isYmdWithinInclusive(
                  key,
                  bounds.fromYmd,
                  bounds.toYmd,
                );
                const isSelected = key === selectedDateKey;
                const isToday = key === todayYmd;
                const clickable = teaching && inBounds;

                return (
                  <button
                    key={key}
                    type="button"
                    disabled={!clickable}
                    onClick={() => handlePickDate(date)}
                    className={cn(
                      "mx-auto flex h-9 w-9 items-center justify-center rounded-md text-sm",
                      !clickable && "cursor-default text-text-muted/40",
                      clickable && "hover:bg-brand/10",
                      isSelected && "bg-brand/15 ring-1 ring-brand/30",
                      isToday && teaching && !isSelected && "ring-1 ring-brand/20",
                    )}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>

            {pendingDateKey && pendingIndices.length > 1 ? (
              <div className="border-t border-border-subtle p-3">
                <p className="mb-2 text-xs font-medium text-text-muted">
                  Multiple sessions on {formatTeachingDayYmd(pendingDateKey, "MMM d, yyyy")}. Choose one:
                </p>
                <Select
                  items={pendingIndices.map((index) => ({
                    value: String(index),
                    label: formatSessionLabel(events[index]!, timeFormat),
                  }))}
                  placeholder="Select session"
                  onValueChange={handleSessionSelect}
                />
              </div>
            ) : null}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
