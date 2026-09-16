import { describe, expect, it } from "vitest";
import {
  ConsultationBookingStatus,
  type ConsultationBooking,
} from "@/types/consultation";
import {
  bookingIdFromCalendarEvent,
  bookingToCalendarEvent,
  bookingsToFormattedEvents,
} from "@/lib/consultation/booking-calendar";

function makeBooking(
  overrides: Partial<ConsultationBooking> & Pick<ConsultationBooking, "id" | "scheduled_at">,
): ConsultationBooking {
  return {
    duration_minutes: 30,
    student_name: "Student",
    student_email: "student@example.com",
    meeting_link: "",
    status: ConsultationBookingStatus.Confirmed,
    cancelled_at: null,
    cancelled_by: null,
    created_at: "2026-08-01T00:00:00Z",
    details: {},
    booking_url: "",
    ...overrides,
  };
}

describe("bookingToCalendarEvent", () => {
  it("derives tenant-local start time and duration end in org timezone", () => {
    const booking = makeBooking({
      id: 7,
      scheduled_at: "2026-08-11T14:30:00Z",
      duration_minutes: 45,
      student_name: "Alex",
    });

    const event = bookingToCalendarEvent(booking, "Asia/Yangon");

    expect(event.id).toBe(7);
    expect(event.title).toBe("Alex");
    expect(event.date).toBe("2026-08-11");
    expect(event.time_from).toBe("21:00:00");
    expect(event.time_to).toBe("21:45:00");
    expect(event.is_deleted).toBe(false);
  });

  it("keeps cancelled bookings visible on the calendar", () => {
    const booking = makeBooking({
      id: 3,
      scheduled_at: "2026-08-12T12:00:00Z",
      status: ConsultationBookingStatus.Cancelled,
    });

    const event = bookingToCalendarEvent(booking, "Asia/Yangon");

    expect(event.is_deleted).toBe(false);
    expect(event.id).toBe(3);
  });
});

describe("bookingsToFormattedEvents", () => {
  it("buckets bookings by calendar day and preserves click lookup id", () => {
    const bookings = [
      makeBooking({
        id: 10,
        scheduled_at: "2026-08-12T13:00:00Z",
        student_name: "Later",
      }),
      makeBooking({
        id: 11,
        scheduled_at: "2026-08-12T12:00:00Z",
        student_name: "Earlier",
      }),
    ];

    const formatted = bookingsToFormattedEvents(bookings, "Asia/Yangon");
    const dayEvents = formatted["2026-08-12"];

    expect(dayEvents).toHaveLength(2);
    expect(dayEvents?.map((row) => row.title)).toEqual(["Earlier", "Later"]);
    expect(bookingIdFromCalendarEvent(dayEvents![0]!)).toBe(11);
    expect(bookingIdFromCalendarEvent(dayEvents![1]!)).toBe(10);
  });

  it("shifts bucket day when UTC instant crosses org midnight", () => {
    const booking = makeBooking({
      id: 4,
      scheduled_at: "2026-08-11T17:30:00Z",
    });

    const formatted = bookingsToFormattedEvents([booking], "Asia/Yangon");

    expect(formatted["2026-08-12"]).toHaveLength(1);
    expect(formatted["2026-08-11"]).toBeUndefined();
  });
});

describe("bookingIdFromCalendarEvent", () => {
  it("returns null for missing or non-numeric ids", () => {
    expect(bookingIdFromCalendarEvent({})).toBeNull();
    expect(bookingIdFromCalendarEvent({ id: "abc" })).toBeNull();
  });
});
