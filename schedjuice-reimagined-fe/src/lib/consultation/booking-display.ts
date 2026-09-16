import {
  ConsultationBookingStatus,
  ConsultationCancelledBy,
  type ConsultationBooking,
} from "@/types/consultation";
import { formatInTimeZone } from "date-fns-tz";

export function formatBookingWhen(
  booking: ConsultationBooking,
  timezone: string | undefined,
  timePattern: string,
): string {
  const datePattern = `${timePattern.includes("a") ? "MMM d, yyyy" : "MMM d, yyyy"} · ${timePattern}`;
  return formatInTimeZone(
    new Date(booking.scheduled_at),
    timezone ?? "UTC",
    datePattern,
  );
}

export function formatBookingTimeOnly(
  booking: ConsultationBooking,
  timezone: string | undefined,
  timePattern: string,
): string {
  return formatInTimeZone(
    new Date(booking.scheduled_at),
    timezone ?? "UTC",
    timePattern,
  );
}

export function formatBookingDateLabel(
  date: Date,
  timezone: string | undefined,
): string {
  return formatInTimeZone(date, timezone ?? "UTC", "MMM d, yyyy");
}

export function bookingStatusLabel(booking: ConsultationBooking): string | null {
  if (booking.status === ConsultationBookingStatus.Cancelled) {
    if (
      booking.cancelled_by === ConsultationCancelledBy.Consultant &&
      !booking.meeting_link
    ) {
      return "Declined";
    }
    return "Cancelled";
  }
  if (booking.status === ConsultationBookingStatus.Pending) {
    return "Waiting for you";
  }
  if (booking.status === ConsultationBookingStatus.Confirmed) {
    return "Confirmed";
  }
  return null;
}

export function sortBookings(bookings: ConsultationBooking[]): ConsultationBooking[] {
  return [...bookings].sort((a, b) => {
    const aPending = a.status === ConsultationBookingStatus.Pending;
    const bPending = b.status === ConsultationBookingStatus.Pending;
    if (aPending !== bPending) {
      return aPending ? -1 : 1;
    }
    return new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
  });
}

export function bookingScheduledYmd(
  booking: ConsultationBooking,
  timezone: string | undefined,
): string {
  return formatInTimeZone(
    new Date(booking.scheduled_at),
    timezone ?? "UTC",
    "yyyy-MM-dd",
  );
}

export function calendarDateToYmd(
  date: Date,
  timezone: string | undefined,
): string {
  return formatInTimeZone(date, timezone ?? "UTC", "yyyy-MM-dd");
}

export function groupBookingsByYmd(
  bookings: ConsultationBooking[],
  timezone: string | undefined,
): Map<string, ConsultationBooking[]> {
  const grouped = new Map<string, ConsultationBooking[]>();
  for (const booking of sortBookings(bookings)) {
    const ymd = bookingScheduledYmd(booking, timezone);
    const existing = grouped.get(ymd);
    if (existing) {
      existing.push(booking);
    } else {
      grouped.set(ymd, [booking]);
    }
  }
  return grouped;
}

export function visibleMonthHasBookings(
  visibleMonth: Date,
  bookingYmds: Set<string>,
  timezone: string | undefined,
): boolean {
  const monthPrefix = formatInTimeZone(visibleMonth, timezone ?? "UTC", "yyyy-MM");
  return Array.from(bookingYmds).some((ymd) => ymd.startsWith(monthPrefix));
}
