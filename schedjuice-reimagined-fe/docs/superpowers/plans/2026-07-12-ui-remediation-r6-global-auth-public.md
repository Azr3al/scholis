# Global Auth Public Routes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify global shell interactions and repair authentication, public surfaces, notifications, search, and user-hub routes so they use R1–R5 contracts without local primitive forks.

**Architecture:** Route-local components adopt semantic tokens under `.sj-root`, replace stale `@/app/_chrome/*` imports with R1–R5 contract components, and align public/auth layouts with R5 page-width helpers. Shell overlay behavior (global find, account menu, theme toggle) is verified against R1/R2 but not edited here; shared-shell defects are routed back to the owning contract wave.

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

**Route count:** 16 product routes (excludes design/debug/artifacts and all finance R11–R14 routes)

All FE commands run from `schedjuice-reimagined-fe/`.

## Current-state evidence (base `05ac447b`)

| Location | Issue |
| --- | --- |
| `src/app/(public)/join-course/[code]/page.tsx` | Imports `@/app/_chrome/card` — stale shim (evidence at base SHA) |
| `src/app/(public)/register/layout.tsx` | Wraps registration in `@/app/_chrome/card` |
| `src/app/(public)/(tnc)/layout.tsx` | Legal pages use `_chrome/card` wrapper |
| `src/app/(internal)/notifications/page.tsx` | Uses `PageContainer` but legacy `text-muted-foreground` tokens |
| `src/app/(internal)/profile/page.tsx` | Missing `PageContainer`; delegates to profile components |
| `src/components/auth/login-form.tsx` | Auth form owns login visual hierarchy — verify token contrast R1 |
| Cohort scan | `_chrome` pages: 1; legacy token pages: 4; missing PageContainer (internal): see manifest |

**Pages with `@/app/_chrome/*` imports (migrate in this plan):**

- `src/app/(public)/join-course/[code]/page.tsx`

**R5 contracts to consume (do not redefine):** `PageContainer`, `PageTitle`, `PageHeader`, `PageSection`, `usePageHeader`, `page-composition.ts` width/density map.

---


## Stop conditions

Stop and report (do not patch shared contracts locally) when:

1. Current branch base SHA differs from `05ac447b10966131d4f37a2ba724110c33d66dd4` and owned page files changed upstream — re-read routes and confirm plan validity.
2. Any file in **Forbidden shared files** below changed on your branch — escalate to the owning R1–R5 plan.
3. `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run build`, or `npm run test:browser` fails after your change and the failure is outside owned files.
4. Required auth storage state, tenant, route fixture, or persona permission is unavailable — STOP before execution, report the affected route as BLOCKED, and do not run or skip any browser test.
5. A defect requires editing `src/components/data-table/resource-table.tsx`, `src/components/auto-form/**`, or `src/components/shell/**`.

**Escape hatch:** Document a narrow, evidence-backed exception in `docs/superpowers/specs/ui-remediation-exceptions.md` and stop implementation until approved.

---

## Forbidden shared files

| Path | Owner plan | Reason |
| --- | --- | --- |
| `src/app/globals.css` | R1 | Token vocabulary and theme runtime |
| `src/components/shell/**` | R1 theme bridge + R2 overlay layers; otherwise frozen | App shell, sidebar, panel header |
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

### Page routes (16)

- `src/app/(internal)/notifications/page.tsx`
- `src/app/(internal)/profile/page.tsx`
- `src/app/(internal)/search/page.tsx`
- `src/app/(internal)/user-hub/page.tsx`
- `src/app/(public)/(auth)/forgot-password/page.tsx`
- `src/app/(public)/(auth)/login/page.tsx`
- `src/app/(public)/(auth)/reset-password/page.tsx`
- `src/app/(public)/(tnc)/privacy-policy/page.tsx`
- `src/app/(public)/(tnc)/terms/page.tsx`
- `src/app/(public)/join-course/[code]/page.tsx`
- `src/app/(public)/notfound/page.tsx`
- `src/app/(public)/people/[slug]/page.tsx`
- `src/app/(public)/register/page.tsx`
- `src/app/(public)/verify/[token]/page.tsx`
- `src/app/(public)/watch/[token]/page.tsx`
- `src/app/page.tsx`

