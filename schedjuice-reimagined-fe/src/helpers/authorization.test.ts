import {
  canAccessCourseAttendance,
  canConfigurePaymentInfo,
  canManagePaymentInfoForUser,
  canMarkAttendance,
  canVerifyPayments,
  canViewOwnAttendance,
  canViewPaymentScreenshots,
  resolvePaymentInfoRoutes,
  isProfileScopedPaymentInfoRoutes,
} from "@/helpers/authorization";
import { describe, expect, it } from "vitest";

import { role, type accountType } from "@/types/user";

function userWithPermissions(
  permissions: string[],
  id = 1,
): accountType {
  return { id, roles: [role.teacher], permissions } as accountType;
}

describe("payment info self-service authorization", () => {
  it("allows self manage with payment_info.manage_own", () => {
    const viewer = userWithPermissions(["payment_info.manage_own"], 42);
    expect(canManagePaymentInfoForUser(viewer, 42)).toBe(true);
    expect(canManagePaymentInfoForUser(viewer, 99)).toBe(false);
  });

  it("allows school-wide manage with payment.configure", () => {
    const viewer = userWithPermissions(["payment.configure"], 1);
    expect(canManagePaymentInfoForUser(viewer, 99)).toBe(true);
    expect(canConfigurePaymentInfo(viewer)).toBe(true);
  });

  it("uses profile-scoped routes for own manage without configure", () => {
    const viewer = userWithPermissions(["payment_info.manage_own"], 5);
    expect(isProfileScopedPaymentInfoRoutes(viewer, 5)).toBe(true);
    expect(isProfileScopedPaymentInfoRoutes(viewer, 6)).toBe(false);
  });

  it("does not use profile routes when configure is held", () => {
    const viewer = userWithPermissions(
      ["payment.configure", "payment_info.manage_own"],
      5,
    );
    expect(isProfileScopedPaymentInfoRoutes(viewer, 5)).toBe(false);
  });
});

describe("resolvePaymentInfoRoutes", () => {
  it("returns profile-scoped hrefs for self-service staff", () => {
    const viewer = userWithPermissions(["payment_info.manage_own"], 42);
    const routes = resolvePaymentInfoRoutes(viewer, 42);

    expect(routes.profileScoped).toBe(true);
    expect(routes.adminScoped).toBe(false);
    expect(routes.createHref).toBe("/users/42/payment-infos/create");
    expect(routes.editHref(7)).toBe("/users/42/payment-infos/7/edit");
  });

  it("returns admin hrefs for finance users", () => {
    const viewer = userWithPermissions(["payment.configure"], 1);
    const routes = resolvePaymentInfoRoutes(viewer, 99);

    expect(routes.profileScoped).toBe(false);
    expect(routes.adminScoped).toBe(true);
    expect(routes.createHref).toBe("/payment-infos/create?user_id=99");
    expect(routes.editHref(7)).toBe("/payment-infos/7/edit");
  });

  it("returns no hrefs for unauthorized viewers", () => {
    const viewer = userWithPermissions(["course.view"], 42);
    const routes = resolvePaymentInfoRoutes(viewer, 42);

    expect(routes.profileScoped).toBe(false);
    expect(routes.adminScoped).toBe(false);
    expect(routes.createHref).toBeNull();
    expect(routes.editHref(7)).toBeNull();
  });

  it("returns no hrefs when viewer is undefined", () => {
    const routes = resolvePaymentInfoRoutes(undefined, 42);

    expect(routes.createHref).toBeNull();
    expect(routes.editHref(7)).toBeNull();
  });
});

describe("canViewPaymentScreenshots", () => {
  it("allows payment.view_all", () => {
    expect(
      canViewPaymentScreenshots(userWithPermissions(["payment.view_all"])),
    ).toBe(true);
  });

  it("allows payment.view and payment.record together", () => {
    expect(
      canViewPaymentScreenshots(
        userWithPermissions(["payment.view", "payment.record"]),
      ),
    ).toBe(true);
  });

  it("denies payment.view without payment.record", () => {
    expect(canViewPaymentScreenshots(userWithPermissions(["payment.view"]))).toBe(
      false,
    );
  });

  it("denies payment.record without payment.view", () => {
    expect(
      canViewPaymentScreenshots(userWithPermissions(["payment.record"])),
    ).toBe(false);
  });

  it("denies unrelated permissions", () => {
    expect(canViewPaymentScreenshots(userWithPermissions(["course.view"]))).toBe(
      false,
    );
  });
});

describe("canVerifyPayments", () => {
  it("requires payment.verify", () => {
    expect(canVerifyPayments(userWithPermissions(["payment.verify"]))).toBe(true);
    expect(
      canVerifyPayments(
        userWithPermissions(["payment.view_all", "payment.record"]),
      ),
    ).toBe(false);
  });
});

describe("course attendance access", () => {
  it("allows students with attendance.view_own", () => {
    const student = {
      id: 1,
      roles: [role.student],
      permissions: ["attendance.view_own"],
    } as accountType;

    expect(canViewOwnAttendance(student)).toBe(true);
    expect(canMarkAttendance(student)).toBe(false);
    expect(canAccessCourseAttendance(student)).toBe(true);
  });

  it("allows teachers with attendance.mark", () => {
    const teacher = userWithPermissions(["attendance.mark"]);

    expect(canMarkAttendance(teacher)).toBe(true);
    expect(canViewOwnAttendance(teacher)).toBe(false);
    expect(canAccessCourseAttendance(teacher)).toBe(true);
  });

  it("denies users without attendance permissions", () => {
    const user = userWithPermissions(["course.view"]);

    expect(canMarkAttendance(user)).toBe(false);
    expect(canViewOwnAttendance(user)).toBe(false);
    expect(canAccessCourseAttendance(user)).toBe(false);
  });
});
