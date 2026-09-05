import { describe, it, expect, vi } from "vitest";

// usePermissions imports useUser, which transitively imports @/lib/api — a module
// that throws at load time unless NEXT_PUBLIC_BASE_API_URL is set. makePermissionChecker
// is pure and never touches useUser, so we stub it to keep this a dependency-free unit test.
vi.mock("@/hooks/useUser", () => ({
  useUser: () => ({ user: undefined }),
}));

import { makePermissionChecker } from "@/lib/rbac/permission-checker";

describe("permission checker", () => {
  const c = makePermissionChecker(["course.view", "course.update"]);
  it("can() is false for an unheld code", () => expect(c.can("payment.verify")).toBe(false));
  it("canAny() true if any held", () => expect(c.canAny(["payment.verify", "course.view"])).toBe(true));
  it("canAll() false if one missing", () => expect(c.canAll(["course.view", "payment.verify"])).toBe(false));
  it("superadmin sentinel grants everything", () =>
    expect(makePermissionChecker(["*"]).can("anything.at.all")).toBe(true));
});
