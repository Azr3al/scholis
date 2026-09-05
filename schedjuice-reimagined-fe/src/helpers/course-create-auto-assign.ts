import { role } from "@/types/user";

/** Mirrors backend `is_exclusive_teacher` + `auto_assign_creator_as_main_teacher`. */
export function willAutoAssignCreatorAsMainTeacher(args: {
  autoAssignFlag: boolean;
  roles: string[] | undefined | null;
}): boolean {
  if (!args.autoAssignFlag) return false;
  const roles = args.roles ?? [];
  return roles.length === 1 && roles[0] === role.teacher;
}
