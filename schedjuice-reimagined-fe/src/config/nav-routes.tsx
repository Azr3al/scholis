import {
  visibleChildren,
  type NavPermissionChecker,
} from "@/components/nav/nav-visibility";
import {
  canAccessDemoGuide,
  canAccessPlatformOrganizations,
  isStudent,
} from "@/helpers/authorization";
import { getReportsNavHref } from "@/lib/reports/tenant-report-links";
import {
  organizationType,
  TransactionScreenshotStrategy,
} from "@/types/organization";
import { accountType } from "@/types/user";
import { ViewGrid as LayoutDashboard, ViewGrid as LayoutGrid, Home, GraduationCap as School, Book as BookOpen, BookmarkBook as BookMarked, ClipboardCheck, BookStack as Library, Eye as ScanEye, ClipboardCheck as ClipboardList, Group as Users, PageEdit as NotebookPen, Upload, Activity, PiggyBank, DollarCircle as CircleDollarSign, Bank as Banknote, ClockRotateRight, Dollar as DollarSign, Wallet as WalletCards, CreditCard, ClockRotateRight as HistoryIcon, Page as Receipt, ScanBarcode, GraphUp as LineChart, Wrench, Page as FileSpreadsheet, Percentage as Percent, UserBadgeCheck as UserCheck, UserPlus, KanbanBoard as Kanban, Calendar, Megaphone, Bell, Page as ScrollText, HelpCircle as CircleHelp, StatsUpSquare as BarChart3, Page as FileText, Settings as Settings2, CodeBrackets as Braces, GraduationCap, Label as Tags, Eye, ShieldCheck, Lock as LockIcon, HardDrive, Terminal, MultiplePages as FileStack, Settings, Bug, MapPin, Medal as Award, ChatBubble, ChatLines } from "iconoir-react";
import type { ComponentType, SVGProps } from "react";
import type { ReadonlyURLSearchParams } from "next/navigation";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

export type navLinkType = {
  title: string;
  href?: string;
  description?: string;
  /** Any-of permission codes (empty array = visible to any authenticated user). */
  requiredPermissions?: string[];
  /** When true, require ALL listed permissions instead of any-of. */
  requireAll?: boolean;
  children?: navLinkType[];
  icon: IconComponent;
  canShow?: (tenant: organizationType, user?: accountType) => boolean;
  resolveHref?: (tenant: organizationType) => string | undefined;
  /** When false, nav item is active only on an exact path match (not sub-routes). Default true. */
  activeOnSubpaths?: boolean;
};

