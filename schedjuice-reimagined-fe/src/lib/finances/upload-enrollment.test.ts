import { describe, expect, it } from "vitest";
import {
  courseHasBillablePaymentPlan,
  currentDiscountTemplateIds,
  resolveUploadDiscountSectionView,
  UPLOAD_ENROLLMENT_SEARCH_QUERY,
} from "./upload-enrollment";

describe("courseHasBillablePaymentPlan", () => {
  it("returns true for numeric FK", () => {
    expect(courseHasBillablePaymentPlan(5)).toBe(true);
  });

  it("returns true for expanded plan with price but no id", () => {
    expect(courseHasBillablePaymentPlan({ price: "390000" })).toBe(true);
  });

  it("returns false when plan is null or has no price/id", () => {
    expect(courseHasBillablePaymentPlan(null)).toBe(false);
    expect(courseHasBillablePaymentPlan({ billing_type: "per_period" })).toBe(
      false,
    );
  });
});

describe("resolveUploadDiscountSectionView", () => {
  const base = {
    invalidContext: false,
    courseLoading: false,
    courseHasPaymentPlan: true,
    enrollmentLoading: false,
    enrollmentError: false,
    enrollmentId: 42 as number | null,
  };

  it("shows picker when enrollment is found", () => {
    expect(resolveUploadDiscountSectionView(base)).toBe("picker");
  });

  it("shows error instead of hiding when enrollment search fails", () => {
    expect(
      resolveUploadDiscountSectionView({
        ...base,
        enrollmentError: true,
        enrollmentId: null,
      }),
    ).toBe("error");
  });

  it("shows not_enrolled when search succeeds with no row", () => {
    expect(
      resolveUploadDiscountSectionView({
        ...base,
        enrollmentId: null,
      }),
    ).toBe("not_enrolled");
  });

  it("hides when course has no billable payment plan", () => {
    expect(
      resolveUploadDiscountSectionView({
        ...base,
        courseHasPaymentPlan: false,
        enrollmentId: null,
      }),
    ).toBe("hidden");
  });
});

describe("currentDiscountTemplateIds", () => {
  it("extracts template ids from current enrollment discounts", () => {
    expect(
      currentDiscountTemplateIds([
        { discount: 1 },
        { discount: 2 },
        { discount: null },
      ]),
    ).toEqual([1, 2]);
  });
});

describe("UPLOAD_ENROLLMENT_SEARCH_QUERY", () => {
  it("uses empty sorts so user-courses search does not send invalid id sort", () => {
    expect(UPLOAD_ENROLLMENT_SEARCH_QUERY.sorts).toEqual([]);
    expect(UPLOAD_ENROLLMENT_SEARCH_QUERY.page).toBe(1);
    expect(UPLOAD_ENROLLMENT_SEARCH_QUERY.size).toBe(1);
  });
});
