export function isInternalPath(pathname: string): boolean {
  return pathname === "/internal" || pathname.startsWith("/internal/");
}

export function isInternalPlatformOrgPath(pathname: string): boolean {
  return (
    pathname === "/internal/organizations" ||
    pathname === "/internal/organizations/create" ||
    /^\/internal\/organizations\/\d+/.test(pathname)
  );
}

/** Internal tools that operate on an explicit school tenant (`?tenantId=`). */
const INTERNAL_TENANT_SCOPED_PREFIXES = [
  "/internal/billing",
  "/internal/ai-usage",
  "/internal/management-commands",
  "/internal/microsoft-bulk-repair",
  "/internal/microsoft-password-reset",
  "/internal/microsoft-health",
  "/internal/acca-spreadsheet-import",
] as const;

export function isInternalTenantScopedPath(pathname: string): boolean {
  return INTERNAL_TENANT_SCOPED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Platform org settings / record under `/internal/organizations/[id]…`. */
export function isInternalOrgRecordPath(pathname: string): boolean {
  return /^\/internal\/organizations\/\d+(?:\/|$)/.test(pathname);
}

export function parseInternalOrgRecordId(pathname: string): string | null {
  const match = pathname.match(/^\/internal\/organizations\/(\d+)(?:\/|$)/);
  return match?.[1] ?? null;
}

/**
 * Target href when switching org on a path-based record.
 * Always lands on `/internal/organizations/{id}` (drops nested suffixes).
 */
export function buildInternalOrgRecordHref(
  orgId: string | number,
  searchParams?: string | URLSearchParams | null,
): string {
  const raw =
    typeof searchParams === "string"
      ? searchParams.replace(/^\?/, "")
      : (searchParams?.toString() ?? "");
  const qs = raw ? `?${raw}` : "";
  return `/internal/organizations/${orgId}${qs}`;
}

export function shouldShowInternalTenantPicker(pathname: string): boolean {
  return (
    isInternalOrgRecordPath(pathname) || isInternalTenantScopedPath(pathname)
  );
}
