# Internal Mode Platform Tooling — Design Spec

**Date:** 2026-07-18  
**Status:** Approved for implementation planning  
**Repos:** `schedjuice-reimagined-fe` (primary), `schedjuice-reimagined-be` (access / tenant-target APIs as needed)  
**Approach:** Dedicated `/internal/*` route group with its own shell (Approach 1)

## 1. Summary

Platform-internal tooling today is scattered under `/debug/*` and the Platform nav, with inconsistent gates (`debug.access` vs superadmin role vs `canAccessPlatformOrganizations`). School-facing and staff-only items share the same Platform section.

Introduce **internal mode**: a dedicated `/internal/*` app surface with its own layout and sidebar, available only to **superadmin on the single admin tenant** (`Organization.is_admin`). That tenant is the Schedjuice staff admin panel. Former debug tools, the platform organizations list, and staff-only org settings / billing / detailed AI usage move there. Tenant-scoped tools stay on the admin domain and take an explicit **tenant dropdown** (`?tenantId=`).

The normal Platform nav becomes thin: school admins get a new simplified **Usage** page; platform staff get **Internal tools** entry into internal mode. Product Docs moves under **Content**.

## 2. Context

### Current state

| Area | Location | Gate today |
| --- | --- | --- |
| Debug hub + tools | `(internal)/debug/*` | Nav/middleware: `debug.access`; pages often raw `role.superadmin` |
| Organizations list / platform record | `/organizations`, `/organizations/[id]` | `canAccessPlatformOrganizations` (superadmin + admin tenant) |
| Org Settings, Billing, AI Usage | Platform nav → own-tenant paths | Tenant perms (`org.configure`, `billing.manage`, `ai.usage.view`) — used by Schedjuice staff, not school admins |
| Product Docs | Platform nav → `/platform/docs` | `docs.manage` + platform-admin `canShow` |
| Tenant switching | Cross-domain redirect via `usePlatformAdminNavigate` | No in-app tenant picker for operating on another school |

### Constraints

- There is **exactly one** admin tenant in the org table; it is the staff control plane.
- Host/domain still defines the **logged-in** tenant cookie; internal tools must not require switching to a school domain to operate on that school.
- Old `/debug/*` URLs will **404** (no redirects).

## 3. Goals

1. Internal mode = presence on `/internal/*` with a dedicated shell (internal sidebar only).
2. Access: `isSuperAdmin(user) && tenant.is_admin` everywhere (middleware, nav, pages, backend).
3. Move all former `/debug/*` tools into `/internal/...`; Microsoft tools always listed (tenant-scoped via picker, not hidden by admin-tenant Microsoft flags).
4. Move platform org list/create/record under `/internal/organizations...`.
5. Move Org Settings, Billing, and detailed AI Usage under the internal sidebar.
6. Add school-facing **Usage** under normal Platform (less detailed Schedjuice + AI overview for current tenant).
7. Move Product Docs nav item under **Content** (broader Content-style access via `docs.manage`).
8. Tenant-specific internal pages: dropdown selecting target school; stay on admin domain; pass `tenantId` to APIs.

## 4. Non-goals

- Pixel-perfect Usage metrics / charts beyond a sensible v1 summary.
- Migrating Product Docs off `/platform/docs` URL or changing its CMS shell.
- View-as RBAC tooling changes.
- Design-system `/components` gallery changes.
- Soft redirects from `/debug/*` or old platform org list URLs.
- Making school admins users of Org Settings / Billing / detailed AI Usage.

## 5. Locked decisions

| Topic | Choice |
| --- | --- |
| Mode model | URL-based: `/internal/*` = internal mode |
| Entry | Platform nav **Internal tools** → `/internal/organizations` (platform-admin only) |
| Exit | Explicit **Exit** in internal shell **and** navigating outside `/internal/*` |
| Access rule | `canAccessPlatformOrganizations` / equivalent at all layers |
| Old `/debug/*` | Remove (404); no redirects |
| Platform org list path | `/internal/organizations` (old list 404) |
| Microsoft nav items | Always show in internal sidebar |
| Tenant picker | Stay on admin domain; `?tenantId=`; customer tenants in picker |
| Picker scope | Opt-in per page (tenant-scoped tools only) |
| Org Settings / Billing / detailed AI | Internal only |
| School Platform nav | New **Usage** page (current tenant, simplified) |
| Product Docs | Nav under Content; `docs.manage` |
| Admin tenant | Single staff panel tenant (`is_admin`) |

## 6. Architecture

### 6.1 Route groups & shells

```
(normal AppShell)                    (internal-tools shell)
/platform/usage                      /internal/*
/platform/docs (nav under Content)   /internal/organizations...
                                     /internal/... (tools, settings,
                                       billing, detailed AI usage)
```

- New Next.js route group with its **own layout** (not the school product sidebar).
- Reuse account chrome / design tokens where practical; sidebar config is separate (`internalNavLinks`).
- Normal `AppShell` Platform section no longer lists debug tools or org list.

### 6.2 Access control

Unify on platform-admin:

1. **Middleware:** `/internal/*` requires superadmin + admin tenant; deny otherwise.
2. **Nav:** Platform **Internal tools** uses `canShow: canAccessPlatformOrganizations`.
3. **Pages:** Shared gate component (reuse/adapt `PlatformAdminGate` patterns).
4. **Backend:** Prefer `RequiresPlatformAdminTenant` (or equivalent) for internal/platform APIs; tenant-target operations validate selected org id and reject abuse. Do not treat cookie tenant as the operated-on school for those tools.

