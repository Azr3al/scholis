export function isAdmissionsRecordRoute(pathname: string): boolean {
  return pathname === "/admissions" || pathname.startsWith("/admissions/");
}
