"use client";
import { Button, Dialog, Skeleton, buttonVariants } from "@/components/primitives";
import { formatDate, getDateISOString, sortEvents } from "@/helpers/date";
import { cn } from "@/lib/utils";
import { Star } from "iconoir-react";
import { isSabbath } from "mm-cal-js";
import { useCalendar } from "./calendar-context";
import { formatTimeslotRangeForDisplay } from "@/helpers/timeslot";
import { useTenant } from "@/hooks/useTenant";
import { useMemo, useState } from "react";
import { eventType } from "@/types/course";
import { eventAccentBorder, eventChipClass } from "./event-chip";
import {
  orgTimeDateFnsPattern,
  resolveTimeDisplayFormat,
} from "@/helpers/time-format";

interface DayBoxProps {
  date?: Date;
}

const MAX_VISIBLE_IN_CELL = 2;

export const DayBox: React.FC<DayBoxProps> = ({ date }) => {
  const { tenant } = useTenant();
  const timeFormat = resolveTimeDisplayFormat(tenant?.time_display_format);
  const {
    events,
    areEventsSelectable,
    onEventClick,
    selectedEvents,
    isInEventSelectionMode,
    isLoading,
    renderEvent,
  } = useCalendar();
  const [moreOpen, setMoreOpen] = useState(false);

  const areDatesEqual = (date1: Date, date2: Date) => {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  };

  const isToday = date && areDatesEqual(date, new Date());

  const sortedForDay = useMemo(() => {
    if (!date) return [];
    return (events[getDateISOString(date)] || [])
      .filter((e) => !e.is_deleted)
      .sort((a, b) => sortEvents(a.time_from ?? "", b.time_from ?? ""));
  }, [date, events]);

  const visibleItems = sortedForDay.slice(0, MAX_VISIBLE_IN_CELL);
  const overflowItems = sortedForDay.slice(MAX_VISIBLE_IN_CELL);
  const overflowCount = overflowItems.length;

  return (
    <div
      className={cn({
        "relative flex h-full min-h-[7.5rem] flex-col overflow-hidden rounded-lg border border-border/60 bg-transparent transition-colors duration-200":
          true,
        "hidden bg-surface-sunken/40 sm:block": date === undefined,
      })}
    >
      {isLoading && (
        <Skeleton className="min-h-[6.5rem] w-full flex-1 sm:min-h-[8rem]" />
      )}
      {!isLoading && date && (
        <>
          <div className="relative flex w-full shrink-0 items-center px-2 pb-1 pr-8 pt-2">
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <div
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-md font-semibold tabular-nums",
                  isToday
                    ? "bg-accent/12 font-semibold text-accent ring-1 ring-accent/35"
                    : "bg-muted/80 text-foreground"
                )}
              >
                <span>{formatDate(date, "d")}</span>
              </div>
              <span className="text-muted-foreground sm:hidden">
                {formatDate(date, "ddd")}
              </span>
            </div>
            {isSabbath(date) === 1 && (
              <Star
                className="absolute right-2 top-2 size-4 shrink-0 text-foreground"
                fill="currentColor"
                strokeWidth={1.5}
                aria-hidden
              />
            )}
          </div>
          <div className="z-10 flex min-h-0 flex-1 flex-col gap-1 overflow-hidden px-2 pb-2">
            {visibleItems.map((e) => {
              const isSelected = selectedEvents
                ?.map((e2) => e2.id)
                .includes(e.id);
              return (
                <div
                  className={cn(
                    eventChipClass,
                    "min-w-0 text-xs leading-snug",
                    eventAccentBorder(e, isSelected),
                    areEventsSelectable && "cursor-pointer",
                  )}
                  key={e.id}
                  onClick={() => {
                    if (areEventsSelectable && isInEventSelectionMode) {
                      onEventClick?.(e as eventType);
                    }
                  }}
                >
                  <div className="min-w-0 font-semibold">
                    {renderEvent ? (
                      renderEvent(e as eventType)
                    ) : (
                      <div className="min-w-0">
                        <div className="break-words">{e.title}</div>
                        {e.time_from && e.time_to && (
                          <div className="mt-0.5 min-w-0 overflow-x-auto text-xs font-normal tabular-nums whitespace-nowrap opacity-75">
                            {formatTimeslotRangeForDisplay(
                              {
                                date: getDateISOString(date),
                                time_from: e.time_from,
                                time_to: e.time_to,
                              },
                              tenant?.timezone,
                              orgTimeDateFnsPattern(timeFormat),
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {overflowCount > 0 ? (
              <button
                type="button"
                className="rounded-md border border-dashed border-border bg-muted/50 px-2 py-1 text-left text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                onClick={() => setMoreOpen(true)}
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
              {date ? formatDate(date, "EEEE, MMM d") : "Sessions"}
            </Dialog.Title>
          </div>
          <ul className="flex max-h-[min(50vh,20rem)] flex-col gap-2 overflow-y-auto text-sm">
            {overflowItems.map((e) => (
                <li
                  key={String(e.id)}
                  className={cn(
                    eventChipClass,
                    "px-3 py-2",
                    eventAccentBorder(e),
                  )}
                >
                  {renderEvent ? (
                    renderEvent(e as eventType)
                  ) : (
                    <div>
                      <span className="font-medium">{e.title}</span>
                      {e.time_from && e.time_to && date ? (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {formatTimeslotRangeForDisplay(
                            {
                              date: getDateISOString(date),
                              time_from: e.time_from,
                              time_to: e.time_to,
                            },
                            tenant?.timezone,
                            orgTimeDateFnsPattern(timeFormat),
                          )}
                        </div>
                      ) : null}
                    </div>
                  )}
                </li>
            ))}
          </ul>
          <Button
            type="button"
            variant="secondary" onClick={() => setMoreOpen(false)}
          >
            Close
          </Button>
        </Dialog.Popup>
      </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
};
