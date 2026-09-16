import { describe, expect, it } from "vitest";

import { resolveScheduleRowAction } from "./resolve-schedule-row-action";

describe("resolveScheduleRowAction", () => {
  it("prefers check-in when session checkin is enabled", () => {
    expect(
      resolveScheduleRowAction({
        courseId: 1,
        useTeacherSessionCheckin: true,
        checkinAction: "check_in",
        markingHref: "/courses/1/attendance/marking/0",
        settledLabel: null,
      }),
    ).toEqual({ kind: "check_in", courseId: 1 });
  });

  it("falls back to Mark when check-in is not active", () => {
    const href = "/courses/2/attendance/marking/1";
    expect(
      resolveScheduleRowAction({
        courseId: 2,
        useTeacherSessionCheckin: false,
        checkinAction: "none",
        markingHref: href,
        settledLabel: null,
      }),
    ).toEqual({ kind: "mark", href });
  });
});