export const navLinks: navLinkType[] = [
  {
    title: "Home",
    icon: LayoutDashboard,
    children: [
      {
        title: "Home",
        icon: Home,
        href: "/home",
        requiredPermissions: [],
      },
      {
        title: "Shortcuts",
        icon: LayoutGrid,
        href: "/shortcuts",
        requiredPermissions: [],
      },
      {
        title: "Messages",
        icon: ChatLines,
        href: "/chat",
        requiredPermissions: ["chat.participate"],
      },
      {
        title: "Complaints by Parents",
        icon: ChatBubble,
        href: "/complaints",
        requiredPermissions: ["complaint.view_own"],
        canShow: (tenant, user) =>
          Boolean(user && isStudent(user) && tenant.is_crm_enabled),
      },
      {
        title: "Demo Guide",
        icon: FileStack,
        href: "/demo-guide",
        requiredPermissions: [],
        canShow: (tenant, user) => canAccessDemoGuide(user, tenant),
      },
    ],
  },
  {
    title: "Courses",
    icon: School,
    children: [
      {
        title: "Academic Hub",
        icon: BookOpen,
        href: "/courses",
        requiredPermissions: ["course.view"],
      },
      {
        title: "Campus Check-in",
        icon: MapPin,
        href: "/services/campus-checkin",
        requiredPermissions: ["attendance.mark"],
        canShow: (tenant) => tenant.is_building_checkin_enabled,
      },
      {
        title: "Quizzes",
        icon: ClipboardCheck,
        href: "/quizzes-v3",
        requiredPermissions: ["quiz.author", "quiz.view_responses"],
      },
      {
        title: "Question Bank",
        icon: Library,
        href: "/quizzes-v3/question-bank",
        requiredPermissions: ["questionbank.manage"],
      },
      {
        title: "Submission Tracker",
        icon: ClipboardCheck,
        href: "/assessments/submission-tracker",
        requiredPermissions: ["submission.track"],
      },
      {
        title: "AI Detector",
        icon: ScanEye,
        href: "/ai-detector",
        requiredPermissions: ["quiz.author"],
      },
    ],
  },
  {
    title: "People",
    icon: ClipboardList,
    canShow: (_tenant, user) => Boolean(user && !isStudent(user)),
    children: [
      {
        title: "Users",
        icon: Users,
        href: "/users",
        requiredPermissions: ["user.view", "user.view_all"],
      },
      {
        title: "Students",
        icon: Users,
        href: "/users?tab=students",
        requiredPermissions: ["user.view"],
        canShow: (tenant) => tenant.can_teacher_create_course,
      },
      {
        title: "Student Registration",
        icon: NotebookPen,
        href: "/student-registration",
        requiredPermissions: ["user.create"],
      },
      {
        title: "Imports",
        icon: Upload,
        href: "/imports",
        requiredPermissions: ["user.import"],
      },
      {
        title: "Leave requests",
        icon: Calendar,
        href: "/leave-requests",
        requiredPermissions: ["leave.view_all"],
      },
      {
        title: "Attendance Overview",
        icon: ScanEye,
        href: "/attendances/god-view",
        requiredPermissions: ["attendance.view_all"],
      },
      {
        title: "Login Activity",
        icon: Activity,
        href: "/organizations/user-activity",
        requiredPermissions: ["analytics.view"],
      },
    ],
  },
  {
    title: "CRM",
    icon: Kanban,
    canShow: (tenant) => Boolean(tenant.is_crm_enabled),
    children: [
      {
        title: "Leads",
        icon: UserPlus,
        href: "/crm/leads",
        requiredPermissions: ["lead.view"],
      },
      {
        title: "Issues",
        icon: Bug,
        href: "/crm/issues",
        requiredPermissions: ["issue.view"],
      },
    ],
  },
  {
    title: "User Logs",
    icon: NotebookPen,
    children: [
      {
        title: "Logs",
        icon: NotebookPen,
        href: "/logs",
        requiredPermissions: ["userlog.view"],
      },
      {
        title: "Report Types",
        icon: Settings,
        href: "/logs/settings",
        requiredPermissions: ["userlog.configure"],
      },
    ],
  },
  {
    title: "Staff Points",
    icon: Award,
    canShow: (tenant) => tenant.is_staff_points_enabled,
    children: [
      {
        title: "Points",
        icon: Award,
        href: "/points",
        requiredPermissions: ["points.view"],
      },
      {
        title: "Point types",
        icon: Settings,
        href: "/points/settings",
        requiredPermissions: ["points.configure"],
      },
    ],
  },
  {
    title: "Finance",
    icon: PiggyBank,
    children: [
      {
        title: "Overview",
        icon: LayoutDashboard,
        href: "/finances",
        activeOnSubpaths: false,
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
        title: "Student Payments",
        icon: CircleDollarSign,
        href: "/finances/student-payments",
        requiredPermissions: ["payment.view_all", "payment.record"],
      },
      {
        title: "Make Payment",
        icon: Banknote,
        href: "/finances/make-payment",
        requiredPermissions: ["payment.make", "payment.view"],
        canShow: (tenant, user) => isStudent(user!),
      },
      {
        title: "My Payments",
        icon: ClockRotateRight,
        href: "/finances/payment-history",
        requiredPermissions: ["payment.make", "payment.view"],
        canShow: (tenant, user) => isStudent(user!),
      },
      {
        title: "Payment Plans",
        icon: DollarSign,
        href: "/payment-plans",
        requiredPermissions: ["payment.configure"],
      },
      {
        title: "Discounts",
        icon: Percent,
        href: "/discounts",
        requiredPermissions: ["payment.configure"],
      },
      {
        title: "Payment Methods",
        icon: WalletCards,
        href: "/payment-methods",
        requiredPermissions: ["payment.configure"],
      },
      {
        title: "Staff Payments",
        icon: Banknote,
        href: "/finances/staff-payments",
        requiredPermissions: ["payment.view_all", "payroll.view_all"],
      },
      {
        title: "Recent Transactions",
        icon: HistoryIcon,
        href: "/finances/recent-transactions",
        requiredPermissions: ["payment.view_all"],
      },
      {
        title: "Receiver Transactions",
        icon: Receipt,
        href: "/finances/receiver-transactions",
        requiredPermissions: ["payment.view_all"],
      },
      {
        title: "Unpaid Students",
        icon: ScanBarcode,
        href: "/finances/unpaid-students",
        requiredPermissions: ["payment.view_unpaid", "payment.view_unpaid_all"],
        canShow: (tenant) =>
          [
            TransactionScreenshotStrategy.admin_upload,
            TransactionScreenshotStrategy.user_upload,
          ].includes(tenant?.transaction_screenshot_strategy ?? ""),
      },
      {
        title: "Scan Transaction Screenshots",
        icon: ScanBarcode,
        href: "/screenshots/create",
        requiredPermissions: ["payment.record"],
        canShow: (tenant) =>
          tenant.transaction_screenshot_strategy ===
          TransactionScreenshotStrategy.admin_upload,
      },
      {
        title: "Cash Flow",
        icon: LineChart,
        href: "/finances/cash-flow",
        requiredPermissions: ["analytics.view"],
        canShow: (tenant) => tenant.is_payroll_calculation_enabled,
      },
      {
        title: "School Overview",
        icon: BarChart3,
        href: "/finances/school-overview",
        requiredPermissions: ["analytics.view"],
        canShow: (tenant) => tenant.is_payroll_calculation_enabled,
      },
    ],
  },
  {
    title: "Operations",
    icon: Wrench,
    children: [
      {
        title: "Payroll",
        icon: PiggyBank,
        href: "/finances/payroll",
        requiredPermissions: ["payroll.view_all", "payroll.view"],
        canShow: (tenant) => tenant.is_payroll_calculation_enabled,
      },
      {
        title: "Microsoft Payroll Report",
        icon: FileSpreadsheet,
        href: "/finances/microsoft-payroll",
        requiredPermissions: ["payroll.view_all"],
        canShow: (tenant) => tenant.is_microsoft_on,
      },
      {
        title: "Rates",
        icon: Percent,
        href: "/finances/rates",
        requiredPermissions: ["rate.manage"],
      },
      {
        title: "Staff Payment Info",
        icon: CreditCard,
        href: "/payment-infos",
        requiredPermissions: ["payment.configure"],
      },
      {
        title: "Checkin Histories",
        icon: HistoryIcon,
        href: "/finances/checkin-histories",
        requiredPermissions: ["checkin.view_all"],
        canShow: (tenant) => !tenant.is_microsoft_on,
      },
      {
        title: "User Attendance",
        icon: UserCheck,
        href: "/finances/user-attendance",
        requiredPermissions: ["checkin.view_all"],
        canShow: (tenant) => tenant.is_microsoft_on,
      },
      {
        title: "Campus Check-in's",
        icon: Calendar,
        href: "/services/campus-checkins",
        requiredPermissions: ["checkin.view_all"],
        canShow: (tenant) => tenant.is_building_checkin_enabled,
      },
      {
        title: "Upload Access Log",
        icon: Upload,
        href: "/services/upload-access-log",
        requiredPermissions: ["checkin.view_all"],
        canShow: (tenant) => tenant.is_building_checkin_enabled,
      },
    ],
  },
  {
    title: "Content",
    icon: Megaphone,
    children: [
      {
        title: "Announcement Center",
        icon: Megaphone,
        href: "/content/announcement-center",
        requiredPermissions: ["announcement.manage"],
      },
      {
        title: "Blogs",
        icon: BookOpen,
        href: "/news",
        requiredPermissions: ["news.manage"],
        canShow: (tenant) => tenant.domain_url.includes("teachersucenter.com"),
      },
      {
        title: "Library",
        icon: Library,
        href: "/library",
        requiredPermissions: ["library.view"],
        canShow: (tenant) => !tenant.is_library_disabled,
      },
      {
        title: "Notifications",
        icon: Bell,
        href: "/notifications",
        requiredPermissions: [],
      },
      {
        title: "What's new",
        icon: ScrollText,
        href: "/changelog",
        requiredPermissions: [],
      },
      {
        title: "Help",
        icon: CircleHelp,
        href: "/help",
        requiredPermissions: [],
      },
      {
        title: "Product Docs",
        icon: FileText,
        href: "/platform/docs",
        requiredPermissions: ["docs.manage"],
      },
    ],
  },
  {
    title: "Insights",
    icon: BarChart3,
    children: [
      {
        title: "Reports",
        icon: FileText,
        href: "/finances/reports",
        resolveHref: (tenant) => getReportsNavHref(tenant),
        requiredPermissions: ["analytics.view"],
      },
      {
        title: "Analytics",
        icon: LineChart,
        href: "/shortcuts/analytics",
        requiredPermissions: ["analytics.view"],
      },
    ],
  },
  {
    title: "Setup",
    icon: Settings2,
    children: [
      {
        title: "Programs",
        icon: Braces,
        href: "/programs",
        requiredPermissions: ["program.view", "program.manage"],
      },
      {
        title: "Subjects",
        icon: BookMarked,
        href: "/subjects",
        requiredPermissions: ["subject.view", "subject.manage"],
      },
      {
        title: "Intakes",
        icon: Calendar,
        href: "/intakes",
        requiredPermissions: ["intake.view", "intake.manage"],
      },
      {
        title: "Course Roles",
        icon: GraduationCap,
        href: "/course-roles",
        requiredPermissions: ["course_role.manage"],
      },
      {
        title: "Categories",
        icon: Tags,
        href: "/categories",
        requiredPermissions: ["category.manage"],
      },
      {
        title: "Visibility Settings",
        icon: Eye,
        href: "/visibilities",
        requiredPermissions: ["visibility.manage"],
      },
      {
        title: "Form designer",
        icon: Braces,
        href: "/form-designer",
        requiredPermissions: ["form.manage"],
      },
    ],
  },
  {
    title: "Administration",
    icon: ShieldCheck,
    children: [
      {
        title: "Roles & Permissions",
        icon: LockIcon,
        href: "/administration/roles",
        requiredPermissions: ["rbac.view"],
      },
      {
        title: "Storage",
        icon: HardDrive,
        href: "/storage",
        requiredPermissions: ["storage.view"],
      },
      {
        title: "Data Verification Requests",
        icon: ClipboardCheck,
        href: "/data-verification-requests",
        requiredPermissions: ["verification.view"],
      },
    ],
  },
  {
    title: "Platform",
    icon: Terminal,
    children: [
      {
        title: "Usage",
        icon: BarChart3,
        href: "/platform/usage",
        requiredPermissions: ["ai.usage.view", "billing.manage"],
      },
      {
        title: "Internal tools",
        icon: Terminal,
        href: "/internal/organizations",
        requiredPermissions: ["org.manage_all"],
        canShow: (tenant, user) =>
          Boolean(user && canAccessPlatformOrganizations(user, tenant)),
      },
    ],
  },
];

