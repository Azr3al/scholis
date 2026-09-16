import { Button, Dialog, buttonVariants } from "@/components/primitives";
import { formatTimeslotRangeForDisplay } from "@/helpers/timeslot";
import {
  profileEventCourseLabel,
  profileEventDisplayTitle,
} from "@/helpers/user-profile";
import { useTenant } from "@/hooks/useTenant";
import { isSameWeek, format, startOfWeek, addDays, isToday } from "date-fns";
import {
  convert12hourTo24hour,
  formateEventTime,
  formatEventDay,
} from "@/helpers/date";
import { formatSessionTimeRange } from "@/helpers/session-time";
import {
  orgTimeDateFnsPattern,
  resolveTimeDisplayFormat,
} from "@/helpers/time-format";
import { useCalendar } from "./calendar-context";
import { CalendarEventSlot } from "./calendar-event-slot";
import { weekdayNames } from "./types";
import { WeekdayAnimalIcon } from "@/components/icons/weekday-animal-icons";
import { borderlessEventChipClass } from "./event-chip";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { eventType } from "@/types/course";
import { isOvernightSession } from "@/helpers/session-time";

function eventHourRange(event: {
  time_from: string;
  time_to: string;
}): { start: number; end: number } {
  const [sh, sm] = event.time_from.split(":").map(Number);
  const [eh, em] = event.time_to.split(":").map(Number);
  const start = sh + sm / 60;
  const end = eh + em / 60;
  if (isOvernightSession(event.time_from, event.time_to)) {
    return { start, end: 24 };
  }
  return { start, end };
}

/** Mutually overlapping events (same column / day), excluding assignments. */
function buildOverlapClusters(events: any[]): any[][] {
  const sorted = [...events]
    .filter((e) => !e.assignment)
    .sort((a, b) => a.time_from.localeCompare(b.time_from));
  const clusters: any[][] = [];

  sorted.forEach((event) => {
    const { start, end } = eventHourRange(event);
    let cluster = clusters.find((c) =>
      c.some((ev) => {
        const r = eventHourRange(ev);
        return start < r.end && end > r.start;
      })
    );
    if (!cluster) {
      cluster = [];
      clusters.push(cluster);
    }
    cluster.push(event);
  });

  return clusters;
}

const weekEventButtonClass = cn(borderlessEventChipClass, "absolute");

function WeekEventContent({
  event,
  compact,
  renderEvent,
}: {
  event: eventType;
  compact: boolean;
  renderEvent?: (event: eventType) => ReactNode;
}) {
  if (renderEvent) {
    return <>{renderEvent(event)}</>;
  }
  return (
    <CalendarEventSlot
      title={profileEventDisplayTitle(event, "Session")}
      timeFrom={event.time_from}
      timeTo={event.time_to}
      compact={compact}
    />
  );
}

