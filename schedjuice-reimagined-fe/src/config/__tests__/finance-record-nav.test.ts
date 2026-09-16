import { describe, expect, it } from "vitest";
import {
  FINANCE_CONTEXT_PARENT,
  FINANCE_RECORD_NAV_ENTRIES,
  financeRecordNavActive,
  financeRecordSubRouteLabel,
  visibleFinanceRecordEntries,
  visibleFinanceRecordNavSections,
} from "../finance-record-nav";
import {
  ReportStyle,
  TransactionScreenshotStrategy,
} from "@/types/organization";
import type { organizationType } from "@/types/organization";
import { role, type accountType } from "@/types/user";

describe("FINANCE_CONTEXT_PARENT", () => {
  it("stays Overview at /finances for the icon rail", () => {
    expect(FINANCE_CONTEXT_PARENT).toEqual({
      label: "Overview",
      href: "/finances",
    });
  });
});

const adminTenant = {
  transaction_screenshot_strategy: TransactionScreenshotStrategy.admin_upload,
  is_payroll_calculation_enabled: true,
  is_microsoft_on: false,
} as organizationType;

const adminUser = {
  roles: [{ permissions: [{ code: "payment.view_all" }, { code: "analytics.view" }] }],
} as unknown as accountType;

const configureUser = {
  roles: [
    {
      permissions: [
        { code: "payment.view_all" },
        { code: "payment.configure" },
        { code: "payment.record" },
        { code: "analytics.view" },
        { code: "payroll.view_all" },
        { code: "rate.manage" },
        { code: "checkin.view_all" },
      ],
    },
  ],
} as unknown as accountType;

const studentUser = {
  roles: [role.student],
  permissions: ["payment.make", "payment.view"],
} as unknown as accountType;

const canAnyAdmin = (codes: string[]) =>
  codes.some((code) => code === "payment.view_all" || code === "analytics.view");

const canAnyConfigure = (codes: string[]) =>
  codes.some((code) =>
    [
      "payment.view_all",
      "payment.configure",
      "payment.record",
      "analytics.view",
      "payroll.view_all",
      "rate.manage",
      "checkin.view_all",
    ].includes(code),
  );

const canAnyStudent = (codes: string[]) =>
  codes.some((code) => code === "payment.make" || code === "payment.view");

describe("financeRecordNavActive", () => {
  it("highlights overview only on exact /finances", () => {
    const overview = FINANCE_RECORD_NAV_ENTRIES.find((e) => e.id === "overview")!;
    expect(financeRecordNavActive(overview, "/finances")).toBe(true);
    expect(financeRecordNavActive(overview, "/finances/student-payments")).toBe(false);
    expect(financeRecordNavActive(overview, "/discounts")).toBe(false);
  });

  it("highlights student payments on nested upload routes", () => {
    const entry = FINANCE_RECORD_NAV_ENTRIES.find((e) => e.id === "student_payments")!;
    expect(financeRecordNavActive(entry, "/finances/student-payments")).toBe(true);
    expect(financeRecordNavActive(entry, "/finances/student-payments/upload")).toBe(true);
    expect(financeRecordNavActive(entry, "/finances/unpaid-students")).toBe(false);
  });

  it("highlights configuration entries on nested CRUD routes", () => {
    const discounts = FINANCE_RECORD_NAV_ENTRIES.find((e) => e.id === "discounts")!;
    expect(financeRecordNavActive(discounts, "/discounts")).toBe(true);
    expect(financeRecordNavActive(discounts, "/discounts/create")).toBe(true);
    expect(financeRecordNavActive(discounts, "/discounts/abc/edit")).toBe(true);

    const plans = FINANCE_RECORD_NAV_ENTRIES.find((e) => e.id === "payment_plans")!;
    expect(financeRecordNavActive(plans, "/payment-plans/abc/edit")).toBe(true);
  });

  it("highlights scan screenshots on /screenshots/create and nested paths", () => {
    const scan = FINANCE_RECORD_NAV_ENTRIES.find((e) => e.id === "scan_screenshots")!;
    expect(financeRecordNavActive(scan, "/screenshots/create")).toBe(true);
    expect(financeRecordNavActive(scan, "/screenshots/create/extra")).toBe(true);
    expect(financeRecordNavActive(scan, "/finances/unpaid-students")).toBe(false);
  });
});

