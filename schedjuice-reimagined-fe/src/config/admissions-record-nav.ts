export const ADMISSIONS_CONTEXT_PARENT = {
  label: "People",
  href: "/admissions",
} as const;

export const ADMISSIONS_RECORD_NAV_ENTRIES = [
  { id: "people" as const, label: "People", href: "/admissions" },
  { id: "courses" as const, label: "Courses", href: "/admissions/courses" },
];

export function admissionsRecordNavActive(
  entry: (typeof ADMISSIONS_RECORD_NAV_ENTRIES)[number],
  pathname: string,
): boolean {
  if (entry.href === "/admissions") return pathname === "/admissions";
  return pathname === entry.href || pathname.startsWith(`${entry.href}/`);
}