export const WeekView: React.FC = () => {
  const { currentDate, events, renderEvent, onEventClick } = useCalendar();
  const { tenant } = useTenant();
  const timeFormat = resolveTimeDisplayFormat(tenant?.time_display_format);
  const timeslotPattern = orgTimeDateFnsPattern(timeFormat);

  const renderEventLabel = (event: eventType) => {
    if (renderEvent) return renderEvent(event);
    return profileEventDisplayTitle(event, "Session");
  };

  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [overflowEvents, setOverflowEvents] = useState<any[] | null>(null);

  function handleEventClick(event: eventType) {
    if (onEventClick) {
      onEventClick(event);
      return;
    }
    setSelectedEvent(event);
  }

  const startDay = startOfWeek(currentDate, { weekStartsOn: 0 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(startDay, i));
  const hours = Array.from({ length: 24 }, (_, i) => i);

  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const topPosition = ((now.getHours() * 60 + now.getMinutes()) / 60) * 4;

  const showCurrentTimeLine = isSameWeek(now, currentDate, { weekStartsOn: 0 });

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let earliestHour: number | null = null;

    days.forEach((day) => {
      const dayStr = format(day, "yyyy-MM-dd");
      const formatEvents = events[dayStr] || [];
      formatEvents
        .filter((event) => !event.assignment)
        .forEach((event) => {
          const [hour, minute] = event.time_from.split(":").map(Number);
          const totalHour = hour + minute / 60;
          if (earliestHour === null || totalHour < earliestHour) {
            earliestHour = totalHour;
          }
        });
    });

    if (earliestHour !== null && scrollRef.current) {
      const scrollPosition = Math.max(0, (earliestHour - 1) * 64);
      const mainEl = document.getElementById("main-content");
      if (mainEl) {
        const gridTop =
          scrollRef.current.getBoundingClientRect().top -
          mainEl.getBoundingClientRect().top +
          mainEl.scrollTop;
        mainEl.scrollTo({
          top: gridTop + scrollPosition,
          behavior: "smooth",
        });
      }
    }
  }, [currentDate]);

  const renderDayColumn = (day: Date) => {
    const dayStr = format(day, "yyyy-MM-dd");
    const dayEvents = events[dayStr] || [];
    const clusters = buildOverlapClusters(dayEvents);

    return (
      <div
        key={day.toISOString()}
        className="relative border-r border-border bg-background"
      >
        {hours.map((hour) => (
          <div key={hour} className="relative h-16 border-b border-border" />
        ))}

        {clusters.flatMap((cluster) => {
          if (cluster.length === 0) return [];

          if (cluster.length <= 2) {
            return cluster.map((event, slotIndex) => {
              const { start, end } = eventHourRange(event);
              const duration = end - start;
              const widthPct = 100 / cluster.length;
              const leftPct = slotIndex * widthPct;
              return (
                <button
                  type="button"
                  key={event.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEventClick(event as eventType);
                  }}
                  className={weekEventButtonClass}
                  style={{
                    top: `${start * 4}rem`,
                    height: `${Math.max(duration * 4, 1.75)}rem`,
                    width: `calc(${widthPct}% - 4px)`,
                    left: `calc(${leftPct}% + 2px)`,
                  }}
                >
                  <WeekEventContent
                    event={event as eventType}
                    compact={duration < 0.5}
                    renderEvent={renderEvent}
                  />
                </button>
              );
            });
          }

          const [a, b, ...rest] = cluster;
          const chipTopRem =
            Math.max(...cluster.map((e) => eventHourRange(e).end)) * 4 - 1.5;

          return [
            <div
              key={`cl-${cluster.map((e) => String(e.id)).join("-")}`}
            >
              {[a, b].map((event, slotIndex) => {
                const { start, end } = eventHourRange(event);
                const duration = end - start;
                return (
                  <button
                    type="button"
                    key={event.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEventClick(event as eventType);
                    }}
                    className={weekEventButtonClass}
                    style={{
                      top: `${start * 4}rem`,
                      height: `${Math.max(duration * 4, 1.75)}rem`,
                      width: "calc(50% - 4px)",
                      left: slotIndex === 0 ? "2px" : "calc(50% + 1px)",
                    }}
                  >
                    <WeekEventContent
                      event={event as eventType}
                      compact={duration < 0.5}
                      renderEvent={renderEvent}
                    />
                  </button>
                );
              })}
              <button
                type="button"
                className={cn(
                  "absolute z-10 rounded border border-dashed border-border-strong bg-surface-elevated px-1 py-0.5 text-center text-[11px] font-medium text-text-muted shadow-xs transition-colors hover:bg-surface-hover hover:text-text-primary",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
                style={{
                  top: `${Math.max(0, chipTopRem)}rem`,
                  left: "2px",
                  width: "calc(100% - 4px)",
                  minHeight: "1.375rem",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setOverflowEvents(rest);
                }}
              >
                +{rest.length} more
              </button>
            </div>,
          ];
        })}
      </div>
    );
  };

  return (
    <div>
      <div
        className="rounded-lg border border-border"
        ref={scrollRef}
      >
        <div className="sticky top-0 z-20 grid grid-cols-8 border-b border-border bg-background">
          <div className="h-12 border-r border-border pl-3 pt-3 text-sm font-medium text-muted-foreground">
            Time
          </div>
          {days.map((day) => (
            <div
              key={day.toISOString()}
              className={cn(
                "flex h-12 flex-col items-center justify-center gap-0.5 border-r border-border py-1 text-center text-sm font-medium text-foreground",
                isToday(day) && "bg-muted"
              )}
            >
              <WeekdayAnimalIcon
                day={weekdayNames[day.getDay()]}
                className="size-4 shrink-0"
              />
              {formatEventDay(day)}
            </div>
          ))}
        </div>

        <div className="relative grid grid-cols-8">
          <div className="border-r border-border">
            {hours.map((hour) => (
              <div
                key={hour}
                className="h-16 border-b border-border bg-background pl-3 pt-3 text-sm text-muted-foreground"
              >
                {convert12hourTo24hour(hour)}
              </div>
            ))}
          </div>

          {days.map((day) => renderDayColumn(day))}

          {showCurrentTimeLine ? (
            <div
              className="pointer-events-none absolute left-0 right-0 z-10 h-px bg-destructive/50 transition-all duration-500 ease-linear"
              style={{ top: `${topPosition}rem` }}
              aria-hidden
            />
          ) : null}
        </div>
      </div>

      {!onEventClick ? (
      <Dialog.Root
        open={selectedEvent !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedEvent(null);
        }}
      >
        <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className="sm:max-w-md">
          <div>
            <Dialog.Title>
              {selectedEvent
                ? renderEventLabel(selectedEvent as eventType)
                : "Session"}
            </Dialog.Title>
          </div>
          {selectedEvent ? (
            <div className="flex flex-col gap-3 text-sm">
              <p>
                <span className="font-medium text-foreground">Time</span>
                <span className="text-muted-foreground">
                  {" "}
                  {tenant
                    ? formatTimeslotRangeForDisplay(
                        {
                          date:
                            typeof selectedEvent.date === "string"
                              ? selectedEvent.date.slice(0, 10)
                              : format(selectedEvent.date, "yyyy-MM-dd"),
                          time_from: selectedEvent.time_from,
                          time_to: selectedEvent.time_to,
                        },
                        tenant.timezone,
                        timeslotPattern,
                      )
                    : formatSessionTimeRange(
                        selectedEvent.time_from,
                        selectedEvent.time_to,
                        (t) => formateEventTime(t, timeFormat)
                      )}
                </span>
              </p>
              {selectedEvent.course ? (
                <p>
                  <span className="font-medium text-foreground">Course</span>
                  <span className="text-muted-foreground">
                    {" "}
                    {profileEventCourseLabel(selectedEvent.course) ??
                      profileEventDisplayTitle(selectedEvent, "Course")}
                  </span>
                </p>
              ) : null}
            </div>
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
      </Dialog.Root>
      ) : null}

      <Dialog.Root
        open={overflowEvents !== null && overflowEvents.length > 0}
        onOpenChange={(open) => {
          if (!open) setOverflowEvents(null);
        }}
      >
        <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className="sm:max-w-md">
          <div>
            <Dialog.Title>Overlapping sessions</Dialog.Title>
          </div>
          <ul className="flex max-h-[min(60vh,24rem)] flex-col gap-2 overflow-y-auto text-sm">
            {(overflowEvents ?? []).map((ev) => (
              <li
                key={String(ev.id)}
                className="rounded-md border border-border bg-muted/40 px-3 py-2"
              >
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => {
                    setOverflowEvents(null);
                    handleEventClick(ev as eventType);
                  }}
                >
                  <span className="font-medium text-foreground">
                    {renderEventLabel(ev as eventType)}
                  </span>
                  <div className="text-xs text-muted-foreground">
                    {formatSessionTimeRange(
                      ev.time_from,
                      ev.time_to,
                      (t) => formateEventTime(t, timeFormat)
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            variant="secondary" className="w-full sm:w-auto"
            onClick={() => setOverflowEvents(null)}
          >
            Close
          </Button>
        </Dialog.Popup>
      </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
};
