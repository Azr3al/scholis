import { describe, expect, it } from "vitest";
import {
  studentPaymentsReportShellClassName,
  studentPaymentsSplitPaneMainClassName,
} from "@/components/finances/student-payments-report-shell-layout";

describe("studentPaymentsReportShellClassName", () => {

  it("returns unbounded shell without height cap for original ResourceTable", () => {
    const className = studentPaymentsReportShellClassName(false);
    expect(className).not.toContain("h-[75dvh]");
    expect(className).not.toContain("overflow-hidden");
    expect(className).toContain("rounded-xl");
  });
});

describe("studentPaymentsSplitPaneMainClassName", () => {
  it("returns bounded flex column pane for Glide", () => {
    expect(studentPaymentsSplitPaneMainClassName()).toContain("overflow-hidden");
    expect(studentPaymentsSplitPaneMainClassName()).toContain("flex-col");
    expect(studentPaymentsSplitPaneMainClassName()).toContain("min-h-0");
  });

  it("returns natural-height pane for original ResourceTable", () => {
    const className = studentPaymentsSplitPaneMainClassName(false);
    expect(className).toContain("p-3");
    expect(className).not.toContain("overflow-hidden");
    expect(className).not.toContain("flex-col");
    expect(className).not.toContain("h-full");
  });
});
