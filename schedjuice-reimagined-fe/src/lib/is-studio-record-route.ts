const STUDIO_RECORD_ROUTE_PREFIXES = ["/studio", "/award-titles"] as const;

export function isStudioRecordRoute(pathname: string): boolean {
  return STUDIO_RECORD_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
