import type { SessionOption } from "@/helpers/course/session-grouping";
import type { accountType } from "@/types/user";

export type TeacherCandidate = Pick<
  accountType,
  "id" | "name" | "email" | "profile_image"
> & {
  isFree?: boolean;
  busyReason?: "substitution_reserve" | "schedule_conflict" | null;
  alternative_name?: string | null;
};

export type CourseRoleOption = {
  id: number;
  name: string;
  seniority: "MAIN_TEACHER" | "ASSISTANT_TEACHER" | "OTHER";
  isSubstitute: boolean;
  isCollisionEnabled: boolean;
};

export type SessionMode = "weekdays" | "custom";

export type AssignStep = "pick-teacher" | "pick-role" | "pick-sessions";

/** Substitutes always pick sessions; collision-disabled oversight roles do not. */
export function roleNeedsSessionSelection(role: CourseRoleOption): boolean {
  return role.isSubstitute || role.isCollisionEnabled;
}

export type { SessionOption };
