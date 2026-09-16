import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { accountType } from "./types/user";
import {
  canAccessDemoGuide,
  canAccessPlatformOrganizations,
  isAdmin,
  isStudent,
  isSuperAdmin,
} from "./helpers/authorization";
import { isInternalPath } from "@/lib/internal-route-access";
import { organizationType } from "./types/organization";
import { showGlobalAlert } from "./helpers/global-alert";
import { ruleForPath } from "./config/route-permissions";
import { getAccountFromRequest } from "./lib/account-cookie";
import { getTenantFromRequest } from "./lib/tenant-cookie";
import { tenantFeatureRedirectPath } from "@/lib/org/tenant-feature-route-gates";

export function middleware(request: NextRequest) {
  const isLoggedIn =
    request.cookies.get("access") ||
    (request.cookies.get("refresh") && request.cookies.get("session_id"));
  const tenant: organizationType = getTenantFromRequest(request);

  if (isLoggedIn) {
    const account: accountType = getAccountFromRequest(request);
    showGlobalAlert(account, tenant);
    // Superadmin-only in-house component library (design foundation).
    if (request.nextUrl.pathname.startsWith("/components")) {
      if (!isSuperAdmin(account)) {
        return NextResponse.redirect(new URL("/home", request.url));
      }
      return NextResponse.next();
    }
    if (request.nextUrl.pathname === "/profile" && account?.id) {
      return NextResponse.redirect(
        new URL(`/users/${account.id}`, request.url),
      );
    }
    if (
      tenant.is_homepage_disabled &&
      request.nextUrl.pathname === "/" &&
      account?.id
    ) {
      return NextResponse.redirect(
        new URL(`/users/${account.id}`, request.url),
      );
    }
    const featureRedirect = tenantFeatureRedirectPath(
      request.nextUrl.pathname,
      {
        is_library_disabled: Boolean(tenant.is_library_disabled),
        is_crm_enabled: Boolean(tenant.is_crm_enabled),
      },
    );
    if (featureRedirect) {
      return NextResponse.redirect(new URL(featureRedirect, request.url));
    }
    if (request.nextUrl.pathname.startsWith("/complaints")) {
      if (!isStudent(account) || !tenant.is_crm_enabled) {
        return NextResponse.redirect(new URL("/home", request.url));
      }
    }
    if (isStudent(account)) {
      if (request.nextUrl.pathname.startsWith("/shortcuts")) {
        return NextResponse.redirect(new URL("/home", request.url));
      }
      const bannedRouteSegments: string[] = ["dashboard", "edit", "create"];
      const bannedRoutes: string[] = ["/users"];
      if (
        bannedRouteSegments.some((segment) =>
          request.nextUrl.pathname.includes(segment)
        )
      ) {
        return NextResponse.redirect(new URL("/home", request.url));
      }
      if (bannedRoutes.some((route) => request.nextUrl.pathname === route)) {
        return NextResponse.redirect(new URL("/home", request.url));
      }
    }

    if (isInternalPath(request.nextUrl.pathname)) {
      if (!canAccessPlatformOrganizations(account, tenant)) {
        return NextResponse.redirect(new URL("/home", request.url));
      }
      return NextResponse.next();
    }

    if (request.nextUrl.pathname.includes("organizations") && tenant.id) {
      const billingMatch = request.nextUrl.pathname.match(
        /^\/organizations\/(\d+)\/billing/,
      );
      if (billingMatch) {
        const orgId = billingMatch[1];
        if (String(tenant.id) !== orgId) {
          return NextResponse.redirect(new URL("/home", request.url));
        }
      }

      const isOwnOrgOrProfile =
        request.nextUrl.pathname.startsWith(`/organizations/${tenant.id}`) ||
        request.nextUrl.pathname.startsWith("/organizations/profile");
      if (isSuperAdmin(account) || isAdmin(account)) {
        return NextResponse.next();
      }
      if (!tenant.is_admin && isOwnOrgOrProfile) {
        return NextResponse.next();
      }
      if (!tenant.is_admin && !isOwnOrgOrProfile) {
        return NextResponse.redirect(new URL("/home", request.url));
      }
      return NextResponse.next();
    }

    if (request.nextUrl.pathname.startsWith("/demo-guide")) {
      if (!canAccessDemoGuide(account, tenant)) {
        return NextResponse.redirect(new URL("/home", request.url));
      }
      return NextResponse.next();
    }

    // --- Default-deny permission guard (UX only; the backend is the real boundary). ---
    // We ONLY redirect on an EXPLICIT rule whose `anyOf` the user fails:
    //   - unmapped internal routes (ruleForPath -> undefined) are allowed through, so
    //     we never lock users out of pages not yet added to the route map;
    //   - an empty/missing `permissions` array means RBAC isn't populated for this
    //     session yet (e.g. mid-rollout) -> skip rather than lock everyone out;
    //   - superadmins (and the "*" sentinel, if the backend ever sends it) bypass.
    // `/organizations` keeps its dedicated tenant-aware handling above (it returns
    // before reaching here when a tenant is set), so it is excluded here too.
    const rawPermissions = account?.permissions;
    const permissions: string[] = Array.isArray(rawPermissions)
      ? rawPermissions
      : [];
    const isSuperadminUser =
      isSuperAdmin(account) || permissions.includes("*");
    if (
      permissions.length > 0 &&
      !isSuperadminUser &&
      !request.nextUrl.pathname.includes("organizations")
    ) {
      const rule = ruleForPath(request.nextUrl.pathname);
      // Never redirect the user's own profile page: `/profile` resolves to
      // `/users/:id` above, so bouncing that path back to `/profile` would loop.
      const ownProfilePath = account?.id ? `/users/${account.id}` : null;
      const isOwnProfilePage = request.nextUrl.pathname === ownProfilePath;
      const isOwnPaymentInfoRoute =
        ownProfilePath != null &&
        request.nextUrl.pathname.startsWith(`${ownProfilePath}/payment-infos`) &&
        permissions.includes("payment_info.manage_own");
      if (
        rule?.anyOf &&
        !isOwnProfilePage &&
        !isOwnPaymentInfoRoute &&
        !rule.anyOf.some((code) => permissions.includes(code))
      ) {
        return NextResponse.redirect(new URL("/home", request.url));
      }
    }

    if (request.nextUrl.pathname === "/") {
      return NextResponse.redirect(new URL("/home", request.url));
    }
    return NextResponse.next();
  } else {
    const next = new URLSearchParams({
      next: request.nextUrl.pathname,
    }).toString();

    return NextResponse.redirect(new URL(`/login?${next}`, request.url));
  }
}

// Matcher literal must stay in sync with MIDDLEWARE_MATCHER in
// src/lib/middleware-matcher.ts (Next requires a statically analyzable string).
export const config = {
  matcher: [
    "/((?!api|_next/|favicon.ico|login|images|svg-icons|fonts|changelog|unauthorized|notfound|terms|privacy|public|reset-password|forgot-password|join-course|book-consultation|register|watch|people|teachers|verify|attachments|\\.well-known|.*\\.[\\w]+$).*)",
  ],
};