export function resolveNavHref(
  href: string | undefined,
  tenantId?: string | number | null,
): string {
  if (!href) return "#";
  if (href.includes(":id") && tenantId != null) {
    return href.replace(":id", String(tenantId));
  }
  return href;
}

export function resolveNavItemHref(
  item: navLinkType,
  tenant: organizationType | null | undefined,
): string {
  const href =
    tenant && item.resolveHref ? item.resolveHref(tenant) : item.href;
  return resolveNavHref(href, tenant?.id);
}

function splitNavHref(href: string): {
  path: string;
  query: URLSearchParams | null;
} {
  const [path, queryString] = href.split("?", 2);
  return {
    path,
    query: queryString ? new URLSearchParams(queryString) : null,
  };
}

export function isNavItemActive(
  href: string | undefined,
  pathname: string,
  searchParams: URLSearchParams | ReadonlyURLSearchParams | null,
  tenantId?: string | number | null,
  activeOnSubpaths = true,
): boolean {
  const resolved = resolveNavHref(href, tenantId);
  if (resolved === "#") return false;

  const { path, query } = splitNavHref(resolved);

  if (path === "/users") {
    if (pathname.startsWith("/users/")) {
      return query?.get("tab") !== "students";
    }
    if (pathname !== "/users") {
      return false;
    }
    const tab = searchParams?.get("tab") ?? null;
    if (query?.get("tab") === "students") {
      return tab === "students";
    }
    return tab !== "students";
  }

  const pathMatches =
    pathname === path ||
    (activeOnSubpaths && path !== "/" && pathname.startsWith(`${path}/`));
  if (!pathMatches) {
    return false;
  }

  if (!query) {
    if (pathname === path) return true;
    if (!activeOnSubpaths) return false;
    return path !== "/" && pathname.startsWith(`${path}/`);
  }

  if (pathname !== path) {
    return false;
  }

  for (const [key, value] of Array.from(query.entries())) {
    if (searchParams?.get(key) !== value) {
      return false;
    }
  }
  return true;
}

