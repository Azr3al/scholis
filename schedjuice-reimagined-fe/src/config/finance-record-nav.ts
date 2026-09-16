import { isStudent } from "@/helpers/authorization";
import {
  ReportStyle,
  TransactionScreenshotStrategy,
  type organizationType,
} from "@/types/organization";
import type { accountType } from "@/types/user";

export type FinanceRecordNavId =
  | "overview"
  | "student_payments"
  | "make_payment"
  | "payment_history"
  | "staff_payments"
  | "recent_transactions"
  | "receiver_transactions"
  | "unpaid_students"
  | "scan_screenshots"
  | "payment_plans"
  | "discounts"
  | "payment_methods"
  | "payment_infos"
  | "cash_flow"
  | "school_overview"
  | "teacher_courses"
  | "excellent_choice"
  | "payroll"
  | "microsoft_payroll"
  | "rates"
  | "checkin_histories"
  | "user_attendance";

export type FinanceRecordNavGroupId =
  | "payments"
  | "configuration"
  | "analytics"
  | "operations";

export type FinanceRecordNavGroup = {
  id: FinanceRecordNavGroupId;
  label: string;
};

export const FINANCE_RECORD_NAV_GROUPS: FinanceRecordNavGroup[] = [
  { id: "payments", label: "Payments" },
  { id: "configuration", label: "Configuration" },
  { id: "analytics", label: "Analytics" },
  { id: "operations", label: "Operations" },
];

export type FinanceRecordNavEntry = {
  id: FinanceRecordNavId;
  label: string;
  href: string;
  group?: FinanceRecordNavGroupId;
  requiredPermissions?: string[];
  canShow?: (tenant: organizationType, user?: accountType) => boolean;
};

export type FinanceRecordNavSectionGroup = FinanceRecordNavGroup & {
  entries: FinanceRecordNavEntry[];
};

export type FinanceRecordNavSections = {
  overview: FinanceRecordNavEntry | null;
  groups: FinanceRecordNavSectionGroup[];
};

export const FINANCE_CONTEXT_PARENT = {
  label: "Overview",
  href: "/finances",
} as const;

export const FINANCE_RECORD_NAV_ENTRIES: FinanceRecordNavEntry[] = [
  {
    id: "overview",
    label: "Overview",
    href: "/finances",
    requiredPermissions: [
      "payment.view_all",
      "payment.view",
      "payment.record",
      "payment.view_unpaid",
      "payment.view_unpaid_all",
      "analytics.view",
    ],
  },
  {
    id: "student_payments",
    label: "Student Payments",
    href: "/finances/student-payments",
    group: "payments",
    requiredPermissions: ["payment.view_all", "payment.record"],
  },
  {
    id: "make_payment",
    label: "Make Payment",
    href: "/finances/make-payment",
    group: "payments",
    requiredPermissions: ["payment.make", "payment.view"],
    canShow: (_tenant, user) => isStudent(user),
  },
  {
    id: "payment_history",
    label: "My Payments",
    href: "/finances/payment-history",
    group: "payments",
    requiredPermissions: ["payment.make", "payment.view"],
    canShow: (_tenant, user) => isStudent(user),
  },
  {
    id: "staff_payments",
    label: "Staff Payments",
    href: "/finances/staff-payments",
    group: "payments",
    requiredPermissions: ["payment.view_all", "payroll.view_all"],
  },
  {
    id: "recent_transactions",
    label: "Recent Transactions",
    href: "/finances/recent-transactions",
    group: "payments",
    requiredPermissions: ["payment.view_all"],
  },
  {
    id: "receiver_transactions",
    label: "Receiver Transactions",
    href: "/finances/receiver-transactions",
    group: "payments",
    requiredPermissions: ["payment.view_all"],
  },
  {
    id: "unpaid_students",
    label: "Unpaid Students",
    href: "/finances/unpaid-students",
    group: "payments",
    requiredPermissions: ["payment.view_unpaid", "payment.view_unpaid_all"],
    canShow: (tenant) =>
      [
        TransactionScreenshotStrategy.admin_upload,
        TransactionScreenshotStrategy.user_upload,
      ].includes(tenant.transaction_screenshot_strategy ?? ""),
  },
  {
    id: "scan_screenshots",
    label: "Scan Transaction Screenshots",
    href: "/screenshots/create",
    group: "payments",
    requiredPermissions: ["payment.record"],
    canShow: (tenant) =>
      tenant.transaction_screenshot_strategy ===
      TransactionScreenshotStrategy.admin_upload,
  },
  {
    id: "payment_plans",
    label: "Payment Plans",
    href: "/payment-plans",
    group: "configuration",
    requiredPermissions: ["payment.configure"],
  },
  {
    id: "discounts",
    label: "Discounts",
    href: "/discounts",
    group: "configuration",
    requiredPermissions: ["payment.configure"],
  },
  {
    id: "payment_methods",
    label: "Payment Methods",
    href: "/payment-methods",
    group: "configuration",
    requiredPermissions: ["payment.configure"],
  },
  {
    id: "cash_flow",
    label: "Cash Flow",
    href: "/finances/cash-flow",
    group: "analytics",
    requiredPermissions: ["analytics.view"],
    canShow: (tenant) => tenant.is_payroll_calculation_enabled,
  },
  {
    id: "school_overview",
    label: "School Overview",
    href: "/finances/school-overview",
    group: "analytics",
    requiredPermissions: ["analytics.view"],
    canShow: (tenant) => tenant.is_payroll_calculation_enabled,
  },
  {
    id: "teacher_courses",
    label: "Teacher Courses",
    href: "/finances/reports/teacher-courses",
    group: "analytics",
    requiredPermissions: ["analytics.view"],
    canShow: (tenant) => tenant.report_style === ReportStyle.TR_SU_STYLE,
  },
  {
    id: "excellent_choice",
    label: "Excellent Choice Style",
    href: "/finances/reports/excellent-choice",
    group: "analytics",
    requiredPermissions: ["analytics.view"],
    canShow: (tenant) =>
      tenant.report_style === ReportStyle.EXCELLENT_CHOICE_STYLE,
  },
  {
    id: "payroll",
    label: "Payroll",
    href: "/finances/payroll",
    group: "operations",
    requiredPermissions: ["payroll.view_all", "payroll.view"],
    canShow: (tenant) => tenant.is_payroll_calculation_enabled,
  },
  {
    id: "microsoft_payroll",
    label: "Microsoft Payroll Report",
    href: "/finances/microsoft-payroll",
    group: "operations",
    requiredPermissions: ["payroll.view_all"],
    canShow: (tenant) => tenant.is_microsoft_on,
  },
  {
    id: "rates",
    label: "Rates",
    href: "/finances/rates",
    group: "operations",
    requiredPermissions: ["rate.manage"],
  },
  {
    id: "payment_infos",
    label: "Staff Payment Info",
    href: "/payment-infos",
    group: "operations",
    requiredPermissions: ["payment.configure"],
  },
  {
    id: "checkin_histories",
    label: "Checkin Histories",
    href: "/finances/checkin-histories",
    group: "operations",
    requiredPermissions: ["checkin.view_all"],
    canShow: (tenant) => !tenant.is_microsoft_on,
  },
  {
    id: "user_attendance",
    label: "User Attendance",
    href: "/finances/user-attendance",
    group: "operations",
    requiredPermissions: ["checkin.view_all"],
    canShow: (tenant) => tenant.is_microsoft_on,
  },
];

