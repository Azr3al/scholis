import { describe, expect, it } from "vitest";

import { role, type accountType } from "@/types/user";

import {
  OVERVIEW_ALWAYS_LOCKED_FIELDS,
  OVERVIEW_IDENTITY_FIELDS,
  STEWARD_USER_KEYS,
  canViewPeopleFieldHistory,
  overviewFieldLocked,
} from "./steward-fields";

function user(
  id: number,
  roles: role[],
  overrides: Partial<accountType> = {},
): accountType {
  return { id, roles, ...overrides } as accountType;
}

describe("overview field lock matrix", () => {
  const teacher = user(2, [role.teacher]);
  const student = user(9, [role.student], {
    user_write_mode: "steward",
    writable_fields: [...STEWARD_USER_KEYS],
  });

  it("unlocks name for a steward teacher and keeps login email locked", () => {
    expect(
      overviewFieldLocked({ viewer: teacher, subject: student, field: "name" }),
    ).toBe(false);
    expect(
      overviewFieldLocked({ viewer: teacher, subject: student, field: "email" }),
    ).toBe(true);
  });

  it("does not show student code on Overview", () => {
    expect(OVERVIEW_IDENTITY_FIELDS).not.toContain("code");
    expect(OVERVIEW_ALWAYS_LOCKED_FIELDS).not.toContain("code");
  });

  it("locks name when write mode is none", () => {
    const outsider = user(9, [role.student], {
      user_write_mode: "none",
      writable_fields: [],
    });
    expect(
      overviewFieldLocked({ viewer: teacher, subject: outsider, field: "name" }),
    ).toBe(true);
  });
});

describe("canViewPeopleFieldHistory", () => {
  it("allows the subject and steward or full writers", () => {
    const student = user(5, [role.student], { user_write_mode: "steward" });
    const teacher = user(2, [role.teacher]);
    expect(canViewPeopleFieldHistory(student, student)).toBe(true);
    expect(
      canViewPeopleFieldHistory(teacher, {
        id: 5,
        user_write_mode: "steward",
      }),
    ).toBe(true);
    expect(
      canViewPeopleFieldHistory(teacher, { id: 5, user_write_mode: "none" }),
    ).toBe(false);
  });
});