export function navSectionContainsActivePath(
  section: navLinkType,
  pathname: string,
  tenantId?: string | number | null,
  searchParams?: URLSearchParams | ReadonlyURLSearchParams | null,
): boolean {
  if (!section.children) return false;
  return section.children.some((child) =>
    isNavItemActive(child.href, pathname, searchParams ?? null, tenantId),
  );
}

export function getNavPageTitle(
  pathname: string,
  tenantId?: string | number | null,
): string | null {
  let bestTitle: string | null = null;
  let bestLen = -1;
  const visit = (nodes: navLinkType[]) => {
    for (const n of nodes) {
      if (n.href) {
        const h = resolveNavHref(n.href, tenantId);
        if (h !== "#" && (pathname === h || pathname.startsWith(`${h}/`))) {
          if (bestLen < 0 || h.length > bestLen) {
            bestTitle = n.title;
            bestLen = h.length;
          }
        }
      }
      if (n.children?.length) visit(n.children);
    }
  };
  visit(navLinks);
  return bestTitle;
}

/** Default navigation target for a top-level nav section icon. */
export function resolveSectionNavHref(
  section: navLinkType,
  checker: NavPermissionChecker,
  tenant: organizationType | null | undefined,
  user?: accountType,
): string | null {
  const children = visibleChildren(section, checker, tenant, user);
  const first = children.find((c) => c.href || c.resolveHref);
  if (!first) return null;
  return resolveNavItemHref(first, tenant);
}
