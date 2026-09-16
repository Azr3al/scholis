import type { HubProgram } from "@/hooks/academic-hub/use-programs";
import { filterParam, operatorEnum } from "@/types/api";

export interface CourseScope {
  programId: number | null;
  intakeId: number | null;
}

export const EMPTY_COURSE_SCOPE: CourseScope = {
  programId: null,
  intakeId: null,
};

export function isCourseScoped(scope: CourseScope): boolean {
  return scope.programId != null || scope.intakeId != null;
}

export function isScopeComplete(
  scope: CourseScope,
  program: HubProgram | null | undefined,
): boolean {
  if (scope.programId == null) return false;
  if (!program) return false;
  if (program.course_creation_method === "intake_based") {
    return scope.intakeId != null;
  }
  return true;
}

export function scopeIncompleteMessage(
  scope: CourseScope,
  program: HubProgram | null | undefined,
): string | null {
  if (scope.programId == null || !program) {
    return "Select a program to continue.";
  }
  if (
    program.course_creation_method === "intake_based" &&
    scope.intakeId == null
  ) {
    return "Select an intake to continue.";
  }
  return null;
}

export function buildCourseScopeFilterParams(scope: CourseScope): filterParam[] {
  const params: filterParam[] = [];
  if (scope.programId != null) {
    params.push({
      field_name: "program",
      operator: operatorEnum.exact,
      value: String(scope.programId),
    });
  }
  if (scope.intakeId != null) {
    params.push({
      field_name: "intake",
      operator: operatorEnum.exact,
      value: String(scope.intakeId),
    });
  }
  return params;
}

export function scopeKey(scope: CourseScope): string {
  return `p${scope.programId ?? ""}:i${scope.intakeId ?? ""}`;
}
