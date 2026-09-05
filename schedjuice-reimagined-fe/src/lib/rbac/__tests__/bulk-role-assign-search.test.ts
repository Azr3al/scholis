import { describe, it, expect } from "vitest";
import type { RbacRole } from "@/api/rbac";
import { role } from "@/types/user";
import {
  buildBulkRoleAssignStaffFilter,
  grantableRolesForActor,
} from "../bulk-role-assign-search";

const roles: RbacRole[] = [
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
    slug: "student",
    display_name: "Student",
    is_system: true,
    is_assignable: true,
    codes: [],
  },
  {
    id: 3,
    slug: "course-coordinator",
    display_name: "Coordinator",
    is_system: false,
    is_assignable: true,
    codes: [],
  },
];

describe("grantableRolesForActor", () => {
  it("excludes student from staff search overlap slugs", () => {
    const grantable = grantableRolesForActor({
      roles,
      actorRoles: [role.admin],
      canManageRbac: true,
    });
    expect(grantable.map((r) => r.slug)).not.toContain("student");
    expect(grantable.map((r) => r.slug)).toContain("course-coordinator");
  });
});

describe("buildBulkRoleAssignStaffFilter", () => {
  it("builds roles overlap filter param", () => {
    const grantable = grantableRolesForActor({
      roles,
      actorRoles: [role.admin],
      canManageRbac: false,
    });
    const filter = buildBulkRoleAssignStaffFilter(grantable);
    expect(filter.field_name).toBe("roles");
    expect(filter.operator).toBe("overlap");
    expect(filter.value).toContain("teacher");
    expect(filter.value).not.toContain("student");
  });
});
