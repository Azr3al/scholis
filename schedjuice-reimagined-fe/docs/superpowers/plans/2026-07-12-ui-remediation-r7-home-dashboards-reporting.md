# Home Dashboards Reporting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair home, management dashboard, analytics shortcuts, and user-activity reporting routes for consistent page composition, chart/card hierarchy, date-picker overlays, and responsive overflow.

**Architecture:** Dashboard and shortcut pages migrate off `@/app/_chrome/{card,chart,date-picker,table}` to R4/R5 primitives. Home adopts `PageContainer` + `usePageHeader` instead of ad-hoc max-width wrappers. Chart/toolbar rows use R5 three-zone composition (dominant metrics, supporting filters, quiet legends).

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind v4 semantic tokens (`.sj-root`), Vitest (`npm run test:unit`), Playwright (`npm run test:browser` post-R0 merge), TanStack Query, ResourceTable, AutoForm.

**Spec:** `docs/superpowers/specs/2026-07-12-ui-migration-remediation-program-design.md`

**Planning baseline SHA:** `05ac447b10966131d4f37a2ba724110c33d66dd4` on `dev`

**Dependencies (must be merged before starting):**
- `docs/superpowers/plans/2026-07-12-ui-remediation-r0-verification-foundation.md`
- `docs/superpowers/plans/2026-07-12-ui-remediation-r1-design-authority-theme.md`
- `docs/superpowers/plans/2026-07-12-ui-remediation-r2-overlay-portal-stack.md`
- `docs/superpowers/plans/2026-07-12-ui-remediation-r3-table-contracts.md`
- `docs/superpowers/plans/2026-07-12-ui-remediation-r4-form-control-contracts.md`
- `docs/superpowers/plans/2026-07-12-ui-remediation-r5-page-composition-contracts.md`

**Route count:** 20 product routes (excludes design/debug/artifacts and all finance R11–R14 routes)

All FE commands run from `schedjuice-reimagined-fe/`.

## Current-state evidence (base `05ac447b`)

| Location | Issue |
| --- | --- |
| `src/app/(internal)/home/page.tsx:5-7` | Ad-hoc `max-w-[1400px] px-4 py-8` — not `PageContainer` + R5 density |
| `src/app/(internal)/management/dashboard/page.tsx` | Uses `_chrome/card` + mixed sj/legacy tokens |
| `src/app/(internal)/shortcuts/analytics/page.tsx` | Uses `_chrome/{card,chart,date-picker}` — overlay/width risk |
| `src/app/(internal)/shortcuts/starting-courses/page.tsx` | Nested `_chrome/card` + `_chrome/chart` stacks |
| 8/20 owned pages | Import `@/app/_chrome/*` at base SHA |
| 19/20 owned pages | Use `PageContainer` but header/title patterns inconsistent with R5 `PageHeader` |
| Cohort scan | `_chrome` pages: 8; legacy token pages: 12; missing PageContainer (internal): see manifest |

**Pages with `@/app/_chrome/*` imports (migrate in this plan):**

- `src/app/(internal)/management/dashboard/page.tsx`
- `src/app/(internal)/organizations/user-activity/login-activity/page.tsx`
- `src/app/(internal)/shortcuts/analytics/page.tsx`
- `src/app/(internal)/shortcuts/available-teachers/page.tsx`
- `src/app/(internal)/shortcuts/school-welcome/page.tsx`
- `src/app/(internal)/shortcuts/starting-courses/page.tsx`
- `src/app/(internal)/shortcuts/todays-classes/page.tsx`
- `src/app/(internal)/shortcuts/user-schedule/page.tsx`

**R5 contracts to consume (do not redefine):** `PageContainer`, `PageTitle`, `PageHeader`, `PageSection`, `usePageHeader`, `page-composition.ts` width/density map.

---


## Stop conditions

Stop and report (do not patch shared contracts locally) when:

