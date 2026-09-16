import { describe, expect, it } from "vitest";
import {
  getCourseMarkingGapsEmptyMessage,
  getDailyAbsencesEmptyMessage,
  hasActiveOptionalFilters,
} from "@/helpers/attendance-god-view";
import {
  CourseMarkingProblemStatus,
  DailyAttendanceStatusFilter,
} from "@/types/attendance-god-view";

const baseParams = {
  courseId: "",
  categoryIdsActive: false,
  programId: "",
  studentId: "",
  minRate: "",
  maxRate: "",
  sort: "attendance_rate_asc",
  gapMinRate: "80",
  problemStatus: CourseMarkingProblemStatus.Unregistered,
  stalledAfterMarking: false,
};

describe("hasActiveOptionalFilters", () => {
  it("returns false when all defaults", () => {
    expect(hasActiveOptionalFilters("daily_absences", baseParams)).toBe(false);
  });

  it("returns true when course is selected", () => {
    expect(
      hasActiveOptionalFilters("daily_absences", {
        ...baseParams,
        courseId: "42",
      }),
    ).toBe(true);
  });

  it("returns true when gap min rate differs on course marking gaps", () => {
    expect(
      hasActiveOptionalFilters("course_marking_gaps", {
        ...baseParams,
        gapMinRate: "90",
      }),
    ).toBe(true);
  });

  it("returns true when stalled after marking is on", () => {
    expect(
      hasActiveOptionalFilters("course_marking_gaps", {
        ...baseParams,
        stalledAfterMarking: true,
      }),
    ).toBe(true);
  });
});

describe("getDailyAbsencesEmptyMessage", () => {
  it("prioritizes no scheduled sessions for filtered course", () => {
    expect(
      getDailyAbsencesEmptyMessage(null, {
        has_scheduled_sessions: false,
      }),
    ).toBe("This course has no scheduled sessions on this day.");
  });

  it("keeps status filter message when sessions exist", () => {
    expect(
      getDailyAbsencesEmptyMessage(DailyAttendanceStatusFilter.Absent, {
        has_scheduled_sessions: true,
      }),
    ).toBe("No absent students for this day.");
  });
});

describe("getCourseMarkingGapsEmptyMessage", () => {
  it("prioritizes no scheduled sessions for filtered course", () => {
    expect(
      getCourseMarkingGapsEmptyMessage("80", CourseMarkingProblemStatus.Unregistered, {
        has_scheduled_sessions: false,
      }),
    ).toBe("This course has no scheduled sessions in the selected range.");
  });

  it("returns stalled empty message when stalled filter is on", () => {
    expect(
      getCourseMarkingGapsEmptyMessage("80", CourseMarkingProblemStatus.Unregistered, null, {
        stalledAfterMarking: true,
      }),
    ).toBe(
      "No courses with prior marking and two consecutive unregistered session days in the selected range.",
    );
  });
});
