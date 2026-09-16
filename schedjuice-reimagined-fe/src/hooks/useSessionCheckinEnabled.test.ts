import { describe, expect, it } from "vitest";
import { canShowSessionCheckin } from "./useSessionCheckinEnabled";

describe("canShowSessionCheckin", () => {

  it("hides for student when only teacher checkin enabled", () => {
    expect(
      canShowSessionCheckin({
        isTeacher: false,
        isStudent: true,
        useTeacherSessionCheckin: true,
        useStudentCheckin: false,
      }),
    ).toBe(false);
  });

  it("shows for student when use_student_checkin is true", () => {
    expect(
      canShowSessionCheckin({
        isTeacher: false,
        isStudent: true,
        useTeacherSessionCheckin: false,
        useStudentCheckin: true,
      }),
    ).toBe(true);
  });
});
