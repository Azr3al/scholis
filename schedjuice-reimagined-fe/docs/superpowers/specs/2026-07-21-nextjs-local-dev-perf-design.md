# Next.js local hot reload / compile performance

**Status:** approved design (planning phase)  
**Date:** 2026-07-21  
**Repos:** `schedjuice-reimagined-fe`  
**Surfaces:** local `next dev` only (Turbopack default, Webpack escape hatch, heavy-island lazy boundaries)

## Context

Local Webpack `next dev` on this app is slow for both cold route compiles and save→HMR. Observed on a typical session:

- Cold `/finances/student-payments`: ~6.3s (~9076 modules)
- Cold `/courses/[id]/edit`: ~4.7s (~6522 modules)
- HMR: often ~0.6–5s; spikes to ~10s on fat graphs

The app is large (~2.2k TS/TSX files) with heavy client libraries (Glide, TipTap, `@react-pdf`, Konva). Next is `^15.2.6`. `pnpm dev:turbo` (`next dev --turbopack`) already exists but is unused; default `pnpm dev` is Webpack. `experimental.optimizePackageImports` currently only lists `iconoir-react`.

Pain: both cold routes and HMR (user chose “both”). Scope appetite: medium — Turbopack default plus targeted import/dep hygiene, not a full app rewrite. Turbopack has not been tried yet on this machine/session.

## Goals

1. Make default local DX use Turbopack so cold compiles and HMR are materially faster.
2. Keep a Webpack escape hatch when Turbopack breaks a critical path.
3. Isolate heavy islands (Glide, TipTap, react-pdf, Konva) behind `next/dynamic` so unrelated routes do not pay their compile cost.
4. Expand `optimizePackageImports` for libraries Next can tree-shake better in both bundlers (at least `date-fns`; confirm others during implementation).
5. Record simple before/after timings in the PR; no flaky CI perf gates.

## Non-goals

- Changing production `next build` bundler defaults or deploying Turbopack-only.
- Full route-group splitting, monorepo package split, or layout architecture rewrite.
- Removing `moment` everywhere (optional follow-up; not required for this pass).
- Permanent automated “assert compile time” tests.
- Visual Companion / UI redesign of loading states beyond minimal placeholders.

## Decision

**Approach 2 — Turbopack default + targeted heavy-module isolation.**

| # | Decision |
| --- | --- |
| 1 | Default `pnpm dev` → `next dev --turbopack` |
| 2 | Escape/rename `dev:turbo` with `dev:webpack` → `next dev` |
| 3 | Expand `optimizePackageImports` (keep `iconoir-react`; add `date-fns` and any other verified wins) |
| 4 | Lazy-load Glide / TipTap / `@react-pdf` / Konva at existing shell component boundaries |
| 5 | Prefer `ssr: false` for canvas/DOM-only islands |
| 6 | Keep existing Webpack `canvas` external for the escape hatch |
| 7 | Measure a fixed set of routes before/after; clear `.next` once for fair baseline |
| 8 | If Turbopack fails on a critical island, document + use Webpack; do not block the DX win |

## Architecture

```
pnpm dev           → next dev --turbopack
pnpm dev:webpack   → next dev

next.config.js
  experimental.optimizePackageImports: ["iconoir-react", "date-fns", …]
  webpack: canvas external (Webpack path only)

Heavy islands (dynamic import)
  Glide grids  → student-payments-grid, data-sheet, leads/import grids, …
  TipTap       → components/editor/*, course feed composer/card, course edit entry
  react-pdf    → payslip / receipt / id-card / policy PDF triggers
  Konva        → certificate / image editor canvas
```

**Principles**

- Prefer bundler switch + isolation over restructuring routes.
- Dynamic wrappers at shared shells, not one-off `dynamic()` in every page when a shell already exists.
- No production feature changes; brief loading placeholder is acceptable.
- Webpack path must still boot.

## Concrete changes

### Scripts / config

- `package.json` scripts: `dev` = Turbopack; `dev:webpack` = Webpack; remove or alias obsolete `dev:turbo`.
- `next.config.js`: expand `optimizePackageImports`; leave Webpack canvas external intact.
- Short developer note in FE `README.md` and/or `AGENTS.md`: prefer `pnpm dev`; if Turbo breaks, use `pnpm dev:webpack` and record the symptom.

### Heavy islands

| Island | Example call sites today | Isolation target |
| --- | --- | --- |
| Glide | `student-payments-grid`, `data-sheet`, leads/import/shortcuts grids | Grid shell components |
| TipTap | `components/editor/*`, course feed composer/card, course edit | Editor entry components |
| react-pdf | payslip, receipt, id-card, policy export | PDF document / download triggers |
| Konva | certificate primitives / image editor | Editor canvas wrapper |

### Explicitly out of scope this pass

- Deep barrel-file hunts unless a specific shared import is proven to inflate many routes during measurement.
- Replacing Moment with `date-fns` across the app.
- Changing how rewrites/images/experimental server features work.

## Measurement & acceptance

**Baseline routes (Webpack, then same under Turbopack):**

1. `/finances/student-payments` (cold)
2. `/courses/[id]/edit` (cold)
3. One lighter internal page without Glide/TipTap (cold)
4. One save→HMR on a leaf component of a light page and on a heavy page

**Acceptance (local, PR-recorded — not CI):**

1. Cold compiles of the heavy routes are **noticeably faster** under Turbopack (target: routinely under ~2–3s where Webpack was ~5–10s; machine-dependent — capture numbers).
2. HMR on light edits is typically **sub-second to low seconds**, not multi-second full-graph rebuilds.
3. Opening a non-grid / non-editor route does **not** force-compile Glide/TipTap/PDF/Konva.
4. `pnpm dev:webpack` still starts.
5. Smoke: student payments grid, course edit/feed editor, one PDF path, certificate editor — no functional regression beyond brief placeholders.

**Verification method:** terminal compile lines; short PR checklist. Existing editor unit tests remain; no new compile-time assertions.

## Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Turbopack incompat with canvas / Konva / PDF | `dynamic(..., { ssr: false })` + Webpack escape hatch |
| Loading UX flash | Minimal skeleton / `null` placeholder; same UX after load |
| Accidental prod behavior change | Dynamic only for already client-only islands; do not change `next build` defaults |
| Misleading timings from warm cache | Clear `.next` once when capturing baselines |
| Scope creep into moment/route rewrite | Hard non-goals above |

## Error handling

- Dev boot failure under Turbopack → switch to `dev:webpack`, note stack in issue/PR.
- Dynamic island load failure → existing page/error boundaries; no new global error framework.

## Rollout order

1. Baseline timings under current Webpack `pnpm dev` (optionally wipe `.next` once).
2. Flip scripts to Turbopack default; expand `optimizePackageImports`; re-measure.
3. Isolate islands in order: Glide → TipTap → react-pdf → Konva (highest fan-out first).
4. Smoke critical paths; confirm Webpack escape hatch.
5. Document default Turbo + Webpack fallback.
6. Stop — no further architecture churn unless Turbo blocks a critical path.

## Testing notes

- Prefer high-value behavioral tests only if a dynamic boundary changes observable behavior (e.g. missing export, SSR crash). Do not add “renders after dynamic import” smoke.
- Manual smoke checklist is the primary verification for this DX work.

## Done when

Default local DX is Turbopack, heavy islands are lazy at shell boundaries, Webpack escape hatch exists and boots, developer docs mention the fallback, and before/after timings are recorded in the implementation PR.
