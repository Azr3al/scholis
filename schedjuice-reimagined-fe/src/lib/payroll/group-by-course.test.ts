import { describe, expect, it } from "vitest";
import {
  buildSessionBasedCourseSummaries,
  buildTrphillipsCourseSummaries,
} from "./group-by-course";

describe("buildSessionBasedCourseSummaries", () => {
  it("returns empty array for no rows", () => {
    expect(buildSessionBasedCourseSummaries([], 30000)).toEqual([]);
  });

  it("groups sessions by course and computes earnings", () => {
    const rows = [
      { course_id: 2, course: "Beta Course" },
      { course_id: 1, course: "Alpha Course" },
      { course_id: 1, course: "Alpha Course" },
      { course_id: 2, course: "Beta Course" },
      { course_id: 2, course: "Beta Course" },
    ];

    const result = buildSessionBasedCourseSummaries(rows, 30000);

    expect(result).toEqual([
      {
        courseId: 1,
        courseTitle: "Alpha Course",
        sessionCount: 2,
        perSessionRate: 30000,
        earnings: 60000,
      },
      {
        courseId: 2,
        courseTitle: "Beta Course",
        sessionCount: 3,
        perSessionRate: 30000,
        earnings: 90000,
      },
    ]);
  });
});

describe("buildTrphillipsCourseSummaries", () => {
  it("returns empty array for no rows", () => {
    expect(buildTrphillipsCourseSummaries([], {})).toEqual([]);
  });

  it("groups hours by course and pulls earnings from by_course", () => {
    const rows = [
      {
        course_id: 1,
        course: "Alpha Course",
        hours: 2,
        is_extra: false,
      },
      {
        course_id: 1,
        course: "Alpha Course",
        hours: 1.5,
        is_extra: true,
      },
      {
        course_id: 2,
        course: "Beta Course",
        hours: 3,
        is_extra: false,
      },
    ];
    const byCourse = {
      1: { earnings: 12000, total_hours: 3.5 },
      2: { earnings: 8000, total_hours: 3 },
    };

    const result = buildTrphillipsCourseSummaries(rows, byCourse);

    expect(result).toEqual([
      {
        courseId: 1,
        courseTitle: "Alpha Course",
        regularHours: 2,
        extraHours: 1.5,
        totalHours: 3.5,
        earnings: 12000,
      },
      {
        courseId: 2,
        courseTitle: "Beta Course",
        regularHours: 3,
        extraHours: 0,
        totalHours: 3,
        earnings: 8000,
      },
    ]);
  });

  it("resolves string keys in by_course aggregate", () => {
    const rows = [
      { course_id: 1, course: "Alpha Course", hours: 2, is_extra: false },
    ];
    const byCourse = {
      "1": { earnings: 5000, total_hours: 2 },
    };

    const result = buildTrphillipsCourseSummaries(rows, byCourse);

    expect(result[0]?.earnings).toBe(5000);
  });
});
