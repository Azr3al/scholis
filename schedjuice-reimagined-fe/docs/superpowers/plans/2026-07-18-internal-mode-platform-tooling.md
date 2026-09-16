# Internal Mode Platform Tooling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a dedicated `/internal/*` staff shell (superadmin + admin tenant only) that owns former debug tools, platform org management, and detailed billing/AI panes, plus a school-facing Platform **Usage** page and Content nav for Product Docs.

**Architecture:** New Next.js route group `(platform-internal)` serves URL `/internal/*` with `InternalAppShell` (internal sidebar only). Mode = URL. Tenant-scoped tools stay on the admin domain and pass `tenantId` (query) / `organization_id` (API). Normal Platform nav shrinks to Usage + Internal tools. Product Docs moves under Content; FE/BE docs gates drop the admin-tenant requirement and use `docs.manage` / `docs.view`.

**Tech Stack:** Next.js App Router, existing `AppShell` patterns, Vitest (`bun run test:unit`), Django DRF + `tenant_schemas.utils.schema_context`, `RequiresPlatformAdminTenant`, `./scripts/run_backend_tests.sh` with `--keepdb`.

**Spec:** `docs/superpowers/specs/2026-07-18-internal-mode-platform-tooling-design.md`

## Global Constraints

- Access for `/internal/*`: `canAccessPlatformOrganizations` = `isSuperAdmin(user) && tenant.is_admin` at middleware, nav, layout gate, and backend.
- Exactly one admin tenant (`is_admin`); it is the Schedjuice staff control plane.
- Old `/debug` and `/debug/*` **404** (no redirects). Platform org **list** at `/organizations` **404** (no redirects).
- Keep `/organizations/profile` for **current-tenant** self-service (profile menu, ID cards, video). Do not delete it. Staff cross-tenant settings live at `/internal/org-settings`.
- Microsoft internal nav items always visible (no `is_microsoft_on` on admin tenant).
- Tenant picker: URL `?tenantId=`; APIs use `organization_id`; stay on admin domain; exclude admin org from picker.
- Usage page path: `/platform/usage`; nav `anyOf: ["ai.usage.view", "billing.manage"]`.
- Product Docs nav under Content with `docs.manage`; remove `PlatformAdminGate` / `RequiresPlatformAdminTenant` from docs (RBAC `docs.view` / `docs.manage` only).
- Route group `(internal)` remains the **school** AppShell group — do **not** put `/internal` URLs under it.
- Backend tests must use `--keepdb` via `./scripts/run_backend_tests.sh`.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/internal-route-access.ts` | Create | `isInternalPath`, `isInternalPlatformOrgPath` |
| `src/lib/org-route-access.ts` | Modify | Stop treating `/organizations` list/create as platform paths (they move) |
| `src/lib/__tests__/internal-route-access.test.ts` | Create | Path helper tests |
| `src/lib/__tests__/org-route-access.test.ts` | Modify | Update expectations for moved paths |
| `src/middleware.ts` | Modify | Gate `/internal/*`; drop platform-list special case for old list |
| `src/config/route-permissions.ts` | Modify | `/internal` rule; `/platform/usage`; remove `/debug` |
| `src/config/__tests__/route-permissions.test.ts` | Modify | Match new rules |
| `src/config/internal-nav-routes.tsx` | Create | `internalNavLinks` for internal sidebar |
| `src/config/nav-routes.tsx` | Modify | Platform → Usage + Internal tools; Product Docs → Content |
| `src/config/__tests__/nav-routes.test.ts` | Modify | New Platform/Content expectations |
| `src/components/shell/internal-app-shell.tsx` | Create | Internal chrome + Exit + internal sidebar |
| `src/components/shell/internal-sidebar-nav.tsx` | Create | Renders `internalNavLinks` |
| `src/hooks/useInternalTenant.ts` | Create | `tenantId` query state + validation helpers |
| `src/components/internal/internal-tenant-picker.tsx` | Create | Org combobox excluding admin tenant |
| `src/components/internal/require-internal-tenant.tsx` | Create | Empty state wrapper when picker required |
| `src/app/(platform-internal)/layout.tsx` | Create | `PlatformAdminGate` + `InternalAppShell` |
| `src/app/(platform-internal)/internal/**` | Create | Moved/new internal pages |
| `src/app/(internal)/debug/**` | Delete | After move |
| `src/app/(internal)/organizations/page.tsx` | Delete | After move to `/internal/organizations` |
| `src/app/(internal)/organizations/create/**` | Delete | After move |
| `src/app/(internal)/organizations/[id]/**` | Delete | After move (platform record) |
| `src/app/(internal)/platform/usage/page.tsx` | Create | School Usage overview (`/platform/usage`) |
| `src/app/(docs)/platform/docs/layout.tsx` | Modify | Drop `PlatformAdminGate`; permission gate |
| `schedjuice-reimagined-be/app_organization/target_tenant.py` | Create | Resolve `organization_id` for platform-admin ops |
| `schedjuice-reimagined-be/app_microsoft/views.py` | Modify | Accept `organization_id`; operate in target schema |
| `schedjuice-reimagined-be/app_product_docs/views.py` | Modify | Drop `RequiresPlatformAdminTenant` from docs views |
| `schedjuice-reimagined-be/app_*/tests/...` | Create/Modify | Cover target-tenant + docs access |

---

### Task 1: Path helpers + unit tests

**Files:**
- Create: `src/lib/internal-route-access.ts`
- Create: `src/lib/__tests__/internal-route-access.test.ts`
- Modify: `src/lib/org-route-access.ts`
- Modify: `src/lib/__tests__/org-route-access.test.ts`

**Interfaces:**
- Consumes: none
- Produces:
  - `isInternalPath(pathname: string): boolean`
  - `isInternalPlatformOrgPath(pathname: string): boolean`
  - `isPlatformOrgManagementPath` updated so `/organizations` list/create are **false** (moved); keep false for profile/user-activity; other-org `/organizations/:id` becomes unused/false once deleted

- [ ] **Step 1: Write failing tests**

Create `src/lib/__tests__/internal-route-access.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  isInternalPath,
  isInternalPlatformOrgPath,
} from "../internal-route-access";

