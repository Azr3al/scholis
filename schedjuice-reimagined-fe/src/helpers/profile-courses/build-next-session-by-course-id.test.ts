import { describe, expect, it, vi } from "vitest";

vi.mock("@/helpers/record-academic/calendar-sessions", () => ({
  getUpcomingSessions: vi.fn((events: unknown[]) =>
    events.length === 0
      ? []
      : [
          {
            courseId: 10,
            courseTitle: "Math",
            calendarDay: "2026-06-27",
            timeFrom: "14:00:00",
            timeTo: "15:00:00",
            sortKey: "2026-06-27T14:00:00",
            label: "Fri 14:00–15:00",
          },
          {
            courseId: 20,
            courseTitle: "English",
            calendarDay: "2026-06-27",
            timeFrom: "09:00:00",
            timeTo: "10:00:00",
            sortKey: "2026-06-27T09:00:00",
            label: "Fri 09:00–10:00",
          },
        ],
  ),
}));

import { buildNextSessionByCourseId } from "./build-next-session-by-course-id";

describe("buildNextSessionByCourseId", () => {
  it("returns empty map for no events", () => {
    expect(buildNextSessionByCourseId([], "UTC").size).toBe(0);
  });

  it("maps each course to its earliest upcoming session label", () => {
    const map = buildNextSessionByCourseId(
      [{ id: 1, date: "2026-06-27", course: { id: 10 } }],
      "UTC",
    );

    expect(map.get(10)).toBe("Fri 14:00–15:00");
    expect(map.get(20)).toBe("Fri 09:00–10:00");
  });
});