1. Current branch base SHA differs from `05ac447b10966131d4f37a2ba724110c33d66dd4` and owned page files changed upstream — re-read routes and confirm plan validity.
2. Any file in **Forbidden shared files** below changed on your branch — escalate to the owning R1–R5 plan.
3. `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run build`, or `npm run test:browser` fails after your change and the failure is outside owned files.
4. Required auth storage state, dashboard data fixture, reporting fixture, or persona permission is unavailable — STOP before execution, report the affected route as BLOCKED, and do not run or skip any browser test.
5. A defect requires editing `src/components/data-table/resource-table.tsx`, `src/components/auto-form/**`, or `src/components/shell/**`.

**Escape hatch:** Document a narrow, evidence-backed exception in `docs/superpowers/specs/ui-remediation-exceptions.md` and stop implementation until approved.

---

## Forbidden shared files

| Path | Owner plan | Reason |
| --- | --- | --- |
| `src/app/globals.css` | R1 | Token vocabulary and theme runtime |
| `src/components/shell/**` | R5 (+ R2 for overlays in shell) | App shell, sidebar, panel header |
| `src/components/primitives/**` | R2/R4 | Overlay and control primitives |
| `src/components/data-table/resource-table.tsx` | R3 | Table engine |
| `src/components/data-table/types.ts` | R3 | Column contract types |
| `src/components/auto-form/**` | R4 | AutoForm width and field mapping |
| `src/components/layout/page-container.tsx` | R5 | Page width contract (consume only) |
| `src/components/typography/h1.tsx` | R5 | Page title scale (consume only) |
| `src/lib/layout/page-width.ts` | R5 | Width tokens (consume only) |
| `src/app/_chrome/**` | R1/R4 | Legacy shim — do not extend; migrate imports out |
| `src/components/finances/**` | R11–R14 | Finance serialized cohorts |
| `docs/ui-remediation/route-manifest.json` | R15 | Manifest inventory and QA status |

---

## Owned files

### Page routes (20)

- `src/app/(internal)/home/page.tsx`
- `src/app/(internal)/management/dashboard/page.tsx`
- `src/app/(internal)/management/reports/classes-data/page.tsx`
- `src/app/(internal)/management/reports/page.tsx`
- `src/app/(internal)/organizations/user-activity/login-activity/page.tsx`
- `src/app/(internal)/organizations/user-activity/page.tsx`
- `src/app/(internal)/shortcuts/analytics/page.tsx`
- `src/app/(internal)/shortcuts/available-teachers/page.tsx`
- `src/app/(internal)/shortcuts/course-data/page.tsx`
- `src/app/(internal)/shortcuts/course-insights/page.tsx`
- `src/app/(internal)/shortcuts/meeting-link-sheet/page.tsx`
- `src/app/(internal)/shortcuts/page.tsx`
- `src/app/(internal)/shortcuts/school-welcome/page.tsx`
- `src/app/(internal)/shortcuts/staff-data/page.tsx`
- `src/app/(internal)/shortcuts/starting-courses/page.tsx`
- `src/app/(internal)/shortcuts/student-data/page.tsx`
- `src/app/(internal)/shortcuts/todays-classes/page.tsx`
- `src/app/(internal)/shortcuts/unpaid-course-counts/page.tsx`
- `src/app/(internal)/shortcuts/user-insights/page.tsx`
- `src/app/(internal)/shortcuts/user-schedule/page.tsx`

### Route-local component directories

- `src/components/home/` (route-local components; modify only files imported by owned pages)
- `src/components/management/` (route-local components; modify only files imported by owned pages)
- `src/components/shortcuts/` (route-local components; modify only files imported by owned pages)
- `src/components/user-activity/` (route-local components; modify only files imported by owned pages)
- `src/components/reports/` (route-local components; modify only files imported by owned pages)

### New helper modules (this plan)

- Create: `src/lib/ui-remediation/r7-dashboard-layout-classes.ts`
- Create: `src/lib/ui-remediation/r7-dashboard-layout-classes.test.ts`
- Create: `e2e/r7-home-dashboards-reporting.spec.ts` (Playwright — post-R0 harness)

---

## Route manifest (R7)

