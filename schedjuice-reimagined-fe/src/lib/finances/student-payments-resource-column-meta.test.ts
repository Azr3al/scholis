import { describe, expect, it } from "vitest";
import { studentPaymentsResourceColumnLayout } from "./student-payments-resource-column-meta";

describe("studentPaymentsResourceColumnLayout", () => {
  it("omits parsed_amount when canVerify is false", () => {
    const layout = studentPaymentsResourceColumnLayout({
      hideCourseColumn: false,
      userUploadStrategy: false,
      canVerify: false,
    });
    expect(layout.some((c) => c.id === "parsed_amount")).toBe(false);
  });

  it("omits course when hideCourseColumn is true", () => {
    const layout = studentPaymentsResourceColumnLayout({
      hideCourseColumn: true,
      userUploadStrategy: false,
      canVerify: true,
    });
    expect(layout.some((c) => c.id === "course")).toBe(false);
  });

  it("inserts billing_start_date and omits method/date when userUploadStrategy", () => {
    const layout = studentPaymentsResourceColumnLayout({
      hideCourseColumn: false,
      userUploadStrategy: true,
      canVerify: false,
    });
    expect(layout.some((c) => c.id === "billing_start_date")).toBe(true);
    expect(layout.some((c) => c.id === "payment_method__name")).toBe(false);
    expect(layout.some((c) => c.id === "date_on_screenshot")).toBe(false);
  });

  it("places remarks immediately after description", () => {
    const layout = studentPaymentsResourceColumnLayout({
      hideCourseColumn: false,
      userUploadStrategy: false,
      canVerify: true,
    });
    const descIdx = layout.findIndex((c) => c.id === "description");
    const remarksIdx = layout.findIndex((c) => c.id === "remarks");
    expect(descIdx).toBeGreaterThanOrEqual(0);
    expect(remarksIdx).toBe(descIdx + 1);
  });
});
