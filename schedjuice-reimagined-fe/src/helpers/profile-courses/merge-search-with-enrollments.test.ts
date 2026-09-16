import { describe, expect, it, vi } from "vitest";
import { seniorityEnum } from "@/types/course";

vi.mock("@/helpers/record-academic/calendar-sessions", () => ({
  nextSessionLabelForCourse: () => null,
}));

import { mergeSearchWithEnrollments } from "./merge-search-with-enrollments";

describe("mergeSearchWithEnrollments", () => {
  const enrollments = [
    {
      id: 100,
      course: { id: 1, title: "Math A", code: "M1", status: "active" },
      assigned_as_role: { name: "Student", seniority: null },
    },
    {
      id: 101,
      course: { id: 2, title: "Physics", code: "P1", status: "active" },
      assigned_as_role: {
        name: "Teacher",
        seniority: seniorityEnum.MAIN_TEACHER,
      },
    },
  ];

  it("merges course search rows with enrollment metadata", () => {
    const rows = mergeSearchWithEnrollments({
      courses: [
        {
          id: 1,
          title: "Math A",
          code: "M1",
          status: "active",
        },
        {
          id: 99,
          title: "Orphan",
          code: "X",
          status: "active",
        },
      ],
      enrollments,
      sharedIds: [1],
      calendarEvents: [],
      tenantTimezone: "Asia/Yangon",
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userCourseId: 100,
      courseId: 1,
      title: "Math A",
      assignedRoleName: "Student",
      isShared: true,
    });
  });

  it("sorts by role seniority rank", () => {
    const rows = mergeSearchWithEnrollments({
      courses: [
        { id: 1, title: "Math A", status: "active" },
        { id: 2, title: "Physics", status: "active" },
      ],
      enrollments,
      sharedIds: [],
      calendarEvents: [],
      tenantTimezone: null,
    });

    expect(rows.map((r) => r.courseId)).toEqual([2, 1]);
  });
});