describe("isInternalPath", () => {
  it("matches /internal and children", () => {
    expect(isInternalPath("/internal")).toBe(true);
    expect(isInternalPath("/internal/organizations")).toBe(true);
    expect(isInternalPath("/internal/microsoft-health")).toBe(true);
  });

  it("does not match school routes", () => {
    expect(isInternalPath("/organizations")).toBe(false);
    expect(isInternalPath("/organizations/profile")).toBe(false);
    expect(isInternalPath("/debug")).toBe(false);
    expect(isInternalPath("/home")).toBe(false);
  });
});

describe("isInternalPlatformOrgPath", () => {
  it("matches internal org management routes", () => {
    expect(isInternalPlatformOrgPath("/internal/organizations")).toBe(true);
    expect(isInternalPlatformOrgPath("/internal/organizations/create")).toBe(
      true,
    );
    expect(isInternalPlatformOrgPath("/internal/organizations/12")).toBe(true);
  });

  it("excludes non-org internal tools", () => {
    expect(isInternalPlatformOrgPath("/internal/cron-jobs")).toBe(false);
  });
});
```

Update `org-route-access.test.ts` so `/organizations` and `/organizations/create` expect **false** (no longer platform management paths). Keep profile / user-activity false. Other-org `/organizations/:id` can remain true temporarily until those pages are deleted in Task 4 (then update tests to false or delete those cases).

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd schedjuice-reimagined-fe && bun run test:unit -- src/lib/__tests__/internal-route-access.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement helpers**

Create `src/lib/internal-route-access.ts`:

```typescript
export function isInternalPath(pathname: string): boolean {
  return pathname === "/internal" || pathname.startsWith("/internal/");
}

