/**
 * Frontend route -> permission map that drives the default-deny middleware guard.
 *
 * This MIRRORS the backend RBAC audit map but is **UX only** — the backend remains
 * the real security boundary (see the RBAC permission-matrix spec). The middleware
 * uses {@link ruleForPath} to find the most specific (longest-prefix) rule for a
 * pathname and, when that rule declares `anyOf`, redirects users who hold none of
 * those permission codes.
 *
 * Rule shape:
 * - `anyOf`      — the user must hold at least one of these permission codes.
 * - `public`     — no auth required (informational; the middleware `matcher` already
 *                  excludes these paths, so they rarely reach the guard).
 * - `authedOnly` — any authenticated user may access; no specific capability needed.
 *
 * IMPORTANT: unmapped internal routes intentionally have NO rule. Callers MUST treat
 * a `ruleForPath` result of `undefined` as "allow", so we never lock users out of a
 * page that simply hasn't been added to this map yet.
 */
export type RouteRule = {
  prefix: string;
  /** When set, pathname must include `/${suffix}` after the prefix match. */
  suffix?: string;
  anyOf?: string[];
  public?: boolean;
  authedOnly?: boolean;
};

export const ROUTE_RULES: RouteRule[] = [
  // --- Public (auth not required). Mostly excluded by the middleware matcher. ---
  { prefix: "/login", public: true },
  { prefix: "/register", public: true },
  { prefix: "/join-course", public: true },

  // --- Authenticated-only (no specific capability required). ---
  { prefix: "/home", authedOnly: true }, // created in Plan 4
  { prefix: "/profile", authedOnly: true },
  { prefix: "/notifications", authedOnly: true },
  { prefix: "/changelog", authedOnly: true },
  { prefix: "/search", authedOnly: true },
  { prefix: "/help", authedOnly: true },
  { prefix: "/demo-guide", authedOnly: true },
  { prefix: "/shortcuts/staff-data", anyOf: ["user.view_data_sheet"] },
  { prefix: "/shortcuts/student-data", anyOf: ["user.view_data_sheet"] },
  {
    prefix: "/shortcuts/course-insights",
    anyOf: ["course.view_all", "course.manage_all"],
  },
  {
    prefix: "/shortcuts/user-insights",
    anyOf: ["course.view_all", "course.manage_all"],
  },
  { prefix: "/id-card/settings", anyOf: ["org.configure"] },
  { prefix: "/id-card", authedOnly: true },

  // --- Courses / academics ---
  {
    prefix: "/courses",
    suffix: "student-payments",
    anyOf: ["payment.view_all", "payment.record"],
  },
  {
    prefix: "/courses",
    suffix: "attendance/marking",
    anyOf: ["attendance.mark"],
  },
  { prefix: "/courses", anyOf: ["course.view"] },
  { prefix: "/quizzes-v3", anyOf: ["quiz.author", "quiz.view_responses"] },
  { prefix: "/assessments/submission-tracker", anyOf: ["submission.track"] },
  { prefix: "/templates/id-card", anyOf: ["org.configure"] },
  { prefix: "/templates/document", anyOf: ["document_template.manage"] },
  { prefix: "/studio", anyOf: ["document_template.manage", "award_title.manage"] },
  { prefix: "/admissions", anyOf: ["admissions.view"] },

  // --- People ---
  { prefix: "/users", anyOf: ["user.view", "user.view_all"] },
  { prefix: "/crm/leads/settings", anyOf: ["crm.configure"] },
  { prefix: "/crm/leads", anyOf: ["lead.view"] },
  { prefix: "/crm/issues/settings", anyOf: ["issue.configure"] },
  { prefix: "/crm/issues", anyOf: ["issue.view"] },
  { prefix: "/complaints/new", anyOf: ["complaint.create"] },
  { prefix: "/complaints", anyOf: ["complaint.view_own"] },
  { prefix: "/logs/settings", anyOf: ["userlog.configure"] },
  { prefix: "/logs", anyOf: ["userlog.view"] },
  { prefix: "/points/settings", anyOf: ["points.configure"] },
  { prefix: "/points", anyOf: ["points.view"] },
  { prefix: "/attendances/god-view", anyOf: ["attendance.view_all"] },
  { prefix: "/leave-requests", anyOf: ["leave.view_all"] },

  // --- Finance ---
  // Sub-routes use LONGER prefixes than `/finances` so they win for users who hold
  // route-specific permissions (e.g. teachers with payroll.view, students with payment.make).
  { prefix: "/finances/make-payment", anyOf: ["payment.make"] },
  { prefix: "/finances/payment-history", anyOf: ["payment.make", "payment.view"] },
  { prefix: "/finances/payroll", anyOf: ["payroll.view_all", "payroll.view"] },
  { prefix: "/finances/microsoft-payroll", anyOf: ["payroll.view_all"] },
  { prefix: "/finances/rates", anyOf: ["rate.manage"] },
  { prefix: "/finances/checkin-histories", anyOf: ["checkin.view_all"] },
  { prefix: "/finances/user-attendance", anyOf: ["checkin.view_all"] },
  { prefix: "/finances/cash-flow", anyOf: ["analytics.view"] },
  { prefix: "/finances/school-overview", anyOf: ["analytics.view"] },
  { prefix: "/finances/reports", anyOf: ["analytics.view"] },
  { prefix: "/finances/student-payments", anyOf: ["payment.view_all", "payment.record"] },
  { prefix: "/finances/staff-payments/create", anyOf: ["payroll.manage"] },
  { prefix: "/finances/staff-payments", anyOf: ["payment.view_all", "payroll.view_all", "payroll.view"] },
  { prefix: "/finances/recent-transactions", anyOf: ["payment.view_all"] },
  { prefix: "/finances/receiver-transactions", anyOf: ["payment.view_all"] },
  { prefix: "/finances/unpaid-students", anyOf: ["payment.view_unpaid", "payment.view_unpaid_all"] },
  {
    prefix: "/finances",
    anyOf: [
      "payment.view_all",
      "payment.view",
      "payment.record",
      "payment.view_unpaid",
      "payment.view_unpaid_all",
      "analytics.view",
    ],
  },
  { prefix: "/payment-plans", anyOf: ["payment.configure"] },
  { prefix: "/discounts", anyOf: ["payment.configure"] },
  { prefix: "/payment-methods", anyOf: ["payment.configure"] },
  { prefix: "/payment-infos", anyOf: ["payment.configure"] },

  // --- School setup ---
  { prefix: "/programs", anyOf: ["program.view", "program.manage"] },
  { prefix: "/subjects", anyOf: ["subject.view", "subject.manage"] },
  { prefix: "/intakes", anyOf: ["intake.view", "intake.manage"] },
  { prefix: "/course-roles", anyOf: ["course_role.manage"] },
  { prefix: "/award-titles", anyOf: ["award_title.manage"] },
  { prefix: "/visibilities", anyOf: ["visibility.manage"] },
  { prefix: "/form-designer", anyOf: ["form.manage"] },

  // --- Content ---
  { prefix: "/content/announcement-center", anyOf: ["announcement.manage"] },
  { prefix: "/announcements", anyOf: ["announcement.manage"] },
  { prefix: "/news", anyOf: ["news.manage"] },

  // --- Services (teacher self-service before any broader /services rule) ---
  { prefix: "/services/campus-checkin", anyOf: ["attendance.mark"] },

  // --- Administration ---
  { prefix: "/administration/roles", anyOf: ["rbac.view"] }, // page lands in Plan 5
  { prefix: "/storage", anyOf: ["storage.view"] },
  { prefix: "/data-verification-requests", anyOf: ["verification.view"] },

  // --- Platform-internal (superadmin-only capabilities). ---
  // NOTE: `/organizations` keeps its dedicated, tenant-aware handling in
  // `middleware.ts`; this rule exists for completeness/nav and is not the gate
  // that middleware applies to org paths.
  { prefix: "/organizations/profile", anyOf: ["org.configure", "ai.usage.view"] },
  {
    prefix: "/organizations/user-activity/devices",
    anyOf: ["mobile_device.view"],
  },
  { prefix: "/organizations", anyOf: ["org.manage_all"] },
  { prefix: "/platform/docs", anyOf: ["docs.view", "docs.manage"] },
  { prefix: "/platform/usage", anyOf: ["ai.usage.view", "billing.manage"] },
  { prefix: "/internal", anyOf: ["org.manage_all"] },
];

