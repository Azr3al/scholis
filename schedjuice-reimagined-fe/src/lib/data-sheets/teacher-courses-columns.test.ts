import { describe, expect, it } from "vitest";
import {
  TEACHER_COURSES_FIELDS,
  splitAssignedClasses,
  teacherCoursesFromRow,
} from "./teacher-courses-columns";

describe("teacher-courses-columns", () => {
  it("keeps name, email, assigned_classes, type, and duration in the locked column order", () => {
    expect(TEACHER_COURSES_FIELDS).toEqual([
      "name",
      "email",
      "assigned_classes",
      "course_type",
      "duration",
    ]);
  });

  it("splits assigned_classes on newlines for chips", () => {
    expect(splitAssignedClasses("A\nB")).toEqual(["A", "B"]);
    expect(splitAssignedClasses("")).toEqual([]);
    expect(splitAssignedClasses(null)).toEqual([]);
  });

  it("prefers structured courses over splitting assigned_classes", () => {
    expect(
      teacherCoursesFromRow({
        name: "Ada",
        email: "ada@example.com",
        user_id: 1,
        assigned_classes: "Fallback",
        course_type: "WE",
        duration: "1h 30m",
        courses: [{ id: 9, title: "Chip Label (MT) FM" }],
      }),
    ).toEqual([{ id: 9, title: "Chip Label (MT) FM" }]);
  });
});
