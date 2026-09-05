import { describe, expect, it } from "vitest";
import { canShowAcademicHubCreate } from "./can-show-create";

describe("canShowAcademicHubCreate", () => {
  it("shows for teacher-only when tenant flag is on (no course.create)", () => {
    expect(
      canShowAcademicHubCreate({
        hasCourseCreatePermission: false,
        isOnlyTeacher: true,
        canTeacherCreateCourse: true,
      }),
    ).toBe(true);
  });

  it("hides for teacher-only when tenant flag is off", () => {
    expect(
      canShowAcademicHubCreate({
        hasCourseCreatePermission: false,
        isOnlyTeacher: true,
        canTeacherCreateCourse: false,
      }),
    ).toBe(false);
  });

  it("shows when user has course.create", () => {
    expect(
      canShowAcademicHubCreate({
        hasCourseCreatePermission: true,
        isOnlyTeacher: false,
        canTeacherCreateCourse: false,
      }),
    ).toBe(true);
  });

  it("hides when neither course.create nor teacher flag applies", () => {
    expect(
      canShowAcademicHubCreate({
        hasCourseCreatePermission: false,
        isOnlyTeacher: false,
        canTeacherCreateCourse: true,
      }),
    ).toBe(false);
  });
});
