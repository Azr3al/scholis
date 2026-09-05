import { describe, expect, it } from "vitest";
import { isStaffRoles, isStudentRoles, reportTypesForSubject } from "./applies-to";
import type { ReportType } from "@/types/user-log";

const rt = (applies_to: ReportType["applies_to"]): ReportType => ({
  id: Math.random(),
  name: "x",
  description: "",
  color: "#000",
  applies_to,
  is_active: true,
  order: 0,
});

describe("applies-to", () => {
  it("classifies roles", () => {
    expect(isStudentRoles(["student"])).toBe(true);
    expect(isStaffRoles(["student"])).toBe(false);
    expect(isStaffRoles(["teacher"])).toBe(true);
    expect(isStaffRoles(["teacher", "student"])).toBe(true);
  });

  it("filters report types for a student subject", () => {
    const types = [rt("STUDENT"), rt("STAFF"), rt("BOTH")];
    const out = reportTypesForSubject(types, ["student"]);
    expect(out.map((t) => t.applies_to)).toEqual(["STUDENT", "BOTH"]);
  });

  it("filters report types for a staff subject", () => {
    const types = [rt("STUDENT"), rt("STAFF"), rt("BOTH")];
    const out = reportTypesForSubject(types, ["teacher"]);
    expect(out.map((t) => t.applies_to)).toEqual(["STAFF", "BOTH"]);
  });
});
