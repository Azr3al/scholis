import { describe, expect, it } from "vitest";

import { formatStaffUserSecondaryLine } from "./staff-user-search-display";

describe("formatStaffUserSecondaryLine", () => {
  it("joins alt name and email with a middle dot", () => {
    expect(
      formatStaffUserSecondaryLine({
        alternative_name: "Aung Aung",
        email: "teacher@example.com",
      }),
    ).toBe("Aung Aung · teacher@example.com");
  });

  it("returns email only when alt name is missing", () => {
    expect(
      formatStaffUserSecondaryLine({
        email: "teacher@example.com",
      }),
    ).toBe("teacher@example.com");
  });

  it("returns empty string when both are missing", () => {
    expect(formatStaffUserSecondaryLine({})).toBe("");
  });
});
