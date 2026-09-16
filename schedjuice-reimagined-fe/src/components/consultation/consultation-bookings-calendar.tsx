"use client";

import { Calendar } from "@/components/calendar/calendar";
import { CalendarView } from "@/components/calendar/types";
import {
  bookingIdFromCalendarEvent,
  bookingsToFormattedEvents,
} from "@/lib/consultation/booking-calendar";
import type { ConsultationBooking } from "@/types/consultation";
import type { eventType } from "@/types/course";
import { useMemo } from "react";

type ConsultationBookingsCalendarProps = {
  bookings: ConsultationBooking[];
  timezone: string | undefined;
  isLoading: boolean;
  onBookingClick: (bookingId: number) => void;
};

export function ConsultationBookingsCalendar({
  bookings,
  timezone,
  isLoading,
  onBookingClick,
}: ConsultationBookingsCalendarProps) {
  const formattedEvents = useMemo(
    () => bookingsToFormattedEvents(bookings, timezone),
    [bookings, timezone],
  );

  function handleEventClick(event: eventType) {
    const bookingId = bookingIdFromCalendarEvent(event);
    if (bookingId != null) {
      onBookingClick(bookingId);
    }
  }

  return (
    <Calendar
      embedded
      events={formattedEvents}
      isLoading={isLoading}
      onEventClick={handleEventClick}
      showableViews={[CalendarView.WEEK, CalendarView.MONTH]}
      defaultView={CalendarView.MONTH}
    />
  );
}
