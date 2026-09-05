import { describe, expect, it } from "vitest";

import { formatMoney } from "@/helpers/money";
import {
  formatPayrollHours,
  formatPayrollMoney,
} from "@/lib/payroll/format";

describe("formatPayrollHours", () => {
  it("rounds floating-point artifacts to two decimal places", () => {
    expect(formatPayrollHours(264.84999999999997)).toBe("264.85");
  });

  it("formats whole numbers with two decimal places", () => {
    expect(formatPayrollHours(10)).toBe("10.00");
    expect(formatPayrollHours(0)).toBe("0.00");
  });
});

describe("formatPayrollMoney", () => {
  it("formats amounts with currency and two decimal places", () => {
    expect(formatPayrollMoney(1234.5, "Ks")).toBe("Ks 1,234.50");
    expect(formatPayrollMoney(10000, "Ks")).toBe("Ks 10,000.00");
  });

  it("rounds floating-point artifacts to two decimal places", () => {
    expect(formatPayrollMoney(99.99999999999997, "Ks")).toBe("Ks 100.00");
  });
});

describe("formatMoney default behavior", () => {
  it("still trims trailing zeros when options are omitted", () => {
    expect(formatMoney(10000, "Ks")).toBe("Ks 10,000");
    expect(formatMoney(1234.5, "Ks")).toBe("Ks 1,234.5");
  });
});
