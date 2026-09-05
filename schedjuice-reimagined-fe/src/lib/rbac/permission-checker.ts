export const SUPERADMIN_WILDCARD = "*";

type PermissionCheckerOptions = {
  /** God-mode bypass (superadmin role or wildcard in auth payload). */
  grantAll?: boolean;
};

export function makePermissionChecker(
  permissions: string[] | undefined,
  options?: PermissionCheckerOptions,
) {
  const grantAll = options?.grantAll ?? false;
  const set = new Set(permissions ?? []);
  const has = (code: string) =>
    grantAll || set.has(SUPERADMIN_WILDCARD) || set.has(code);
  return {
    permissions: permissions ?? [],
    can: has,
    canAny: (codes: string[]) => codes.some(has),
    canAll: (codes: string[]) => codes.every(has),
  };
}