### Route-local component directories

- `src/components/auth/` (route-local components; modify only files imported by owned pages)
- `src/components/notifications/` (route-local components; modify only files imported by owned pages)
- `src/components/search/` (route-local components; modify only files imported by owned pages)
- `src/components/user-hub/` (route-local components; modify only files imported by owned pages)
- `src/components/profile/` (route-local components; modify only files imported by owned pages)
- `src/components/public/` (route-local components; modify only files imported by owned pages)
- `src/components/watch/` (route-local components; modify only files imported by owned pages)
- `src/components/verify/` (route-local components; modify only files imported by owned pages)
- `src/components/join-course/` (route-local components; modify only files imported by owned pages)
- `src/app/(public)/` (route-local components; modify only files imported by owned pages)

### New helper modules (this plan)

- Create: `src/lib/ui-remediation/r6-global-route-classes.ts`
- Create: `src/lib/ui-remediation/r6-global-route-classes.test.ts`
- Create: `e2e/r6-global-auth-public.spec.ts` (Playwright — post-R0 harness)

---

## Route manifest (R6)

| Route | Page file | Persona / permission | Shared patterns | Risk | Verification |
| --- | --- | --- | --- | --- | --- |
| `/(internal)/notifications` | `src/app/(internal)/notifications/page.tsx` | authenticated any — Notification inbox | legacy-tokens | low | manual |
| `/(internal)/profile` | `src/app/(internal)/profile/page.tsx` | authenticated any — Self profile; shell chrome | missing-PageContainer | low | manual |
| `/(internal)/search` | `src/app/(internal)/search/page.tsx` | authenticated any — Global find results | legacy-tokens | low | manual |
| `/(internal)/user-hub` | `src/app/(internal)/user-hub/page.tsx` | authenticated any — Personal hub landing | legacy-tokens | low | manual |
| `/(public)/(auth)/forgot-password` | `src/app/(public)/(auth)/forgot-password/page.tsx` | unauthenticated — Password reset request | sj-tokens | low | manual |
| `/(public)/(auth)/login` | `src/app/(public)/(auth)/login/page.tsx` | unauthenticated — Tenant login; no app shell | shell-delegated | medium | automated + manual |
| `/(public)/(auth)/reset-password` | `src/app/(public)/(auth)/reset-password/page.tsx` | unauthenticated — Password reset token form | sj-tokens | low | manual |
| `/(public)/(tnc)/privacy-policy` | `src/app/(public)/(tnc)/privacy-policy/page.tsx` | public — Legal static page | shell-delegated | low | manual |
| `/(public)/(tnc)/terms` | `src/app/(public)/(tnc)/terms/page.tsx` | public — Legal static page | shell-delegated | low | manual |
| `/(public)/join-course/[code]` | `src/app/(public)/join-course/[code]/page.tsx` | unauthenticated/student — Course join by code | stale-_chrome | medium | representative automated + manual |
| `/(public)/notfound` | `src/app/(public)/notfound/page.tsx` | public — 404 surface | sj-tokens | low | manual |
| `/(public)/people/[slug]` | `src/app/(public)/people/[slug]/page.tsx` | public — Staff public profile | shell-delegated | low | manual |
| `/(public)/register` | `src/app/(public)/register/page.tsx` | unauthenticated — Org registration wizard | shell-delegated | low | manual |
| `/(public)/verify/[token]` | `src/app/(public)/verify/[token]/page.tsx` | unauthenticated — Email/account verification | legacy-tokens, sj-tokens | medium | representative automated + manual |
| `/(public)/watch/[token]` | `src/app/(public)/watch/[token]/page.tsx` | unauthenticated — Recording watch link | shell-delegated | low | manual |
| `/` | `src/app/page.tsx` | public — Root redirect; no shell | shell-delegated | low | manual |

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
npm run test:unit -- src/lib/ui-remediation/r6-global-route-classes.test.ts
```

Expected: all tests PASS

**Cohort-scoped browser test:**

```bash
npm run test:browser -- e2e/r6-global-auth-public.spec.ts
```

Expected: all tests PASS; screenshots written to `e2e/screenshots/r6/`

**Production build smoke:**

```bash
npm run build
```

Expected: Exit 0

---

## Role, theme, and viewport matrix

| Surface | Roles | Themes | Viewports | Notes |
| --- | --- | --- | --- | --- |
| Representative automated route `/(public)/(auth)/login` | See route manifest persona column | light + dark | 1280×800 desktop; 390×844 mobile | Primary browser spec |
| All `R6` routes | Per manifest | light required; dark where internal shell | desktop 1280; mobile 390 for routes with toolbars/tables | Manual checklist below |
| Overlay-heavy routes (date pickers, dialogs, comboboxes) | Same as route | both | desktop | Verify R2 layer: dropdown above sticky toolbar |

---

## Manual route checklist

- [ ] `/(internal)/notifications` — authenticated any; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/profile` — authenticated any; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/search` — authenticated any; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/user-hub` — authenticated any; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(public)/(auth)/forgot-password` — unauthenticated; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(public)/(auth)/login` — unauthenticated; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(public)/(auth)/reset-password` — unauthenticated; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(public)/(tnc)/privacy-policy` — public; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(public)/(tnc)/terms` — public; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(public)/join-course/[code]` — unauthenticated/student; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(public)/notfound` — public; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(public)/people/[slug]` — public; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(public)/register` — unauthenticated; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(public)/verify/[token]` — unauthenticated; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(public)/watch/[token]` — unauthenticated; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/` — public; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present

