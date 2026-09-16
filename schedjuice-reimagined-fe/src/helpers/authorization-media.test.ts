import { describe, expect, it } from "vitest";

import {
  canEditProfileMedia,
  canEditUser,
  canUpdateCoverImage,
} from "@/helpers/authorization";
import { canMutateUserField } from "@/lib/users/steward-fields";
import { role, type accountType } from "@/types/user";

function user(
  id: number,
  roles: role[],
  overrides: Partial<accountType> = {},
): accountType {
  return { id, roles, ...overrides } as accountType;
}

describe("canEditProfileMedia", () => {
  it("allows viewing your own profile media", () => {
    const student = user(5, [role.student]);
    expect(canEditProfileMedia(student, 5)).toBe(true);
  });

  it("allows admins to edit another user's profile media", () => {
    const admin = user(1, [role.admin]);
    expect(canEditProfileMedia(admin, 99)).toBe(true);
  });

  it("denies non-admin editing another user's profile media", () => {
    const teacher = user(2, [role.teacher]);
    expect(canEditProfileMedia(teacher, 99)).toBe(false);
  });
});

describe("canEditUser (ID photo gate)", () => {
  it("allows admin for anyone", () => {
    const admin = user(1, [role.admin]);
    expect(canEditUser(admin, 99)).toBe(true);
  });

  it("allows staff with user.update_own for themselves", () => {
    const teacher = user(2, [role.teacher], { permissions: ["user.update_own"] });
    expect(canEditUser(teacher, 2)).toBe(true);
  });

  it("allows students with user.update_own to edit their own profile", () => {
    const student = user(5, [role.student], { permissions: ["user.update_own"] });
    expect(canEditUser(student, 5)).toBe(true);
  });

  it("denies students without user.update_own editing their own profile", () => {
    const student = user(5, [role.student]);
    expect(canEditUser(student, 5)).toBe(false);
  });

  it("denies students editing others", () => {
    const student = user(5, [role.student]);
    expect(canEditUser(student, 99)).toBe(false);
  });
});

describe("canUpdateCoverImage", () => {
  it("denies students updating their own cover", () => {
    const student = user(5, [role.student]);
    expect(canUpdateCoverImage(student, 5)).toBe(false);
  });

  it("allows staff to update their own cover", () => {
    const teacher = user(2, [role.teacher]);
    expect(canUpdateCoverImage(teacher, 2)).toBe(true);
  });
});

describe("student profile photo via stewardship", () => {
  it("allows a student steward to mutate profile_image", () => {
    const student = user(5, [role.student], {
      user_write_mode: "steward",
      writable_fields: ["profile_image"],
    });
    expect(
      canMutateUserField({
        viewer: student,
        subject: student,
        field: "profile_image",
      }),
    ).toBe(true);
  });
});
