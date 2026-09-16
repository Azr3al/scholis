import { organizationType } from "@/types/organization";
import { role } from "@/types/user";

/** Staff roles that can be combined with each other but not with student. */
export const STAFF_ROLES: role[] = [
  role.superadmin,
  role.admin,
  role.manager,
  role.teacher,
  role.finance,
  role.hr,
  role.consultant,
];

export const formatRoleLabel = (r: role | string): string => {
  if (r === role.hr) return "HR";
  return r.charAt(0).toUpperCase() + r.slice(1);
};

const ROLE_PRIORITY: role[] = [
  role.superadmin,
  role.admin,
  role.manager,
  role.finance,
  role.hr,
  role.consultant,
  role.teacher,
];

export function primaryStaffRoleLabel(roles: string[] | undefined | null): string {
  const set = new Set(roles ?? []);
  for (const r of ROLE_PRIORITY) {
    if (set.has(r)) return formatRoleLabel(r);
  }
  const first = (roles ?? []).find((r) => r !== role.student);
  return first ? formatRoleLabel(first) : "Staff";
}

export const hasStudentRole = (roles: string[] | undefined | null): boolean =>
  (roles ?? []).includes(role.student);

export const hasStaffRole = (
  roles: string[] | undefined | null,
  systemSlugs?: Set<string>,
): boolean =>
  (roles ?? []).some(
    (r) =>
      STAFF_ROLES.includes(r as role) ||
      (r !== role.student && !isKnownSystemSlug(r, systemSlugs)),
  );

export const isKnownSystemSlug = (
  slug: string,
  systemSlugs?: Set<string>,
): boolean =>
  systemSlugs
    ? systemSlugs.has(slug)
    : Object.values(role).includes(slug as role);

export const applyRoleToggle = (
  current: string[],
  toggled: string,
  checked: boolean,
  _systemSlugs?: Set<string>,
): string[] => {
  if (toggled === role.student) {
    if (checked) return [role.student];
    return current.filter((r) => r !== role.student);
  }

  if (checked) {
    const withoutStudent = current.filter((r) => r !== role.student);
    if (withoutStudent.includes(toggled)) return withoutStudent;
    return [...withoutStudent, toggled];
  }

  return current.filter((r) => r !== toggled);
};

/** Student must be the only role when present (matches backend User.is_student()). */
export const isValidStudentRoleCombination = (roles: string[]): boolean => {
  if (!hasStudentRole(roles)) return true;
  return roles.length === 1 && roles[0] === role.student;
};

//** Based on the user's given roles, the returned roles are the roles which the user have the permission to mutate. */
export const getMutableRoleOfUser = (
  userRoles: role[] | undefined | null,
  tenant?: organizationType
) => {
  if (!userRoles?.length) {
    return [];
  }
  if (userRoles.includes(role.superadmin)) {
    return Object.keys(role).map((r) => r as role);
  } else if (userRoles.includes(role.admin)) {
    const adminRoles: role[] = [
      role.manager,
      role.teacher,
      role.student,
      role.finance,
      role.hr,
    ];
    if (tenant?.is_consultation_booking_on) {
      adminRoles.push(role.consultant);
    }
    return adminRoles;
  } else if (userRoles.includes(role.manager)) {
    return [role.teacher, role.student];
  } else if (tenant && tenant.can_teacher_create_course) {
    return [role.student];
  } else {
    return [];
  }
};
