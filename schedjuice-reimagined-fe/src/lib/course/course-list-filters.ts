import {
  hasAdminCredentials,
  hasSchoolWideCourseAccess,
} from "@/helpers/authorization";
import { filterParam, operatorEnum } from "@/types/api";
import { courseStatus } from "@/types/course";
import type { accountType } from "@/types/user";

/** School-wide list (mobile Class tab parity): RBAC breadth or admin/manager/superadmin role. */
export function seesAllOrgCourses(user: accountType): boolean {
  return hasSchoolWideCourseAccess(user) || hasAdminCredentials(user);
}

/** Chat list: membership scope + planned/active effective status (mobile chat parity). */
export function buildChatCourseListFilterParams(
  user: accountType,
): filterParam[] {
  const params: filterParam[] = [];

  if (!seesAllOrgCourses(user)) {
    params.push({
      field_name: "user_courses__user_id|created_by",
      operator: operatorEnum.exact,
      value: String(user.id),
    });
  }

  params.push({
    field_name: "status",
    operator: operatorEnum.in,
    value: [courseStatus.planned, courseStatus.active].join(","),
  });

  return params;
}
