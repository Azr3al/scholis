# Next.js Local Dev Perf (Turbopack + Islands) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make local cold-route compile and HMR faster in `schedjuice-reimagined-fe` by defaulting to Turbopack and lazily loading Glide / TipTap / react-pdf (and confirming Konva) islands.

**Architecture:** Flip `pnpm dev` to `next dev --turbopack` with a Webpack escape hatch; expand `optimizePackageImports`; split heavy shells so Glide/`DataSheet`, course TipTap feed, and remaining static `@react-pdf` usage load via `next/dynamic` or `import()` instead of sync imports on unrelated routes.

**Tech Stack:** Next.js 15.2.x, React 19, pnpm, Turbopack, `next/dynamic`, Vitest (only if a boundary changes observable behavior), terminal compile timings for acceptance.

**Spec:** `docs/superpowers/specs/2026-07-21-nextjs-local-dev-perf-design.md`

## Global Constraints

- Scope is **local DX only** — do not change production `next build` bundler defaults.
- Keep Webpack escape hatch working (`pnpm dev:webpack`).
- Prefer wrapping **existing shell components**; do not rewrite route groups or purge `moment` in this pass.
- No flaky CI “assert compile time” tests; record before/after timings in the PR description.
- High-value tests only if a dynamic boundary breaks real behavior; no “renders after dynamic import” smoke.
- Sub-agent models (if dispatched): `composer-2.5-fast` or `grok-4.5-fast-xhigh` unless the user names another.
- Work in `schedjuice-reimagined-fe` git root; commit frequently per task.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `package.json` | Modify | `dev` → Turbopack; add `dev:webpack`; remove obsolete `dev:turbo` |
| `next.config.js` | Modify | Expand `experimental.optimizePackageImports` |
| `AGENTS.md` | Modify | Document Turbo default + Webpack fallback (already claims Turbo — align with reality) |
| `README.md` | Modify | Short local-dev note for Turbo / Webpack |
| `src/components/data-sheet/data-sheet-impl.tsx` | Create | Current Glide `DataSheet` implementation (moved) |
| `src/components/data-sheet/data-sheet.tsx` | Modify | Thin `dynamic(..., { ssr: false })` re-export of `DataSheet` + types |
| `src/components/course/record/course-record-overview.tsx` | Modify | `dynamic` import `CourseFeed` so course overview cold compile skips TipTap until feed loads |
| `src/components/course/feed/course-feed.tsx` | Modify | `dynamic` import `CourseFeedComposer` (TipTap composer) |
| `src/components/rbac/policy-pdf-document.tsx` | Create | PDF document component moved out of `policy-export.tsx` |
| `src/components/rbac/policy-export.tsx` | Modify | Remove sync `@react-pdf` imports; `import()` document on download |
| `docs/superpowers/plans/2026-07-21-nextjs-local-dev-perf.md` | This plan | Execution checklist |

**Already lazy (do not rework unless broken):** `helpers/payment-receipt.ts`, `helpers/staff-payslip.ts`, `helpers/id-card-export.ts` already `import()` `@react-pdf` and PDF components.

**Konva note:** `react-konva` appears only under `src/components/certificate/primitives/` with **no current importers**. Task 5 verifies and either no-ops with a PR note or wraps if a live path is found.

---

### Task 1: Baseline timings + Turbopack default + package-import optimization

**Files:**
- Modify: `package.json`
- Modify: `next.config.js`
- Modify: `AGENTS.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: none
- Produces: `pnpm dev` → Turbopack; `pnpm dev:webpack` → Webpack; expanded `optimizePackageImports`

- [ ] **Step 1: Capture Webpack baseline (before script flip)**

With current `pnpm dev` (Webpack), after a fresh or once-cleared `.next` if timings look suspiciously warm:

```bash
cd schedjuice-reimagined-fe
# Optional fair baseline:
# rm -rf .next
pnpm dev
```

In the browser, cold-navigate and paste terminal lines into the PR draft for:

1. `/finances/student-payments`
2. `/courses/<some-id>/edit` (any real course id)
3. One light page without Glide/TipTap (e.g. a simple settings/list page you already use)
4. One save→HMR on a leaf component

Expected: Webpack lines similar to prior session (`Compiled … in Ns (NNNN modules)`).

- [ ] **Step 2: Flip scripts in `package.json`**

Replace the scripts block entries so they match:

```json
"dev": "next dev --turbopack",
"dev:webpack": "next dev",
```

Delete `"dev:turbo": "next dev --turbopack"` (replaced by default `dev`).

- [ ] **Step 3: Expand `optimizePackageImports` in `next.config.js`**

Change `experimental` to:

```js
experimental: {
  // lucide-react is on Next 15's built-in optimize list; iconoir-react is not.
  optimizePackageImports: ["iconoir-react", "date-fns"],
},
```

Leave the existing `webpack` canvas externals block unchanged.

- [ ] **Step 4: Align docs with the new default**

In `AGENTS.md` under **Running**, ensure bullets say:

- **Dev server**: `pnpm run dev` (port 3000, **Turbopack**)
- **Webpack fallback**: `pnpm run dev:webpack` if Turbopack crashes or mis-renders a critical path; note the symptom in the PR/issue

In `README.md` under **Development configs**, add:

```markdown
## Local development