| Route | Page file | Persona / permission | Shared patterns | Risk | Verification |
| --- | --- | --- | --- | --- | --- |
| `/(internal)/home` | `src/app/(internal)/home/page.tsx` | admin/teacher/student — Role-specific home widgets | missing-PageContainer, custom-container-not-PageContainer | low | manual |
| `/(internal)/management/dashboard` | `src/app/(internal)/management/dashboard/page.tsx` | principal/admin — Management dashboard | stale-_chrome, sj-tokens | high | automated + manual |
| `/(internal)/management/reports/classes-data` | `src/app/(internal)/management/reports/classes-data/page.tsx` | principal/admin — Reporting hub | shell-delegated | low | manual |
| `/(internal)/management/reports` | `src/app/(internal)/management/reports/page.tsx` | principal/admin — Reporting hub | sj-tokens | low | manual |
| `/(internal)/organizations/user-activity/login-activity` | `src/app/(internal)/organizations/user-activity/login-activity/page.tsx` | platform admin — Org activity analytics | stale-_chrome, sj-tokens | medium | representative automated + manual |
| `/(internal)/organizations/user-activity` | `src/app/(internal)/organizations/user-activity/page.tsx` | platform admin — Org activity analytics | sj-tokens | low | manual |
| `/(internal)/shortcuts/analytics` | `src/app/(internal)/shortcuts/analytics/page.tsx` | admin/principal — Operational shortcut/report | stale-_chrome, legacy-tokens | medium | representative automated + manual |
| `/(internal)/shortcuts/available-teachers` | `src/app/(internal)/shortcuts/available-teachers/page.tsx` | admin/principal — Operational shortcut/report | stale-_chrome, legacy-tokens | medium | representative automated + manual |
| `/(internal)/shortcuts/course-data` | `src/app/(internal)/shortcuts/course-data/page.tsx` | admin/principal — Operational shortcut/report | legacy-tokens | low | manual |
| `/(internal)/shortcuts/course-insights` | `src/app/(internal)/shortcuts/course-insights/page.tsx` | admin/principal — Operational shortcut/report | legacy-tokens | low | manual |
| `/(internal)/shortcuts/meeting-link-sheet` | `src/app/(internal)/shortcuts/meeting-link-sheet/page.tsx` | admin/principal — Operational shortcut/report | legacy-tokens | low | manual |
| `/(internal)/shortcuts` | `src/app/(internal)/shortcuts/page.tsx` | admin/principal — Operational shortcut/report | sj-tokens | low | manual |
| `/(internal)/shortcuts/school-welcome` | `src/app/(internal)/shortcuts/school-welcome/page.tsx` | admin/principal — Operational shortcut/report | stale-_chrome, legacy-tokens | medium | representative automated + manual |
| `/(internal)/shortcuts/staff-data` | `src/app/(internal)/shortcuts/staff-data/page.tsx` | admin/principal — Operational shortcut/report | legacy-tokens | low | manual |
| `/(internal)/shortcuts/starting-courses` | `src/app/(internal)/shortcuts/starting-courses/page.tsx` | admin/principal — Operational shortcut/report | stale-_chrome, legacy-tokens | medium | representative automated + manual |
| `/(internal)/shortcuts/student-data` | `src/app/(internal)/shortcuts/student-data/page.tsx` | admin/principal — Operational shortcut/report | legacy-tokens | low | manual |
| `/(internal)/shortcuts/todays-classes` | `src/app/(internal)/shortcuts/todays-classes/page.tsx` | admin/principal — Operational shortcut/report | stale-_chrome, legacy-tokens | medium | representative automated + manual |
| `/(internal)/shortcuts/unpaid-course-counts` | `src/app/(internal)/shortcuts/unpaid-course-counts/page.tsx` | admin/principal — Finance-adjacent shortcut; UI only (no payment edit) | sj-tokens | low | manual |
| `/(internal)/shortcuts/user-insights` | `src/app/(internal)/shortcuts/user-insights/page.tsx` | admin/principal — Operational shortcut/report | legacy-tokens | low | manual |
| `/(internal)/shortcuts/user-schedule` | `src/app/(internal)/shortcuts/user-schedule/page.tsx` | admin/principal — Operational shortcut/report | stale-_chrome, legacy-tokens | medium | representative automated + manual |

