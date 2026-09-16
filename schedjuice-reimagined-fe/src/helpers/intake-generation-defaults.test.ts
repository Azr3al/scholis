import { describe, expect, it } from "vitest";
import {
  buildCoursePayloadFromIntakeDefaults,
  buildMultiCoursePayloadFromIntakeDefaults,
  getLevelDefaultCategoryId,
  parseIntakeGenerationDefaults,
  resolveIntakeAddPaymentPlanId,
  resolveMultiCourseCategoryId,
} from "./intake-generation-defaults";
import type { intakeType } from "@/types/intake";

describe("parseIntakeGenerationDefaults", () => {
  it("returns empty object when generation_defaults is missing", () => {
    expect(parseIntakeGenerationDefaults({} as intakeType)).toEqual({});
  });

  it("returns parsed defaults object", () => {
    expect(
      parseIntakeGenerationDefaults({
        generation_defaults: {
          category_id: 3,
          description: "Exam prep",
        },
      } as unknown as intakeType),
    ).toEqual({
      category_id: 3,
      description: "Exam prep",
    });
  });
});

describe("buildCoursePayloadFromIntakeDefaults", () => {
  it("builds a course payload from intake defaults and row data", () => {
    const intake = {
      id: 12,
      name: "Jun 2026",
      program: 2,
      start_date: new Date("2026-06-01"),
      end_date: new Date("2026-12-31"),
      generation_defaults: {
        category_id: 4,
        payment_plan_id: 9,
        description: "Cohort default",
        is_payment_enabled: true,
      },
    } as unknown as intakeType;

    const payload = buildCoursePayloadFromIntakeDefaults(intake, 2, {
      subject_id: 7,
      title: "ACCA Audit - Jun 2026 (2)",
    });

    expect(payload).toMatchObject({
      title: "ACCA Audit - Jun 2026 (2)",
      program: 2,
      intake: 12,
      subject: 7,
      category: 4,
      payment_plan: 9,
      description: "Cohort default",
      is_payment_enabled: true,
    });
    expect(payload.start_date).toBeTruthy();
    expect(payload.end_date).toBeTruthy();
  });
});

describe("resolveIntakeAddPaymentPlanId", () => {
  const intake = {
    generation_defaults: { payment_plan_id: 9 },
  } as unknown as intakeType;

  it("prefers row override over form default and intake default", () => {
    expect(resolveIntakeAddPaymentPlanId(intake, 5, 3)).toBe(3);
  });

  it("prefers form default over intake default", () => {
    expect(resolveIntakeAddPaymentPlanId(intake, 5, undefined)).toBe(5);
  });

  it("falls back to intake generation_defaults", () => {
    expect(resolveIntakeAddPaymentPlanId(intake, undefined, undefined)).toBe(9);
  });

  it("returns undefined when no plan at any level", () => {
    const intakeNoPlan = { generation_defaults: {} } as unknown as intakeType;
    expect(
      resolveIntakeAddPaymentPlanId(intakeNoPlan, undefined, undefined),
    ).toBeUndefined();
  });
});

describe("buildCoursePayloadFromIntakeDefaults payment_plan", () => {
  it("row payment_plan_id overrides intake default", () => {
    const intake = {
      id: 12,
      name: "Jun 2026",
      program: 2,
      start_date: new Date("2026-06-01"),
      end_date: new Date("2026-12-31"),
      generation_defaults: { payment_plan_id: 9 },
    } as unknown as intakeType;

    const payload = buildCoursePayloadFromIntakeDefaults(intake, 2, {
      subject_id: 7,
      title: "Course",
      payment_plan_id: 3,
    });

    expect(payload.payment_plan).toBe(3);
  });

  it("omits payment_plan when none resolved", () => {
    const intake = {
      id: 12,
      name: "Jun 2026",
      program: 2,
      start_date: new Date("2026-06-01"),
      end_date: new Date("2026-12-31"),
      generation_defaults: {},
    } as unknown as intakeType;

    const payload = buildCoursePayloadFromIntakeDefaults(intake, 2, {
      subject_id: 7,
      title: "Course",
    });

    expect(payload).not.toHaveProperty("payment_plan");
  });
});

describe("buildMultiCoursePayloadFromIntakeDefaults", () => {
  it("builds a multi-strategy course payload without subject", () => {
    const intake = {
      id: 12,
      name: "Term 1 2026",
      program: 2,
      start_date: new Date("2026-01-01"),
      end_date: new Date("2026-06-30"),
      generation_defaults: {
        category_id: 4,
        payment_plan_id: 9,
        description: "K-12 default",
      },
    } as unknown as intakeType;

    const payload = buildMultiCoursePayloadFromIntakeDefaults(intake, 2, {
      level_id: 5,
      section_id: 8,
      title: "Year 6 Section A - Term 1 2026",
      category_id: 4,
    });

    expect(payload).toMatchObject({
      title: "Year 6 Section A - Term 1 2026",
      program: 2,
      intake: 12,
      level: 5,
      section: 8,
      category: 4,
      payment_plan: 9,
      description: "K-12 default",
    });
    expect(payload).not.toHaveProperty("subject");
  });
});

describe("resolveMultiCourseCategoryId", () => {
  const intake = {
    generation_defaults: { category_id: 10 },
  } as unknown as intakeType;

  it("prefers intake default category", () => {
    expect(
      resolveMultiCourseCategoryId(intake, { default_category: 3 }),
    ).toBe(10);
  });

  it("falls back to level default category", () => {
    const intakeWithoutCategory = {
      generation_defaults: {},
    } as unknown as intakeType;

    expect(
      resolveMultiCourseCategoryId(intakeWithoutCategory, {
        default_category: { id: 7 },
      }),
    ).toBe(7);
  });

  it("falls back to category override", () => {
    const intakeWithoutCategory = {
      generation_defaults: {},
    } as unknown as intakeType;

    expect(
      resolveMultiCourseCategoryId(intakeWithoutCategory, undefined, "11"),
    ).toBe(11);
  });
});

describe("getLevelDefaultCategoryId", () => {
  it("reads numeric and expanded default_category values", () => {
    expect(getLevelDefaultCategoryId({ default_category: 4 })).toBe(4);
    expect(getLevelDefaultCategoryId({ default_category: { id: 6 } })).toBe(6);
    expect(getLevelDefaultCategoryId({ default_category: null })).toBeUndefined();
  });
});
