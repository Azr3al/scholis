import { describe, expect, it } from "vitest";
import {
  buildUserProfileHref,
  getTeachingRoleBadgeProps,
} from "./roster-table-utils";
import { seniorityEnum } from "@/types/course";

describe("buildUserProfileHref", () => {
  it("encodes pathname and search into ref query param", () => {
    expect(
      buildUserProfileHref(42, "/courses/1/members", "?tab=staff"),
    ).toBe("/users/42?ref=%2Fcourses%2F1%2Fmembers%3Ftab%3Dstaff");
  });
});

describe("getTeachingRoleBadgeProps", () => {

  it("returns show false for OTHER or missing seniority", () => {
    expect(getTeachingRoleBadgeProps(seniorityEnum.OTHER, "Coach")).toEqual({
      show: false,
      variant: null,
      label: null,
    });
    expect(getTeachingRoleBadgeProps(null, null)).toEqual({
      show: false,
      variant: null,
      label: null,
    });
  });
});