function entryMatchesPermissions(
  entry: FinanceRecordNavEntry,
  canAny: (codes: string[]) => boolean,
): boolean {
  if (!entry.requiredPermissions?.length) {
    return true;
  }
  return canAny(entry.requiredPermissions);
}

export function visibleFinanceRecordEntries(
  user: accountType | undefined,
  tenant: organizationType | null,
  canAny: (codes: string[]) => boolean,
): FinanceRecordNavEntry[] {
  if (!tenant) return [];
  return FINANCE_RECORD_NAV_ENTRIES.filter((entry) => {
    if (!entryMatchesPermissions(entry, canAny)) {
      return false;
    }
    if (entry.canShow && !entry.canShow(tenant, user)) {
      return false;
    }
    return true;
  });
}

export function visibleFinanceRecordNavSections(
  user: accountType | undefined,
  tenant: organizationType | null,
  canAny: (codes: string[]) => boolean,
): FinanceRecordNavSections {
  const entries = visibleFinanceRecordEntries(user, tenant, canAny);
  const overview = entries.find((entry) => entry.id === "overview") ?? null;
  const groups = FINANCE_RECORD_NAV_GROUPS.map((group) => ({
    ...group,
    entries: entries.filter((entry) => entry.group === group.id),
  })).filter((group) => group.entries.length > 0);

  return { overview, groups };
}

export function financeRecordNavActive(
  entry: FinanceRecordNavEntry,
  pathname: string,
): boolean {
  if (entry.href === "/finances") {
    return pathname === "/finances";
  }
  if (entry.id === "scan_screenshots") {
    return pathname === "/screenshots/create" || pathname.startsWith("/screenshots/");
  }
  return pathname === entry.href || pathname.startsWith(`${entry.href}/`);
}

export function activeFinanceRecordEntry(
  pathname: string,
): FinanceRecordNavEntry | null {
  for (const entry of FINANCE_RECORD_NAV_ENTRIES) {
    if (financeRecordNavActive(entry, pathname)) {
      return entry;
    }
  }
  return null;
}

export function financeRecordSubRouteLabel(pathname: string): string | null {
  const active = activeFinanceRecordEntry(pathname);
  if (!active || active.href === "/finances") {
    return null;
  }
  if (pathname === active.href) {
    return null;
  }
  const tail = pathname.slice(active.href.length + 1).split("/")[0];
  if (!tail) {
    return null;
  }
  return tail.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function financeRecordPageTitle(pathname: string): string {
  const active = activeFinanceRecordEntry(pathname);
  if (active) {
    return active.label;
  }
  return "Finance";
}
