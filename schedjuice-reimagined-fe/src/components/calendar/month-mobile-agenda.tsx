"use client";
import { Skeleton } from "@/components/primitives";

import { formatDate, getDateISOString, sortEvents } from "@/helpers/date";
import { formatTimeslotRangeForDisplay } from "@/helpers/timeslot";
import { useTenant } from "@/hooks/useTenant";
import { useMemo } from "react";
import { useCalendar } from "./calendar-context";
import { eventType } from "@/types/course";
import { cn } from "@/lib/utils";
import { eventAccentBorder, eventChipClass } from "./event-chip";
import {
  orgTimeDateFnsPattern,
  resolveTimeDisplayFormat,
} from "@/helpers/time-format";

/** Chronological list of sessions for the visible month (small screens). */
export function MonthMobileAgenda() {
  const { days, events, isLoading, renderEvent, onEventClick } = useCalendar();
  const { tenant } = useTenant();
  const timeFormat = resolveTimeDisplayFormat(tenant?.time_display_format);

  const sections = useMemo(() => {
    const out: { date: Date; items: Partial<eventType>[] }[] = [];
    for (const d of days) {
      const key = getDateISOString(d);
      const items = (events[key] || [])
        .filter((e) => !e.is_deleted)
        .sort((a, b) => sortEvents(a.time_from ?? "", b.time_from ?? ""));
      if (items.length > 0) {
        out.push({ date: d, items });
      }
    }
    return out;
  }, [days, events]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 py-2" aria-busy="true">
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No sessions scheduled this month.
      </p>
    );
  }

  return (
    <section
      className="flex flex-col gap-5 border-t border-border pt-4"
      aria-label="This month’s sessions"
    >
      <h3 className="text-sm font-semibold tracking-tight text-foreground">
        This month
      </h3>
      <ul className="flex flex-col gap-5">
        {sections.map(({ date, items }) => (
          <li key={date.toISOString()}>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {formatDate(date, "EEEE, MMM d")}
            </p>
            <ul className="mt-2 flex flex-col gap-2">
              {items.map((e) => {
                const content = renderEvent ? (
                  renderEvent(e as eventType)
                ) : (
                  <div>
                    <span className="font-medium text-foreground">
                      {e.title}
                    </span>
                    {e.time_from && e.time_to ? (
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
                );

                if (onEventClick) {
                  return (
                    <li key={String(e.id)}>
                      <button
                        type="button"
                        onClick={() => onEventClick(e as eventType)}
                        className={cn(
                          eventChipClass,
                          "w-full px-3 py-2 text-left text-sm",
                          eventAccentBorder(e),
                        )}
                      >
                        {content}
                      </button>
                    </li>
                  );
                }

                return (
                  <li
                    key={String(e.id)}
                    className={cn(
                      eventChipClass,
                      "px-3 py-2 text-sm",
                      eventAccentBorder(e),
                    )}
                  >
                    {content}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