describe("financeRecordSubRouteLabel", () => {
  it("returns a title-cased tail for nested routes", () => {
    expect(financeRecordSubRouteLabel("/finances/student-payments/upload")).toBe(
      "Upload",
    );
  });
});

describe("visibleFinanceRecordEntries", () => {
  it("hides student-only entries for admin viewers", () => {
    const ids = visibleFinanceRecordEntries(adminUser, adminTenant, canAnyAdmin).map(
      (entry) => entry.id,
    );
    expect(ids).not.toContain("make_payment");
    expect(ids).not.toContain("payment_history");
    expect(ids).toContain("student_payments");
    expect(ids).not.toContain("payment_plans");
    expect(ids).not.toContain("discounts");
  });

  it("shows configuration entries for payment.configure holders", () => {
    const ids = visibleFinanceRecordEntries(configureUser, adminTenant, canAnyConfigure).map(
      (entry) => entry.id,
    );
    expect(ids).toContain("payment_plans");
    expect(ids).toContain("discounts");
    expect(ids).toContain("payment_methods");
    expect(ids).toContain("payment_infos");
  });

  it("shows scan screenshots only for admin_upload strategy", () => {
    const withAdminUpload = visibleFinanceRecordEntries(
      configureUser,
      adminTenant,
      canAnyConfigure,
    ).map((entry) => entry.id);
    expect(withAdminUpload).toContain("scan_screenshots");

    const withoutAdminUpload = visibleFinanceRecordEntries(
      configureUser,
      {
        ...adminTenant,
        transaction_screenshot_strategy: TransactionScreenshotStrategy.user_upload,
      } as organizationType,
      canAnyConfigure,
    ).map((entry) => entry.id);
    expect(withoutAdminUpload).not.toContain("scan_screenshots");
  });

  it("shows student payment entries for student viewers", () => {
    const ids = visibleFinanceRecordEntries(studentUser, adminTenant, canAnyStudent).map(
      (entry) => entry.id,
    );
    expect(ids).toContain("make_payment");
    expect(ids).toContain("payment_history");
    expect(ids).not.toContain("student_payments");
  });
});

describe("visibleFinanceRecordNavSections", () => {
  it("returns configuration group between payments and analytics", () => {
    const { groups } = visibleFinanceRecordNavSections(
      configureUser,
      adminTenant,
      canAnyConfigure,
    );
    expect(groups.map((group) => group.id)).toEqual([
      "payments",
      "configuration",
      "analytics",
      "operations",
    ]);
    expect(groups.find((group) => group.id === "configuration")?.entries.map((e) => e.id)).toEqual([
      "payment_plans",
      "discounts",
      "payment_methods",
    ]);
    expect(groups.find((group) => group.id === "operations")?.entries.map((e) => e.id)).toContain(
      "payment_infos",
    );
    const staffPaymentInfo = groups
      .find((group) => group.id === "operations")
      ?.entries.find((e) => e.id === "payment_infos");
    expect(staffPaymentInfo?.label).toBe("Staff Payment Info");
  });
});

describe("analytics report entries", () => {
  it("shows Teacher Courses under analytics for TR SU, not Finance report", () => {
    const ids = visibleFinanceRecordEntries(
      configureUser,
      { ...adminTenant, report_style: ReportStyle.TR_SU_STYLE } as organizationType,
      canAnyConfigure,
    ).map((e) => e.id);
    expect(ids).toContain("teacher_courses");
    expect(ids).not.toContain("finance_report");
    expect(ids).not.toContain("excellent_choice");
  });
});
