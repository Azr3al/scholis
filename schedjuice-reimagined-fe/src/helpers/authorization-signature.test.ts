import { describe, expect, it } from "vitest";

import { canEditUserSignature } from "@/helpers/authorization";
import { role, type accountType } from "@/types/user";

function user(
  id: number,
  roles: role[],
  overrides: Partial<accountType> = {},
): accountType {
  return { id, roles, ...overrides } as accountType;
}

describe("canEditUserSignature", () => {
  it("allows staff editing their own signature", () => {
    const teacher = user(2, [role.teacher]);
    expect(canEditUserSignature(teacher, teacher)).toBe(true);
  });

  it("denies admin editing another user's signature", () => {
    const admin = user(1, [role.admin]);
    const teacher = user(2, [role.teacher]);
    expect(canEditUserSignature(admin, teacher)).toBe(false);
  });

  it("denies student editing their own signature", () => {
    const student = user(5, [role.student]);
    expect(canEditUserSignature(student, student)).toBe(false);
  });
});
