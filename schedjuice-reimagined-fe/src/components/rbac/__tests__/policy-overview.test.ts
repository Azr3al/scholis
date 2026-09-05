import { describe, it, expect } from "vitest";
import { synthesizePolicy } from "@/lib/rbac/synthesize-policy";
import {
  policyBreadthSummary,
  teacherPolicyFixtureCatalog,
  TEACHER_POLICY_CODES,
} from "../policy-overview-utils";

describe("policy overview integration", () => {
  it("describes teacher scope and lists sensitive unheld permissions", () => {
    const catalog = teacherPolicyFixtureCatalog();
    const policy = synthesizePolicy(TEACHER_POLICY_CODES, catalog);
    const attendance = policy.can.find((group) => group.domain === "attendance");

    expect(attendance?.scope).toBe("own");
    expect(attendance?.text.toLowerCase()).toContain(
      "limited to what they are assigned to",
    );
    expect(
      policy.cannot.some((item) => item.code === "payment.verify"),
    ).toBe(true);
    expect(policy.cannot.some((item) =>
      item.sentence.toLowerCase().includes("verify and approve student payments"),
    )).toBe(true);
    expect(policyBreadthSummary(policy)).toBe("Limited to assigned records");
  });
});
