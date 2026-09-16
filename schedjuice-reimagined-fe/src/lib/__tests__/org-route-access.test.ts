import { describe, it, expect } from "vitest";
import { isPlatformOrgManagementPath } from "../org-route-access";

describe("isPlatformOrgManagementPath", () => {
  const tenantId = 42;

  it("is always false — platform org pages live under /internal", () => {
    expect(isPlatformOrgManagementPath("/organizations", tenantId)).toBe(false);
    expect(isPlatformOrgManagementPath("/organizations/create", tenantId)).toBe(
      false,
    );
    expect(isPlatformOrgManagementPath("/organizations/99", tenantId)).toBe(
      false,
    );
    expect(
      isPlatformOrgManagementPath("/organizations/99/edit", tenantId),
    ).toBe(false);
    expect(isPlatformOrgManagementPath("/organizations/42", tenantId)).toBe(
      false,
    );
    expect(isPlatformOrgManagementPath("/organizations/profile", tenantId)).toBe(
      false,
    );
    expect(
      isPlatformOrgManagementPath(
        "/organizations/user-activity",
        tenantId,
      ),
    ).toBe(false);
    expect(
      isPlatformOrgManagementPath("/internal/organizations", tenantId),
    ).toBe(false);
  });
});
