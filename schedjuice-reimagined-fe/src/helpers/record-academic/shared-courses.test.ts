import { describe, it, expect } from "vitest";
import { sharedCourseIds, viewerTeachingCourseIds } from "./shared-courses";
import { seniorityEnum } from "@/types/course";

describe("viewerTeachingCourseIds", () => {
  it("returns course ids where assigned role seniority qualifies", () => {
    const ids = viewerTeachingCourseIds([
      {
        course: { id: 1, status: "active" },
        assigned_as_role: { seniority: seniorityEnum.MAIN_TEACHER },
      },
      {
        course: { id: 2, status: "active" },
        assigned_as_role: { seniority: seniorityEnum.OTHER },
      },
      {
        course: { id: 3, status: "ended" },
        assigned_as_role: { seniority: seniorityEnum.MAIN_TEACHER },
      },
    ]);
    expect(ids).toEqual([1]);
  });
});

describe("sharedCourseIds", () => {
  it("returns intersection of viewer teaching courses and subject enrollments", () => {
    const viewer = [
      {
        course: { id: 10, status: "active" },
        assigned_as_role: { seniority: seniorityEnum.MAIN_TEACHER },
      },
      {
        course: { id: 20, status: "active" },
        assigned_as_role: { seniority: seniorityEnum.MAIN_TEACHER },
      },
    ];
    const subject = [{ course: { id: 10 } }, { course: { id: 30 } }];
    expect(sharedCourseIds(viewer, subject)).toEqual([10]);
  });

  it("returns empty when no overlap", () => {
    expect(
      sharedCourseIds(
        [
          {
            course: { id: 1, status: "active" },
            assigned_as_role: { seniority: seniorityEnum.MAIN_TEACHER },
          },
        ],
        [{ course: { id: 99 } }],
      ),
    ).toEqual([]);
  });
});