export function isInternalPlatformOrgPath(pathname: string): boolean {
  return (
    pathname === "/internal/organizations" ||
    pathname === "/internal/organizations/create" ||
    /^\/internal\/organizations\/\d+/.test(pathname)
  );
}
```

Update `src/lib/org-route-access.ts` — remove the early `true` for `/organizations` and `/organizations/create`:

```typescript
export function isPlatformOrgManagementPath(
  pathname: string,
  tenantId: string | number,
): boolean {
  if (pathname.startsWith("/organizations/user-activity")) {
    return false;
  }
  if (pathname.startsWith("/organizations/profile")) {
    return false;
  }
  // Platform list/create live under /internal/organizations (see isInternalPlatformOrgPath).
  if (pathname === "/organizations" || pathname === "/organizations/create") {
    return false;
  }
  const match = pathname.match(/^\/organizations\/(\d+)/);
  if (match && match[1] !== String(tenantId)) {
    return true;
  }
  return false;
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd schedjuice-reimagined-fe && bun run test:unit -- src/lib/__tests__/internal-route-access.test.ts src/lib/__tests__/org-route-access.test.ts
```

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/lib/internal-route-access.ts src/lib/__tests__/internal-route-access.test.ts src/lib/org-route-access.ts src/lib/__tests__/org-route-access.test.ts
git commit -m "$(cat <<'EOF'
feat(internal): add /internal path helpers and retire org-list platform paths

EOF
)"
```

---

### Task 2: Middleware + route-permissions for `/internal` and Usage

**Files:**
- Modify: `src/middleware.ts`
- Modify: `src/config/route-permissions.ts`
- Modify: `src/config/__tests__/route-permissions.test.ts`

**Interfaces:**
- Consumes: `isInternalPath`, `canAccessPlatformOrganizations`
- Produces: middleware deny/allow for `/internal/*`; `ruleForPath("/internal/...")` → platform-admin-oriented rule; `/platform/usage` mapped; `/debug` rule removed

- [ ] **Step 1: Write failing route-permissions tests**

In `src/config/__tests__/route-permissions.test.ts`, replace the `/debug` deep-child case with:

```typescript
  it("resolves /internal tools under /internal prefix", () => {
    const rule = ruleForPath("/internal/cron-jobs");
    expect(rule?.prefix).toBe("/internal");
    expect(rule?.anyOf).toEqual(["org.manage_all"]);
  });

  it("resolves /platform/usage for ai.usage.view or billing.manage", () => {
    const rule = ruleForPath("/platform/usage");
    expect(rule?.prefix).toBe("/platform/usage");
    expect(rule?.anyOf).toEqual(["ai.usage.view", "billing.manage"]);
  });
```

Remove or rewrite the old `/debug/cron-jobs` expectation.

- [ ] **Step 2: Run — expect FAIL**

```bash
cd schedjuice-reimagined-fe && bun run test:unit -- src/config/__tests__/route-permissions.test.ts
```

- [ ] **Step 3: Update `route-permissions.ts`**

In the platform-internal block (~L114–121):

- Remove `{ prefix: "/debug", anyOf: ["debug.access"] }`
- Add `{ prefix: "/internal", anyOf: ["org.manage_all"] }` (middleware still enforces admin tenant; this is UX belt-and-suspenders for non-superadmin)
- Add `{ prefix: "/platform/usage", anyOf: ["ai.usage.view", "billing.manage"] }`
- Keep `/platform/docs` as-is
- Keep `/organizations/profile` for current-tenant settings
- Narrow `/organizations` rule if needed so bare `/organizations` is not a soft-allow for everyone (list will 404)

- [ ] **Step 4: Update middleware**

Near the top of the authenticated branch (before org special-case), add:

```typescript
import { isInternalPath } from "@/lib/internal-route-access";

// ...
if (isInternalPath(request.nextUrl.pathname)) {
  if (!canAccessPlatformOrganizations(account, tenant)) {
    return NextResponse.redirect(new URL("/home", request.url));
  }
  return NextResponse.next();
}
```

Leave `/organizations/profile` and user-activity handling intact. Platform list at `/organizations` will naturally 404 once page is removed; if someone hits it while still present mid-migration, redirect non-platform-admin home (optional).

- [ ] **Step 5: Run tests — PASS**

```bash
cd schedjuice-reimagined-fe && bun run test:unit -- src/config/__tests__/route-permissions.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/middleware.ts src/config/route-permissions.ts src/config/__tests__/route-permissions.test.ts
git commit -m "$(cat <<'EOF'
feat(internal): gate /internal in middleware and route-permissions

EOF
)"
```

---

### Task 3: Internal nav config + InternalAppShell + route group layout

**Files:**
- Create: `src/config/internal-nav-routes.tsx`
- Create: `src/components/shell/internal-sidebar-nav.tsx`
- Create: `src/components/shell/internal-app-shell.tsx`
- Create: `src/app/(platform-internal)/layout.tsx`
- Create: `src/app/(platform-internal)/internal/page.tsx` (stub overview OK)

**Interfaces:**
- Consumes: `PlatformAdminGate`, `canAccessPlatformOrganizations` (via gate)
- Produces: `internalNavLinks: NavSection[]` (same shape as `navLinks` children pattern — flat list of `{ title, href, icon }` is fine); `InternalAppShell`; layout at `/internal`

- [ ] **Step 1: Add `internal-nav-routes.tsx`**

```tsx
import {
  Activity,
  Building2,
  Clock,
  FileSpreadsheet,
  FileStack,
  KeyRound,
  Receipt,
  Settings,
  Terminal,
  Wrench,
  Bug,
  BarChart3,
} from "iconoir-react";

export type InternalNavItem = {
  title: string;
  href: string;
  icon: typeof Building2;
};

export const internalNavLinks: InternalNavItem[] = [
  { title: "Organizations", href: "/internal/organizations", icon: Building2 },
  { title: "Organization Settings", href: "/internal/org-settings", icon: Settings },
  { title: "Billing", href: "/internal/billing", icon: Receipt },
  { title: "AI Usage", href: "/internal/ai-usage", icon: BarChart3 },
  { title: "Overview", href: "/internal", icon: Bug },
  { title: "Management Commands", href: "/internal/management-commands", icon: Terminal },
  { title: "Demo Artifacts", href: "/internal/demo-artifacts", icon: FileStack },
  { title: "Microsoft Bulk Repair", href: "/internal/microsoft-bulk-repair", icon: Wrench },
  { title: "Microsoft Password Reset", href: "/internal/microsoft-password-reset", icon: KeyRound },
  { title: "Microsoft Provisioning Health", href: "/internal/microsoft-health", icon: Activity },
  { title: "ACCA Spreadsheet Import", href: "/internal/acca-spreadsheet-import", icon: FileSpreadsheet },
  { title: "Cron Jobs", href: "/internal/cron-jobs", icon: Clock },
  { title: "Cron Logs", href: "/internal/cron-logs", icon: Clock },
];
```

No Microsoft `canShow` filters.

- [ ] **Step 2: Implement `InternalSidebarNav` + `InternalAppShell`**

Shell requirements:
- Left nav from `internalNavLinks`
- Header label e.g. “Schedjuice Internal”
- **Exit** button → `router.push("/home")` (or `<Link href="/home">`)
- No school `navLinks`, no chat dock (omit `ChatArea` unless trivially shared — prefer omit)
- Wrap with `TooltipProvider` as needed
- Active link: `pathname === href` or `pathname.startsWith(href + "/")` with Overview (`/internal`) exact-match only

- [ ] **Step 3: Layout**

`src/app/(platform-internal)/layout.tsx`:

```tsx
"use client";

import { InternalAppShell } from "@/components/shell/internal-app-shell";
import { PlatformAdminGate } from "@/hooks/usePlatformAdminGate";

export default function PlatformInternalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PlatformAdminGate>
      <InternalAppShell>{children}</InternalAppShell>
    </PlatformAdminGate>
  );
}
```

Stub `src/app/(platform-internal)/internal/page.tsx` with a short “Internal tools” heading + links list (copy from old debug hub once moved).

- [ ] **Step 4: Manual smoke**

Run FE, as platform-admin on admin tenant open `/internal` — see internal shell + Exit. As school admin, expect redirect/prompt home.

- [ ] **Step 5: Commit**

```bash
git add src/config/internal-nav-routes.tsx src/components/shell/internal-sidebar-nav.tsx src/components/shell/internal-app-shell.tsx src/app/\(platform-internal\)
git commit -m "$(cat <<'EOF'
feat(internal): add InternalAppShell and /internal route group

EOF
)"
```

---

### Task 4: Move platform organizations pages under `/internal/organizations`

**Files:**
- Create (via move): `src/app/(platform-internal)/internal/organizations/**`
- Delete: `src/app/(internal)/organizations/page.tsx`, `create/**`, `[id]/**` (keep `profile/**`, `user-activity/**`)
- Modify: links inside moved pages (`/organizations` → `/internal/organizations`)
- Modify: `organization-columns.tsx` hrefs if shared — prefer colocate under internal or pass base path

**Interfaces:**
- Consumes: existing `OrgRecordShell mode="platform"`, `useOrganizationsList`
- Produces: working `/internal/organizations`, `/create`, `/[id]`

- [ ] **Step 1: Move files**

```bash
cd schedjuice-reimagined-fe
mkdir -p src/app/\(platform-internal\)/internal/organizations
git mv src/app/\(internal\)/organizations/page.tsx src/app/\(platform-internal\)/internal/organizations/page.tsx
git mv src/app/\(internal\)/organizations/create src/app/\(platform-internal\)/internal/organizations/create
git mv src/app/\(internal\)/organizations/\[id\] src/app/\(platform-internal\)/internal/organizations/\[id\]
# Move organization-columns.tsx with the list page (or keep import path updated)
git mv src/app/\(internal\)/organizations/organization-columns.tsx src/app/\(platform-internal\)/internal/organizations/organization-columns.tsx
```

If `git mv` conflicts with shared imports from profile, copy instead and delete old.

- [ ] **Step 2: Rewrite internal links**

In moved files, replace:
- `"/organizations"` → `"/internal/organizations"`
- `"/organizations/create"` → `"/internal/organizations/create"`
- `` `/organizations/${id}` `` → `` `/internal/organizations/${id}` ``

Replace page-level `role.superadmin` spinner gates with reliance on layout `PlatformAdminGate` (optional thin `canAccessPlatformOrganizations` assert).

- [ ] **Step 3: Confirm school paths still work**

- `/organizations/profile` still resolves
- `/organizations/user-activity` still resolves
- `/organizations` 404

- [ ] **Step 4: Commit**

```bash
git add -A src/app/\(platform-internal\)/internal/organizations src/app/\(internal\)/organizations
git commit -m "$(cat <<'EOF'
feat(internal): move platform org pages under /internal/organizations

EOF
)"
```

---

### Task 5: Move debug tools under `/internal/*` and delete `/debug`

**Files:**
- Move: `src/app/(internal)/debug/**` → `src/app/(platform-internal)/internal/**` (flatten: `debug/foo` → `internal/foo`)
- Update: all hrefs `/debug` → `/internal`
- Update: `demo-guide` import of demo-artifacts components (path change)
- Update: `posthog.test.ts` paths from `/debug/...` to `/internal/...` if exclusion list uses them
- Delete: empty `debug` tree

**Interfaces:**
- Consumes: existing page components
- Produces: `/internal/management-commands`, `/internal/demo-artifacts/...`, microsoft/*, acca, cron-*

- [ ] **Step 1: Move tree**

```bash
cd schedjuice-reimagined-fe
# Example pattern — move each tool folder to (platform-internal)/internal/<name>
git mv src/app/\(internal\)/debug/management-commands src/app/\(platform-internal\)/internal/management-commands
git mv src/app/\(internal\)/debug/demo-artifacts src/app/\(platform-internal\)/internal/demo-artifacts
git mv src/app/\(internal\)/debug/microsoft-bulk-repair src/app/\(platform-internal\)/internal/microsoft-bulk-repair
git mv src/app/\(internal\)/debug/microsoft-password-reset src/app/\(platform-internal\)/internal/microsoft-password-reset
git mv src/app/\(internal\)/debug/microsoft-health src/app/\(platform-internal\)/internal/microsoft-health
git mv src/app/\(internal\)/debug/acca-spreadsheet-import src/app/\(platform-internal\)/internal/acca-spreadsheet-import
git mv src/app/\(internal\)/debug/cron-jobs src/app/\(platform-internal\)/internal/cron-jobs
git mv src/app/\(internal\)/debug/cron-logs src/app/\(platform-internal\)/internal/cron-logs
# Merge old debug/page.tsx content into internal/page.tsx then delete debug/page.tsx
```

- [ ] **Step 2: Global replace in moved files**

Replace string `/debug` with `/internal` in those pages and `_components`. Fix `demo-guide` import path to `@/app/(platform-internal)/internal/demo-artifacts/_components/...` or better: move shared demo components to `src/components/demo-artifacts/` if import path is painful — only if needed.

Replace per-page `user.roles.includes(role.superadmin)` gates with layout gate (delete spinner-only superadmin checks or switch to `canAccessPlatformOrganizations`).

- [ ] **Step 3: Update PostHog exclusion tests**

In `src/lib/posthog.test.ts` (and `shouldTrackPage` implementation if it hardcodes `/debug`), use `/internal/` prefix instead of `/debug/`.

- [ ] **Step 4: Verify `/debug` 404; `/internal/cron-jobs` loads for platform-admin**

- [ ] **Step 5: Commit**

```bash
git commit -am "$(cat <<'EOF'
feat(internal): relocate debug tools under /internal and drop /debug

EOF
)"
```

---

### Task 6: Reshape normal Platform + Content nav

**Files:**
- Modify: `src/config/nav-routes.tsx`
- Modify: `src/config/__tests__/nav-routes.test.ts`

**Interfaces:**
- Consumes: `canAccessPlatformOrganizations`
- Produces: Platform children = Usage + Internal tools; Content includes Product Docs

- [ ] **Step 1: Update nav tests**

```typescript
  it("Platform exposes Usage and Internal tools permissions", () => {
    const perms = allPerms({ children: navLinks });
    expect(perms).toContain("ai.usage.view");
    expect(perms).toContain("billing.manage");
    expect(perms).toContain("org.manage_all");
    expect(perms).not.toContain("debug.access");
  });

  it("Content includes Product Docs with docs.manage", () => {
    const content = navLinks.find((s) => s.title === "Content");
    const docs = content?.children?.find((c) => c.title === "Product Docs");
    expect(docs?.href).toBe("/platform/docs");
    expect(docs?.requiredPermissions).toEqual(["docs.manage"]);
  });
```

- [ ] **Step 2: Run — FAIL, then rewrite Platform/Content sections**

**Content** — append:

```tsx
{
  title: "Product Docs",
  icon: FileText,
  href: "/platform/docs",
  requiredPermissions: ["docs.manage"],
},
```

**Platform** — replace children with only:

```tsx
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
```

Remove Organizations, Organization Settings, Billing, AI Usage, Product Docs, and all debug entries from Platform.

Note: `visibleChildren` treats `requiredPermissions` as any-of via `canAny` — confirm Usage shows if user has either permission (existing helper behavior). If `canAny` is not used and it requires all, split into a `canShow` that ORs the two codes.

- [ ] **Step 3: Run nav tests — PASS**

```bash
cd schedjuice-reimagined-fe && bun run test:unit -- src/config/__tests__/nav-routes.test.ts src/components/nav/__tests__/nav-visibility.test.ts
```

- [ ] **Step 4: Commit**

```bash
git commit -am "$(cat <<'EOF'
feat(nav): thin Platform nav; move Product Docs under Content

EOF
)"
```

---

### Task 7: Product Docs access — drop admin-tenant gate

**Files:**
- Modify: `src/app/(docs)/platform/docs/layout.tsx`
- Modify: `schedjuice-reimagined-be/app_product_docs/views.py`
- Modify/Create: BE tests under `app_product_docs/tests/` for non-admin-tenant access with `docs.manage`

**Interfaces:**
- Consumes: `docs.view` / `docs.manage` RBAC
- Produces: docs usable without `tenant.is_admin`

- [ ] **Step 1: FE layout**

Replace `PlatformAdminGate` with a small client gate that allows when `canAny(["docs.view", "docs.manage"])` (or existing permissions hook). Show forbidden/spinner otherwise. Keep `PlatformDocsShell`.

- [ ] **Step 2: BE — remove platform-admin permission class**

In `app_product_docs/views.py`, change `_PLATFORM = [RBACPermission, RequiresPlatformAdminTenant]` to `_PLATFORM = [RBACPermission]` (or equivalent per-view). Keep `required_permissions` maps.

- [ ] **Step 3: BE test**

Add a test that a user with `docs.manage` on a **non-admin** tenant can GET/PATCH an allowed docs endpoint (follow existing docs test factories). Assert platform-admin is no longer required.

```bash
cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_product_docs.tests -v 2
```

- [ ] **Step 4: Commit FE + BE separately**

```bash
# FE
git commit -am "$(cat <<'EOF'
feat(docs): allow Product Docs via docs.manage without admin tenant

EOF
)"
# BE (in schedjuice-reimagined-be)
git commit -am "$(cat <<'EOF'
feat(docs): drop RequiresPlatformAdminTenant from product docs views

EOF
)"
```

---

### Task 8: Internal tenant picker (FE)

**Files:**
- Create: `src/hooks/useInternalTenant.ts`
- Create: `src/components/internal/internal-tenant-picker.tsx`
- Create: `src/components/internal/require-internal-tenant.tsx`
- Create: `src/hooks/useInternalTenant.test.ts` (or component test)

**Interfaces:**
- Consumes: `nuqs` `useQueryState`, organizations search / `EntityCombobox` with `entity="organizations"`
- Produces:
  - `useInternalTenant(): { tenantId: string | null; setTenantId: (id: string | null) => void; organizationId: number | null }`
  - `<InternalTenantPicker />`
  - `<RequireInternalTenant>{children}</RequireInternalTenant>` — if no `tenantId`, render “Select a tenant” empty state and the picker; else render children

- [ ] **Step 1: Hook**

```typescript
"use client";

import { parseAsString, useQueryState } from "nuqs";

export function useInternalTenant() {
  const [tenantId, setTenantId] = useQueryState(
    "tenantId",
    parseAsString.withDefault("").withOptions({ clearOnDefault: true }),
  );
  const normalized = tenantId.trim() === "" ? null : tenantId.trim();
  const organizationId =
    normalized && /^\d+$/.test(normalized) ? Number(normalized) : null;

  return {
    tenantId: normalized,
    setTenantId: (id: string | null) => setTenantId(id ?? ""),
    organizationId,
  };
}
```

- [ ] **Step 2: Picker**

Use `EntityCombobox` with `entity="organizations"`, `displayFunction={(o) => o.name}`, fields `id,name,is_admin`. Filter out `is_admin === true` client-side (and/or query filter if API supports). On change, `setTenantId(String(id))`.

- [ ] **Step 3: Unit test**

Test that `organizationId` is null for empty/invalid `tenantId`, and number for `"42"`. If hook testing is awkward without nuqs adapter, test a pure `parseInternalTenantId(raw: string): number | null` helper extracted next to the hook.

- [ ] **Step 4: Commit**

```bash
git commit -am "$(cat <<'EOF'
feat(internal): add tenantId query picker for staff tools

EOF
)"
```

---

### Task 9: Backend target-tenant resolution for Microsoft tools

**Files:**
- Create: `schedjuice-reimagined-be/app_organization/target_tenant.py`
- Create: `schedjuice-reimagined-be/app_organization/tests/test_target_tenant.py`
- Modify: `schedjuice-reimagined-be/app_microsoft/views.py`
- Modify: `schedjuice-reimagined-fe/src/app/client-api/microsoft.ts`
- Create/Modify: microsoft API tests for `organization_id`

**Interfaces:**
- Consumes: `RequiresPlatformAdminTenant`, `Organization`, `schema_context`
- Produces:
  - `resolve_target_organization(request) -> Organization` raising/returning 400 if missing/invalid/admin
  - Microsoft tool views require platform-admin + `organization_id` and run scans/jobs in `schema_context(target.schema_name)` with `tenant=target`

- [ ] **Step 1: Failing BE tests**

```python
from django.test import RequestFactory, TestCase
from rest_framework.exceptions import ValidationError

from app_organization.target_tenant import resolve_target_organization
# Use existing org factories from test_platform_org_access / microsoft tests


class ResolveTargetOrganizationTests(TestCase):
    def test_requires_organization_id(self):
        request = RequestFactory().get("/microsoft/health")
        request.tenant = self.admin_org
        with self.assertRaises(ValidationError):
            resolve_target_organization(request)

    def test_rejects_admin_org_as_target(self):
        request = RequestFactory().get(
            "/microsoft/health", {"organization_id": self.admin_org.id}
        )
        request.tenant = self.admin_org
        with self.assertRaises(ValidationError):
            resolve_target_organization(request)

    def test_resolves_customer_org(self):
        request = RequestFactory().get(
            "/microsoft/health", {"organization_id": self.customer_org.id}
        )
        request.tenant = self.admin_org
        org = resolve_target_organization(request)
        self.assertEqual(org.id, self.customer_org.id)
```

Wire real org creation like `app_organization/tests/test_platform_org_access.py`.

- [ ] **Step 2: Implement `target_tenant.py`**

```python
from rest_framework.exceptions import ValidationError

from app_organization.models import Organization


def resolve_target_organization(request) -> Organization:
    raw = request.query_params.get("organization_id")
    if raw is None and hasattr(request, "data"):
        raw = (request.data or {}).get("organization_id")
    if raw is None or raw == "":
        raise ValidationError({"organization_id": "This field is required."})
    try:
        org_id = int(raw)
    except (TypeError, ValueError) as exc:
        raise ValidationError({"organization_id": "Must be an integer."}) from exc
    org = Organization.objects.filter(id=org_id).first()
    if org is None:
        raise ValidationError({"organization_id": "Organization not found."})
    if getattr(org, "is_admin", False):
        raise ValidationError(
            {"organization_id": "Cannot target the admin organization."}
        )
    return org
```

- [ ] **Step 3: Update Microsoft views**

For health / dry-run / jobs / password-reset:
1. Add `permission_classes` or view checks: `RequiresPlatformAdminTenant` **in addition to** existing RBAC codes (or replace `debug.access` with platform-admin + keep `microsoft.repair` where already used).
2. `target = resolve_target_organization(request)`
3. Wrap tenant-schema work:

```python
from tenant_schemas.utils import schema_context

with schema_context(target.schema_name):
    result = dry_run(target, target_type)
```

Pass `target` anywhere the code currently uses `request.tenant` for MS config.

- [ ] **Step 4: FE client**

```typescript
export const getMicrosoftHealth = (organizationId: number | string) =>
  axiosClient.get(`microsoft/health`, {
    params: { organization_id: organizationId },
  });

export const microsoftRepairDryRun = (
  target_type: MicrosoftRepairTargetType,
  organizationId: number | string,
) =>
  axiosClient.post(`microsoft/repair/dry-run`, {
    target_type,
    organization_id: organizationId,
  });
// similarly for jobs + password reset
```

- [ ] **Step 5: Run BE tests**

```bash
cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_organization.tests.test_target_tenant app_microsoft.tests -v 2
```

- [ ] **Step 6: Commit BE + FE client**

---

### Task 10: Wire picker into tenant-scoped internal pages

**Files:**
- Modify: microsoft-* pages, acca import, management-commands (school-targeting actions), demo-artifacts provision UI
- Do **not** add picker to: organizations list/create/[id], overview, cron-jobs, cron-logs

**Interfaces:**
- Consumes: `useInternalTenant`, `RequireInternalTenant`, updated microsoft client
- Produces: pages no-op until tenant selected; APIs receive `organization_id`

- [ ] **Step 1: Microsoft health example**

```tsx
export default function MicrosoftHealthPage() {
  const { organizationId } = useInternalTenant();
  const { data, isLoading } = useQuery({
    queryKey: ["microsoft-health", organizationId],
    queryFn: () => getMicrosoftHealth(organizationId!),
    enabled: organizationId != null,
  });

  return (
    <PageContainer>
      <InternalTenantPicker />
      <RequireInternalTenant>
        {/* existing cards; fix repair links to preserve ?tenantId= */}
      </RequireInternalTenant>
    </PageContainer>
  );
}
```

Preserve `tenantId` when linking between MS pages (`/internal/microsoft-bulk-repair?tenantId=`).

- [ ] **Step 2: Repeat for password-reset, bulk-repair, ACCA**

For management-commands / demo provision: wrap only actions that need a school; if a command is global, skip picker.

- [ ] **Step 3: Manual verify** — select tenant A vs B changes health payload; missing selection disables run buttons.

- [ ] **Step 4: Commit**

```bash
git commit -am "$(cat <<'EOF'
feat(internal): require tenant picker on Microsoft and ACCA tools

