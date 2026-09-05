import { describe, it, expect } from "vitest";
import { buildCourseBreadcrumb } from "./breadcrumb";

describe("buildCourseBreadcrumb", () => {
  it("joins program, level, section with middle dots", () => {
    expect(
      buildCourseBreadcrumb({
        program: { name: "ACCA" },
        level: { name: "Year 1" },
        section: { name: "Sec A" },
      }),
    ).toBe("ACCA · Year 1 · Sec A");
  });

  it("collapses missing pieces", () => {
    expect(buildCourseBreadcrumb({ program: { name: "Diploma" } })).toBe(
      "Diploma",
    );
  });
});
