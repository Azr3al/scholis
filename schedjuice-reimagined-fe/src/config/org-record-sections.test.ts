import { describe, expect, it } from "vitest";
import { role } from "@/types/user";
import {
  isOrgSectionId,
  resolveOrgSection,
  visibleOrgSections,
  type OrgRecordContext,
} from "./org-record-sections";

const adminViewer = {
  id: 1,
  roles: [role.admin],
  permissions: ["org.configure"],
} as OrgRecordContext["viewer"];

const superadminViewer = {
  id: 1,
  roles: [role.superadmin],
  permissions: ["org.manage_all"],
} as OrgRecordContext["viewer"];

const adminTenant = {
  id: 1,
  is_admin: true,
} as OrgRecordContext["tenant"];

describe("isOrgSectionId", () => {
  it("rejects unknown", () => {
    expect(isOrgSectionId("nope")).toBe(false);
  });
});

describe("visibleOrgSections", () => {
  it("hides platform group on tenant mode", () => {
    const ids = visibleOrgSections({
      mode: "tenant",
      viewer: adminViewer,
      tenant: adminTenant,
    }).map((s) => s.id);
    expect(ids).toContain("overview");
    expect(ids).not.toContain("billing");
    expect(ids).not.toContain("admins");
  });

  it("shows platform group on platform mode for superadmin on admin tenant", () => {
    const ids = visibleOrgSections({
      mode: "platform",
      viewer: superadminViewer,
      tenant: adminTenant,
    }).map((s) => s.id);
    expect(ids).toContain("billing");
    expect(ids).toContain("admins");
  });
});

describe("resolveOrgSection", () => {
  const tenantCtx: OrgRecordContext = {
    mode: "tenant",
    viewer: adminViewer,
    tenant: adminTenant,
  };

  it("returns overview for platform-only section on tenant route", () => {
    expect(resolveOrgSection("billing", tenantCtx)).toBe("overview");
  });

  it("returns overview for unknown section", () => {
    expect(resolveOrgSection("nope", tenantCtx)).toBe("overview");
  });

  it("returns microsoft for visible admin section", () => {
    expect(resolveOrgSection("microsoft", tenantCtx)).toBe("microsoft");
  });
});