EOF
)"
```

---

### Task 11: Internal Org Settings / Billing / AI Usage pages

**Files:**
- Create: `src/app/(platform-internal)/internal/org-settings/page.tsx`
- Create: `src/app/(platform-internal)/internal/billing/page.tsx`
- Create: `src/app/(platform-internal)/internal/ai-usage/page.tsx`

**Interfaces:**
- Consumes: `OrgRecordShell` / section components (`OrgBillingSection`, `OrgAiSection`), `RequireInternalTenant`
- Produces: staff panes for **selected** `organizationId` (not cookie tenant)

- [ ] **Step 1: Org settings page**

```tsx
"use client";

import { OrgRecordShell } from "@/components/org/record/org-record-shell";
import { InternalTenantPicker } from "@/components/internal/internal-tenant-picker";
import { RequireInternalTenant } from "@/components/internal/require-internal-tenant";
import { useInternalTenant } from "@/hooks/useInternalTenant";
import { PageContainer } from "@/components/layout/page-container";

export default function InternalOrgSettingsPage() {
  const { organizationId } = useInternalTenant();
  return (
    <PageContainer>
      <InternalTenantPicker />
      <RequireInternalTenant>
        <OrgRecordShell mode="platform" orgId={String(organizationId)} />
      </RequireInternalTenant>
    </PageContainer>
  );
}
```

If `OrgRecordShell` assumes route `/organizations/[id]`, adapt with a `basePath` prop **or** render section components directly with `orgId={organizationId}` and default section `profile`. Prefer minimal `OrgRecordShell` API extension (`basePath="/internal/organizations"` only if record rail links need it). For settings-only page, mounting `OrgRecordShell` in platform mode with `orgId` is enough; hide create/list chrome.

- [ ] **Step 2: Billing + AI Usage**

Same picker wrapper; render `OrgBillingSection` / `OrgAiSection` with `orgId={organizationId}` (copy mounting pattern from `org-record-shell.tsx` ~billing/ai branches). Default AI pane to usage.

- [ ] **Step 3: Confirm `/organizations/profile` still works for current tenant via profile menu**

- [ ] **Step 4: Commit**

```bash
git commit -am "$(cat <<'EOF'
feat(internal): add tenant-scoped org settings, billing, and AI usage

