import type {
  CoverageMode,
  RouteFamily,
  RiskTier,
  VerificationVariantId,
} from "./route-manifest-schema";

type VerificationVariantPlan = {
  id: VerificationVariantId;
  implementationPlan: string;
  implementationOwner: string;
  qaOwner: string;
};

const FAMILY_IMPLEMENTATION_MAP: Record<
  RouteFamily,
  { owner: string; plan: string; qaOwner: string }
> = {
  "global-shell-auth-public": {
    owner: "R6",
    plan: "2026-07-12-ui-remediation-r6-global-auth-public.md",
    qaOwner: "R15-QA1",
  },
  "home-dashboard-analytics": {
    owner: "R7",
    plan: "2026-07-12-ui-remediation-r7-home-dashboards-reporting.md",
    qaOwner: "R15-QA2",
  },
  "administration-crud": {
    owner: "R8",
    plan: "2026-07-12-ui-remediation-r8-administration-crud.md",
    qaOwner: "R15-QA3",
  },
  "courses-attendance-scheduling": {
    owner: "R9",
    plan: "2026-07-12-ui-remediation-r9-courses-attendance-scheduling.md",
    qaOwner: "R15-QA4",
  },
  "quizzes-docs-content-services": {
    owner: "R10",
    plan: "2026-07-12-ui-remediation-r10-content-quizzes-services.md",
    qaOwner: "R15-QA5",
  },
  "finance-operations": {
    owner: "R11",
    plan: "2026-07-12-ui-remediation-r11-finance-operations.md",
    qaOwner: "R15-QA6",
  },
  "student-payments": {
    owner: "R12",
    plan: "2026-07-12-ui-remediation-r12-student-payments-resource-table.md",
    qaOwner: "R15-QA7",
  },
  "payment-upload-verification": {
    owner: "R14",
    plan: "2026-07-12-ui-remediation-r14-payment-upload-verification.md",
    qaOwner: "R15-QA10",
  },
};

