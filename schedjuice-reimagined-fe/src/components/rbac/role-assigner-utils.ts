import { getMutableRoleOfUser } from "@/helpers/role";
import type { RbacRole } from "@/api/rbac";
import type { organizationType } from "@/types/organization";
import { role } from "@/types/user";

/** True when selected roles include no system (legacy) slug — mobile app needs a base role. */
export function assignmentLacksLegacyRole(
  selectedSlugs: string[],
  systemSlugs: string[],
): boolean {
  if (selectedSlugs.length === 0) return false;
  const systemSet = new Set(systemSlugs);
  return !selectedSlugs.some((slug) => systemSet.has(slug));
}

export function filterGrantableRoles(
  roles: RbacRole[],
  actorLegacyRoles: role[],
  tenant?: organizationType | null,
  canManageRbac = false,
): RbacRole[] {
  const mutable = new Set(getMutableRoleOfUser(actorLegacyRoles, tenant ?? undefined));
  return roles.filter((item) => {
    if (item.is_system) return mutable.has(item.slug as role);
    return canManageRbac && item.is_assignable;
  });
}
