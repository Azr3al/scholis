import { describe, expect, it } from "vitest";
import { formatRepeatEverySummary } from "./course-repeat";

describe("formatRepeatEverySummary", () => {
  it("maps ISO weekday numbers to labels", () => {
    expect(formatRepeatEverySummary(["1", "3"])).toBe("Mon, Wed");
  });

  it("passes through weekday name strings", () => {
    expect(formatRepeatEverySummary(["Mon", "Wed"])).toBe("Mon, Wed");
  });

  it("returns null when empty", () => {
    expect(formatRepeatEverySummary(null)).toBeNull();
    expect(formatRepeatEverySummary([])).toBeNull();
  });
});