---

## Verification commands

Post-R0 baseline (must pass before and after every batch):

| Command | Expected (post-R0 merge) |
| --- | --- |
| `npm run lint` | Exit 0 |
| `npm run typecheck` | Exit 0 |
| `npm run test:unit` | Exit 0; all unit tests pass |
| `npm run build` | Exit 0; production build completes |
| `npm run test:browser` | Exit 0; Playwright suite green with zero skipped tests |

**Cohort-scoped unit test:**

```bash
npm run test:unit -- src/lib/ui-remediation/r7-dashboard-layout-classes.test.ts
```

Expected: all tests PASS

**Cohort-scoped browser test:**

```bash
npm run test:browser -- e2e/r7-home-dashboards-reporting.spec.ts
```

Expected: all tests PASS; screenshots written to `e2e/screenshots/r7/`

**Production build smoke:**

```bash
npm run build
```

Expected: Exit 0

---

## Role, theme, and viewport matrix

| Surface | Roles | Themes | Viewports | Notes |
| --- | --- | --- | --- | --- |
| Representative automated route `/(internal)/management/dashboard` | See route manifest persona column | light + dark | 1280×800 desktop; 390×844 mobile | Primary browser spec |
| All `R7` routes | Per manifest | light required; dark where internal shell | desktop 1280; mobile 390 for routes with toolbars/tables | Manual checklist below |
| Overlay-heavy routes (date pickers, dialogs, comboboxes) | Same as route | both | desktop | Verify R2 layer: dropdown above sticky toolbar |

---

## Manual route checklist

