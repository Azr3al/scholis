import { describe, expect, it } from "vitest";
import type { RbacRole } from "@/api/rbac";
import {
  displayNameForSlug,
  filterAssignableCustomRoles,
  mergeProfileRoles,
  partitionRoles,
  resolveCustomRolesForSave,
} from "../profile-role-utils";

const rbacRoles: RbacRole[] = [
  {
    id: 1,
    slug: "teacher",
    display_name: "Teacher",
    is_system: true,
    is_assignable: true,
    codes: [],
  },
  {
    id: 2,
    slug: "department-head",
    display_name: "Department Head",
    is_system: false,
    is_assignable: true,
    codes: [],
  },
];

describe("partitionRoles", () => {
  it("splits system and custom slugs", () => {
    expect(partitionRoles(["teacher", "department-head"], rbacRoles)).toEqual({
      system: ["teacher"],
      custom: ["department-head"],
    });
  });
});

describe("mergeProfileRoles", () => {
  it("combines system and custom without duplicates", () => {
    expect(
      mergeProfileRoles(["teacher"], ["department-head", "teacher"]),
    ).toEqual(["teacher", "department-head"]);
  });
});

describe("resolveCustomRolesForSave", () => {
  it("uses editor selection when actor can manage rbac", () => {
    expect(
      resolveCustomRolesForSave({
        canManageRbac: true,
        selectedCustom: ["department-head"],
        subjectCustom: ["legacy-custom"],
      }),
    ).toEqual(["department-head"]);
  });

  it("preserves subject custom roles when actor cannot manage rbac", () => {
    expect(
      resolveCustomRolesForSave({
        canManageRbac: false,
        selectedCustom: [],
        subjectCustom: ["department-head"],
      }),
    ).toEqual(["department-head"]);
  });
});

describe("filterAssignableCustomRoles", () => {
  it("returns custom roles only for rbac.manage holders", () => {
    expect(
      filterAssignableCustomRoles(rbacRoles, true).map((r) => r.slug),
    ).toEqual(["department-head"]);
    expect(filterAssignableCustomRoles(rbacRoles, false)).toEqual([]);
  });
});

describe("displayNameForSlug", () => {
  it("falls back to slug when role is unknown", () => {
    expect(displayNameForSlug("department-head", rbacRoles)).toBe(
      "Department Head",
    );
    expect(displayNameForSlug("unknown", rbacRoles)).toBe("unknown");
  });
});
