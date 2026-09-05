import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/api", () => ({ axiosClient: { get: vi.fn() } }));

import { buildVisibleWorkspaces } from "../workspaces";
import { makePermissionChecker } from "@/hooks/usePermissions";
import type { organizationType } from "@/types/organization";
import { accountType, role } from "@/types/user";

const tenant = { id: 1 } as unknown as organizationType;

describe("buildVisibleWorkspaces", () => {
  it("returns [] when Finance, Studio, CRM, and Admissions are all closed", () => {
    expect(
      buildVisibleWorkspaces({
        checker: makePermissionChecker(["course.view"]),
        tenant,
        user: { roles: [role.teacher] } as accountType,
      }),
    ).toEqual([]);
  });

  it("omits Admissions without admissions.view even if Finance is enterable", () => {
    const cards = buildVisibleWorkspaces({
      checker: makePermissionChecker(["payment.view_all"]),
      tenant,
      user: { roles: [role.finance] } as accountType,
    });
    expect(cards.map((c) => c.id)).toEqual(["finance", "hr"]);
  });

  it("includes Studio plus HR coming soon and omits Finance and Admissions", () => {
    const cards = buildVisibleWorkspaces({
      checker: makePermissionChecker(["award_title.manage"]),
      tenant,
      user: { roles: [role.admin] } as accountType,
    });
    expect(cards.map((c) => c.id)).toEqual(["studio", "hr"]);
    expect(cards[0]).toMatchObject({
      status: "enterable",
      homeHref: "/studio",
      label: "Studio",
    });
  });

  it("treats document_template.manage as Studio-enterable", () => {
    const cards = buildVisibleWorkspaces({
      checker: makePermissionChecker(["document_template.manage"]),
      tenant,
      user: { roles: [role.admin] } as accountType,
    });
    expect(cards.map((c) => c.id)).toContain("studio");
    expect(cards.map((c) => c.id)).not.toContain("admissions");
  });

  it("returns Admissions enterable plus HR coming soon for admissions.view only", () => {
    const cards = buildVisibleWorkspaces({
      checker: makePermissionChecker(["admissions.view"]),
      tenant,
      user: { roles: [role.manager] } as accountType,
    });
    expect(cards.map((c) => c.id)).toEqual(["hr", "admissions"]);
    expect(cards.find((c) => c.id === "admissions")).toMatchObject({
      status: "enterable",
      homeHref: "/admissions",
      label: "Admissions",
    });
    expect(cards.find((c) => c.id === "hr")).toMatchObject({
      status: "coming_soon",
    });
  });

  it("returns Finance, Studio, HR, Admissions when all are enterable", () => {
    const cards = buildVisibleWorkspaces({
      checker: makePermissionChecker([
        "payment.view_all",
        "document_template.manage",
        "admissions.view",
      ]),
      tenant,
      user: { roles: [role.admin] } as accountType,
    });
    expect(cards.map((c) => c.id)).toEqual([
      "finance",
      "studio",
      "hr",
      "admissions",
    ]);
    expect(cards.find((c) => c.id === "admissions")?.homeHref).toBe(
      "/admissions",
    );
  });

  it("includes CRM enterable when enabled and user has lead.view", () => {
    const cards = buildVisibleWorkspaces({
      checker: makePermissionChecker(["lead.view"]),
      tenant: { id: 1, is_crm_enabled: true } as organizationType,
      user: { roles: [role.manager] } as accountType,
    });
    expect(cards.map((c) => c.id)).toEqual(["crm", "hr"]);
    expect(cards.find((c) => c.id === "crm")).toMatchObject({
      status: "enterable",
      homeHref: "/crm/leads",
      label: "CRM",
    });
  });

  it("omits CRM when tenant CRM is disabled", () => {
    const cards = buildVisibleWorkspaces({
      checker: makePermissionChecker(["lead.view"]),
      tenant: { id: 1, is_crm_enabled: false } as organizationType,
      user: { roles: [role.manager] } as accountType,
    });
    expect(cards).toEqual([]);
  });

  it("routes CRM home to issues when user only has issue.view", () => {
    const cards = buildVisibleWorkspaces({
      checker: makePermissionChecker(["issue.view"]),
      tenant: { id: 1, is_crm_enabled: true } as organizationType,
      user: { roles: [role.manager] } as accountType,
    });
    expect(cards.find((c) => c.id === "crm")?.homeHref).toBe("/crm/issues");
  });

  it("still marks Finance enterable when Unpaid Students canShow fails", () => {
    const cards = buildVisibleWorkspaces({
      checker: makePermissionChecker(["payment.view_unpaid"]),
      tenant: {
        id: 1,
        transaction_screenshot_strategy: "none",
      } as unknown as organizationType,
      user: { roles: [role.admin] } as accountType,
    });
    expect(cards.find((c) => c.id === "finance")?.status).toBe("enterable");
  });
});
