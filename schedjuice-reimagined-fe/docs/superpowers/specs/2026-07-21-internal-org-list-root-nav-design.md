# Internal mode: org list as root, path-based org settings

**Date:** 2026-07-21  
**Status:** Approved for implementation planning  
**Repos:** `schedjuice-reimagined-fe`  
**Revises:** [2026-07-18 internal-mode platform tooling](2026-07-18-internal-mode-platform-tooling-design.md) (sidebar IA, org settings entry, tenant picker visibility on platform org record)

## Summary

Internal mode lands on the **organizations list**. **Overview** and **Organization Settings** leave the sidebar. Opening an org uses the existing path-based record at `/internal/organizations/[id]` as the settings surface. The header **Tenant** dropdown stays visible on those record routes and switches orgs by rewriting the path id (preserving stable section/query params). The query-param surface `/internal/org-settings` is removed (404; no soft-redirect). Other tenant-scoped tools keep `?tenantId=`.

## Goals

1. `/internal` → redirect to `/internal/organizations`.
2. Sidebar: remove Overview and Organization Settings; keep Organizations (and other tools unchanged).
3. Org list row → `/internal/organizations/[id]` (settings via path).
4. Header tenant picker always visible on `/internal/organizations/[id]` and nested under that id.
5. Picker change: rewrite id segment; preserve search params; drop path suffix after the id when nested.
6. Delete `/internal/org-settings` (404); clean nav, route helpers, and `recordBasePath` wiring that existed only for that URL.

## Non-goals

- Path-based routing for billing, AI usage, Microsoft tools, management commands, ACCA import.
- Soft-redirects from `/internal/org-settings` or `?tenantId=` org-settings URLs.
- Changing Platform **Internal tools** entry target beyond staying on the org list.
- Changing Exit / access gates / which orgs appear in the tenant picker (including admin-org targeting rules).

## Locked decisions

| Topic | Choice |
| --- | --- |
| Root | `/internal` redirects to `/internal/organizations` |
| Overview | Removed from sidebar; not a destination |
| Org settings URL | Path-based `/internal/organizations/[id]` only |
| Old `/internal/org-settings` | Remove (404); no soft-redirect |
| Sidebar Organization Settings | Removed |
| List row click | `/internal/organizations/[id]` (unchanged path) |
| Tenant picker on org record | Always visible (header) |
| Picker sync on org record | Path id; not `?tenantId=` |
| Tenant switch query | Preserve search string (`section`, pane, etc.) |
| Tenant switch nested path | Drop suffix after `[id]`; land on `/internal/organizations/{newId}?…` |
| Clear picker on org record | Not supported (no-op / omit clear) — record always has an id |
| Other internal tools | Unchanged `?tenantId=` via `useInternalTenant` |
| Approach | Dual-mode picker (path on org record; query elsewhere) |

## Behavior

### Navigation

| Surface | Behavior |
| --- | --- |
| `/internal` | Redirect → `/internal/organizations` |
| Sidebar | No Overview; no Organization Settings |
| `/internal/organizations` | List + Create (no header tenant picker) |
| `/internal/organizations/create` | Create (no header tenant picker) |
| `/internal/organizations/[id]…` | Platform `OrgRecordShell`; header tenant picker visible |
| `/internal/org-settings` | 404 |

### Tenant picker (dual-mode)

```
isOrgRecordPath(/internal/organizations/:id…)
  → value from path id
  → onChange → router.push(/internal/organizations/{newId} + current search)
  → nested …/9/admins/create?x=1 + pick 12 → /internal/organizations/12?x=1

isInternalTenantScopedPath (billing, ai-usage, microsoft, …)
  → existing ?tenantId= / useInternalTenant
```

List and create are neither: picker hidden.

### Section links

Platform org record section/OAuth hrefs use default `/internal/organizations/${orgId}?section=…` (no `basePath` forcing `/internal/org-settings`, no `tenantId` query for that surface). Remove `recordBasePath="/internal/org-settings"` usage with the deleted page.

## Architecture (FE)

| Area | Change |
| --- | --- |
| `internal/page.tsx` | Redirect to organizations (replace overview hub) |
| `internal-nav-routes.tsx` | Drop Overview + Organization Settings; simplify `isInternalNavItemActive` if overview exact-match is unused |
| `internal/org-settings/` | Delete route module |
| `internal-route-access.ts` | Remove `/internal/org-settings` from tenant-scoped prefixes; add helper (or extend shell check) for org-record path picker visibility |
| `InternalAppShell` | Show picker when org-record path **or** query tenant-scoped path |
| `InternalTenantPicker` / hook | Path mode when on org-record routes; query mode otherwise |
| `org-section-href` + tests | Drop org-settings / `tenantId`-via-`basePath` expectations for that surface |
| Overview `TOOL_DESCRIPTIONS` | Gone with overview page (or unused) |

## Error handling

| Case | Behavior |
| --- | --- |
| Invalid `[id]` / load failure | Existing record-shell error UI; picker remains so staff can switch to a valid org |
| Nested route + tenant switch | Suffix after id dropped; search preserved |
| Stale bookmark to `/internal/org-settings` | 404 |

## Testing (high-value)

- Nav config: Overview and Organization Settings absent.
- Shell: picker shown on `/internal/organizations/9` (and nested); hidden on list/create.
- Path-mode picker: id rewrite preserves query; nested suffix stripped.
- `orgSectionHref` / base path: no `/internal/org-settings` or forced `tenantId` for platform default paths.
- Route helpers: `/internal/org-settings` removed from tenant-scoped list; org-record visibility covered.

Avoid happy-path-only “overview renders” or tautological link-list smoke.

## Revises relative to 2026-07-18

- Entry already preferred org list; this makes `/internal` itself redirect there and removes the Overview hub from IA.
- Org Settings is no longer a separate sidebar item or `?tenantId=` twin surface; path-based platform record is the only settings entry from the list.
- Tenant picker becomes visible on platform org record paths (previously query-scoped tools only).
