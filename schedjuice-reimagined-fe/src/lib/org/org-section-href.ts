import type { OrgRecordMode } from "@/config/org-record-sections";

export type OrgAiPane = "settings" | "usage" | "failures" | "requests";

type OrgSectionHrefExtras = {
  pane?: OrgAiPane;
  date?: string;
  /** Stay on this path instead of the default org record route. */
  basePath?: string;
};

export function orgRecordBasePath(
  mode: OrgRecordMode,
  orgId: string | number,
  basePath?: string,
): string {
  if (basePath) return basePath;
  return mode === "tenant"
    ? "/organizations/profile"
    : `/internal/organizations/${orgId}`;
}

export function orgSectionHref(
  mode: OrgRecordMode,
  orgId: string | number,
  section: string,
  extras?: OrgSectionHrefExtras,
): string {
  const params = new URLSearchParams({ section });
  if (extras?.pane) params.set("pane", extras.pane);
  if (extras?.date) params.set("date", extras.date);
  return `${orgRecordBasePath(mode, orgId, extras?.basePath)}?${params.toString()}`;
}