- `pnpm dev` — Next.js Turbopack (preferred; faster cold compile / HMR)
- `pnpm dev:webpack` — Webpack escape hatch if Turbopack breaks something
```

- [ ] **Step 5: Boot Turbopack and re-measure**

```bash
cd schedjuice-reimagined-fe
pnpm dev
```

Expected: server starts; terminal mentions Turbopack (or lacks Webpack “NNNN modules” style lines). Re-hit the same baseline routes; record times next to Step 1 numbers.

Also verify escape hatch:

```bash
# stop Turbo first, then:
pnpm dev:webpack
```

Expected: boots successfully.

- [ ] **Step 6: Commit**

```bash
git add package.json next.config.js AGENTS.md README.md
git commit -m "$(cat <<'EOF'
perf(fe): default local next dev to Turbopack

EOF
)"
```

---

### Task 2: Lazy `DataSheet` (Glide island)

**Files:**
- Create: `src/components/data-sheet/data-sheet-impl.tsx`
- Modify: `src/components/data-sheet/data-sheet.tsx`

**Interfaces:**
- Consumes: existing `DataSheet` / `DataSheetProps` API from current `data-sheet.tsx`
- Produces: same public exports from `@/components/data-sheet/data-sheet` (`DataSheet`, `DataSheetProps`); implementation lives in `data-sheet-impl.tsx` and loads only on the client via `dynamic`

- [ ] **Step 1: Move implementation**

```bash
cd schedjuice-reimagined-fe
git mv src/components/data-sheet/data-sheet.tsx src/components/data-sheet/data-sheet-impl.tsx
```

- [ ] **Step 2: Create lazy wrapper at the old path**

Create `src/components/data-sheet/data-sheet.tsx`:

```tsx
"use client";

import dynamic from "next/dynamic";
import type { ForwardRefExoticComponent, RefAttributes } from "react";
import type { DataEditorRef } from "@glideapps/glide-data-grid";

import type { DataSheetProps } from "./data-sheet-impl";

export type { DataSheetProps } from "./data-sheet-impl";

export const DataSheet = dynamic(
  () =>
    import("./data-sheet-impl").then((mod) => ({
      default: mod.DataSheet,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[240px] w-full animate-pulse rounded-md bg-muted/40" />
    ),
  },
) as ForwardRefExoticComponent<
  DataSheetProps & RefAttributes<DataEditorRef>
>;
```

If TypeScript rejects the `as` cast, adjust to the smallest cast that preserves call-site types (keep `DataSheetProps` exported; do not change consumer prop shapes).

- [ ] **Step 3: Ensure impl keeps named export**

In `data-sheet-impl.tsx`, confirm these remain:

```ts
export interface DataSheetProps { /* … */ }
export const DataSheet = forwardRef<DataEditorRef, DataSheetProps>(/* … */);
```

No other API renames.

- [ ] **Step 4: Typecheck**

```bash
cd schedjuice-reimagined-fe
pnpm typecheck
```

Expected: PASS (or only pre-existing unrelated errors — do not introduce new errors in `data-sheet*`).

- [ ] **Step 5: Manual smoke**

With `pnpm dev`:

1. Open `/finances/student-payments` — grid appears after brief skeleton (not a blank forever).
2. Open a non-grid route (e.g. course members) — confirm terminal does **not** needlessly recompile Glide solely from navigating away/back to light pages after a cold start of a light page first.

- [ ] **Step 6: Commit**

```bash
git add src/components/data-sheet/data-sheet.tsx src/components/data-sheet/data-sheet-impl.tsx
git commit -m "$(cat <<'EOF'
perf(fe): lazy-load Glide DataSheet behind dynamic import

EOF
)"
```

---

### Task 3: Lazy TipTap on course feed path

**Files:**
- Modify: `src/components/course/record/course-record-overview.tsx`
- Modify: `src/components/course/feed/course-feed.tsx`

**Interfaces:**
- Consumes: `CourseFeed` props unchanged; `CourseFeedComposer` props unchanged
- Produces: course overview no longer sync-imports TipTap feed modules; composer loads via `dynamic`

- [ ] **Step 1: Dynamic `CourseFeed` in course overview**

In `src/components/course/record/course-record-overview.tsx`, replace the static `CourseFeed` import with:

```tsx
"use client";

