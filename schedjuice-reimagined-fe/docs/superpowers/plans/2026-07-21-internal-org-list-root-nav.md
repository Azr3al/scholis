# Internal Org List Root Nav Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the internal organizations list the `/internal` landing page, remove Overview and Organization Settings from the sidebar, delete `/internal/org-settings`, and show a path-synced header Tenant picker on `/internal/organizations/[id]` (and nested routes).

**Architecture:** Dual-mode tenant picker — path id on org-record routes (`/internal/organizations/\d+…`), `?tenantId=` elsewhere. Pure helpers in `internal-route-access.ts` decide visibility and build switch hrefs. Root `/internal` becomes a server redirect to the list.

**Tech Stack:** Next.js App Router, Vitest (`bun run test:unit`), existing `InternalAppShell` / `InternalTenantPicker` / `OrgRecordShell`.

**Spec:** `docs/superpowers/specs/2026-07-21-internal-org-list-root-nav-design.md`

## Global Constraints

- FE only (`schedjuice-reimagined-fe`). No backend changes.
- No soft-redirect from `/internal/org-settings` — delete the route (404).
- Do not migrate billing / AI / Microsoft / management / ACCA off `?tenantId=`.
- On org-record tenant switch: preserve search string; drop path suffix after `[id]`.
- Clearing the picker on an org-record path is a no-op (record always has an id).
- High-value tests only (auth/edge/behavior); no overview-renders smoke.
- Unit tests: `bun run test:unit -- <path>` from `schedjuice-reimagined-fe`.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/internal-route-access.ts` | Modify | Drop `org-settings` from query-scoped prefixes; add org-record path + picker visibility + href helpers |
| `src/lib/__tests__/internal-route-access.test.ts` | Modify | Cover new helpers; assert `org-settings` not query-scoped; org record ≠ query-scoped |
| `src/config/internal-nav-routes.tsx` | Modify | Remove Overview + Organization Settings; drop unused overview active-match if dead |
| `src/config/__tests__/internal-nav-routes.test.ts` | Create | Assert removed nav hrefs/titles absent |
| `src/app/(platform-internal)/internal/page.tsx` | Replace | Server `redirect("/internal/organizations")` |
| `src/app/(platform-internal)/internal/org-settings/page.tsx` | Delete | 404 that URL |
| `src/lib/org/org-section-href.ts` | Modify | Stop injecting `tenantId` when `basePath` is set |
| `src/lib/org/__tests__/org-section-href.test.ts` | Modify | Assert default platform paths; no org-settings/`tenantId` surface |
| `src/components/internal/internal-tenant-picker.tsx` | Modify | Path mode vs query mode |
| `src/components/shell/internal-app-shell.tsx` | Modify | Show picker via `shouldShowInternalTenantPicker` |
| `src/components/shell/internal-app-shell.test.tsx` | Modify | Org-record shown; list/create hidden; billing still shown |
| `src/components/org/record/org-record-shell.tsx` | Modify | Comment only (drop org-settings example) if needed |

---

### Task 1: Org-record path helpers + drop org-settings from query scope

**Files:**
- Modify: `src/lib/internal-route-access.ts`
- Modify: `src/lib/__tests__/internal-route-access.test.ts`

**Interfaces:**
- Consumes: existing `isInternalTenantScopedPath`
- Produces:
  - `isInternalOrgRecordPath(pathname: string): boolean`
  - `parseInternalOrgRecordId(pathname: string): string | null`
  - `buildInternalOrgRecordHref(orgId: string \| number, searchParams?: string \| URLSearchParams \| null): string`
  - `shouldShowInternalTenantPicker(pathname: string): boolean`

- [ ] **Step 1: Write the failing tests**

Replace / extend `src/lib/__tests__/internal-route-access.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import {
  buildInternalOrgRecordHref,
  isInternalOrgRecordPath,
  isInternalPath,
  isInternalPlatformOrgPath,
  isInternalTenantScopedPath,
  parseInternalOrgRecordId,
  shouldShowInternalTenantPicker,
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

describe("isInternalTenantScopedPath", () => {
  it("matches query-tenant tools and excludes org list/record and removed org-settings", () => {
    expect(isInternalTenantScopedPath("/internal/billing")).toBe(true);
    expect(isInternalTenantScopedPath("/internal/ai-usage")).toBe(true);
    expect(isInternalTenantScopedPath("/internal/org-settings")).toBe(false);
    expect(isInternalTenantScopedPath("/internal/organizations")).toBe(false);
    expect(isInternalTenantScopedPath("/internal/organizations/12")).toBe(
      false,
    );
    expect(isInternalTenantScopedPath("/internal/demo-artifacts")).toBe(false);
  });
});

describe("isInternalOrgRecordPath", () => {
  it("matches numeric org id and nested paths only", () => {
    expect(isInternalOrgRecordPath("/internal/organizations/12")).toBe(true);
    expect(
      isInternalOrgRecordPath("/internal/organizations/12/admins/create"),
    ).toBe(true);
    expect(isInternalOrgRecordPath("/internal/organizations")).toBe(false);
    expect(isInternalOrgRecordPath("/internal/organizations/create")).toBe(
      false,
    );
  });
});

describe("parseInternalOrgRecordId", () => {
  it("returns the id segment or null", () => {
    expect(parseInternalOrgRecordId("/internal/organizations/9")).toBe("9");
    expect(
      parseInternalOrgRecordId("/internal/organizations/9/admins/create"),
    ).toBe("9");
    expect(parseInternalOrgRecordId("/internal/organizations")).toBeNull();
    expect(parseInternalOrgRecordId("/internal/organizations/create")).toBeNull();
  });
});

describe("buildInternalOrgRecordHref", () => {
  it("rewrites to base record path and preserves search", () => {
    expect(buildInternalOrgRecordHref(12, "section=video&pane=usage")).toBe(
      "/internal/organizations/12?section=video&pane=usage",
    );
    expect(buildInternalOrgRecordHref("12", "?section=ai")).toBe(
      "/internal/organizations/12?section=ai",
    );
    expect(buildInternalOrgRecordHref(12, new URLSearchParams("x=1"))).toBe(
      "/internal/organizations/12?x=1",
    );
    expect(buildInternalOrgRecordHref(12, "")).toBe(
      "/internal/organizations/12",
    );
    expect(buildInternalOrgRecordHref(12, null)).toBe(
      "/internal/organizations/12",
    );
  });
});

describe("shouldShowInternalTenantPicker", () => {
  it("shows on org record or query-scoped tools; hides on list/create", () => {
    expect(shouldShowInternalTenantPicker("/internal/organizations/9")).toBe(
      true,
    );
    expect(
      shouldShowInternalTenantPicker("/internal/organizations/9/admins"),
    ).toBe(true);
    expect(shouldShowInternalTenantPicker("/internal/billing")).toBe(true);
    expect(shouldShowInternalTenantPicker("/internal/organizations")).toBe(
      false,
    );
    expect(
      shouldShowInternalTenantPicker("/internal/organizations/create"),
    ).toBe(false);
    expect(shouldShowInternalTenantPicker("/internal")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd schedjuice-reimagined-fe
bun run test:unit -- src/lib/__tests__/internal-route-access.test.ts
```

Expected: FAIL — new exports missing and/or `/internal/org-settings` still treated as tenant-scoped.

- [ ] **Step 3: Implement helpers**

Update `src/lib/internal-route-access.ts` to:

```ts
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

/** Internal tools that operate on an explicit school tenant (`?tenantId=`). */
const INTERNAL_TENANT_SCOPED_PREFIXES = [
  "/internal/billing",
  "/internal/ai-usage",
  "/internal/management-commands",
  "/internal/microsoft-bulk-repair",
  "/internal/microsoft-password-reset",
  "/internal/microsoft-health",
  "/internal/acca-spreadsheet-import",
] as const;

export function isInternalTenantScopedPath(pathname: string): boolean {
  return INTERNAL_TENANT_SCOPED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Platform org settings / record under `/internal/organizations/[id]…`. */
export function isInternalOrgRecordPath(pathname: string): boolean {
  return /^\/internal\/organizations\/\d+(?:\/|$)/.test(pathname);
}

export function parseInternalOrgRecordId(pathname: string): string | null {
  const match = pathname.match(/^\/internal\/organizations\/(\d+)(?:\/|$)/);
  return match?.[1] ?? null;
}

/**
 * Target href when switching org on a path-based record.
 * Always lands on `/internal/organizations/{id}` (drops nested suffixes).
 */
export function buildInternalOrgRecordHref(
  orgId: string | number,
  searchParams?: string | URLSearchParams | null,
): string {
  const raw =
    typeof searchParams === "string"
      ? searchParams.replace(/^\?/, "")
      : (searchParams?.toString() ?? "");
  const qs = raw ? `?${raw}` : "";
  return `/internal/organizations/${orgId}${qs}`;
}

export function shouldShowInternalTenantPicker(pathname: string): boolean {
  return (
    isInternalOrgRecordPath(pathname) || isInternalTenantScopedPath(pathname)
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd schedjuice-reimagined-fe
bun run test:unit -- src/lib/__tests__/internal-route-access.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/lib/internal-route-access.ts src/lib/__tests__/internal-route-access.test.ts
git commit -m "$(cat <<'EOF'
feat(fe): org-record path helpers for internal tenant picker

Detect /internal/organizations/[id] for picker visibility and build path
switches; drop removed org-settings from query-scoped prefixes.
EOF
)"
```

---

### Task 2: Sidebar IA + `/internal` redirect + delete org-settings page

**Files:**
- Modify: `src/config/internal-nav-routes.tsx`
- Create: `src/config/__tests__/internal-nav-routes.test.ts`
- Replace: `src/app/(platform-internal)/internal/page.tsx`
- Delete: `src/app/(platform-internal)/internal/org-settings/page.tsx`

**Interfaces:**
- Consumes: none from Task 1
- Produces: `internalNavLinks` without Overview / Organization Settings; `/internal` → organizations

- [ ] **Step 1: Write the failing nav test**

Create `src/config/__tests__/internal-nav-routes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  internalNavLinks,
  isInternalNavItemActive,
} from "../internal-nav-routes";

describe("internalNavLinks", () => {
  it("omits Overview and Organization Settings", () => {
    const hrefs = internalNavLinks.map((item) => item.href);
    const titles = internalNavLinks.map((item) => item.title);
    expect(hrefs).not.toContain("/internal");
    expect(hrefs).not.toContain("/internal/org-settings");
    expect(titles).not.toContain("Overview");
    expect(titles).not.toContain("Organization Settings");
    expect(hrefs).toContain("/internal/organizations");
  });
});

describe("isInternalNavItemActive", () => {
  it("matches organizations self and nested record paths", () => {
    expect(
      isInternalNavItemActive(
        "/internal/organizations",
        "/internal/organizations",
      ),
    ).toBe(true);
    expect(
      isInternalNavItemActive(
        "/internal/organizations/9",
        "/internal/organizations",
      ),
    ).toBe(true);
    expect(
      isInternalNavItemActive("/internal/billing", "/internal/organizations"),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd schedjuice-reimagined-fe
bun run test:unit -- src/config/__tests__/internal-nav-routes.test.ts
```

Expected: FAIL — Overview / Organization Settings still present.

- [ ] **Step 3: Update nav config**

Edit `src/config/internal-nav-routes.tsx`:

- Remove the Overview and Organization Settings entries.
- Remove unused icon imports (`Bug`, `Settings`) if nothing else uses them.
- Simplify `isInternalNavItemActive` to prefix matching only (no `/internal` exact-match special case):

```ts
export function isInternalNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
```

Keep Organizations as the first item (existing order otherwise unchanged):

```ts
export const internalNavLinks: InternalNavItem[] = [
  { title: "Organizations", href: "/internal/organizations", icon: Building2 },
  { title: "Billing", href: "/internal/billing", icon: Receipt },
  // ... remaining tools unchanged (AI Usage, Management Commands, …)
];
```

- [ ] **Step 4: Replace overview page with redirect**

Replace `src/app/(platform-internal)/internal/page.tsx` entirely with a server component:

```tsx
import { redirect } from "next/navigation";

export default function InternalIndexPage() {
  redirect("/internal/organizations");
}
```

- [ ] **Step 5: Delete org-settings route**

Delete `src/app/(platform-internal)/internal/org-settings/page.tsx` (and empty `org-settings` directory if left behind).

- [ ] **Step 6: Run nav tests**

Run:

```bash
cd schedjuice-reimagined-fe
bun run test:unit -- src/config/__tests__/internal-nav-routes.test.ts
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
cd schedjuice-reimagined-fe
git add \
  src/config/internal-nav-routes.tsx \
  src/config/__tests__/internal-nav-routes.test.ts \
  src/app/\(platform-internal\)/internal/page.tsx
git rm -f src/app/\(platform-internal\)/internal/org-settings/page.tsx
git commit -m "$(cat <<'EOF'
feat(fe): land internal mode on org list and drop org-settings route

Redirect /internal to organizations; remove Overview and Organization
Settings from the sidebar; delete the query-param org-settings page.
EOF
)"
```

---

### Task 3: Platform section hrefs without org-settings / tenantId injection

**Files:**
- Modify: `src/lib/org/org-section-href.ts`
- Modify: `src/lib/org/__tests__/org-section-href.test.ts`
- Modify: `src/components/org/record/org-record-shell.tsx` (comment only)

**Interfaces:**
- Consumes: existing `orgSectionHref` / `orgRecordBasePath` signatures (keep `basePath` optional override; stop adding `tenantId`)
- Produces: platform default hrefs like `/internal/organizations/9?section=video`

- [ ] **Step 1: Rewrite failing tests for default platform surface**

Replace `src/lib/org/__tests__/org-section-href.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { orgRecordBasePath, orgSectionHref } from "../org-section-href";

describe("orgRecordBasePath", () => {
  it("uses platform org record path by default", () => {
    expect(orgRecordBasePath("platform", 9)).toBe("/internal/organizations/9");
  });

  it("uses tenant profile path for tenant mode", () => {
    expect(orgRecordBasePath("tenant", 9)).toBe("/organizations/profile");
  });

  it("prefers explicit basePath when provided", () => {
    expect(orgRecordBasePath("platform", 9, "/custom")).toBe("/custom");
  });
});

describe("orgSectionHref", () => {
  it("builds platform section links without tenantId query", () => {
    expect(orgSectionHref("platform", 9, "video")).toBe(
      "/internal/organizations/9?section=video",
    );
  });

  it("includes pane and date without injecting tenantId", () => {
    expect(
      orgSectionHref("platform", 9, "ai", {
        pane: "usage",
        date: "2026-07-01",
      }),
    ).toBe(
      "/internal/organizations/9?section=ai&pane=usage&date=2026-07-01",
    );
  });

  it("does not add tenantId when basePath override is set", () => {
    expect(
      orgSectionHref("platform", 9, "video", { basePath: "/custom" }),
    ).toBe("/custom?section=video");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd schedjuice-reimagined-fe
bun run test:unit -- src/lib/org/__tests__/org-section-href.test.ts
```

Expected: FAIL — current code still injects `tenantId` when `basePath` is set / old expectations.

- [ ] **Step 3: Remove tenantId injection**

In `src/lib/org/org-section-href.ts`, update types/docs and `orgSectionHref`:

```ts
export type OrgSectionHrefExtras = {
  pane?: OrgAiPane;
  date?: string;
  /** Stay on this path instead of the default org record route. */
  basePath?: string;
};

export function orgSectionHref(
  mode: OrgRecordMode,
  orgId: string | number,
  section: string,
  extras?: OrgSectionHrefExtras,
): string {
  const params = new URLSearchParams({ section });
  if (extras?.pane) params.set("pane", extras.pane);
  if (extras?.date) params.set("date", extras.date);
  return `${orgRecordBasePath(mode, orgId, extras?.basePath)}?${params.toString()}`;
}
```

Remove the `tenantId` field from `OrgSectionHrefExtras` and the `if (extras?.basePath) { params.set("tenantId", …) }` block.

Update the `recordBasePath` JSDoc on `OrgRecordShell` to reference `/internal/organizations/[id]` instead of `/internal/org-settings`.

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd schedjuice-reimagined-fe
bun run test:unit -- src/lib/org/__tests__/org-section-href.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add \
  src/lib/org/org-section-href.ts \
  src/lib/org/__tests__/org-section-href.test.ts \
  src/components/org/record/org-record-shell.tsx
git commit -m "$(cat <<'EOF'
fix(fe): stop injecting tenantId into platform org section hrefs

Path-based /internal/organizations/[id] is the settings surface; section
links no longer assume the removed org-settings query twin.
EOF
)"
```

---

### Task 4: Dual-mode InternalTenantPicker + shell visibility

**Files:**
- Modify: `src/components/internal/internal-tenant-picker.tsx`
- Modify: `src/components/shell/internal-app-shell.tsx`
- Modify: `src/components/shell/internal-app-shell.test.tsx`

**Interfaces:**
- Consumes: `parseInternalOrgRecordId`, `buildInternalOrgRecordHref`, `shouldShowInternalTenantPicker` from Task 1; `useInternalTenant` for query mode
- Produces: header picker path-sync on org records; unchanged `?tenantId=` elsewhere

- [ ] **Step 1: Update shell tests (failing until wired)**

Replace the tenant-picker cases in `src/components/shell/internal-app-shell.test.tsx` with:

```ts
describe("InternalAppShell", () => {
  beforeEach(() => {
    mockPathname.mockReturnValue("/internal/organizations");
  });

  afterEach(() => {
    cleanup();
  });

  it("shows header tenant picker on org record paths", () => {
    mockPathname.mockReturnValue("/internal/organizations/9");
    render(
      <InternalAppShell>
        <p>record</p>
      </InternalAppShell>,
    );

    const picker = screen.getByTestId("tenant-picker");
    expect(picker).toBeTruthy();
    expect(picker.getAttribute("data-variant")).toBe("header");
  });

  it("shows header tenant picker on nested org record paths", () => {
    mockPathname.mockReturnValue("/internal/organizations/9/admins/create");
    render(
      <InternalAppShell>
        <p>nested</p>
      </InternalAppShell>,
    );

    expect(screen.getByTestId("tenant-picker")).toBeTruthy();
  });

  it("shows header tenant picker on query tenant-scoped routes", () => {
    mockPathname.mockReturnValue("/internal/billing");
    render(
      <InternalAppShell>
        <p>billing</p>
      </InternalAppShell>,
    );

    expect(screen.getByTestId("tenant-picker")).toBeTruthy();
  });

  it("hides header tenant picker on org list", () => {
    mockPathname.mockReturnValue("/internal/organizations");
    render(
      <InternalAppShell>
        <p>orgs</p>
      </InternalAppShell>,
    );

    expect(screen.queryByTestId("tenant-picker")).toBeNull();
  });

  it("hides header tenant picker on org create", () => {
    mockPathname.mockReturnValue("/internal/organizations/create");
    render(
      <InternalAppShell>
        <p>create</p>
      </InternalAppShell>,
    );

    expect(screen.queryByTestId("tenant-picker")).toBeNull();
  });
});
```

Keep existing mocks (`next/link`, `next/navigation`, `InternalTenantPicker`, etc.) as already defined in that file. Ensure `usePathname` mock still drives `mockPathname`.

- [ ] **Step 2: Run shell tests to verify failure**

Run:

```bash
cd schedjuice-reimagined-fe
bun run test:unit -- src/components/shell/internal-app-shell.test.tsx
```

Expected: FAIL — org record path does not show picker yet (`isInternalTenantScopedPath` only).

- [ ] **Step 3: Wire shell visibility**

In `src/components/shell/internal-app-shell.tsx`, change import/usage:

```ts
import { shouldShowInternalTenantPicker } from "@/lib/internal-route-access";

// inside InternalShell:
const showTenantPicker = shouldShowInternalTenantPicker(pathname);
```

- [ ] **Step 4: Implement dual-mode picker**

Update `src/components/internal/internal-tenant-picker.tsx`:

```tsx
"use client";

import { useGetAllEntitiesQuery } from "@/components/form/entity-combobox";
import { EntityComboboxList } from "@/components/form/entity-combobox-list";
import { isValidApiEntityIdParam } from "@/helpers/relation-fk";
import { useInternalTenant } from "@/hooks/useInternalTenant";
import {
  buildInternalOrgRecordHref,
  parseInternalOrgRecordId,
} from "@/lib/internal-route-access";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";

type OrganizationRow = {
  id: number;
  name: string;
  is_admin?: boolean;
};

const ORG_QUERY_PARAMS = { fields: ["id", "name", "is_admin"] };

type InternalTenantPickerProps = {
  variant?: "default" | "header";
};

export function InternalTenantPicker({
  variant = "default",
}: InternalTenantPickerProps = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const orgRecordId = parseInternalOrgRecordId(pathname);
  const { tenantId, setTenantId } = useInternalTenant();
  const query = useGetAllEntitiesQuery("organizations", ORG_QUERY_PARAMS);

  const options = useMemo(() => {
    return ((query.data?.data?.data as OrganizationRow[] | undefined) ?? [])
      .filter(
        (c) =>
          c != null &&
          c.id != null &&
          isValidApiEntityIdParam(String(c.id)),
      )
      .map((c) => ({
        value: String(c.id),
        label: c.name,
      }));
  }, [query.data]);

  const value = orgRecordId ?? tenantId ?? "";

  return (
    <EntityComboboxList
      label="Tenant"
      isLoading={query.isLoading}
      value={value}
      onChange={(id) => {
        if (!id) {
          if (orgRecordId) return;
          setTenantId(null);
          return;
        }
        if (orgRecordId) {
          router.push(buildInternalOrgRecordHref(id, searchParams));
          return;
        }
        setTenantId(id);
      }}
      options={options}
      triggerClassName={
        variant === "header"
          ? "w-[min(16rem,40vw)] min-w-40"
          : "w-full min-w-56"
      }
    />
  );
}
```

- [ ] **Step 5: Run shell tests to verify they pass**

Run:

```bash
cd schedjuice-reimagined-fe
bun run test:unit -- src/components/shell/internal-app-shell.test.tsx
```

Expected: PASS

If `useSearchParams` needs a Suspense boundary and tests error: the picker is already under `<Suspense>` in the shell header path via children — if unit tests blow up, wrap the picker body that calls `useSearchParams` in a tiny inner component already suspended by the existing `<Suspense>{children}</Suspense>` / header Suspense, or mock `useSearchParams` in the shell test file:

```ts
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
```

(Update the existing `next/navigation` mock in `internal-app-shell.test.tsx` accordingly — picker is mocked there so this is only needed if the real picker is rendered in other tests.)

- [ ] **Step 6: Run the full related unit suite**

Run:

```bash
cd schedjuice-reimagined-fe
bun run test:unit -- \
  src/lib/__tests__/internal-route-access.test.ts \
  src/config/__tests__/internal-nav-routes.test.ts \
  src/lib/org/__tests__/org-section-href.test.ts \
  src/components/shell/internal-app-shell.test.tsx
```

Expected: all PASS

- [ ] **Step 7: Commit**

```bash
cd schedjuice-reimagined-fe
git add \
  src/components/internal/internal-tenant-picker.tsx \
  src/components/shell/internal-app-shell.tsx \
  src/components/shell/internal-app-shell.test.tsx
git commit -m "$(cat <<'EOF'
feat(fe): path-synced tenant picker on internal org records

Show the header Tenant control on /internal/organizations/[id] and switch
orgs by rewriting the path while preserving query params.
EOF
)"
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
| --- | --- |
| `/internal` → organizations | Task 2 |
| Remove Overview + Organization Settings from sidebar | Task 2 |
| Row → `/internal/organizations/[id]` (unchanged) | Already true; no code change |
| Picker always on org settings/record paths | Tasks 1 + 4 |
| Path rewrite; preserve search; drop nested suffix | Tasks 1 + 4 (`buildInternalOrgRecordHref`) |
| Delete `/internal/org-settings` (404, no redirect) | Task 2 |
| Other tools keep `?tenantId=` | Task 4 query branch; Task 1 prefixes |
| Clear picker no-op on record | Task 4 |
| Section hrefs without org-settings/`tenantId` | Task 3 |
| High-value tests listed in spec | Tasks 1–4 |

No placeholders left. Helper names consistent across tasks (`shouldShowInternalTenantPicker`, `buildInternalOrgRecordHref`, `parseInternalOrgRecordId`).
