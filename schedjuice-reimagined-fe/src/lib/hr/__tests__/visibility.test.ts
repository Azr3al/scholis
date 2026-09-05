import { describe, expect, it } from "vitest";

import { canViewHrSection } from "@/lib/hr/visibility";
import { role, type accountType } from "@/types/user";
import type { organizationType } from "@/types/organization";

function viewer(roles: role[]): accountType {
  return { id: 1, roles } as accountType;
}

const hrEnabledTenant = {
  is_hr_fields_enabled: true,
} as organizationType;

describe("canViewHrSection", () => {
  it("allows admin when HR fields are enabled", () => {
    expect(
      canViewHrSection({ viewer: viewer([role.admin]), tenant: hrEnabledTenant }),
    ).toBe(true);
  });

  it("allows superadmin when HR fields are enabled", () => {
    expect(
      canViewHrSection({
        viewer: viewer([role.superadmin]),
        tenant: hrEnabledTenant,
      }),
    ).toBe(true);
  });

  it("denies manager when HR fields are enabled", () => {
    expect(
      canViewHrSection({ viewer: viewer([role.manager]), tenant: hrEnabledTenant }),
    ).toBe(false);
  });

  it("denies teacher when HR fields are enabled", () => {
    expect(
      canViewHrSection({ viewer: viewer([role.teacher]), tenant: hrEnabledTenant }),
    ).toBe(false);
  });

  it("denies student when HR fields are enabled", () => {
    expect(
      canViewHrSection({ viewer: viewer([role.student]), tenant: hrEnabledTenant }),
    ).toBe(false);
  });

  it("denies admin when HR fields are disabled", () => {
    expect(
      canViewHrSection({
        viewer: viewer([role.admin]),
        tenant: { is_hr_fields_enabled: false } as organizationType,
      }),
    ).toBe(false);
  });
});
