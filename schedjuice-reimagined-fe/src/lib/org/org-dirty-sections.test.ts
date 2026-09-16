import { describe, expect, it } from "vitest";

import { getDirtySchemaSectionIds } from "./org-dirty-sections";

describe("getDirtySchemaSectionIds", () => {
  it("maps dirty profile and reports fields to their sections", () => {
    const ids = getDirtySchemaSectionIds({
      name: true,
      is_wd_we_course_types_enabled: true,
    });
    expect(ids).toContain("profile");
    expect(ids).toContain("courses");
  });

  it("returns empty when nothing is dirty", () => {
    expect(getDirtySchemaSectionIds({})).toEqual([]);
  });

  it("ignores nested dirty objects by collecting top-level keys", () => {
    const ids = getDirtySchemaSectionIds({
      available_domains: { 0: true },
    });
    expect(ids).toContain("login-domains");
  });
});
