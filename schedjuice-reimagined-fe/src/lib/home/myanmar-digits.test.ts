import { describe, expect, it } from "vitest";

import { formatMyanmarDigits } from "./myanmar-digits";

describe("formatMyanmarDigits", () => {
  it("maps Latin digits to Myanmar digits", () => {
    expect(formatMyanmarDigits(5)).toBe("၅");
    expect(formatMyanmarDigits(2567)).toBe("၂၅၆၇");
  });
});
