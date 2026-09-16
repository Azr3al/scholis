import type { FormattedEvents } from "@/helpers/calendar";
import { convertEventDateToUserTimezone } from "@/helpers/timeslot";
import { sortBookings } from "@/lib/consultation/booking-display";
import type { eventType } from "@/types/course";
import type { ConsultationBooking } from "@/types/consultation";
import { addMinutes } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

export function bookingToCalendarEvent(
  booking: ConsultationBooking,
  tenantTimezone: string | undefined,
): Partial<eventType> {
  const tz = tenantTimezone ?? "UTC";
  const start = new Date(booking.scheduled_at);
  const end = addMinutes(start, booking.duration_minutes);

  return {
    id: booking.id,
    title: booking.student_name,
    date: formatInTimeZone(start, tz, "yyyy-MM-dd"),
    time_from: formatInTimeZone(start, tz, "HH:mm:ss"),
    time_to: formatInTimeZone(end, tz, "HH:mm:ss"),
    is_deleted: false,
  };
}

export function bookingsToFormattedEvents(
  bookings: ConsultationBooking[],
  tenantTimezone: string | undefined,
): FormattedEvents {
  const formatted: FormattedEvents = {};

  for (const booking of sortBookings(bookings)) {
    const event = bookingToCalendarEvent(booking, tenantTimezone);
    const tenantDate =
      typeof event.date === "string"
        ? event.date
        : formatInTimeZone(event.date as Date, tenantTimezone ?? "UTC", "yyyy-MM-dd");
    const bucketKey = convertEventDateToUserTimezone(
      tenantDate,
      event.time_from ?? "",
      tenantTimezone,
    );

    if (!formatted[bucketKey]) {
      formatted[bucketKey] = [];
    }
    formatted[bucketKey].push(event);
  }

  return formatted;
}

export function bookingIdFromCalendarEvent(event: Partial<eventType>): number | null {
  const id = event.id;
  if (typeof id === "number") {
    return id;
  }
  if (typeof id === "string" && id.trim() !== "") {
    const parsed = Number(id);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
