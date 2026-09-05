"use client";

import { Button, Dialog } from "@/components/primitives";
import { RoughDivider } from "@/components/primitives/decoration/rough-divider";
import { weekdayNames } from "@/components/calendar/types";
import { WeekdayAnimalIcon } from "@/components/icons/weekday-animal-icons";
import { formatDate, getDateISOString, sortEvents } from "@/helpers/date";
import { isPastEvent } from "@/helpers/calendar";
import { formatTimeslotRangeForDisplay, formatTimeslotStartForDisplay } from "@/helpers/timeslot";
import {
  orgTimeDateFnsPattern,
  resolveTimeDisplayFormat,
} from "@/helpers/time-format";
import { useTenant } from "@/hooks/useTenant";
import { cn } from "@/lib/utils";
import { Star } from "iconoir-react";
import { isSabbath } from "mm-cal-js";
import { useMemo, useState } from "react";
import type { eventType } from "@/types/course";
import { SessionChip } from "./session-chip";

const MAX_VISIBLE_IN_CELL = 2;

export type DayCellSession = Partial<eventType> & {
  displayTitle: string;
};

export type DayCellProps = {
  date?: Date;
  sessions: DayCellSession[];
  isLoading?: boolean;
  isOutsideMonth?: boolean;
  orgTimezone?: string;
  onSessionClick?: (session: eventType) => void;
  /** When set, clicking empty space in the day cell selects that date. */
  onEmptyDayClick?: (date: Date) => void;
  /** When false, session chips are not interactive. */
  interactive?: boolean;
  /** When false, hide redundant titles in month cells (e.g. course edit tab). */
  showTitleInCells?: boolean;
};

export function DayCell({
  date,
  sessions,
  isLoading = false,
  isOutsideMonth = false,
  orgTimezone,
  onSessionClick,
  onEmptyDayClick,
  interactive = false,
  showTitleInCells = true,
}: DayCellProps) {
  const { tenant } = useTenant();
  const timeFormat = resolveTimeDisplayFormat(tenant?.time_display_format);
  const [moreOpen, setMoreOpen] = useState(false);

  const isToday =
    date &&
    date.getFullYear() === new Date().getFullYear() &&
    date.getMonth() === new Date().getMonth() &&
    date.getDate() === new Date().getDate();

  const sortedForDay = useMemo(
    () =>
      [...sessions]
        .filter((e) => !e.is_deleted)
        .sort((a, b) => sortEvents(a.time_from ?? "", b.time_from ?? "")),
    [sessions],
  );

  const visibleItems = sortedForDay.slice(0, MAX_VISIBLE_IN_CELL);
  const overflowItems = sortedForDay.slice(MAX_VISIBLE_IN_CELL);
  const overflowCount = overflowItems.length;

  if (date === undefined) {
    return (
      <div
        className="hidden min-h-[7.5rem] border-border-subtle bg-transparent sm:block"
        aria-hidden
      />
    );
  }

  return (
    <div
      className={cn(
        "relative flex min-h-[7.5rem] flex-col border-border-subtle bg-transparent",
        isOutsideMonth && "opacity-50",
        onEmptyDayClick && "cursor-pointer",
      )}
      onClick={onEmptyDayClick ? () => onEmptyDayClick(date) : undefined}
    >
      {isLoading ? (
        <div className="min-h-[7.5rem] animate-pulse bg-surface-skeleton/40" />
      ) : (
        <>
          <div className="relative flex shrink-0 items-center px-1.5 pb-1 pt-1.5 pr-7">
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full font-mono text-xs tabular-nums",
                isToday
                  ? "bg-action text-action-foreground"
                  : "text-text-primary",
              )}
            >
              {formatDate(date, "d")}
            </span>
            {isSabbath(date) === 1 ? (
              <Star
                className="absolute right-1.5 top-1.5 size-3.5 shrink-0 text-text-secondary"
                fill="currentColor"
                strokeWidth={1.5}
                aria-hidden
              />
            ) : null}
          </div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-0.5 overflow-hidden px-1 pb-1.5">
            {visibleItems.map((e) => {
              const past =
                orgTimezone &&
                isPastEvent(e, orgTimezone);
              const slot = {
                date: getDateISOString(date),
                time_from: e.time_from!,
                time_to: e.time_to!,
              };
              const pattern = orgTimeDateFnsPattern(timeFormat);
              const timeLabel =
                e.time_from && e.time_to && date
                  ? formatTimeslotStartForDisplay(slot, orgTimezone, pattern)
                  : "";
              return (
                <SessionChip
                  key={String(e.id)}
                  title={e.displayTitle}
                  timeLabel={timeLabel}
                  showTitle={showTitleInCells}
                  accent={e.is_substitution_reserve ? "secondary" : "brand"}
                  isPast={Boolean(past)}
                  onClick={
                    interactive && onSessionClick
                      ? () => onSessionClick(e as eventType)
                      : undefined
                  }
                />
              );
            })}
            {overflowCount > 0 ? (
              <button
                type="button"
                className="truncate px-1 text-left text-xs text-text-muted hover:text-text-primary"
                onClick={(event) => {
                  event.stopPropagation();
                  setMoreOpen(true);
                }}
              >
                +{overflowCount} more
              </button>
            ) : null}
          </div>
        </>
      )}

      <Dialog.Root open={moreOpen} onOpenChange={setMoreOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop />
          <Dialog.Popup className="sm:max-w-md">
            <div>
              <Dialog.Title>
                {formatDate(date, "EEEE, MMM d")}
              </Dialog.Title>
            </div>
            <ul className="flex max-h-[min(50vh,20rem)] flex-col gap-2 overflow-y-auto text-sm">
              {overflowItems.map((e) => (
                <li key={String(e.id)}>
                  <SessionChip
                    title={e.displayTitle}
                    accent={e.is_substitution_reserve ? "secondary" : "brand"}
                    timeLabel={
                      e.time_from && e.time_to
                        ? formatTimeslotRangeForDisplay(
                            {
                              date: getDateISOString(date),
                              time_from: e.time_from,
                              time_to: e.time_to,
                            },
                            orgTimezone,
                            orgTimeDateFnsPattern(timeFormat),
                          )
                        : ""
                    }
                    onClick={
                      interactive && onSessionClick
                        ? () => {
                            onSessionClick(e as eventType);
                            setMoreOpen(false);
                          }
                        : undefined
                    }
                    className="rounded-md border border-border-subtle px-2 py-1.5"
                  />
                </li>
              ))}
            </ul>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setMoreOpen(false)}
            >
              Close
            </Button>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

