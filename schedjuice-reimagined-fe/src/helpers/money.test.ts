import { describe, expect, it } from "vitest";
import { formatDecimalString, formatMoney, formatPlainAmount } from "./money";

describe("formatPlainAmount lakhs", () => {
  it("keeps values below one lakh in full units", () => {
    expect(formatPlainAmount(99999.99)).toBe("99,999.99");
    expect(formatPlainAmount(10000)).toBe("10,000");
  });

  it("switches to lakhs at 100,000", () => {
    expect(formatPlainAmount(100000)).toBe("1 lakh");
    expect(formatPlainAmount(43705000)).toBe("437.05 lakh");
    expect(formatMoney(43705000, "Ks")).toBe("Ks 437.05 lakh");
    expect(formatDecimalString("250000.00", "Ks")).toBe("Ks 2.5 lakh");
  });

  it("preserves a minus sign for compact lakhs", () => {
    expect(formatMoney(-150000, "Ks")).toBe("Ks -1.5 lakh");
  });
});
