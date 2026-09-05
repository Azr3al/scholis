import type { RbacRole } from "@/api/rbac";

export function systemSlugsFromRoles(roles: RbacRole[]): Set<string> {
  return new Set(roles.filter((r) => r.is_system).map((r) => r.slug));
}

export function partitionRoles(
  slugs: string[],
  roles: RbacRole[],
): { system: string[]; custom: string[] } {
  const systemSet = systemSlugsFromRoles(roles);
  const system: string[] = [];
  const custom: string[] = [];
  for (const slug of slugs) {
    if (systemSet.has(slug)) system.push(slug);
    else custom.push(slug);
  }
  return { system, custom };
}

export function mergeProfileRoles(system: string[], custom: string[]): string[] {
  return Array.from(new Set([...system, ...custom]));
}

export function filterAssignableCustomRoles(
  roles: RbacRole[],
  canManageRbac: boolean,
): RbacRole[] {
  if (!canManageRbac) return [];
  return roles.filter((r) => !r.is_system && r.is_assignable);
}

export function resolveCustomRolesForSave(args: {
  canManageRbac: boolean;
  selectedCustom: string[];
  subjectCustom: string[];
}): string[] {
  if (args.canManageRbac) return args.selectedCustom;
  return args.subjectCustom;
}

export function displayNameForSlug(slug: string, roles: RbacRole[]): string {
  return roles.find((r) => r.slug === slug)?.display_name ?? slug;
}
