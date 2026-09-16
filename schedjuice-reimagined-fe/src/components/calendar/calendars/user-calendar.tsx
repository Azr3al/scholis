"use client";

import { Calendar } from "../calendar";
import { rawToFormattedEvents } from "@/helpers/calendar";
import { CalendarView } from "../types";
import { eventType } from "@/types/course";
import { useTenant } from "@/hooks/useTenant";

interface UserCalendarProps {
  events: eventType[];
  isLoading: boolean;
  renderEvent?: (event: eventType) => React.ReactNode;
  loadError?: boolean;
  onRetry?: () => void;
  defaultView?: CalendarView;
  showableViews?: CalendarView[];
  embedded?: boolean;
}

export const UserCalendar: React.FC<UserCalendarProps> = ({
  events,
  isLoading,
  renderEvent,
  loadError,
  onRetry,
  defaultView = CalendarView.WEEK,
  showableViews = [CalendarView.WEEK, CalendarView.MONTH],
  embedded = false,
}) => {
  const { tenant } = useTenant();
  return (
    <div>
      <Calendar
        embedded={embedded}
        isLoading={isLoading}
        loadError={loadError}
        onRetry={onRetry}
        events={rawToFormattedEvents(events || [], tenant?.timezone)}
        showableViews={showableViews}
        defaultView={defaultView}
        renderEvent={renderEvent}
      />
    </div>
  );
};
