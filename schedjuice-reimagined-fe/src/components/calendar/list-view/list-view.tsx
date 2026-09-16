"use client";

import { useMemo } from "react";
import { useCalendar } from "../calendar-context";
import { EventCard } from "../../event/list-view-card";
import { formateEventTime, sortEvents, getTodayISO } from "@/helpers/date";
import { formatSessionTimeRange } from "@/helpers/session-time";
import { resolveTimeDisplayFormat } from "@/helpers/time-format";
import { useTenant } from "@/hooks/useTenant";

export const CourseListView: React.FC = () => {
  const { events, isLoading } = useCalendar();
  const { tenant } = useTenant();
  const timeFormat = resolveTimeDisplayFormat(tenant?.time_display_format);
  const Today = getTodayISO();
  const dayEntries = useMemo(() => {
    return Object.keys(events)
      .filter((isoDay) => isoDay >= Today)
      .map((isoDay) => ({
        isoDay,
        dayEvents: events[isoDay],
      }))
      .sort((dayA, dayB) => dayA.isoDay.localeCompare(dayB.isoDay));
  }, [events]);

  if (isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading…</div>;
  }

  if (!dayEntries.length) {
    return <div className="p-4 text-sm text-muted-foreground">No events.</div>;
  }

  return (
    <div className="min-w-0 space-y-4">
      {dayEntries.map(({ isoDay, dayEvents }) => {
        const date = new Date(`${isoDay}T00:00:00`);
        //Becaue Isoday is a string and EventCard accepts date props,i need to change the string into Date
        const sorted = [...dayEvents]
          .filter((event) => !event.assignment)
          .sort((firstEvent, secondEvent) =>
            sortEvents(firstEvent.time_from, secondEvent.time_from)
          );

        return (
          <div key={isoDay} className="space-y-2">
            <div className="space-y-2">
              {sorted.map((e) => (
                <div key={e.id}>
                  <EventCard
                    date={date}
                    time_from={formatSessionTimeRange(
                      e.time_from,
                      e.time_to,
                      (t) => formateEventTime(t, timeFormat)
                    )}
                    time_to=""
                    event_title={e.title}
                    room={e.room}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};
