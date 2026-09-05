import { describe, it, expect } from "vitest";
import {
  EMPTY_COURSE_SCOPE,
  isCourseScoped,
  isScopeComplete,
  scopeIncompleteMessage,
  buildCourseScopeFilterParams,
  scopeKey,
} from "./course-scope";
import type { HubProgram } from "@/hooks/academic-hub/use-programs";

const manualProgram: HubProgram = {
  id: 1,
  name: "Manual Program",
  course_creation_method: "manual",
  subject_strategy: "none",
  is_active: true,
};

const intakeProgram: HubProgram = {
  id: 2,
  name: "Intake Program",
  course_creation_method: "intake_based",
  subject_strategy: "none",
  is_active: true,
};

describe("course-scope helpers", () => {
  it("treats empty scope as unscoped", () => {
    expect(isCourseScoped(EMPTY_COURSE_SCOPE)).toBe(false);
    expect(buildCourseScopeFilterParams(EMPTY_COURSE_SCOPE)).toEqual([]);
  });

  it("emits a program filter when only program is set", () => {
    const scope = { programId: 7, intakeId: null };
    expect(isCourseScoped(scope)).toBe(true);
    const fp = buildCourseScopeFilterParams(scope);
    expect(fp).toEqual([{ field_name: "program", operator: "exact", value: "7" }]);
  });

  it("emits program and intake filters when both set", () => {
    const fp = buildCourseScopeFilterParams({ programId: 7, intakeId: 12 });
    const byField = Object.fromEntries(fp.map((f) => [f.field_name, f.value]));
    expect(byField).toEqual({ program: "7", intake: "12" });
  });

  it("requires program only for manual programs", () => {
    expect(isScopeComplete(EMPTY_COURSE_SCOPE, manualProgram)).toBe(false);
    expect(
      isScopeComplete({ programId: 1, intakeId: null }, manualProgram),
    ).toBe(true);
  });

  it("requires intake for intake-based programs", () => {
    expect(
      isScopeComplete({ programId: 2, intakeId: null }, intakeProgram),
    ).toBe(false);
    expect(
      isScopeComplete({ programId: 2, intakeId: 5 }, intakeProgram),
    ).toBe(true);
  });

  it("returns scope incomplete messages", () => {
    expect(scopeIncompleteMessage(EMPTY_COURSE_SCOPE, null)).toBe(
      "Select a program to continue.",
    );
    expect(
      scopeIncompleteMessage({ programId: 2, intakeId: null }, intakeProgram),
    ).toBe("Select an intake to continue.");
    expect(
      scopeIncompleteMessage({ programId: 1, intakeId: null }, manualProgram),
    ).toBe(null);
  });
});