/**
 * Resolve the most specific rule for `pathname` (longest matching prefix wins).
 *
 * Matching is segment-aware: `/finances` matches `/finances` and `/finances/...`
 * but NOT `/financesfoo`. This avoids accidental cross-route matches that could
 * cause spurious redirects, and only ever makes the guard MORE permissive (an
 * unmatched path is allowed through), so it cannot introduce new lockouts.
 *
 * Returns `undefined` when no rule matches — callers MUST treat that as "allow".
 */
function ruleMatchesPath(pathname: string, rule: RouteRule): boolean {
  const prefixMatch =
    pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`);
  if (!prefixMatch) return false;
  if (!rule.suffix) return true;
  const afterPrefix = pathname.slice(rule.prefix.length);
  return (
    afterPrefix.includes(`/${rule.suffix}`) ||
    afterPrefix.endsWith(`/${rule.suffix}`)
  );
}

export function ruleForPath(pathname: string): RouteRule | undefined {
  return ROUTE_RULES.filter((r) => ruleMatchesPath(pathname, r)).sort(
    (a, b) => {
      const aScore = a.prefix.length + (a.suffix?.length ?? 0);
      const bScore = b.prefix.length + (b.suffix?.length ?? 0);
      return bScore - aScore;
    },
  )[0];
}
