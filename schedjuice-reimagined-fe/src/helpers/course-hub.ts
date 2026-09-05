import { assignedAsEnum, seniorityEnum } from "@/types/course";

type MinimalUserCourse = {
  assigned_as?: string;
  user?: unknown;
  assigned_as_role?: { seniority?: string | null } | null;
};

const TEACHING_SENIORITIES = new Set<string>([
  seniorityEnum.MAIN_TEACHER,
  seniorityEnum.ASSISTANT_TEACHER,
]);

export function getCreatedByIdFromCourse(
  course: object | null | undefined,
): number | undefined {
  const cb =
    course && "created_by" in course
      ? (course as { created_by?: unknown }).created_by
      : undefined;
  if (typeof cb === "number") {
    return cb;
  }
  if (cb && typeof cb === "object" && "id" in cb) {
    const id = (cb as { id: unknown }).id;
    return typeof id === "number" ? id : undefined;
  }
  return undefined;
}

/**
 * Canonical teacher roster IDs for `canEditCourse` / schedule badges (same rule as former page.tsx).
 */
export function getTeacherMemberIdsFromCourse(course: {
  user_courses?: Array<MinimalUserCourse>;
} | null | undefined): number[] {
  if (!course?.user_courses?.length) {
    return [];
  }
  return course.user_courses
    .filter((uc) => uc.assigned_as === assignedAsEnum.teacher)
    .map((uc) => {
      const u = uc.user;
      if (typeof u === "number") {
        return u;
      }
      if (u && typeof u === "object" && "id" in u) {
        return (u as { id: number }).id;
      }
      return undefined;
    })
    .filter((id): id is number => typeof id === "number");
}

/** True when user is MAIN_TEACHER or ASSISTANT_TEACHER on the course roster. */
export function userHasTeachingAssignmentOnCourse(
  userId: number,
  course: { user_courses?: Array<MinimalUserCourse> } | null | undefined,
): boolean {
  if (!course?.user_courses?.length) {
    return false;
  }
  return course.user_courses.some((uc) => {
    if (uc.assigned_as !== assignedAsEnum.teacher) {
      return false;
    }
    const u = uc.user;
    const uid =
      typeof u === "number"
        ? u
        : u && typeof u === "object" && "id" in u
          ? (u as { id: number }).id
          : undefined;
    if (uid !== userId) {
      return false;
    }
    const seniority = uc.assigned_as_role?.seniority;
    return (
      seniority != null &&
      String(seniority).trim() !== "" &&
      TEACHING_SENIORITIES.has(String(seniority))
    );
  });
}

/** All roster user IDs (teachers + students) — matches former `canEditCourse` second argument. */
export function getCourseMemberIdsFromCourse(
  course: object | null | undefined,
): number[] {
  const rows =
    course && "user_courses" in course
      ? (course as { user_courses?: unknown }).user_courses
      : undefined;
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }
  return (rows as Array<{ user?: unknown }>)
    .map((uc) => {
      const u = uc.user;
      if (typeof u === "number") {
        return u;
      }
      if (u && typeof u === "object" && "id" in u) {
        return (u as { id: number }).id;
      }
      return undefined;
    })
    .filter((id): id is number => typeof id === "number");
}
