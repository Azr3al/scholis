import { describe, expect, it } from "vitest";

import { canEditCourse } from "@/helpers/authorization";
import { role, type accountType } from "@/types/user";
import type { UserCourse } from "@/sdk";

import {
  courseRosterStewardEnabled,
  matchesCourseProfileSearch,
  patchUserCourseUserField,
} from "./course-student-info-profile";

function user(id: number, roles: role[]): accountType {
  return { id, roles } as accountType;
}

describe("courseRosterStewardEnabled", () => {
  it("is false for a student viewer", () => {
    expect(
      courseRosterStewardEnabled(user(1, [role.student]), {
        teacherMemberIds: [1],
        createdById: 1,
      }),
    ).toBe(false);
  });

  it("is true for a teacher on the roster", () => {
    expect(
      courseRosterStewardEnabled(user(10, [role.teacher]), {
        teacherMemberIds: [10],
        createdById: null,
      }),
    ).toBe(true);
  });

  it("is false for an outsider teacher", () => {
    expect(
      courseRosterStewardEnabled(user(10, [role.teacher]), {
        teacherMemberIds: [99],
        createdById: null,
      }),
    ).toBe(false);
  });

  it("matches canEditCourse for admins", () => {
    const admin = user(1, [role.admin]);
    const ctx = { teacherMemberIds: [99], createdById: null };
    expect(courseRosterStewardEnabled(admin, ctx)).toBe(
      canEditCourse(admin, ctx.teacherMemberIds, ctx.createdById),
    );
  });
});

describe("matchesCourseProfileSearch", () => {
  const row = {
    name: "Aung Aung",
    alternative_name: "Ko Ko",
    email: "aung@example.com",
    communication_email: "ko@example.com",
  };

  it("matches alternative name and emails", () => {
    expect(matchesCourseProfileSearch(row, "ko ko")).toBe(true);
    expect(matchesCourseProfileSearch(row, "aung@example.com")).toBe(true);
    expect(matchesCourseProfileSearch(row, "missing")).toBe(false);
  });

  it("returns all rows when the query is empty", () => {
    expect(matchesCourseProfileSearch(row, "  ")).toBe(true);
  });
});

describe("patchUserCourseUserField", () => {
  const list = {
    total: 2,
    rows: [
      {
        id: 1,
        user: { id: 9, name: "Old", phone_number: "1" },
      },
      {
        id: 2,
        user: { id: 10, name: "Other" },
      },
    ] as UserCourse[],
  };

  it("optimistically patches the nested user field and leaves other rows", () => {
    const next = patchUserCourseUserField(list, 9, "name", "New") as typeof list;
    expect(next.rows[0]?.user).toMatchObject({ id: 9, name: "New" });
    expect(next.rows[1]?.user).toMatchObject({ id: 10, name: "Other" });
    expect(list.rows[0]?.user).toMatchObject({ name: "Old" });
  });

  it("rolls back by writing the previous value", () => {
    const optimistic = patchUserCourseUserField(list, 9, "name", "New");
    const rolled = patchUserCourseUserField(optimistic, 9, "name", "Old") as typeof list;
    expect(rolled.rows[0]?.user).toMatchObject({ name: "Old" });
  });

  it("does not invent a nested user when the row only has an id", () => {
    const numeric = { total: 1, rows: [{ id: 1, user: 9 }] as UserCourse[] };
    expect(patchUserCourseUserField(numeric, 9, "name", "New")).toEqual(numeric);
  });
});