import dynamic from "next/dynamic";
// …keep other imports…

const CourseFeed = dynamic(
  () =>
    import("@/components/course/feed/course-feed").then((m) => m.CourseFeed),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[160px] w-full animate-pulse rounded-md bg-muted/40" />
    ),
  },
);
```

Remove: `import { CourseFeed } from "@/components/course/feed/course-feed";`

Keep the JSX `<CourseFeed … />` call site props identical.

- [ ] **Step 2: Dynamic composer inside `course-feed.tsx`**

In `src/components/course/feed/course-feed.tsx`, replace static composer import:

```tsx
"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";

import { CourseFeedList } from "@/components/course/feed/course-feed-list";
import {
  CourseFeedMonthToolbar,
  defaultMonthBounds,
  type MonthBounds,
} from "@/components/course/feed/course-feed-month-toolbar";
import { useTenant } from "@/hooks/useTenant";

const CourseFeedComposer = dynamic(
  () =>
    import("@/components/course/feed/course-feed-composer").then(
      (m) => m.CourseFeedComposer,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="h-24 w-full animate-pulse rounded-md bg-muted/40" />
    ),
  },
);
```

Leave `CourseFeedList` static for now (cards pull TipTap when editing; list/timeline still import cards — acceptable for this pass). Do **not** expand into a full feed rewrite.

- [ ] **Step 3: Typecheck**

```bash
cd schedjuice-reimagined-fe
pnpm typecheck
```

Expected: PASS for touched files.

- [ ] **Step 4: Manual smoke**

1. Open a course overview/record page that shows the feed — composer/list appear; posting/editing still works if you can edit.
2. Open `/courses/<id>/edit` — still works (this page keeps its own TipTap imports; that is expected).

- [ ] **Step 5: Commit**

```bash
git add src/components/course/record/course-record-overview.tsx src/components/course/feed/course-feed.tsx
git commit -m "$(cat <<'EOF'
perf(fe): lazy-load course feed TipTap composer path