export type MonthGridProps = {
  days: Date[];
  currentDate: Date;
  getSessionsForDay: (date: Date) => DayCellSession[];
  isLoading?: boolean;
  orgTimezone?: string;
  onSessionClick?: (session: eventType) => void;
  onEmptyDayClick?: (date: Date) => void;
  interactive?: boolean;
  showRoughDivider?: boolean;
  showTitleInCells?: boolean;
};

export function MonthGrid({
  days,
  currentDate,
  getSessionsForDay,
  isLoading = false,
  orgTimezone,
  onSessionClick,
  onEmptyDayClick,
  interactive = false,
  showRoughDivider = true,
  showTitleInCells = true,
}: MonthGridProps) {
  const leadingBlanks = useMemo(() => {
    if (days.length === 0) return [];
    return Array.from({ length: days[0].getDay() }, (_, i) => i);
  }, [days]);

  const weekdayLabels = weekdayNames;

  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-7 border-b border-border-subtle">
        {weekdayLabels.map((day) => (
          <div
            key={day}
            className="flex flex-col items-center gap-1 py-2 text-center text-xs font-medium uppercase tracking-wide text-text-muted"
          >
            <WeekdayAnimalIcon day={day} className="size-5 shrink-0" />
            {day}
          </div>
        ))}
      </div>
      {showRoughDivider ? <RoughDivider className="my-0" /> : null}
      <div className="grid grid-cols-7 divide-x divide-y divide-border-subtle border-border-subtle [grid-auto-rows:minmax(7.5rem,1fr)]">
        {leadingBlanks.map((i) => (
          <DayCell key={`blank-${i}`} sessions={[]} />
        ))}
        {days.map((day) => {
          const outside =
            day.getMonth() !== currentDate.getMonth() ||
            day.getFullYear() !== currentDate.getFullYear();
          return (
            <DayCell
              key={day.toISOString()}
              date={day}
              sessions={getSessionsForDay(day)}
              isLoading={isLoading}
              isOutsideMonth={outside}
              orgTimezone={orgTimezone}
              onSessionClick={onSessionClick}
              onEmptyDayClick={onEmptyDayClick}
              interactive={interactive}
              showTitleInCells={showTitleInCells}
            />
          );
        })}
      </div>
    </div>
  );
}