EOF
)"
```

---

### Task 12: School Platform Usage page

**Files:**
- Create: `src/app/(internal)/platform/usage/page.tsx` (URL `/platform/usage` — folder `platform/usage` under `(internal)` school shell)
- Optionally thin presentational: `src/components/platform/tenant-usage-overview.tsx`
- Reuse: `fetchOrgAiUsage(tenant.id, { year, month })` and billing summary fetch from `src/app/client-api/billing.ts` if a lightweight endpoint exists; otherwise show AI summary + placeholder Schedjuice usage cards from fields already on tenant/org payload (seat counts, storage — YAGNI: 2–4 summary metrics max)

**Interfaces:**
- Consumes: `useTenant()`, `ai.usage.view` / `billing.manage` (page-level soft check)
- Produces: non-technical overview; **no** internal repair controls, failure tables, or platform org picker

- [ ] **Step 1: Page UI**

Structure:
- Title: “Usage”
- Section “Schedjuice” — simple counts (active students/courses if cheap via existing APIs; otherwise omit rather than invent)
- Section “AI” — current month tokens / requests from `fetchOrgAiUsage(currentTenantId, …)`
- Link text only if needed: none to internal tools

- [ ] **Step 2: Gate**

If user lacks both perms, redirect `/home` (middleware should already catch).

- [ ] **Step 3: Manual** — school admin sees Usage in Platform; does not see Internal tools; does not see debug links.

- [ ] **Step 4: Commit**

```bash
git commit -am "$(cat <<'EOF'
feat(platform): add school-facing Usage overview page

