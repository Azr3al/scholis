import { describe, expect, it } from "vitest";
import {
  isCheckInDisabled,
  needsCheckoutBeforeCheckIn,
  shouldShowCheckIn,
  type UserCheckinActionInput,
} from "@/helpers/user-checkin-actions";
import { CheckinStatus } from "@/types/attendance";

function base(overrides: Partial<UserCheckinActionInput>): UserCheckinActionInput {
  return {
    courseId: "10",
    currentStatus: CheckinStatus.not_checked_in,
    hasEventsToday: true,
    canCheckIn: false,
    canCheckOut: false,
    totalEvents: 2,
    completedEvents: 0,
    hasStaleOpenSession: false,
    checkinBlockReason: null,
    openCheckinSession: null,
    isLoading: false,
    ...overrides,
  };
}

describe("needsCheckoutBeforeCheckIn", () => {
  it("returns true when checked in with more sessions remaining today", () => {
    expect(
      needsCheckoutBeforeCheckIn(
        base({
          currentStatus: CheckinStatus.checked_in,
          canCheckOut: true,
          totalEvents: 2,
          completedEvents: 0,
          openCheckinSession: {
            course_id: 10,
            course_title: "Math 101",
            user_event: { event: { title: "Morning" } },
          },
        }),
      ),
    ).toBe(true);
  });

  it("returns false when checked in on the only remaining session", () => {
    expect(
      needsCheckoutBeforeCheckIn(
        base({
          currentStatus: CheckinStatus.checked_in,
          canCheckOut: true,
          totalEvents: 2,
          completedEvents: 1,
          openCheckinSession: {
            course_id: 10,
            course_title: "Math 101",
            user_event: { event: { title: "Morning" } },
          },
        }),
      ),
    ).toBe(false);
  });

  it("returns true for a stale open session from a prior day", () => {
    expect(
      needsCheckoutBeforeCheckIn(
        base({
          currentStatus: CheckinStatus.checked_in,
          canCheckOut: true,
          totalEvents: 1,
          completedEvents: 0,
          hasStaleOpenSession: true,
          openCheckinSession: {
            course_id: 10,
            course_title: "Math 101",
            user_event: { event: { title: "Yesterday" } },
            has_stale_open_session: true,
          },
        }),
      ),
    ).toBe(true);
  });

  it("returns false for a normal open check-in window", () => {
    expect(
      needsCheckoutBeforeCheckIn(
        base({
          currentStatus: CheckinStatus.not_checked_in,
          canCheckIn: true,
        }),
      ),
    ).toBe(false);
  });

  it("returns true when another course still has an open check-in", () => {
    expect(
      needsCheckoutBeforeCheckIn(
        base({
          courseId: "20",
          currentStatus: CheckinStatus.not_checked_in,
          canCheckIn: false,
          checkinBlockReason: "checkin_too_early",
          openCheckinSession: {
            course_id: 10,
            course_title: "Math 101",
            user_event: { event: { title: "Morning" } },
          },
        }),
      ),
    ).toBe(true);
  });

  it("returns false when open check-in is on an ended course", () => {
    expect(
      needsCheckoutBeforeCheckIn(
        base({
          courseId: "20",
          currentStatus: CheckinStatus.not_checked_in,
          canCheckIn: false,
          checkinBlockReason: "checkin_too_early",
          openCheckinSession: {
            course_id: 10,
            course_title: "Old Class",
            course_effective_status: "ended",
            user_event: { event: { title: "Last session" } },
          },
        }),
      ),
    ).toBe(false);
  });
});

describe("payroll rate missing block", () => {
  it("shows check-in while disabling submit", () => {
    const status = base({
      canCheckIn: false,
      checkinBlockReason: "payroll_rate_missing",
    });
    expect(shouldShowCheckIn(status)).toBe(true);
    expect(isCheckInDisabled(status)).toBe(true);
  });
});