- [ ] `/(internal)/home` — admin/teacher/student; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/management/dashboard` — principal/admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/management/reports/classes-data` — principal/admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/management/reports` — principal/admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/organizations/user-activity/login-activity` — platform admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/organizations/user-activity` — platform admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/shortcuts/analytics` — admin/principal; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/shortcuts/available-teachers` — admin/principal; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/shortcuts/course-data` — admin/principal; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/shortcuts/course-insights` — admin/principal; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/shortcuts/meeting-link-sheet` — admin/principal; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/shortcuts` — admin/principal; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/shortcuts/school-welcome` — admin/principal; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/shortcuts/staff-data` — admin/principal; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/shortcuts/starting-courses` — admin/principal; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/shortcuts/student-data` — admin/principal; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/shortcuts/todays-classes` — admin/principal; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/shortcuts/unpaid-course-counts` — admin/principal; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/shortcuts/user-insights` — admin/principal; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/shortcuts/user-schedule` — admin/principal; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present

---

## Mechanical migration batches

#### Batch A — home (`home`)

**Files (explicit):**

- `src/app/(internal)/home/page.tsx`

**Mechanical rules:**

1. Replace `@/app/_chrome/*` imports with `@/components/primitives/*` or `@/components/layout/*` equivalents merged in R4.

2. Replace legacy token classes (`text-muted-foreground`, `bg-card`, `bg-background`, `text-foreground`) with semantic `.sj-root` tokens from R1 (`text-text-muted`, `bg-surface`, `text-text-primary`, `border-border`).

3. Wrap internal page bodies in `PageContainer` with width from R5 (`default` unless route is dense ops — then `full`).

4. Set page title/actions via `usePageHeader` (R5); remove inline duplicate H1/`AcademicPageHeader` where shell header suffices.

5. Card stacks: at most one elevated surface per section; nested `Card` inside `Card` is flattened to section + `Separator`.

6. Controls in toolbars: `size="sm"` + `className="w-auto min-w-[8rem]"`; form fields: `className="w-full"` per R4.

7. Preserve all data fetching, mutations, permissions, and navigation behavior — styling/layout only.

8. Add/update route-local column metadata for ResourceTable pages per R3 helpers (do not edit `resource-table.tsx`).


**Commit boundary:** one commit per batch after unit + targeted browser checks pass.

#### Batch B — management (`management`)

**Files (explicit):**

- `src/app/(internal)/management/dashboard/page.tsx`
- `src/app/(internal)/management/reports/classes-data/page.tsx`
- `src/app/(internal)/management/reports/page.tsx`

**Mechanical rules:**

1. Replace `@/app/_chrome/*` imports with `@/components/primitives/*` or `@/components/layout/*` equivalents merged in R4.

2. Replace legacy token classes (`text-muted-foreground`, `bg-card`, `bg-background`, `text-foreground`) with semantic `.sj-root` tokens from R1 (`text-text-muted`, `bg-surface`, `text-text-primary`, `border-border`).

3. Wrap internal page bodies in `PageContainer` with width from R5 (`default` unless route is dense ops — then `full`).

4. Set page title/actions via `usePageHeader` (R5); remove inline duplicate H1/`AcademicPageHeader` where shell header suffices.

5. Card stacks: at most one elevated surface per section; nested `Card` inside `Card` is flattened to section + `Separator`.

6. Controls in toolbars: `size="sm"` + `className="w-auto min-w-[8rem]"`; form fields: `className="w-full"` per R4.

7. Preserve all data fetching, mutations, permissions, and navigation behavior — styling/layout only.

8. Add/update route-local column metadata for ResourceTable pages per R3 helpers (do not edit `resource-table.tsx`).


**Commit boundary:** one commit per batch after unit + targeted browser checks pass.

#### Batch C — shortcuts index (`shortcuts-index`)

**Files (explicit):**

- `src/app/(internal)/shortcuts/page.tsx`

**Mechanical rules:**

1. Replace `@/app/_chrome/*` imports with `@/components/primitives/*` or `@/components/layout/*` equivalents merged in R4.

2. Replace legacy token classes (`text-muted-foreground`, `bg-card`, `bg-background`, `text-foreground`) with semantic `.sj-root` tokens from R1 (`text-text-muted`, `bg-surface`, `text-text-primary`, `border-border`).

3. Wrap internal page bodies in `PageContainer` with width from R5 (`default` unless route is dense ops — then `full`).

4. Set page title/actions via `usePageHeader` (R5); remove inline duplicate H1/`AcademicPageHeader` where shell header suffices.

5. Card stacks: at most one elevated surface per section; nested `Card` inside `Card` is flattened to section + `Separator`.

6. Controls in toolbars: `size="sm"` + `className="w-auto min-w-[8rem]"`; form fields: `className="w-full"` per R4.

7. Preserve all data fetching, mutations, permissions, and navigation behavior — styling/layout only.

8. Add/update route-local column metadata for ResourceTable pages per R3 helpers (do not edit `resource-table.tsx`).


**Commit boundary:** one commit per batch after unit + targeted browser checks pass.

#### Batch D — shortcut reports (`shortcuts-reports`)

**Files (explicit):**

- `src/app/(internal)/shortcuts/analytics/page.tsx`
- `src/app/(internal)/shortcuts/available-teachers/page.tsx`
- `src/app/(internal)/shortcuts/course-data/page.tsx`
- `src/app/(internal)/shortcuts/course-insights/page.tsx`
- `src/app/(internal)/shortcuts/meeting-link-sheet/page.tsx`
- `src/app/(internal)/shortcuts/school-welcome/page.tsx`
- `src/app/(internal)/shortcuts/staff-data/page.tsx`
- `src/app/(internal)/shortcuts/starting-courses/page.tsx`
- `src/app/(internal)/shortcuts/student-data/page.tsx`
- `src/app/(internal)/shortcuts/todays-classes/page.tsx`
- `src/app/(internal)/shortcuts/unpaid-course-counts/page.tsx`
- `src/app/(internal)/shortcuts/user-insights/page.tsx`
- `src/app/(internal)/shortcuts/user-schedule/page.tsx`

**Mechanical rules:**

1. Replace `@/app/_chrome/*` imports with `@/components/primitives/*` or `@/components/layout/*` equivalents merged in R4.

2. Replace legacy token classes (`text-muted-foreground`, `bg-card`, `bg-background`, `text-foreground`) with semantic `.sj-root` tokens from R1 (`text-text-muted`, `bg-surface`, `text-text-primary`, `border-border`).

3. Wrap internal page bodies in `PageContainer` with width from R5 (`default` unless route is dense ops — then `full`).

4. Set page title/actions via `usePageHeader` (R5); remove inline duplicate H1/`AcademicPageHeader` where shell header suffices.

5. Card stacks: at most one elevated surface per section; nested `Card` inside `Card` is flattened to section + `Separator`.

6. Controls in toolbars: `size="sm"` + `className="w-auto min-w-[8rem]"`; form fields: `className="w-full"` per R4.

7. Preserve all data fetching, mutations, permissions, and navigation behavior — styling/layout only.

8. Add/update route-local column metadata for ResourceTable pages per R3 helpers (do not edit `resource-table.tsx`).


**Commit boundary:** one commit per batch after unit + targeted browser checks pass.

#### Batch E — user activity (`user-activity`)

**Files (explicit):**

- `src/app/(internal)/organizations/user-activity/login-activity/page.tsx`
- `src/app/(internal)/organizations/user-activity/page.tsx`

**Mechanical rules:**

1. Replace `@/app/_chrome/*` imports with `@/components/primitives/*` or `@/components/layout/*` equivalents merged in R4.

2. Replace legacy token classes (`text-muted-foreground`, `bg-card`, `bg-background`, `text-foreground`) with semantic `.sj-root` tokens from R1 (`text-text-muted`, `bg-surface`, `text-text-primary`, `border-border`).

3. Wrap internal page bodies in `PageContainer` with width from R5 (`default` unless route is dense ops — then `full`).

4. Set page title/actions via `usePageHeader` (R5); remove inline duplicate H1/`AcademicPageHeader` where shell header suffices.

5. Card stacks: at most one elevated surface per section; nested `Card` inside `Card` is flattened to section + `Separator`.

6. Controls in toolbars: `size="sm"` + `className="w-auto min-w-[8rem]"`; form fields: `className="w-full"` per R4.

7. Preserve all data fetching, mutations, permissions, and navigation behavior — styling/layout only.

8. Add/update route-local column metadata for ResourceTable pages per R3 helpers (do not edit `resource-table.tsx`).


**Commit boundary:** one commit per batch after unit + targeted browser checks pass.


---

### Task 1: Route layout helper (R7)

**Files:**
- Create: `src/lib/ui-remediation/r7-dashboard-layout-classes.ts`
- Create: `src/lib/ui-remediation/r7-dashboard-layout-classes.test.ts`

- [x] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import {
  dashboardFilterToolbarClassName,
  dashboardMetricGridClassName,
  dashboardSectionStackClassName,
} from "./r7-dashboard-layout-classes";

describe("dashboardSectionStackClassName", () => {
  it("uses larger gap for comfortable density", () => {
    expect(dashboardSectionStackClassName("comfortable")).toContain("gap-6");
  });
});

describe("dashboardMetricGridClassName", () => {
  it("includes responsive columns for 4-up metrics", () => {
    expect(dashboardMetricGridClassName(4)).toContain("xl:grid-cols-4");
  });
});

describe("dashboardFilterToolbarClassName", () => {
  it("wraps filters without forcing fixed widths", () => {
    expect(dashboardFilterToolbarClassName()).toContain("flex-wrap");
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/ui-remediation/r7-dashboard-layout-classes.test.ts`

Expected: FAIL with "Cannot find module" or missing export

- [x] **Step 3: Write minimal implementation**

```typescript
export function dashboardSectionStackClassName(density: "comfortable" | "compact" = "comfortable"): string {
  return density === "compact" ? "flex flex-col gap-4" : "flex flex-col gap-6";
}

export function dashboardMetricGridClassName(columnCount: 2 | 3 | 4): string {
  const cols = {
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4",
  } as const;
  return `grid min-w-0 gap-4 ${cols[columnCount]}`;
}

export function dashboardFilterToolbarClassName(): string {
  return "flex min-w-0 flex-wrap items-end gap-3";
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/ui-remediation/r7-dashboard-layout-classes.test.ts`

Expected: PASS (3+ tests)

- [x] **Step 5: Commit**

```bash
git add src/lib/ui-remediation/r7-dashboard-layout-classes.ts src/lib/ui-remediation/r7-dashboard-layout-classes.test.ts
git commit -m "$(cat <<'EOF'
feat(ui-r7): add route layout helper for home dashboards reporting

EOF
)"
```

---

### Task 2: Representative browser spec (R7)

**Files:**
- Create: `e2e/r7-home-dashboards-reporting.spec.ts`

- [x] **Step 1: Write failing Playwright spec**

```typescript
import { test, expect } from "@playwright/test";

test.describe("R7 representative routes", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  test("/management/dashboard has no document horizontal overflow", async ({ page }) => {
    await page.goto("/management/dashboard");
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });

  test("/management/dashboard panel header visible in light and dark", async ({ page }) => {
    await page.goto("/management/dashboard");
    await page.waitForLoadState("networkidle");
    const header = page.locator("[data-testid='panel-header']");
    await expect(header).toBeVisible();
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(header).toBeVisible();
  });
});
```

- [x] **Step 2: Confirm browser preconditions, then verify the new assertions fail**

Before running, confirm `e2e/.auth/admin.json`, dashboard/reporting fixture data, and the `/management/dashboard` route are available. If any precondition is missing, STOP and report R7 BLOCKED; do not execute with skipped tests.

Run: `npm run test:browser -- e2e/r7-home-dashboards-reporting.spec.ts`

Expected: Auth and fixture setup succeeds, no test is skipped, and the new layout assertion fails before the route migration. Missing setup is a STOP/BLOCKED condition, not an expected test failure.

- [x] **Step 3: Commit spec**

```bash
git add e2e/r7-home-dashboards-reporting.spec.ts
git commit -m "$(cat <<'EOF'
test(ui-r7): add representative browser spec for home dashboards reporting

EOF
)"
```

---

## Independent QA handoff prompt

Paste verbatim to a fresh QA subagent (read-only — no patching):

```
You are independent QA for UI remediation plan R7 (Home Dashboards Reporting).
Base SHA target: 05ac447b10966131d4f37a2ba724110c33d66dd4 (final verification on integrated main after all cohorts merge).

Acceptance criteria:
1. All 20 routes in the manifest table pass verification mode listed.
2. No `@/app/_chrome/*` imports remain in owned page or route-local component files.
3. No legacy token classes (`text-muted-foreground`, `bg-card`, `bg-background`, `text-foreground`) in owned files unless covered by a documented R1 exception.
4. Internal routes use PageContainer + usePageHeader per R5 unless listed as documented dense/full-width exception.
5. npm run lint, typecheck, test:unit, build, test:browser pass with zero skipped tests.
6. Confirm auth storage state, dashboard/reporting data, and every required persona before running QA. If any is unavailable, STOP and report the affected route BLOCKED; do not run a reduced or skipped suite.

Fixture URLs (representative):
- /management/dashboard

Commands:
npm run lint
npm run typecheck
npm run test:unit -- src/lib/ui-remediation/r7-dashboard-layout-classes.test.ts
npm run test:browser -- e2e/r7-home-dashboards-reporting.spec.ts
npm run build

Return PASS/FAIL/BLOCKED per route with screenshot path, role, viewport, theme, reproduction steps for failures, and suspected owner plan (R1–R5 shared vs R7 local). BLOCKED means QA stopped before execution because a required fixture or auth precondition was missing; it never means a skipped test.
```

---

## Self-review (author checklist)

- [x] Spec §7 route family R7 — every owned product route listed exactly once
- [x] Spec §8 contracts — consumes R1–R5; forbidden shared files enumerated
- [x] Spec §9 verification — commands and browser assertions included
- [x] Spec §10 — stop conditions, commits, independent QA prompt present
- [x] Placeholder and omitted-code scan passed
