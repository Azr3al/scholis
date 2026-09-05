import { describe, expect, it } from "vitest";
import { HUB_PROGRAM_ALL } from "@/types/academic-hub";
import { shouldShowSecondaryToolbar } from "./secondary-toolbar-visible";

describe("shouldShowSecondaryToolbar", () => {
  it("returns false when program is all", () => {
    expect(
      shouldShowSecondaryToolbar({
        program: HUB_PROGRAM_ALL,
        isOnlyTeacher: false,
        isStudent: false,
      }),
    ).toBe(false);
  });

  it("returns false for teacher-only users", () => {
    expect(
      shouldShowSecondaryToolbar({ program: "1", isOnlyTeacher: true, isStudent: false }),
    ).toBe(false);
  });

  it("returns false for students even when a program is selected", () => {
    expect(
      shouldShowSecondaryToolbar({ program: "1", isOnlyTeacher: false, isStudent: true }),
    ).toBe(false);
  });
});
