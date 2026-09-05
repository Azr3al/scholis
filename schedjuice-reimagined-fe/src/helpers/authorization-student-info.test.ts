import { describe, expect, it } from "vitest";

import {
  canUploadUserImageOnCourse,
  canViewStudentInfoSection,
} from "@/helpers/authorization";
import { role, type accountType } from "@/types/user";

function user(id: number, roles: role[]): accountType {
  return { id, roles } as accountType;
}

describe("student info authorization", () => {
  it("hides section from students", () => {
    expect(canViewStudentInfoSection(user(1, [role.student]))).toBe(false);
  });

  it("shows section to teachers", () => {
    expect(canViewStudentInfoSection(user(2, [role.teacher]))).toBe(true);
  });

  it("allows course teacher to upload on course", () => {
    const teacher = user(10, [role.teacher]);
    expect(
      canUploadUserImageOnCourse(teacher, "id_image", {
        teacherMemberIds: [10],
        createdById: null,
      }),
    ).toBe(true);
  });

  it("denies outsider teacher", () => {
    const teacher = user(10, [role.teacher]);
    expect(
      canUploadUserImageOnCourse(teacher, "id_image", {
        teacherMemberIds: [99],
        createdById: null,
      }),
    ).toBe(false);
  });
});
