import { describe, expect, it } from "vitest";

import { canEditUser } from "@/helpers/authorization";
import { role, type accountType } from "@/types/user";

import { STEWARD_USER_KEYS, canMutateUserField } from "./steward-fields";

function user(
  id: number,
  roles: role[],
  overrides: Partial<accountType> = {},
): accountType {
  return { id, roles, ...overrides } as accountType;
}

describe("STEWARD_USER_KEYS", () => {
  it("includes identity keys and excludes office login email and code", () => {
    expect(STEWARD_USER_KEYS).toContain("name");
    expect(STEWARD_USER_KEYS).toContain("alternative_name");
    expect(STEWARD_USER_KEYS).toContain("profile_image");
    expect(STEWARD_USER_KEYS).toContain("id_photo");
    expect(STEWARD_USER_KEYS).not.toContain("email");
    expect(STEWARD_USER_KEYS).not.toContain("code");
  });
});

describe("canMutateUserField", () => {
  it("allows a connected teacher to edit name when the subject is steward", () => {
    const teacher = user(2, [role.teacher]);
    const student = user(9, [role.student], {
      user_write_mode: "steward",
      writable_fields: [...STEWARD_USER_KEYS],
    });
    expect(canEditUser(teacher, student.id)).toBe(false);
    expect(
      canMutateUserField({ viewer: teacher, subject: student, field: "name" }),
    ).toBe(true);
  });

  it("denies a teacher when the subject write mode is none", () => {
    const teacher = user(2, [role.teacher]);
    const student = user(9, [role.student], {
      user_write_mode: "none",
      writable_fields: [],
    });
    expect(
      canMutateUserField({ viewer: teacher, subject: student, field: "name" }),
    ).toBe(false);
  });

  it("allows a student steward to edit their own name", () => {
    const student = user(5, [role.student], {
      user_write_mode: "steward",
      writable_fields: [...STEWARD_USER_KEYS],
    });
    expect(
      canMutateUserField({ viewer: student, subject: student, field: "name" }),
    ).toBe(true);
  });

  it("denies a student steward for login email", () => {
    const student = user(5, [role.student], {
      user_write_mode: "steward",
      writable_fields: [...STEWARD_USER_KEYS],
    });
    expect(
      canMutateUserField({ viewer: student, subject: student, field: "email" }),
    ).toBe(false);
  });
});
