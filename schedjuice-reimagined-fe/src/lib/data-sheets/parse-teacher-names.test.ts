import { describe, expect, it } from "vitest";

import { parseTeacherNames } from "./parse-teacher-names";

describe("parseTeacherNames", () => {
  it("returns empty for null, undefined, and blank strings", () => {
    expect(parseTeacherNames(null)).toEqual([]);
    expect(parseTeacherNames(undefined)).toEqual([]);
    expect(parseTeacherNames("")).toEqual([]);
    expect(parseTeacherNames("   ")).toEqual([]);
  });

  it("returns a single name unchanged", () => {
    expect(parseTeacherNames("Wine Su Waddy (Wine)")).toEqual([
      "Wine Su Waddy (Wine)",
    ]);
  });

  it("splits comma-separated names", () => {
    expect(
      parseTeacherNames(
        "Teacher Nobi (Phyu Phyu Kyaw), Millie Clover (May M)",
      ),
    ).toEqual(["Teacher Nobi (Phyu Phyu Kyaw)", "Millie Clover (May M)"]);
  });
});
