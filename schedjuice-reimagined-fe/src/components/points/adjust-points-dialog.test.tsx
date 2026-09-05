import { describe, expect, it } from "vitest";
import { isAdjustPointsSubmitDisabled } from "./adjust-points-form";

describe("AdjustPointsDialog", () => {
  it("submit disabled when note too short", () => {
    expect(
      isAdjustPointsSubmitDisabled({
        pointTypeId: 1,
        delta: "5",
        note: "ab",
        saving: false,
      }),
    ).toBe(true);
  });

  it("submit enabled when note meets minimum length", () => {
    expect(
      isAdjustPointsSubmitDisabled({
        pointTypeId: 1,
        delta: "5",
        note: "abc",
        saving: false,
      }),
    ).toBe(false);
  });
});
