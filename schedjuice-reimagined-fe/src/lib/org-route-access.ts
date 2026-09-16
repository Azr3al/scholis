/**
 * Former helper for cross-tenant `/organizations/:id` platform routes.
 * Those pages now live under `/internal/organizations` (see
 * `isInternalPlatformOrgPath`). Kept as a permanent `false` so any leftover
 * callers cannot accidentally treat school self-service paths
 * (`/organizations/profile`, user-activity) as platform management.
 */
export function isPlatformOrgManagementPath(
  pathname: string,
  tenantId: string | number,
): boolean {
  void pathname;
  void tenantId;
  return false;
}
