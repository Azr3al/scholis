import { describe, expect, it } from "vitest";
import {
  getDefaultPaymentPlanId,
  getEffectivePaymentPlanId,
  getSubjectLabelsForRow,
  rowHasCustomPaymentPlan,
} from "./intake-preview";

describe("intake-preview row helpers", () => {
  it("resolves subject label from row subject_id", () => {
    expect(
      getSubjectLabelsForRow(
        { key: "subject:1", title: "T", subject_id: 1 },
        { 1: "Maths" },
      ),
    ).toEqual(["Maths"]);
  });

  it("prefers row subject_name over subjectsById lookup", () => {
    expect(
      getSubjectLabelsForRow(
        {
          key: "subject:14",
          title: "T",
          subject_id: 14,
          subject_name: "PM",
        },
        {},
      ),
    ).toEqual(["PM"]);
  });

  it("falls back to Subject #id when name is unavailable", () => {
    expect(
      getSubjectLabelsForRow(
        { key: "subject:14", title: "T", subject_id: 14 },
        {},
      ),
    ).toEqual(["Subject #14"]);
  });

  it("resolves subject labels from level overrides", () => {
    expect(
      getSubjectLabelsForRow(
        { key: "level:2", title: "T", level_id: 2 },
        { 10: "Physics", 11: "Chemistry" },
        { 2: [10, 11] },
      ),
    ).toEqual(["Physics", "Chemistry"]);
  });

  it("resolves effective payment plan id", () => {
    expect(getDefaultPaymentPlanId(5, undefined)).toBe(5);
    expect(getDefaultPaymentPlanId(5, 9)).toBe(9);
    expect(
      getEffectivePaymentPlanId("a", 9, { a: 3 }),
    ).toBe(3);
    expect(rowHasCustomPaymentPlan("a", { a: 3 })).toBe(true);
    expect(rowHasCustomPaymentPlan("b", { a: 3 })).toBe(false);
  });
});