EOF
)"
```

---

### Task 13: Cleanup call sites + final verification

**Files (as needed):**
- `src/components/nav/profile-menu.tsx` — keep `/organizations/profile`
- Changelog / id-card links — keep profile URLs
- `src/lib/ui-remediation/route-manifest-generator.ts` — treat `/internal/` like former `/debug/`
- Any remaining `/debug` string references in FE (ripgrep)
- BE: ensure ACCA / management-command endpoints accept `organization_id` if they still bind cookie tenant (same pattern as Task 9; if out of scope for a given endpoint, document and disable action until selected tenant can be passed)

- [ ] **Step 1: Ripgrep cleanup**

```bash
cd schedjuice-reimagined-fe && rg -n '"/debug|/debug/' src --glob '!**/changelog/**' 
cd schedjuice-reimagined-fe && rg -n 'href=\"/organizations\"' src
```

Fix stragglers. Changelog historical hrefs may stay.

- [ ] **Step 2: Unit test suite for touched areas**

```bash
cd schedjuice-reimagined-fe && bun run test:unit -- src/lib/__tests__/internal-route-access.test.ts src/lib/__tests__/org-route-access.test.ts src/config/__tests__/route-permissions.test.ts src/config/__tests__/nav-routes.test.ts src/components/nav/__tests__/nav-visibility.test.ts src/lib/posthog.test.ts
```

- [ ] **Step 3: Manual checklist**

1. Platform-admin on admin tenant: Platform → Internal tools → internal shell, Exit → `/home`
2. Microsoft tools: always in sidebar; require tenant; API uses `organization_id`
3. `/debug` 404; `/organizations` list 404; `/organizations/profile` OK
4. School admin: Usage visible (with perms); no Internal tools; Product Docs under Content if `docs.manage`
5. Cron pages: no tenant picker

- [ ] **Step 4: Final commit if cleanup remained**

```bash
git commit -am "$(cat <<'EOF'
chore(internal): finish path cleanup and verification follow-ups

EOF
)"
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
| --- | --- |
| `/internal/*` = mode + new shell | 3 |
| Gate superadmin + admin tenant | 2, 3, layout |
| Move debug tools; MS always listed | 5, 3 nav |
| Move org list/create/record | 4 |
| Org settings / billing / detailed AI internal | 11 |
| Keep current-tenant profile for school deep links | 4, 11, 13 (constraint) |
| Usage page under Platform | 6, 12 |
| Product Docs → Content + broader access | 6, 7 |
| Tenant dropdown `?tenantId=` on admin domain | 8, 9, 10 |
| `/debug` 404 no redirect | 5 |
| Exit + leave `/internal` | 3 |
| Tests for nav/middleware/picker | 1–2, 6, 8, 13 |

**Ambiguity resolved in plan:** Usage path `/platform/usage`; Usage perms OR of `ai.usage.view` \| `billing.manage`; internal staff panes at `/internal/org-settings|billing|ai-usage`; API field `organization_id`.

**Placeholders:** none intentional — ACCA/management-command BE targeting follows Task 9 pattern when those endpoints still use cookie tenant.
