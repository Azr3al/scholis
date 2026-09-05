import type { Policy } from "@/lib/rbac/synthesize-policy";

export function policyHasOrgWideScope(policy: Policy): boolean {
  return policy.can.some((group) => group.scope === "all");
}

export function policyBreadthSummary(policy: Policy): string {
  if (policyHasOrgWideScope(policy)) {
    return "Org-wide access in at least one area";
  }
  if (policy.can.length === 0) {
    return "No permissions assigned";
  }
  return "Limited to assigned records";
}

export function teacherPolicyFixtureCatalog() {
  return [
    {
      code: "attendance.mark",
      sentence: "take attendance for their classes",
      data_class: "Academic",
      sensitive: false,
    },
    {
      code: "course.view",
      sentence: "view courses they are connected to",
      data_class: "Academic",
      sensitive: false,
    },
    {
      code: "payment.verify",
      sentence: "verify and approve student payments",
      data_class: "Financial",
      sensitive: true,
    },
  ];
}

export const TEACHER_POLICY_CODES = ["attendance.mark", "course.view"];