---

## Mechanical migration batches

#### Batch A — public auth (`public-auth`)

**Files (explicit):**

- `src/app/(public)/(auth)/forgot-password/page.tsx`
- `src/app/(public)/(auth)/login/page.tsx`
- `src/app/(public)/(auth)/reset-password/page.tsx`
- `src/app/(public)/register/page.tsx`

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

#### Batch B — public legal/join/verify/watch/people/notfound (`public-legal`)

**Files (explicit):**

- `src/app/(public)/(tnc)/privacy-policy/page.tsx`
- `src/app/(public)/(tnc)/terms/page.tsx`
- `src/app/(public)/join-course/[code]/page.tsx`
- `src/app/(public)/notfound/page.tsx`
- `src/app/(public)/people/[slug]/page.tsx`
- `src/app/(public)/verify/[token]/page.tsx`
- `src/app/(public)/watch/[token]/page.tsx`

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

#### Batch C — global internal (`global-internal`)

**Files (explicit):**

- `src/app/(internal)/notifications/page.tsx`
- `src/app/(internal)/profile/page.tsx`
- `src/app/(internal)/search/page.tsx`
- `src/app/(internal)/user-hub/page.tsx`
- `src/app/page.tsx`

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

### Task 1: Route layout helper (R6)

**Files:**
- Create: `src/lib/ui-remediation/r6-global-route-classes.ts`
- Create: `src/lib/ui-remediation/r6-global-route-classes.test.ts`

- [x] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { globalRoutePageWidth, resolveGlobalRouteLayout } from "./r6-global-route-classes";

describe("resolveGlobalRouteLayout", () => {
  it("classifies auth routes as auth-minimal", () => {
    expect(resolveGlobalRouteLayout("/(public)/(auth)/login")).toBe("auth-minimal");
    expect(resolveGlobalRouteLayout("/(public)/register")).toBe("auth-minimal");
  });

  it("classifies legal and join routes as public-card", () => {
    expect(resolveGlobalRouteLayout("/(public)/(tnc)/terms")).toBe("public-card");
    expect(resolveGlobalRouteLayout("/(public)/join-course/[code]")).toBe("public-card");
  });

  it("classifies internal global routes as shell-standard", () => {
    expect(resolveGlobalRouteLayout("/(internal)/search")).toBe("shell-standard");
    expect(resolveGlobalRouteLayout("/(internal)/notifications")).toBe("shell-standard");
  });
});

