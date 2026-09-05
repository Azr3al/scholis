import { organizationType, ReportStyle } from "@/types/organization";

export type TenantReportLink = {
  label: string;
  href: string;
};

export const FINANCE_REPORTS_HUB_HREF = "/finances/reports";

const REPORTS_HUB_HREF = FINANCE_REPORTS_HUB_HREF;

export function getTenantReportLinks(
  tenant: organizationType | null | undefined,
): TenantReportLink[] {
  if (!tenant) return [];

  if (tenant.report_style === ReportStyle.TR_SU_STYLE) {
    return [
      {
        label: "Teacher Courses",
        href: `${REPORTS_HUB_HREF}/teacher-courses`,
      },
    ];
  }

  if (tenant.report_style === ReportStyle.EXCELLENT_CHOICE_STYLE) {
    return [
      {
        label: "Excellent Choice Style",
        href: `${REPORTS_HUB_HREF}/excellent-choice`,
      },
    ];
  }

  return [];
}

export function getReportsNavHref(
  tenant: organizationType | null | undefined,
): string {
  const links = getTenantReportLinks(tenant);
  return links.length === 1 ? links[0].href : REPORTS_HUB_HREF;
}
