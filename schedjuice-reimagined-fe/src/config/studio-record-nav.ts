export type StudioRecordNavId = "documents" | "award_titles";

export type StudioRecordNavEntry = {
  id: StudioRecordNavId;
  label: string;
  href: string;
  requiredPermissions: string[];
};

export const STUDIO_CONTEXT_PARENT = {
  label: "Documents",
  href: "/studio",
} as const;

export const STUDIO_RECORD_NAV_ENTRIES: StudioRecordNavEntry[] = [
  {
    id: "documents",
    label: "Documents",
    href: "/studio",
    requiredPermissions: ["document_template.manage"],
  },
  {
    id: "award_titles",
    label: "Award titles",
    href: "/award-titles",
    requiredPermissions: ["award_title.manage"],
  },
];

export type StudioNavFlags = {
  canDocuments: boolean;
  canAwards: boolean;
};

export function visibleStudioRecordNavEntries(
  flags: StudioNavFlags,
): StudioRecordNavEntry[] {
  return STUDIO_RECORD_NAV_ENTRIES.filter((entry) =>
    entry.id === "documents" ? flags.canDocuments : flags.canAwards,
  );
}

export function studioRecordNavActive(
  entry: StudioRecordNavEntry,
  pathname: string,
): boolean {
  if (entry.href === "/studio") {
    return pathname === "/studio";
  }
  return pathname === entry.href || pathname.startsWith(`${entry.href}/`);
}
