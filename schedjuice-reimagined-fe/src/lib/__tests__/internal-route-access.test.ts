import { describe, expect, it } from "vitest";
import {
  buildInternalOrgRecordHref,
  isInternalOrgRecordPath,
  isInternalPath,
  isInternalPlatformOrgPath,
  isInternalTenantScopedPath,
  parseInternalOrgRecordId,
  shouldShowInternalTenantPicker,
} from "../internal-route-access";

describe("isInternalPath", () => {
  it("matches /internal and children", () => {
    expect(isInternalPath("/internal")).toBe(true);
    expect(isInternalPath("/internal/organizations")).toBe(true);
    expect(isInternalPath("/internal/microsoft-health")).toBe(true);
  });

  it("does not match school routes", () => {
    expect(isInternalPath("/organizations")).toBe(false);
    expect(isInternalPath("/organizations/profile")).toBe(false);
    expect(isInternalPath("/debug")).toBe(false);
    expect(isInternalPath("/home")).toBe(false);
  });
});

describe("isInternalPlatformOrgPath", () => {
  it("matches internal org management routes", () => {
    expect(isInternalPlatformOrgPath("/internal/organizations")).toBe(true);
    expect(isInternalPlatformOrgPath("/internal/organizations/create")).toBe(
      true,
    );
    expect(isInternalPlatformOrgPath("/internal/organizations/12")).toBe(true);
  });

  it("excludes non-org internal tools", () => {
    expect(isInternalPlatformOrgPath("/internal/cron-jobs")).toBe(false);
  });
});

describe("isInternalTenantScopedPath", () => {
  it("matches query-tenant tools and excludes org list/record and removed org-settings", () => {
    expect(isInternalTenantScopedPath("/internal/billing")).toBe(true);
    expect(isInternalTenantScopedPath("/internal/ai-usage")).toBe(true);
    expect(isInternalTenantScopedPath("/internal/org-settings")).toBe(false);
    expect(isInternalTenantScopedPath("/internal/organizations")).toBe(false);
    expect(isInternalTenantScopedPath("/internal/organizations/12")).toBe(
      false,
    );
    expect(isInternalTenantScopedPath("/internal/demo-artifacts")).toBe(false);
  });
});

describe("isInternalOrgRecordPath", () => {
  it("matches numeric org id and nested paths only", () => {
    expect(isInternalOrgRecordPath("/internal/organizations/12")).toBe(true);
    expect(
      isInternalOrgRecordPath("/internal/organizations/12/admins/create"),
    ).toBe(true);
    expect(isInternalOrgRecordPath("/internal/organizations")).toBe(false);
    expect(isInternalOrgRecordPath("/internal/organizations/create")).toBe(
      false,
    );
  });
});

describe("parseInternalOrgRecordId", () => {
  it("returns the id segment or null", () => {
    expect(parseInternalOrgRecordId("/internal/organizations/9")).toBe("9");
    expect(
      parseInternalOrgRecordId("/internal/organizations/9/admins/create"),
    ).toBe("9");
    expect(parseInternalOrgRecordId("/internal/organizations")).toBeNull();
    expect(parseInternalOrgRecordId("/internal/organizations/create")).toBeNull();
  });
});

describe("buildInternalOrgRecordHref", () => {
  it("rewrites to base record path and preserves search", () => {
    expect(buildInternalOrgRecordHref(12, "section=video&pane=usage")).toBe(
      "/internal/organizations/12?section=video&pane=usage",
    );
    expect(buildInternalOrgRecordHref("12", "?section=ai")).toBe(
      "/internal/organizations/12?section=ai",
    );
    expect(buildInternalOrgRecordHref(12, new URLSearchParams("x=1"))).toBe(
      "/internal/organizations/12?x=1",
    );
    expect(buildInternalOrgRecordHref(12, "")).toBe(
      "/internal/organizations/12",
    );
    expect(buildInternalOrgRecordHref(12, null)).toBe(
      "/internal/organizations/12",
    );
  });
});

describe("shouldShowInternalTenantPicker", () => {
  it("shows on org record or query-scoped tools; hides on list/create", () => {
    expect(shouldShowInternalTenantPicker("/internal/organizations/9")).toBe(
      true,
    );
    expect(
      shouldShowInternalTenantPicker("/internal/organizations/9/admins"),
    ).toBe(true);
    expect(shouldShowInternalTenantPicker("/internal/billing")).toBe(true);
    expect(shouldShowInternalTenantPicker("/internal/organizations")).toBe(
      false,
    );
    expect(
      shouldShowInternalTenantPicker("/internal/organizations/create"),
    ).toBe(false);
    expect(shouldShowInternalTenantPicker("/internal")).toBe(false);
  });
});
