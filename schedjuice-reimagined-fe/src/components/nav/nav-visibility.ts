import type { navLinkType } from "@/config/nav-routes";
import type { organizationType } from "@/types/organization";
import type { accountType } from "@/types/user";

/** The slice of `usePermissions()` the nav visibility rules depend on. */
export type NavPermissionChecker = {
  canAny: (codes: string[]) => boolean;
};

/**
 * Whether a single child nav item should render for the current user.
 *
 * A child is visible when all of the following hold:
 *  - its any-of `requiredPermissions` are satisfied — an empty/absent list means
 *    "visible to any authenticated user";
 *  - its tenant feature-flag gate (`canShow`) passes (a gate without a tenant fails);
 *  - it is not a tenant-scoped `:id` link while the tenant id is missing.
 */
export function isChildVisible(
  child: navLinkType,
  { canAny }: NavPermissionChecker,
  tenant: organizationType | null | undefined,
  user?: accountType,
): boolean {
  const permitted = child.requiredPermissions?.length
    ? canAny(child.requiredPermissions)
    : true;
  if (!permitted) return false;

  const tenantGatePasses = child.canShow
    ? Boolean(tenant && child.canShow(tenant, user))
    : true;
  if (!tenantGatePasses) return false;

  if (child.href?.includes(":id") && !tenant?.id) return false;

  return true;
}

/**
 * The visible children of a section, in declaration order. A section with zero
 * visible children should render nothing (no group header) — this is what kills
 * the empty-section-header bug.
 */
export function visibleChildren(
  section: navLinkType,
  checker: NavPermissionChecker,
  tenant: organizationType | null | undefined,
  user?: accountType,
): navLinkType[] {
  if (section.canShow && !(tenant && section.canShow(tenant, user))) {
    return [];
  }
  return (section.children ?? []).filter((child) =>
    isChildVisible(child, checker, tenant, user),
  );
}
