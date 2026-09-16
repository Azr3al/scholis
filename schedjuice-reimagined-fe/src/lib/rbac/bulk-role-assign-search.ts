import { filterGrantableRoles } from "@/components/rbac/role-assigner-utils";
import { listToApiArray } from "@/helpers/filter-params";
import type { RbacRole } from "@/api/rbac";
import type { filterParam } from "@/types/api";
import { operatorEnum } from "@/types/api";
import type { organizationType } from "@/types/organization";
import { role, type role as RoleSlug } from "@/types/user";

export function grantableRolesForActor(args: {
  roles: RbacRole[];
  actorRoles: RoleSlug[];
  tenant?: organizationType | null;
  canManageRbac: boolean;
}): RbacRole[] {
  return filterGrantableRoles(
    args.roles,
    args.actorRoles,
    args.tenant ?? null,
    args.canManageRbac,
  ).filter((item) => item.slug !== role.student);
}

export function buildBulkRoleAssignStaffFilter(
  grantableRoles: RbacRole[],
): filterParam {
  return {
    field_name: "roles",
    operator: operatorEnum.overlap,
    value: listToApiArray(grantableRoles.map((item) => item.slug)),
  };
}
