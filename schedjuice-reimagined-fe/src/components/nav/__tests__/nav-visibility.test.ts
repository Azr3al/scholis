import { describe, it, expect, vi } from "vitest";

// `nav-visibility` is pure, but it imports `navLinks` from `@/config/nav-routes`,
// and the permission checker comes from `@/hooks/usePermissions`, which transitively
// imports `@/hooks/useUser` → `@/lib/api`. That module throws at load time unless
// NEXT_PUBLIC_BASE_API_URL is set, so stub it to keep this a dependency-free node test.
vi.mock("@/lib/api", () => ({ axiosClient: { get: vi.fn() } }));

import { navLinks } from "@/config/nav-routes";
import { makePermissionChecker } from "@/hooks/usePermissions";
import { isChildVisible, visibleChildren } from "../nav-visibility";
import type { organizationType } from "@/types/organization";
import { accountType, role } from "@/types/user";

// A student-like effective permission set (any-of gating in the nav).
const STUDENT_PERMS = [
  "course.view",
  "payment.make",
  "library.view",
  "chat.participate",
  "grade.view",
  "assignment.submit",
  "quiz.take",
];

const checker = makePermissionChecker(STUDENT_PERMS);
// A real tenant id (so `:id` links aren't auto-hidden) with no special feature flags.
const tenant = { id: 1 } as unknown as organizationType;
// No persona user: the student-only `canShow: isStudent(user)` Finance items are role-gated
// (orthogonal to the permission set), so an absent/non-student user keeps them hidden.
const user = undefined;

const section = (title: string) => {
  const found = navLinks.find((s) => s.title === title);
  if (!found) throw new Error(`nav section "${title}" not found`);
  return found;
};

const titlesVisibleIn = (title: string) =>
  visibleChildren(section(title), checker, tenant, user).map((c) => c.title);

describe("nav visibility (student-like permission set)", () => {
  it("hides every staff-only section (zero visible children)", () => {
    for (const title of [
      "Finance",
      "Operations",
      "Setup",
      "Administration",
      "Platform",
    ]) {
      expect(titlesVisibleIn(title)).toEqual([]);
    }
  });

  it("keeps Courses visible with Academic Hub", () => {
    const visible = titlesVisibleIn("Courses");
    expect(visible.length).toBeGreaterThan(0);
    expect(visible).toContain("Academic Hub");
  });

  it("treats an empty requiredPermissions list as always-visible", () => {
    const alwaysVisible = { title: "Home", icon: section("Home").icon, requiredPermissions: [] };
    expect(isChildVisible(alwaysVisible, checker, tenant, user)).toBe(true);
  });

  it("denies a child whose any-of permissions are all unheld", () => {
    const payrollChild = {
      title: "Payroll",
      icon: section("Operations").icon,
      requiredPermissions: ["payroll.view_all", "payroll.view"],
    };
    expect(isChildVisible(payrollChild, checker, tenant, user)).toBe(false);
  });

  it("hides CRM when is_crm_enabled is false even with lead permissions", () => {
    const crmSection = section("CRM");
    const disabledTenant = {
      id: 1,
      is_crm_enabled: false,
    } as unknown as organizationType;
    const checkerWithLead = makePermissionChecker(["lead.view", "issue.view"]);
    expect(
      visibleChildren(crmSection, checkerWithLead, disabledTenant, user),
    ).toEqual([]);
  });

  it("respects a failing tenant feature-flag gate (canShow)", () => {
    const gated = {
      title: "Gated",
      icon: section("Home").icon,
      requiredPermissions: ["course.view"],
      canShow: () => false,
    };
    expect(isChildVisible(gated, checker, tenant, user)).toBe(false);
  });

  it("hides a tenant-scoped :id link when the tenant id is missing", () => {
    const idLink = {
      title: "Billing",
      icon: section("Home").icon,
      href: "/organizations/:id/billing",
      requiredPermissions: [],
    };
    expect(
      isChildVisible(idLink, checker, undefined, user)
    ).toBe(false);
    expect(isChildVisible(idLink, checker, tenant, user)).toBe(true);
  });

  it("hides Internal tools unless superadmin on an admin tenant", () => {
    const platformSection = section("Platform");
    const internalToolsItem = platformSection.children!.find(
      (c) => c.title === "Internal tools",
    )!;
    const superadminPerms = makePermissionChecker(["org.manage_all"]);
    const superadminUser = {
      roles: [role.superadmin],
    } as accountType;
    const customerTenant = {
      id: 1,
      is_admin: false,
    } as unknown as organizationType;
    const adminTenant = {
      id: 1,
      is_admin: true,
    } as unknown as organizationType;

    expect(
      isChildVisible(
        internalToolsItem,
        superadminPerms,
        customerTenant,
        superadminUser,
      ),
    ).toBe(false);
    expect(
      isChildVisible(
        internalToolsItem,
        superadminPerms,
        adminTenant,
        superadminUser,
      ),
    ).toBe(true);
  });

  it("hides People for student-role users even with user.view", () => {
    const studentUser = {
      roles: [role.student],
    } as accountType;
    const checkerWithUserView = makePermissionChecker(["user.view"]);

    expect(
      visibleChildren(section("People"), checkerWithUserView, tenant, studentUser),
    ).toEqual([]);
  });

  it("hides Student Payments for students with payment.view only", () => {
    const studentUser = {
      roles: [role.student],
    } as accountType;
    const checkerWithPaymentView = makePermissionChecker([
      "payment.view",
      "payment.make",
    ]);

    const financeChildren = visibleChildren(
      section("Finance"),
      checkerWithPaymentView,
      tenant,
      studentUser,
    ).map((c) => c.title);
    expect(financeChildren).not.toContain("Student Payments");
    expect(financeChildren).toContain("Make Payment");
    expect(financeChildren).toContain("My Payments");
  });
});
