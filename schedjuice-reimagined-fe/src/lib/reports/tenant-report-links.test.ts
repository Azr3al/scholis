import { describe, expect, it } from "vitest";
import { organizationType, ReportStyle } from "@/types/organization";
import {
  getReportsNavHref,
  getTenantReportLinks,
} from "./tenant-report-links";

const tenant = (report_style: ReportStyle | null | undefined): organizationType =>
  ({ report_style }) as organizationType;

describe("getTenantReportLinks", () => {
  it("returns Teacher Courses only for TR SU", () => {
    const links = getTenantReportLinks(tenant(ReportStyle.TR_SU_STYLE));
    expect(links).toEqual([
      {
        label: "Teacher Courses",
        href: "/finances/reports/teacher-courses",
      },
    ]);
  });

  it("returns one Excellent Choice report link", () => {
    const links = getTenantReportLinks(tenant(ReportStyle.EXCELLENT_CHOICE_STYLE));
    expect(links).toEqual([
      {
        label: "Excellent Choice Style",
        href: "/finances/reports/excellent-choice",
      },
    ]);
  });

  it("returns empty list when report style is unset", () => {
    expect(getTenantReportLinks(tenant(null))).toEqual([]);
    expect(getTenantReportLinks(null)).toEqual([]);
  });
});

describe("getReportsNavHref", () => {
  it("returns the single report path for Excellent Choice tenants", () => {
    expect(getReportsNavHref(tenant(ReportStyle.EXCELLENT_CHOICE_STYLE))).toBe(
      "/finances/reports/excellent-choice",
    );
  });

  it("returns the Teacher Courses path for TR SU nav", () => {
    expect(getReportsNavHref(tenant(ReportStyle.TR_SU_STYLE))).toBe(
      "/finances/reports/teacher-courses",
    );
  });

  it("returns the hub path when no reports are available", () => {
    expect(getReportsNavHref(tenant(null))).toBe("/finances/reports");
    expect(getReportsNavHref(null)).toBe("/finances/reports");
  });
});
