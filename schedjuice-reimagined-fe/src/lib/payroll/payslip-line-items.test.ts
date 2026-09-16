import { describe, expect, it } from "vitest";

import { buildPayslipLineItems } from "@/lib/payroll/payslip-line-items";
import { PayrollCalculationStrategy } from "@/types/organization";

describe("buildPayslipLineItems", () => {
  it("builds session-based line items per course", () => {
    const items = buildPayslipLineItems(
      {
        per_session_rate: 1000,
        total_earnings: 4000,
      },
      PayrollCalculationStrategy.session_based,
      "Ks",
      [
        { course_id: 1, course: "IELTS Foundation" },
        { course_id: 1, course: "IELTS Foundation" },
        { course_id: 2, course: "Speaking Club" },
        { course_id: 2, course: "Speaking Club" },
      ],
    );
    expect(items).toHaveLength(2);
    expect(items[0]?.label).toBe("IELTS Foundation · 2 sessions");
    expect(items[1]?.label).toBe("Speaking Club · 2 sessions");
  });

  it("builds tr_phillips line items per course and class type", () => {
    const items = buildPayslipLineItems(
      {
        total_earnings: 5700,
        by_course: {
          1: { earnings: 4500, total_hours: 4.5 },
          2: { earnings: 1200, total_hours: 1.5 },
        },
      },
      PayrollCalculationStrategy.tr_phillips,
      "Ks",
      [
        { course_id: 1, course: "IELTS Foundation", hours: 4.5, is_extra: false },
        { course_id: 2, course: "Exam Prep Extra", hours: 1.5, is_extra: true },
      ],
    );
    expect(items).toHaveLength(2);
    expect(items.map((item) => item.label)).toEqual(
      expect.arrayContaining([
        "IELTS Foundation · 4.50 hrs",
        "Exam Prep Extra · 1.50 hrs · extra",
      ]),
    );
  });

  it("splits regular and extra hours for the same course", () => {
    const items = buildPayslipLineItems(
      {
        total_earnings: 10000,
        by_course: {
          1: { earnings: 10000, total_hours: 3.5 },
        },
      },
      PayrollCalculationStrategy.tr_phillips,
      "Ks",
      [
        { course_id: 1, course: "Business English", hours: 2, is_extra: false },
        { course_id: 1, course: "Business English", hours: 1.5, is_extra: true },
      ],
    );
    expect(items).toHaveLength(2);
    expect(items[0]?.label).toBe("Business English · 2.00 hrs");
    expect(items[1]?.label).toBe("Business English · 1.50 hrs · extra");
  });
});
