const STUDIO_RECORD_ROUTE_PREFIXES = ["/studio", "/award-titles"] as const;

export function isStudioRecordRoute(pathname: string): boolean {
  if (/^\/award-titles\/\d+\/certificate\/?$/.test(pathname)) {
    return false;
  }
  return STUDIO_RECORD_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
