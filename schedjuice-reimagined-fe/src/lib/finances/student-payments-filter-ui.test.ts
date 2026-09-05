import { describe, expect, it } from "vitest";
import {
  paymentEditableFieldInputClassName,
  shouldShowStudentPaymentsMonthSelector,
} from "./student-payments-filter-ui";

describe("shouldShowStudentPaymentsMonthSelector", () => {
  it("shows for report mode including course-scoped (fixed course)", () => {
    expect(
      shouldShowStudentPaymentsMonthSelector({
        globalTransactionLookup: false,
        isReport: true,
      }),
    ).toBe(true);
  });

  it("hides for global transaction lookup", () => {
    expect(
      shouldShowStudentPaymentsMonthSelector({
        globalTransactionLookup: true,
        isReport: true,
      }),
    ).toBe(false);
  });

  it("hides when not report mode (e.g. recent transactions)", () => {
    expect(
      shouldShowStudentPaymentsMonthSelector({
        globalTransactionLookup: false,
        isReport: false,
      }),
    ).toBe(false);
  });

  it("defaults isReport to true (shell is always report)", () => {
    expect(
      shouldShowStudentPaymentsMonthSelector({
        globalTransactionLookup: false,
      }),
    ).toBe(true);
  });
});

describe("paymentEditableFieldInputClassName", () => {

  it("uses 20rem floor for description", () => {
    expect(paymentEditableFieldInputClassName("description")).toContain(
      "min-w-[20rem]",
    );
  });

  it("uses description width for remarks", () => {
    expect(paymentEditableFieldInputClassName("remarks")).toContain(
      "min-w-[20rem]",
    );
  });
});
