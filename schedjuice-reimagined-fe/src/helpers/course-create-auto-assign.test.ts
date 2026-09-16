import { describe, expect, it } from "vitest";
import { willAutoAssignCreatorAsMainTeacher } from "./course-create-auto-assign";

describe("willAutoAssignCreatorAsMainTeacher", () => {
  it("returns true when flag is on and roles are exactly teacher", () => {
    expect(
      willAutoAssignCreatorAsMainTeacher({
        autoAssignFlag: true,
        roles: ["teacher"],
      }),
    ).toBe(true);
  });

  it("returns false when flag is off", () => {
    expect(
      willAutoAssignCreatorAsMainTeacher({
        autoAssignFlag: false,
        roles: ["teacher"],
      }),
    ).toBe(false);
  });

  it("returns false for multi-role teacher", () => {
    expect(
      willAutoAssignCreatorAsMainTeacher({
        autoAssignFlag: true,
        roles: ["teacher", "finance"],
      }),
    ).toBe(false);
  });

  it("returns false for empty or missing roles", () => {
    expect(
      willAutoAssignCreatorAsMainTeacher({
        autoAssignFlag: true,
        roles: [],
      }),
    ).toBe(false);
    expect(
      willAutoAssignCreatorAsMainTeacher({
        autoAssignFlag: true,
        roles: undefined,
      }),
    ).toBe(false);
  });
});