School **Usage** uses normal tenant-scoped permissions (e.g. reuse/adapt `ai.usage.view` / billing-adjacent view perms as appropriate for v1 — exact permission name chosen in implementation plan; must be available to tenant admins who should see Usage).

### 6.3 Internal sidebar (v1)

Always listed for platform-admin:

- Organizations (list)
- Organization Settings
- Billing (detailed)
- AI Usage (detailed)
- Overview (former `/debug` hub)
- Management Commands
- Demo Artifacts
- Microsoft Bulk Repair
- Microsoft Password Reset
- Microsoft Provisioning Health
- ACCA Spreadsheet Import
- Cron Jobs
- Cron Logs

Microsoft items are **not** gated on `tenant.is_microsoft_on` for the admin tenant; they are tenant-specific tools driven by the picker.

### 6.4 URL map

| Old | New |
| --- | --- |
| `/organizations` (platform list) | `/internal/organizations` |
| `/organizations/create` | `/internal/organizations/create` |
| `/organizations/[id]/*` (platform record for other orgs) | `/internal/organizations/[id]/*` |
| `/organizations/profile` (staff org settings) | `/internal/organizations/settings` or equivalent under internal (implementation may keep component, change path) |
| Billing / AI usage deep links used by staff | Internal counterparts |
| `/debug` | `/internal` |
| `/debug/<tool>` | `/internal/<tool>` (same slugs) |

**404 (no redirect):** `/debug`, `/debug/*`, platform list at `/organizations`.

### 6.5 Normal Platform & Content nav

**Platform**

| Audience | Items |
| --- | --- |
| Tenant admins (usage perms) | **Usage** → `/platform/usage` (or final path chosen in plan) |
| Superadmin + admin tenant | **Internal tools** → `/internal/organizations` |

**Content**

- Add **Product Docs** (`/platform/docs`, `docs.manage`).
- Existing Content children unchanged.

### 6.6 Usage page (school-facing)

- Normal shell, current tenant only.
- Less detailed / less technical than internal Billing + AI Usage.
- Single overview covering **Schedjuice usage** and **AI usage**.
- v1: summary cards and simple figures; no staff-only controls.
- Does not replace internal detailed panes.

### 6.7 Tenant context (internal tools)

**Component:** `InternalTenantPicker` + shared context.

**Persistence:** Prefer URL `?tenantId=` (shareable, refresh-safe); optional last-selection memory within the session.

**Picker contents:** Customer tenants (exclude admin tenant by default).

**Behavior:**

- Tenant-scoped pages require a selection before destructive/mutating actions.
- Empty state: “Select a tenant”.
- Invalid id: clear error + reset selection.

**Pages (v1 guidance):**

| Page | Tenant picker |
| --- | --- |
| Organizations list / create / platform record | No |
| Overview hub | No |
| Cron jobs / cron logs | No |
| Organization Settings / Billing / detailed AI Usage | Yes (operate on selected school) |
| Management commands | Yes when command targets a school |
| Demo artifacts | Yes when ops target a school |
| Microsoft tools | Yes |
| ACCA import | Yes |

**API:** Send explicit target `tenantId` (header or body per existing backend conventions). Backend enforces platform-admin and validates target org.

### 6.8 Exit behavior

- **Exit** control in internal shell → normal landing (home `/` or equivalent).
- Navigating to any non-`/internal/*` route uses normal `AppShell`.
- Bookmarks to `/internal/*` without platform-admin access are blocked by middleware/gate.

## 7. Error handling

| Case | Behavior |
| --- | --- |
| Non–platform-admin → `/internal/*` | Middleware forbid/redirect; no half shell |
| Missing `tenantId` on scoped tool | Page OK; actions disabled; select-tenant empty state |
| Invalid `tenantId` | Inline/toast error; clear selection |
| Backend rejects target tenant | Surface API error; do not silently fall back to cookie tenant |
| Old `/debug` or platform org list URL | 404 |

## 8. Testing

- Nav: platform-admin sees Internal tools; school admin does not; school admin with perms sees Usage; Product Docs under Content with `docs.manage`.
- Middleware: `/internal/*` denied without platform-admin; allowed with it on admin tenant.
- Shell: `/internal/*` renders internal sidebar only; Exit returns to normal shell.
- Tenant picker present on Microsoft tools; absent on org list and cron.
- Usage page does not expose internal billing/AI admin controls.
- Backend: platform-admin + target-tenant validation for any new/adjusted operate-as-tenant endpoints.
- Regression: school product routes unchanged for non-platform users.

## 9. Implementation notes (non-binding)

- Extract shared page bodies from current debug/org components where possible; prefer move-over-rewrite.
- Replace dual gates (`debug.access` vs raw superadmin role) with platform-admin for internal surfaces; update `route-permissions.ts` and RBAC catalog references as needed.
- Update `isPlatformOrgManagementPath` / middleware org special-cases for `/internal/organizations...`.
- FE primary; BE work limited to permission alignment and explicit tenant targeting where APIs still assume cookie tenant.

## 10. Open items for implementation plan (not design blockers)

- Final path for Usage (`/platform/usage` vs alternatives).
- Exact permission key(s) for Usage visibility.
- Exact internal paths for Org Settings / Billing / AI Usage.
- Wire-up list of which management-command / demo-artifact actions require picker in v1 vs later.
- Whether any leftover deep links to `/organizations/profile` need temporary aliases (default: no aliases; update callers).