export function toRoutePattern(pagePath: string): string {
  const normalized = pagePath
    .replace(/^src\/app\//, "")
    .replace(/(^|\/)page\.tsx$/, "")
    .replace(/^\([^)]+\)\//g, "")
    .replace(/\([^)]+\)\//g, "");
  const segments = normalized.split("/").filter(Boolean);
  const patternSegments = segments.map((seg) =>
    seg.startsWith("[") && seg.endsWith("]") ? `:${seg.slice(1, -1)}` : seg,
  );
  return patternSegments.length === 0 ? "/" : "/" + patternSegments.join("/");
}

export function classifyRouteFamily(pagePath: string): RouteFamily {
  const pattern = toRoutePattern(pagePath);

  if (
    pagePath.includes("/(public)/") ||
    pagePath === "src/app/page.tsx" ||
    pattern === "/search" ||
    pattern === "/notifications" ||
    pattern.startsWith("/login") ||
    pattern.startsWith("/register") ||
    pattern.startsWith("/forgot-password") ||
    pattern.startsWith("/reset-password")
  ) {
    return "global-shell-auth-public";
  }

  if (
    pattern.startsWith("/management/") ||
    pattern.startsWith("/shortcuts/") ||
    pattern === "/home" ||
    pattern.includes("analytics") ||
    pattern.includes("dashboard")
  ) {
    return "home-dashboard-analytics";
  }

  if (
    pattern.startsWith("/finances/student-payments/upload") ||
    pattern.startsWith("/finances/student-payments/verification-upload") ||
    pattern.startsWith("/finances/student-payments/coverage-review")
  ) {
    return "payment-upload-verification";
  }

  if (
    pattern === "/finances/student-payments" ||
    pattern === "/finances/student-payments/transaction-lookup" ||
    pattern === "/courses/:id/student-payments"
  ) {
    return "student-payments";
  }

  if (pattern.startsWith("/finances/")) {
    return "finance-operations";
  }

  if (
    pattern.startsWith("/courses/") ||
    pattern.startsWith("/attendance/") ||
    pattern.includes("/marking") ||
    pattern.startsWith("/calendar")
  ) {
    return "courses-attendance-scheduling";
  }

  if (
    pattern.startsWith("/quizzes") ||
    pattern.startsWith("/take/") ||
    pattern.startsWith("/library") ||
    pattern.startsWith("/news") ||
    pattern.startsWith("/announcements") ||
    pattern.startsWith("/services/") ||
    pattern.startsWith("/forms") ||
    pattern.startsWith("/help") ||
    pattern.startsWith("/platform/docs")
  ) {
    return "quizzes-docs-content-services";
  }

  return "administration-crud";
}

export function classifyRiskTier(
  routeFamily: RouteFamily,
  routePattern: string,
): RiskTier {
  if (
    routeFamily === "payment-upload-verification" ||
    routeFamily === "student-payments" ||
    routeFamily === "finance-operations" ||
    routeFamily === "global-shell-auth-public"
  ) {
    return "high";
  }

  if (
    routeFamily === "courses-attendance-scheduling" ||
    routePattern.includes("/edit") ||
    routePattern.includes("/create")
  ) {
    return "medium";
  }

  return "low";
}

export function classifyCoverageMode(
  route: { routePattern: string; routeFamily: RouteFamily },
  allRoutes: Array<{ routePattern: string; routeFamily: RouteFamily }>,
  automatedSmokePatterns: Set<string>,
): CoverageMode {
  if (automatedSmokePatterns.has(route.routePattern)) {
    return "automated";
  }

  if (classifyRiskTier(route.routeFamily, route.routePattern) === "high") {
    return "automated";
  }

  const familyRoutes = allRoutes
    .filter((r) => r.routeFamily === route.routeFamily)
    .map((r) => r.routePattern)
    .sort();
  if (familyRoutes[0] === route.routePattern) {
    return "representative";
  }

  return "manual";
}

function getImplementationMeta(family: RouteFamily) {
  return FAMILY_IMPLEMENTATION_MAP[family];
}

const RESOURCE_TABLE_VARIANT: VerificationVariantPlan = {
  id: "resource-table",
  implementationPlan:
    "2026-07-12-ui-remediation-r12-student-payments-resource-table.md",
  implementationOwner: "R12",
  qaOwner: "R15-QA8",
};

const GLIDE_VARIANT: VerificationVariantPlan = {
  id: "glide",
  implementationPlan: "2026-07-12-ui-remediation-r13-student-payments-glide.md",
  implementationOwner: "R13",
  qaOwner: "R15-QA9",
};

export function classifyVerificationVariants(
  routePattern: string,
  classifiedFamily?: RouteFamily,
): VerificationVariantPlan[] {
  const studentPaymentRoutes = new Set([
    "/finances/student-payments",
    "/finances/student-payments/transaction-lookup",
    "/courses/:id/student-payments",
  ]);

  if (studentPaymentRoutes.has(routePattern)) {
    return [
      {
        id: "shared-shell",
        implementationPlan:
          "2026-07-12-ui-remediation-r12-student-payments-resource-table.md",
        implementationOwner: "R12",
        qaOwner: "R15-QA7",
      },
      RESOURCE_TABLE_VARIANT,
      GLIDE_VARIANT,
    ];
  }

  if (routePattern === "/finances/recent-transactions") {
    return [
      {
        id: "default",
        implementationPlan:
          "2026-07-12-ui-remediation-r11-finance-operations.md",
        implementationOwner: "R11",
        qaOwner: "R15-QA6",
      },
      GLIDE_VARIANT,
    ];
  }

  const family = classifiedFamily ?? classifyRouteFamily(routePattern);
  const meta = getImplementationMeta(family);
  return [
    {
      id: "default",
      implementationPlan: meta.plan,
      implementationOwner: meta.owner,
      qaOwner: meta.qaOwner,
    },
  ];
}

export function slugifyRoutePattern(routePattern: string): string {
  return routePattern.replace(/^\//, "").replace(/[:/]/g, "-") || "root";
}
