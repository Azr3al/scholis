import { describe, expect, it } from "vitest";

import { buildCourseFormValues } from "./course-form-values";

describe("buildCourseFormValues", () => {
  it("maps FK-only category_id and payment_plan_id to positive ids", () => {
    const out = buildCourseFormValues({
      title: "Algebra",
      category_id: 12,
      payment_plan_id: 34,
    });
    expect(out.category).toBe(12);
    expect(out.payment_plan).toBe(34);
    expect(out.title).toBe("Algebra");
    expect(out).not.toHaveProperty("category_id");
    expect(out).not.toHaveProperty("payment_plan_id");
  });

  it("maps integer category and payment_plan FKs", () => {
    const out = buildCourseFormValues({
      category: 7,
      payment_plan: 9,
    });
    expect(out.category).toBe(7);
    expect(out.payment_plan).toBe(9);
  });

  it("maps nested { id } objects", () => {
    const out = buildCourseFormValues({
      category: { id: 3, name: "IGCSE" },
      payment_plan: { id: 5, name: "Monthly" },
      program: { id: 11, name: "P" },
    });
    expect(out.category).toBe(3);
    expect(out.payment_plan).toBe(5);
    expect(out.program).toBe(11);
  });

  it("prefers *_id when relation is truthy but not a valid id", () => {
    const out = buildCourseFormValues({
      category: {},
      category_id: 42,
      payment_plan: { name: "no-id" },
      payment_plan_id: 99,
    });
    expect(out.category).toBe(42);
    expect(out.payment_plan).toBe(99);
  });

  it("returns null when category and payment_plan are missing or invalid", () => {
    const out = buildCourseFormValues({
      category: null,
      payment_plan: "nope",
      category_id: 0,
    });
    expect(out.category).toBeNull();
    expect(out.payment_plan).toBeNull();
  });
});
