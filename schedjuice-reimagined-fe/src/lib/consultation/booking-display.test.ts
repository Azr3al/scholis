import { describe, expect, it } from "vitest";
import {
  ConsultationBookingStatus,
  type ConsultationBooking,
} from "@/types/consultation";
import {
  bookingScheduledYmd,
  groupBookingsByYmd,
  sortBookings,
} from "@/lib/consultation/booking-display";

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

describe("bookingScheduledYmd", () => {
  it("groups late-night UTC into the org timezone calendar day", () => {
    const booking = makeBooking({
      id: 1,
      scheduled_at: "2026-08-11T14:30:00Z",
    });

    expect(bookingScheduledYmd(booking, "Asia/Yangon")).toBe("2026-08-11");
  });

  it("shifts day when UTC instant crosses org midnight", () => {
    const booking = makeBooking({
      id: 2,
      scheduled_at: "2026-08-11T17:30:00Z",
    });

    expect(bookingScheduledYmd(booking, "Asia/Yangon")).toBe("2026-08-12");
  });
});

describe("groupBookingsByYmd", () => {
  it("places two bookings on the same org day in one bucket sorted by time", () => {
    const bookings = [
      makeBooking({
        id: 1,
        scheduled_at: "2026-08-12T13:00:00Z",
        student_name: "Later",
      }),
      makeBooking({
        id: 2,
        scheduled_at: "2026-08-12T12:00:00Z",
        student_name: "Earlier",
      }),
    ];

    const grouped = groupBookingsByYmd(bookings, "Asia/Yangon");
    const dayBookings = grouped.get("2026-08-12");

    expect(dayBookings?.map((row) => row.student_name)).toEqual([
      "Earlier",
      "Later",
    ]);
  });
});

describe("sortBookings", () => {
  it("ranks pending bookings before confirmed ones", () => {
    const bookings = [
      makeBooking({
        id: 1,
        scheduled_at: "2026-08-20T12:00:00Z",
        status: ConsultationBookingStatus.Confirmed,
      }),
      makeBooking({
        id: 2,
        scheduled_at: "2026-08-21T12:00:00Z",
        status: ConsultationBookingStatus.Pending,
      }),
    ];

    expect(sortBookings(bookings).map((row) => row.id)).toEqual([2, 1]);
  });
});