describe("globalRoutePageWidth", () => {
  it("maps auth-minimal to narrow", () => {
    expect(globalRoutePageWidth("auth-minimal")).toBe("narrow");
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/ui-remediation/r6-global-route-classes.test.ts`

Expected: FAIL with "Cannot find module" or missing export

- [x] **Step 3: Write minimal implementation**

```typescript
export type GlobalRouteLayoutVariant = "auth-minimal" | "public-card" | "shell-standard";

export function resolveGlobalRouteLayout(route: string): GlobalRouteLayoutVariant {
  if (route.startsWith("/(public)/(auth)/") || route === "/(public)/register") {
    return "auth-minimal";
  }
  if (
    route.startsWith("/(public)/") &&
    route !== "/(public)/people/[slug]" &&
    route !== "/(public)/watch/[token]"
  ) {
    return "public-card";
  }
  return "shell-standard";
}

export function globalRoutePageWidth(variant: GlobalRouteLayoutVariant): "narrow" | "default" | "full" {
  if (variant === "auth-minimal") return "narrow";
  if (variant === "public-card") return "default";
  return "default";
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/ui-remediation/r6-global-route-classes.test.ts`

Expected: PASS (3+ tests)

- [x] **Step 5: Commit**

```bash
git add src/lib/ui-remediation/r6-global-route-classes.ts src/lib/ui-remediation/r6-global-route-classes.test.ts
git commit -m "$(cat <<'EOF'
feat(ui-r6): add route layout helper for global auth public routes

EOF
)"
```

---

### Task 2: Representative browser spec (R6)

**Files:**
- Create: `e2e/r6-global-auth-public.spec.ts`

- [x] **Step 1: Write failing Playwright spec**

```typescript
import { test, expect } from "@playwright/test";

test.describe("R6 representative routes", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  test("/login has no document horizontal overflow", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });

  test("/login panel header visible in light and dark", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    const header = page.locator("[data-testid='panel-header']");
    await expect(header).toBeVisible();
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(header).toBeVisible();
  });
});
```

- [x] **Step 2: Confirm browser preconditions, then verify the new assertions fail**

Before running, confirm `e2e/.auth/admin.json`, the tenant, and the `/login` fixture are available. If any precondition is missing, STOP and report R6 BLOCKED; do not execute with skipped tests.

Run: `npm run test:browser -- e2e/r6-global-auth-public.spec.ts`

Expected: Auth and fixture setup succeeds, no test is skipped, and the new layout assertion fails before the route migration. Missing setup is a STOP/BLOCKED condition, not an expected test failure.

- [x] **Step 3: Commit spec**

```bash
git add e2e/r6-global-auth-public.spec.ts
git commit -m "$(cat <<'EOF'
test(ui-r6): add representative browser spec for global auth public routes

EOF
)"
```

---

## Independent QA handoff prompt

Paste verbatim to a fresh QA subagent (read-only — no patching):

```
You are independent QA for UI remediation plan R6 (Global Auth Public Routes).
Base SHA target: 05ac447b10966131d4f37a2ba724110c33d66dd4 (final verification on integrated main after all cohorts merge).

Acceptance criteria:
1. All 16 routes in the manifest table pass verification mode listed.
2. No `@/app/_chrome/*` imports remain in owned page or route-local component files.
3. No legacy token classes (`text-muted-foreground`, `bg-card`, `bg-background`, `text-foreground`) in owned files unless covered by a documented R1 exception.
4. Internal routes use PageContainer + usePageHeader per R5 unless listed as documented dense/full-width exception.
5. npm run lint, typecheck, test:unit, build, test:browser pass with zero skipped tests.
6. Confirm the tenant, auth storage state, and every required route fixture before running QA. If any is unavailable, STOP and report the affected route BLOCKED; do not run a reduced or skipped suite.

Fixture URLs (representative):
- /login

Commands:
npm run lint
npm run typecheck
npm run test:unit -- src/lib/ui-remediation/r6-global-route-classes.test.ts
npm run test:browser -- e2e/r6-global-auth-public.spec.ts
npm run build

Return PASS/FAIL/BLOCKED per route with screenshot path, role, viewport, theme, reproduction steps for failures, and suspected owner plan (R1–R5 shared vs R6 local). BLOCKED means QA stopped before execution because a required fixture or auth precondition was missing; it never means a skipped test.
```

---

## Self-review (author checklist)

- [x] Spec §7 route family R6 — every owned product route listed exactly once
- [x] Spec §8 contracts — consumes R1–R5; forbidden shared files enumerated
- [x] Spec §9 verification — commands and browser assertions included
- [x] Spec §10 — stop conditions, commits, independent QA prompt present
- [x] Placeholder and omitted-code scan passed
