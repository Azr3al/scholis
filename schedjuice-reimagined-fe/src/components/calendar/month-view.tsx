"use client";

import { MonthGrid, type DayCellSession } from "./grid/month-grid";
import { weekdayNames } from "./types";
import { useCalendar } from "./calendar-context";
import { MonthMobileAgenda } from "./month-mobile-agenda";
import { getDateISOString } from "@/helpers/date";
import { useCallback } from "react";
import { useTenant } from "@/hooks/useTenant";
import type { eventType } from "@/types/course";

export const MonthView: React.FC = () => {
  const { days, events, currentDate, isLoading, course, renderEvent, onEventClick } =
    useCalendar();
  const { tenant } = useTenant();

  const getSessionsForDay = useCallback(
    (date: Date): DayCellSession[] => {
      const key = getDateISOString(date);
      return (events[key] || [])
        .filter((e) => !e.is_deleted)
        .map((e) => ({
          ...e,
          displayTitle: renderEvent
            ? String((e as eventType).title)
            : course?.title || (e.title as string) || "Session",
        }));
    },
    [events, course?.title, renderEvent],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="hidden sm:block">
        <MonthGrid
          days={days}
          currentDate={currentDate}
          getSessionsForDay={getSessionsForDay}
          isLoading={isLoading}
          orgTimezone={tenant?.timezone}
          onSessionClick={onEventClick}
          interactive={Boolean(onEventClick)}
        />
      </div>
      <div className="sm:hidden">
        <MonthMobileAgenda />
      </div>
    </div>
  );
};
