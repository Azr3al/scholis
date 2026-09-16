import { describe, expect, it } from "vitest";
import { getMyanmarDate } from "mm-cal-js";

import { deriveLunarFields } from "./myanmar-lunar-fields";

describe("deriveLunarFields", () => {
  it("matches mm-cal-js julian-to-myanmar formulas for 2024-01-01", () => {
    const wall = new Date("2024-01-01T12:00:00+06:30");
    const md = getMyanmarDate(wall);
    const { fortnightDay } = deriveLunarFields(md);
    expect(fortnightDay).toBe(5);
    expect(fortnightDay).not.toBe(md.monthDay);
  });
});
