import { describe, it, expect } from "vitest";
import {
  assignmentLacksLegacyRole,
  filterGrantableRoles,
} from "../role-assigner-utils";
import type { RbacRole } from "@/api/rbac";
import { role } from "@/types/user";

const roles: RbacRole[] = [
  {
    id: 1,
    slug: "admin",
    display_name: "Admin",
    is_system: true,
    is_assignable: true,
    codes: [],
  },
  {
    id: 2,
    slug: "teacher",
    display_name: "Teacher",
    is_system: true,
    is_assignable: true,
    codes: [],
  },
  {
    id: 3,
    slug: "course-coordinator",
    display_name: "Course coordinator",
    is_system: false,
    is_assignable: true,
    codes: [],
  },
];

describe("assignmentLacksLegacyRole", () => {
  const systemSlugs = ["admin", "teacher", "manager", "student"];

  it("returns false when a system slug is selected", () => {
    expect(assignmentLacksLegacyRole(["teacher"], systemSlugs)).toBe(false);
    expect(
      assignmentLacksLegacyRole(["course-coordinator", "student"], systemSlugs),
    ).toBe(false);
  });

  it("returns true for custom-only assignments", () => {
    expect(assignmentLacksLegacyRole(["course-coordinator"], systemSlugs)).toBe(
      true,
    );
    expect(
      assignmentLacksLegacyRole(
        ["course-coordinator", "another-custom"],
        systemSlugs,
      ),
    ).toBe(true);
  });

  it("returns false when nothing is selected", () => {
    expect(assignmentLacksLegacyRole([], systemSlugs)).toBe(false);
  });
});

describe("filterGrantableRoles", () => {
  it("limits system roles to the actor hierarchy", () => {
    const grantable = filterGrantableRoles(roles, [role.manager], null, false);
    expect(grantable.map((item) => item.slug)).toEqual(["teacher"]);
  });

  it("includes custom roles only when canManageRbac is true", () => {
    const grantable = filterGrantableRoles(roles, [role.admin], null, true);
    expect(grantable.map((item) => item.slug)).toEqual([
      "teacher",
      "course-coordinator",
    ]);
  });

  it("hides consultant for admin when consultation booking is off", () => {
    const withConsultant: RbacRole = {
      id: 4,
      slug: "consultant",
      display_name: "Consultant",
      is_system: true,
      is_assignable: true,
      codes: [],
    };
    const grantable = filterGrantableRoles(
      [...roles, withConsultant],
      [role.admin],
      { is_consultation_booking_on: false } as never,
      false,
    );
    expect(grantable.map((item) => item.slug)).not.toContain("consultant");
  });
});
