import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/api", () => ({ axiosClient: { get: vi.fn() } }));
vi.mock("motion/react", () => ({
  motion: {
    div: ({ children }: { children?: React.ReactNode }) => children,
  },
}));

import { makePermissionChecker } from "@/hooks/usePermissions";
import { getVisibleWidgetIds } from "../home-dashboard";

const TEACHER_PERMS = [
  "course.view",
  "attendance.mark",
  "assignment.grade",
  "payroll.view",
];

describe("home dashboard widget visibility", () => {
  it("shows teacher widgets and hides finance-only widgets", () => {
    const { canAny } = makePermissionChecker(TEACHER_PERMS);
    const ids = getVisibleWidgetIds(canAny);

    expect(ids).toContain("welcome");
    expect(ids).toContain("next-class");
    expect(ids).toContain("todays-classes");
    expect(ids).toContain("pending-grading");
    expect(ids).toContain("my-earnings");

    expect(ids).not.toContain("unverified-payments");
    expect(ids).not.toContain("cash-flow");
    expect(ids).not.toContain("unpaid-students");
  });

  it("shows unpaid-students widget when teacher has payment.view_unpaid", () => {
    const { canAny } = makePermissionChecker([
      ...TEACHER_PERMS,
      "payment.view_unpaid",
    ]);
    const ids = getVisibleWidgetIds(canAny);
    expect(ids).toContain("unpaid-students");
  });
});
