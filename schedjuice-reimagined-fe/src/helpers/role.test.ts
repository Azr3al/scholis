import { describe, expect, it } from "vitest";
import {
  applyRoleToggle,
  getMutableRoleOfUser,
  hasStaffRole,
  hasStudentRole,
  isValidStudentRoleCombination,
} from "./role";
import { role } from "@/types/user";
import type { organizationType } from "@/types/organization";

describe("applyRoleToggle", () => {
  it("selecting student clears staff roles", () => {
    expect(
      applyRoleToggle([role.teacher, role.finance], role.student, true)
    ).toEqual([role.student]);
  });

  it("selecting staff removes student", () => {
    expect(applyRoleToggle([role.student], role.teacher, true)).toEqual([
      role.teacher,
    ]);
  });

  it("allows multiple staff roles", () => {
    expect(
      applyRoleToggle([role.teacher], role.finance, true)
    ).toEqual([role.teacher, role.finance]);
  });

  it("unchecking student removes student only", () => {
    expect(applyRoleToggle([role.student], role.student, false)).toEqual([]);
  });
});

describe("role combination helpers", () => {
  it("detects student and staff roles", () => {
    expect(hasStudentRole([role.student])).toBe(true);
    expect(hasStaffRole([role.teacher])).toBe(true);
    expect(hasStaffRole([role.student])).toBe(false);
  });

  it("validates student exclusivity", () => {
    expect(isValidStudentRoleCombination([role.student])).toBe(true);
    expect(
      isValidStudentRoleCombination([role.student, role.teacher])
    ).toBe(false);
    expect(isValidStudentRoleCombination([role.teacher])).toBe(true);
  });

  it("treats custom slugs as staff for exclusivity", () => {
    const systemSlugs = new Set(["teacher", "student"]);
    expect(hasStaffRole(["department-head"], systemSlugs)).toBe(true);
    expect(
      applyRoleToggle(["department-head"], role.student, true, systemSlugs),
    ).toEqual([role.student]);
  });
});

describe("getMutableRoleOfUser", () => {
  const consultationOn = {
    is_consultation_booking_on: true,
  } as organizationType;
  const consultationOff = {
    is_consultation_booking_on: false,
  } as organizationType;

  it("includes consultant for admin when consultation booking is on", () => {
    expect(getMutableRoleOfUser([role.admin], consultationOn)).toContain(
      role.consultant,
    );
  });

  it("omits consultant for admin when consultation booking is off", () => {
    expect(getMutableRoleOfUser([role.admin], consultationOff)).not.toContain(
      role.consultant,
    );
  });
});