EOF
)"
```

---

### Task 4: Finish react-pdf isolation for policy export

**Files:**
- Create: `src/components/rbac/policy-pdf-document.tsx`
- Modify: `src/components/rbac/policy-export.tsx`

**Interfaces:**
- Consumes: `Policy` from `@/lib/rbac/synthesize-policy`; `policyBreadthSummary` from `./policy-overview-utils`
- Produces: `downloadPolicyPdf(roleName, policy)` still works; UI `PolicyExportActions` unchanged; zero sync `@react-pdf/renderer` imports in `policy-export.tsx`

- [ ] **Step 1: Move PDF document into its own module**

Create `src/components/rbac/policy-pdf-document.tsx` with the current `PolicyPdfDocument` component and its `StyleSheet` / `@react-pdf/renderer` imports (cut from `policy-export.tsx`). Use the **exact** existing styles and JSX from `policy-export.tsx` (do not redesign the PDF). Export `PolicyPdfDocument`.

- [ ] **Step 2: Slim `policy-export.tsx`**

Remove all top-level `@react-pdf/renderer` imports and `PolicyPdfDocument` / `pdfStyles`. Keep buttons/UI. Change download to:

```ts
export async function downloadPolicyPdf(roleName: string, policy: Policy) {
  const { pdf } = await import("@react-pdf/renderer");
  const { PolicyPdfDocument } = await import("./policy-pdf-document");
  const { downloadFile } = await import("@/helpers/file");
  const blob = await pdf(
    PolicyPdfDocument({ roleName, policy }),
  ).toBlob();
  // …existing URL / filename / downloadFile / revoke logic unchanged…
}
```

Verify with ripgrep that `policy-export.tsx` has **no** static `from "@react-pdf/renderer"`:

```bash
rg 'from ["'\'']@react-pdf/renderer["'\'']' src/components/rbac/policy-export.tsx
```

Expected: no matches (dynamic `import("@react-pdf/renderer")` is fine).

- [ ] **Step 3: Typecheck + unit tests if any RBAC tests exist**

```bash
cd schedjuice-reimagined-fe
pnpm typecheck
pnpm test:unit -- src/components/rbac
```

Expected: typecheck clean for touched files; vitest passes or finds no tests (OK).

- [ ] **Step 4: Manual smoke**

Open RBAC policy overview UI and download a policy PDF once. Expected: PDF downloads; no console crash.

- [ ] **Step 5: Commit**

```bash
git add src/components/rbac/policy-pdf-document.tsx src/components/rbac/policy-export.tsx
git commit -m "$(cat <<'EOF'
perf(fe): defer react-pdf load for policy export

EOF
)"
```

---

### Task 5: Konva / certificate path check

**Files:**
- Possibly modify: certificate / image-editor entry pages only if a live Konva import path exists
- Otherwise: no code change — document finding in PR

**Interfaces:**
- Consumes: inventory of `react-konva` / `konva` imports
- Produces: either a lazy boundary on a live path, or an explicit “no live Konva graph” note

- [ ] **Step 1: Inventory**

```bash
cd schedjuice-reimagined-fe
rg -n "from ['\"]react-konva['\"]|from ['\"]konva['\"]" src
rg -n "certificate/primitives" src
```

Expected (as of design time): only `src/components/certificate/primitives/{text,rectangle}.tsx` import `react-konva`, with no other file importing those primitives. Certificate create/generate pages use canvas 2D via `@/helpers/image-editor/*`, not Konva.

- [ ] **Step 2: Decide**

- **If still unused:** skip code changes; add a short PR bullet: “Konva primitives unused — no lazy boundary needed this pass.”
- **If a live importer appears:** wrap that page-level editor shell with `next/dynamic(..., { ssr: false })` the same way as Task 2/3 (show the exact wrapper in the commit; do not lazy every primitive file individually).

- [ ] **Step 3: Optional certificate page split (only if Step 2 finds canvas editor sync-imported from a shared layout — unlikely)**

Do nothing unless inventory shows image-editor helpers imported from a shared layout/shell. Certificate pages importing helpers directly is acceptable.

- [ ] **Step 4: Commit only if code changed**

```bash
# If code changed:
git add -A src/components/certificate src/app/\(internal\)/certificates
git commit -m "$(cat <<'EOF'
perf(fe): lazy-load Konva certificate editor island

EOF
)"
```

If no code change, no commit for this task.

---

### Task 6: Final acceptance timings + PR notes

**Files:**
- None required (PR description); optional touch to `README.md` only if fallback wording needs a tweak after real Turbo issues

**Interfaces:**
- Consumes: timings from Task 1 and islands from Tasks 2–5
- Produces: PR-ready before/after table meeting spec acceptance

- [ ] **Step 1: Re-measure under Turbopack after islands**

With `pnpm dev`, after restart (optionally `rm -rf .next` once):

| Route / action | Webpack baseline (Task 1) | Turbo after islands |
|----------------|---------------------------|---------------------|
| Cold `/finances/student-payments` | | |
| Cold `/courses/<id>/edit` | | |
| Cold light page | | |
| HMR light edit | | |
| HMR on payments or feed page | | |

- [ ] **Step 2: Acceptance checklist**

Confirm:

1. Cold heavy routes **noticeably faster** than Webpack baseline (aim routinely under ~2–3s where Webpack was ~5–10s — machine-dependent).
2. Light-page HMR typically sub-second to low seconds.
3. Light routes do not force Glide/TipTap/PDF just by existing in the app (navigate light-first on fresh server).
4. `pnpm dev:webpack` still boots.
5. Smoke: payments grid, course feed/edit, one PDF (receipt or policy), certificate page loads.

- [ ] **Step 3: Typecheck + targeted unit tests**

```bash
cd schedjuice-reimagined-fe
pnpm typecheck
pnpm test:unit -- src/helpers/payment-receipt.test.ts src/helpers/course-feed-update-form-data.test.ts
```

Expected: PASS.

- [ ] **Step 4: Final commit only if leftover doc tweaks**

```bash
git status
# If README/AGENTS need a fix after real findings:
git add README.md AGENTS.md
git commit -m "$(cat <<'EOF'
docs(fe): note Turbopack fallback after local DX pass

EOF
)"
```

Paste the timing table into the PR description when opening/updating the PR.

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| Default Turbopack `pnpm dev` | Task 1 |
| Webpack escape hatch | Task 1 |
| Expand `optimizePackageImports` | Task 1 |
| Glide island lazy | Task 2 |
| TipTap island lazy | Task 3 |
| react-pdf island | Task 4 (policy); others already lazy |
| Konva island | Task 5 (verify / conditional) |
| Measure before/after | Tasks 1 + 6 |
| Docs for Turbo/Webpack | Task 1 (+6 if needed) |
| No prod bundler change / no moment purge / no CI perf tests | Global constraints |

## Placeholder / consistency scan

- No TBD/TODO left in steps.
- Public APIs (`DataSheet`, `CourseFeed` props, `downloadPolicyPdf`) preserved.
- PDF helpers already lazy — plan does not duplicate that work.
