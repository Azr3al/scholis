import { describe, expect, it } from "vitest";
import {
  coursePrimaryTeacherForDisplay,
  shouldShowCoursePrimaryTeacherName,
} from "./course-primary-teacher-display";

const teacher = { id: 1, name: "Khin Khin Win", email: "k@example.com" };

describe("shouldShowCoursePrimaryTeacherName", () => {
  it("shows when main teacher count is missing", () => {
    expect(shouldShowCoursePrimaryTeacherName(undefined)).toBe(true);
    expect(shouldShowCoursePrimaryTeacherName(null)).toBe(true);
  });

  it("shows when count is 0 or 1", () => {
    expect(shouldShowCoursePrimaryTeacherName(0)).toBe(true);
    expect(shouldShowCoursePrimaryTeacherName(1)).toBe(true);
  });

  it("hides when count is greater than 1", () => {
    expect(shouldShowCoursePrimaryTeacherName(2)).toBe(false);
    expect(shouldShowCoursePrimaryTeacherName(12)).toBe(false);
  });
});

describe("coursePrimaryTeacherForDisplay", () => {
  it("returns null when teacher has no name", () => {
    expect(
      coursePrimaryTeacherForDisplay({ id: 1, name: "", email: "a@b.com" }, 1),
    ).toBeNull();
    expect(coursePrimaryTeacherForDisplay(null, 1)).toBeNull();
  });

  it("returns teacher when count allows display", () => {
    expect(coursePrimaryTeacherForDisplay(teacher, 1)).toEqual(teacher);
    expect(coursePrimaryTeacherForDisplay(teacher, 0)).toEqual(teacher);
    expect(coursePrimaryTeacherForDisplay(teacher, null)).toEqual(teacher);
  });

  it("returns null when multiple main teachers are assigned", () => {
    expect(coursePrimaryTeacherForDisplay(teacher, 2)).toBeNull();
  });
});
