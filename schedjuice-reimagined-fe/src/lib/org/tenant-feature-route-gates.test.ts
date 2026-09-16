import { describe, expect, it } from "vitest";

import { tenantFeatureRedirectPath } from "./tenant-feature-route-gates";

describe("tenantFeatureRedirectPath", () => {
  it("redirects /crm when CRM disabled", () => {
    expect(
      tenantFeatureRedirectPath("/crm/leads", {
        is_crm_enabled: false,
        is_library_disabled: false,
      }),
    ).toBe("/home");
  });

  it("allows /crm when CRM enabled", () => {
    expect(
      tenantFeatureRedirectPath("/crm/issues/settings", {
        is_crm_enabled: true,
        is_library_disabled: false,
      }),
    ).toBeNull();
  });

  it("redirects library paths when library disabled", () => {
    expect(
      tenantFeatureRedirectPath("/courses/1/library", {
        is_crm_enabled: true,
        is_library_disabled: true,
      }),
    ).toBe("/home");
  });

  it("redirects /complaints when CRM disabled", () => {
    expect(
      tenantFeatureRedirectPath("/complaints", {
        is_crm_enabled: false,
        is_library_disabled: false,
      }),
    ).toBe("/home");
  });
});
