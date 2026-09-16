# UI Migration Remediation Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement worker plans task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This document is the dispatcher brief. Do **not** implement product source here — only create worktrees, assign plans, run review/QA agents, route failures, and merge to `dev`.

**Goal:** Coordinate R0–R16 of the UI migration remediation program so shared contracts land before route cohorts, finance paths stay serialized, every product route is inventoried and QA-verified, and the program closes only on a single integrated SHA.

**Architecture:** System-first remediation (R0–R5) establishes verification gates and shared contracts; route-family implementation cohorts (R6–R14) repair page-level regressions under disjoint file ownership; R15 runs independent manual QA using one manifest entry per real `page.tsx`. ResourceTable and Glide remain verification variants on the real student-payment routes, so R15-QA7–R15-QA9 can verify shell, ResourceTable, and Glide independently without inventing routes; R16 verifies the final merged SHA with automated gates, static contract checks, manifest closure, and cold signoff.

**Tech Stack:** Next.js 15 App Router, Vitest, Playwright (introduced in R0), TypeScript, Tailwind v4 semantic tokens under `.sj-root`, `DESIGN.md` authority.

**Spec:** [`../specs/2026-07-12-ui-migration-remediation-program-design.md`](../specs/2026-07-12-ui-migration-remediation-program-design.md)  
**Planning baseline SHA:** `05ac447b` on `dev`  
**Repository root:** `schedjuice-reimagined-fe`

---

## Plan portfolio (R0–R16 exact filenames)

| Wave | Plan file | Branch | Worktree directory |
| --- | --- | --- | --- |
| R0 | [`2026-07-12-ui-remediation-r0-verification-foundation.md`](2026-07-12-ui-remediation-r0-verification-foundation.md) | `remediate/ui-r0-verification` | `../worktrees/ui-r0-verification` |
| R1 | [`2026-07-12-ui-remediation-r1-design-authority-theme.md`](2026-07-12-ui-remediation-r1-design-authority-theme.md) | `remediate/ui-r1-tokens` | `../worktrees/ui-r1-tokens` |
| R2 | [`2026-07-12-ui-remediation-r2-overlay-portal-stack.md`](2026-07-12-ui-remediation-r2-overlay-portal-stack.md) | `remediate/ui-r2-overlay` | `../worktrees/ui-r2-overlay` |
| R3 | [`2026-07-12-ui-remediation-r3-table-contracts.md`](2026-07-12-ui-remediation-r3-table-contracts.md) | `remediate/ui-r3-tables` | `../worktrees/ui-r3-tables` |
| R4 | [`2026-07-12-ui-remediation-r4-form-control-contracts.md`](2026-07-12-ui-remediation-r4-form-control-contracts.md) | `remediate/ui-r4-forms` | `../worktrees/ui-r4-forms` |
| R5 | [`2026-07-12-ui-remediation-r5-page-composition-contracts.md`](2026-07-12-ui-remediation-r5-page-composition-contracts.md) | `remediate/ui-r5-page-shell` | `../worktrees/ui-r5-page-shell` |
| R6 | [`2026-07-12-ui-remediation-r6-global-auth-public.md`](2026-07-12-ui-remediation-r6-global-auth-public.md) | `remediate/ui-r6-global-shell` | `../worktrees/ui-r6-global-shell` |
| R7 | [`2026-07-12-ui-remediation-r7-home-dashboards-reporting.md`](2026-07-12-ui-remediation-r7-home-dashboards-reporting.md) | `remediate/ui-r7-dashboard` | `../worktrees/ui-r7-dashboard` |
| R8 | [`2026-07-12-ui-remediation-r8-administration-crud.md`](2026-07-12-ui-remediation-r8-administration-crud.md) | `remediate/ui-r8-admin-crud` | `../worktrees/ui-r8-admin-crud` |
| R9 | [`2026-07-12-ui-remediation-r9-courses-attendance-scheduling.md`](2026-07-12-ui-remediation-r9-courses-attendance-scheduling.md) | `remediate/ui-r9-courses` | `../worktrees/ui-r9-courses` |
| R10 | [`2026-07-12-ui-remediation-r10-content-quizzes-services.md`](2026-07-12-ui-remediation-r10-content-quizzes-services.md) | `remediate/ui-r10-content` | `../worktrees/ui-r10-content` |
| R11 | [`2026-07-12-ui-remediation-r11-finance-operations.md`](2026-07-12-ui-remediation-r11-finance-operations.md) | `remediate/ui-r11-finance-shell` | `../worktrees/ui-r11-finance-shell` |
| R12 | [`2026-07-12-ui-remediation-r12-student-payments-resource-table.md`](2026-07-12-ui-remediation-r12-student-payments-resource-table.md) | `remediate/ui-r12-sp-table` | `../worktrees/ui-r12-sp-table` |
| R13 | [`2026-07-12-ui-remediation-r13-student-payments-glide.md`](2026-07-12-ui-remediation-r13-student-payments-glide.md) | `remediate/ui-r13-sp-glide` | `../worktrees/ui-r13-sp-glide` |
| R14 | [`2026-07-12-ui-remediation-r14-payment-upload-verification.md`](2026-07-12-ui-remediation-r14-payment-upload-verification.md) | `remediate/ui-r14-payment-upload` | `../worktrees/ui-r14-payment-upload` |
| R15 | [`2026-07-12-ui-remediation-r15-independent-route-qa.md`](2026-07-12-ui-remediation-r15-independent-route-qa.md) | `remediate/ui-r15-route-qa` | `../worktrees/ui-r15-route-qa` |
| R16 | [`2026-07-12-ui-remediation-r16-final-integration.md`](2026-07-12-ui-remediation-r16-final-integration.md) | `remediate/ui-r16-final` | `../worktrees/ui-r16-final` |
| Orchestration | [`2026-07-12-ui-migration-remediation-orchestration.md`](2026-07-12-ui-migration-remediation-orchestration.md) | `remediate/ui-orchestration` | dispatcher only — no product edits |

### Artifact paths created across the portfolio

| Artifact | Owner wave | Path |
| --- | --- | --- |
| Verification command registry | R0 | `docs/VERIFICATION.md` |
| Playwright harness | R0 | `playwright.config.ts`, `e2e/fixtures/auth.ts`, `e2e/smoke/` |
| Token/theme contract tests | R1 | `src/lib/sj/legacy-token-aliases.test.ts` |
| Legacy token static gate | R1 | `scripts/check-legacy-tokens.ts` |
| Overlay layer registry | R2 | `src/lib/ui/overlay-layers.ts` |
| Z-index static gate | R2 | `scripts/check-overlay-z-index.ts` |
| Table column layout helpers | R3 | `src/components/data-table/column-layout.ts`, `src/components/data-table/types.ts` |
| Form sizing contract types | R4 | `src/lib/ui/control-sizing.ts`, `src/lib/ui/field-measure.ts` |
| Page shell helpers | R5 | `src/components/layout/page-container.tsx`, `src/components/layout/page-title.tsx`, `src/components/layout/page-header.tsx` |
| Route manifest schema | R15 | `src/lib/ui-remediation/route-manifest-schema.ts` |
| Route manifest generator | R15 | `src/lib/ui-remediation/route-manifest-generator.ts`, `scripts/ui-remediation/generate-route-manifest.ts` |
| Route manifest classifier | R15 | `src/lib/ui-remediation/route-manifest-classifier.ts` |
| Route manifest data | R15 | `docs/ui-remediation/route-manifest.json`, `docs/ui-remediation/route-manifest-exclusions.json` |
| QA evidence store | R15 | `docs/ui-remediation/qa-evidence/` |
| Final integration verifier | R16 | `scripts/ui-remediation/verify-final-integration.sh`, `scripts/ui-remediation/verify-manifest-closure.ts` |

---

## Dependency DAG

```text
R0 (verification baseline + browser harness)
 └─ blocks all implementation

R1 (design authority + token/theme convergence)
 ├─ blocks R2, R3, R4, R5, R6–R14
 └─ parallel-safe with nothing until merged

R2 (overlay/portal stack) ─┐
R3 (ResourceTable contracts) ├─ parallel-safe among R2–R5 after R1 merges
R4 (form/control sizing)     │   only when owned file sets are disjoint
R5 (page shell/composition) ─┘

R6 (global shell/auth/public) ─┐
R7 (dashboard/analytics)        │
R8 (administration CRUD)        ├─ parallel-safe after R2–R5 merge
R9 (courses/attendance)         │   when route inventories are disjoint
R10 (quizzes/content/services)  │
R11 (finance operations outside student-payments report) ────┘── SERIAL finance entry

R12 (student-payments shared shell + ResourceTable mode) ── after R11 merges; SERIAL with R13 on shared routes
R13 (student-payments Glide mode) ── after R12 merges; same routes, distinct mode ownership
R14 (payment upload/verification) ── after R13 merges; never concurrent with R11–R13

R15 (independent manual QA) ── after R6–R14 merge; uses manifest from R15 plan Task 1
R16 (final integration) ── after R15 QA cohorts pass; runs on final integrated SHA only
```

### Merge order (strict)

1. R0 → `dev`
2. R1 → `dev`
3. R2, R3, R4, R5 → `dev` (any parallel order; land all four before route cohorts)
4. R6, R7, R8, R9, R10 → `dev` (parallel when inventories disjoint)
5. R11 → `dev` (alone — finance operations outside student-payments report)
6. R12 → `dev` (alone — student-payments ResourceTable)
7. R13 → `dev` (alone — student-payments Glide)
8. R14 → `dev` (alone — payment upload/verification)
9. R15 manifest/QA infrastructure PR → `dev` (may open before route merges complete; QA execution waits for R6–R14)
10. R15 QA evidence commits → `dev` (one PR per QA cohort or one consolidated evidence PR)
11. R16 → `dev` (final verification scripts + signoff record only after all prior merges)

---

## Parallel-safe groups

| Group | Waves | Condition |
| --- | --- | --- |
| G0 | R0 only | Blocking foundation — never parallel |
| G1 | R1 only | Blocking authority — never parallel |
| G2 | R2 + R3 + R4 + R5 | Disjoint primitive ownership; `subjects/create/page.tsx` is R5-only (R4 uses `/users/create`) |
| G3 | R6 + R7 + R8 + R9 + R10 | Disjoint `page.tsx` and route-local component inventories |
| G4 | R11 only | Finance operations outside student-payments report — one owner |
| G5 | R12 only | ResourceTable mode on the real student-payment routes — one owner |
| G6 | R13 only | Glide mode on those same real routes — one owner |
| G7 | R14 only | Upload/verification workflows — one owner |
| G8 | R15-QA1 through R15-QA10 | Independent QA sub-cohorts by route family or verification variant — verify only, no patches |
| G9 | R16 only | Final integrated SHA — never parallel with implementation |

**Hard serialization pairs (never concurrent):**

| File pattern | Owner order |
| --- | --- |
| `src/app/(internal)/finances/student-payments/page.tsx`, `transaction-lookup/page.tsx`, `src/app/(internal)/courses/[id]/student-payments/page.tsx` | R12 shared shell + ResourceTable mode → R13 Glide mode; each page appears once in the manifest |
| `src/components/finances/student-payments/**` shared filters/toolbar | R12 → R13 |
| `docs/ui-remediation/route-manifest.json` | R15 generator owner only; R16 reads |
| `src/lib/ui/overlay-layers.ts` | R2 only |
| `src/components/data-table/column-layout.ts`, `src/components/data-table/types.ts` | R3 only |
| `DESIGN.md`, `docs/AGENT_UI_SYSTEM.md` | R1 only (R16 may add signoff appendix only) |

### Student-payment manifest ownership

The manifest contains one entry for each real page and nests mode ownership beneath that entry:

| Real route pattern | Page path | Variant owner and QA cohort |
| --- | --- | --- |
| `/finances/student-payments` | `src/app/(internal)/finances/student-payments/page.tsx` | `shared-shell`: R12/R15-QA7; `resource-table`: R12/R15-QA8; `glide`: R13/R15-QA9 |
| `/finances/student-payments/transaction-lookup` | `src/app/(internal)/finances/student-payments/transaction-lookup/page.tsx` | `shared-shell`: R12/R15-QA7; `resource-table`: R12/R15-QA8; `glide`: R13/R15-QA9 |
| `/courses/:id/student-payments` | `src/app/(internal)/courses/[id]/student-payments/page.tsx` | `shared-shell`: R12/R15-QA7; `resource-table`: R12/R15-QA8; `glide`: R13/R15-QA9 |
| `/finances/recent-transactions` | `src/app/(internal)/finances/recent-transactions/page.tsx` | `default`: R11/R15-QA6; `glide`: R13/R15-QA9 |

R12 and R13 do not own separate route entries or page paths. Their implementation and QA ownership is attached to variants, and finance serialization remains R11 → R12 → R13 → R14 because these waves touch shared report components.

---

## One-owner shared-file policy

When two waves list the same path in **Owned files**, only the earliest wave in merge order may edit it. Later waves must rebase and treat the path as **read-only** unless the orchestrator explicitly reassigns ownership.

### Shared-file registry

| Path | Sole owner | Forbidden to |
| --- | --- | --- |
| `DESIGN.md` | R1 | R2–R16 |
| `docs/AGENT_UI_SYSTEM.md`, `README.md` UI sections | R1 | R2–R14 |
| `src/app/globals.css`, `src/lib/sj/palette.ts` | R1 | R2–R14 |
| `src/components/ui/**` (if any remnants) | R1 | all others |
| `src/lib/ui/overlay-layers.ts` | R2 | R6–R16 |
| `src/components/primitives/dialog.tsx`, `popover.tsx`, `select.tsx`, `menu.tsx`, `combobox.tsx`, `tooltip.tsx`, `toast.tsx` | R2 | R4 may size select/combobox after R2 merges; R6–R14 read-only |
| `src/components/data-table/**` column contract files | R3 | R8–R14 |
| `src/components/auto-form/**`, `src/components/form/**` sizing | R4 | R8–R14 |
| `src/app/(internal)/subjects/create/page.tsx` | R5 | R4 (measure via GenericForm/users create only) |
| `src/components/layout/page-container.tsx`, `page-title.tsx`, `page-header.tsx` | R5 | R6–R14 |
| `src/app/layout.tsx` | R1 theme runtime → R2 portal layer; otherwise frozen | R6–R14 |
| `src/components/shell/**` | R1 theme bridge → R2 shell overlay layers; otherwise frozen | R6–R14 |
| `src/app/(internal)/finances/*/page.tsx` outside student-payments | R11 | R12–R14 |
| `src/components/finances/student-payments-report-shell.tsx` and report layout | R12 | R11, R14; R13 after Task 0 only |
| `docs/ui-remediation/route-manifest.json` | R15 Task 1–4 | R6–R14 (read fixture URLs only) |
| `scripts/ui-remediation/verify-final-integration.sh` | R16 | R0–R15 |

**Violation response:** stop the violating wave, open a failure report (see Failure routing), land the owning wave first, rebase violator.

---

## Branch and worktree naming

```bash
# From schedjuice-reimagined-fe at origin/dev
git fetch origin
git worktree add -b remediate/ui-r{N}-{slug} ../worktrees/ui-r{N}-{slug} origin/dev
```

| Wave | Branch | Worktree |
| --- | --- | --- |
| R0 | `remediate/ui-r0-verification` | `../worktrees/ui-r0-verification` |
| R1 | `remediate/ui-r1-tokens` | `../worktrees/ui-r1-tokens` |
| R2 | `remediate/ui-r2-overlay` | `../worktrees/ui-r2-overlay` |
| R3 | `remediate/ui-r3-tables` | `../worktrees/ui-r3-tables` |
| R4 | `remediate/ui-r4-forms` | `../worktrees/ui-r4-forms` |
| R5 | `remediate/ui-r5-page-shell` | `../worktrees/ui-r5-page-shell` |
| R6 | `remediate/ui-r6-global-shell` | `../worktrees/ui-r6-global-shell` |
| R7 | `remediate/ui-r7-dashboard` | `../worktrees/ui-r7-dashboard` |
| R8 | `remediate/ui-r8-admin-crud` | `../worktrees/ui-r8-admin-crud` |
| R9 | `remediate/ui-r9-courses` | `../worktrees/ui-r9-courses` |
| R10 | `remediate/ui-r10-content` | `../worktrees/ui-r10-content` |
| R11 | `remediate/ui-r11-finance-shell` | `../worktrees/ui-r11-finance-shell` |
| R12 | `remediate/ui-r12-sp-table` | `../worktrees/ui-r12-sp-table` |
| R13 | `remediate/ui-r13-sp-glide` | `../worktrees/ui-r13-sp-glide` |
| R14 | `remediate/ui-r14-payment-upload` | `../worktrees/ui-r14-payment-upload` |
| R15 | `remediate/ui-r15-route-qa` | `../worktrees/ui-r15-route-qa` |
| R16 | `remediate/ui-r16-final` | `../worktrees/ui-r16-final` |

PR title format: `remediate(ui): R{N} — {short description}`  
PR base branch: `dev`

---

## Base drift checks

Every worker plan records **Planning baseline SHA: `05ac447b`**. Before execution, each worker runs:

```bash
cd schedjuice-reimagined-fe
PLAN_SHA=05ac447b
CURRENT_BASE=$(git merge-base HEAD origin/dev)
if [ "$CURRENT_BASE" != "$(git rev-parse $PLAN_SHA)" ]; then
  echo "DRIFT: plan base $PLAN_SHA != merge-base $CURRENT_BASE"
fi
git diff --name-only "$PLAN_SHA"..HEAD -- src/app src/components src/config src/lib scripts package.json DESIGN.md README.md docs/AGENT_UI_SYSTEM.md
```

| Drift class | Action |
| --- | --- |
| Documentation-only or unrelated paths outside owned files | Continue after confirming owned files match plan inventory |
| Owned shared-file changed by another merged wave | Stop. Request orchestrator refresh of the worker plan forbidden/owned lists |
| Route-local file changed on `dev` since plan SHA | Re-read route at current SHA, update evidence appendix, confirm plan steps remain valid before editing |
| `docs/ui-remediation/route-manifest.json` changed while R6–R14 in flight | R6–R14 read updated fixture URLs; do not edit manifest |
| Verification baseline regresses (R0 gates fail on `dev`) | Stop all implementation waves until R0 repair lands |

---

## Reviewer dispatch prompt (implementation PRs)

Set `PR_URL`, `WAVE`, and `PLAN_FILE` to the real values, then copy the rendered prompt to a fresh review subagent after each implementation PR opens:

```text
You are an independent code reviewer for the UI Migration Remediation Program.
You do NOT implement fixes. You approve or request changes.

Repository: schedjuice-reimagined-fe
PR: $PR_URL
Wave: $WAVE
Plan file: $PLAN_FILE
Spec: docs/superpowers/specs/2026-07-12-ui-migration-remediation-program-design.md

Review checklist:
1. Edits stay inside the plan's Owned files list; no Forbidden files touched.
2. Shared contracts from R1–R5 are consumed, not redefined locally.
3. No new legacy token classes (text-muted-foreground, bg-card, shadcn imports).
4. No consumer-invented z-index numeric classes outside overlay-layers.ts.
5. Tests added per plan; verification commands in plan pass with expected output.
6. No weakened assertions, skipped tests, or excluded failing files.
7. Route changes include manifest fixture URL updates only if this wave owns manifest (R15).
8. Screenshots attached for UI-changing routes listed in the plan.

Return:
- APPROVE or REQUEST_CHANGES
- File-level findings with line references
- Whether failure is route-local or shared-contract (blocks dependent cohorts)
```

---

## QA dispatch prompt (R15 cohorts)

Set `INTEGRATED_SHA`, `QA_COHORT`, `COHORT_SELECTOR`, and `EVIDENCE_DIRECTORY` to the concrete values from the R15 cohort table, then copy the rendered prompt to a fresh QA subagent (see [`2026-07-12-ui-remediation-r15-independent-route-qa.md`](2026-07-12-ui-remediation-r15-independent-route-qa.md)):

```text
You are an independent QA verifier for UI Migration Remediation R15.
You do NOT patch failures. You verify and report evidence only.

Repository: schedjuice-reimagined-fe
Integrated SHA: $INTEGRATED_SHA
QA cohort: $QA_COHORT
Manifest selector: $COHORT_SELECTOR
Plan file: docs/superpowers/plans/2026-07-12-ui-remediation-r15-independent-route-qa.md
Manifest: docs/ui-remediation/route-manifest.json
Evidence output: $EVIDENCE_DIRECTORY

Acceptance:
1. Every route or route variant selected by the cohort has variant `qaStatus: pass`; a documented blocker is a valid failure report but does not complete the cohort.
2. Required persona, viewport, theme, and student-payment UI variant matrix executed per manifest entry.
3. Manual checks follow the composition/overlay/table/form criteria in the spec.
4. Run the complete browser gate exactly as `npm run test:browser`; skips, focused subsets, and grep filters are not acceptable.
5. Defects include screenshot or DOM evidence, reproduction steps, suspected owner wave.

Return:
- PASS / FAIL / BLOCKED for the cohort
- Per-route evidence JSON paths
- Blocking defects with owner wave (R6–R14 or R1–R5)
```

---

## Failure routing

| Failure type | Symptom | Route to | Blocks |
| --- | --- | --- | --- |
| F1 Shared-contract regression | Overlay/table/form/token break on multiple unrelated routes | Owning R1–R5 wave | All dependent route cohorts + R15 + R16 |
| F2 Route-local regression | Single route or route family broken | Owning R6–R14 wave | That cohort's R15 QA only |
| F3 Manifest gap | `page.tsx` missing from manifest or duplicate assignment | R15 generator owner | R15 QA for affected family |
| F4 Fixture blocker | Auth, permissions, or seed data missing for dynamic route | Report blocker in manifest `blockerReason` | That route only — not program skip |
| F5 Verification baseline | lint/typecheck/unit/build/browser fail on `dev` | R0 owner | All waves |
| F6 Shared-file collision | Two open PRs touch same path | Orchestrator: stop later PR | Later wave until rebase |
| F7 QA evidence incomplete | Missing screenshot, role, or viewport | Re-run R15-QA cohort | R16 |
| F8 Static gate failure | legacy tokens or z-index overrides in product code | R1 or R2 owner | R16 |

### Failure report template

```markdown
## UI Remediation Failure Report

- Route: /finances/student-payments
- Role: admin (payment.view_all)
- Viewport: 1280x800
- Theme: light
- Reproduction: open route, click status Select in row 3
- Expected: listbox above table, clickable
- Actual: listbox clipped; pointer events hit table header
- Evidence: docs/ui-remediation/qa-evidence/r15-qa8-resource-table/finances-student-payments/select-clip.png
- Suspected owner: R2 overlay stack (shared) or R12 student-payments table (route-local)
- Blocks: all cohorts if shared; R15-QA8 ResourceTable variant only if route-local
```

---

## Dispatcher checklist

- [ ] **Step 1: Confirm planning baseline** — `git rev-parse 05ac447b` exists on `origin/dev` ancestry
- [ ] **Step 2: Verify R0–R14 worker plans exist** at paths listed in Plan portfolio table
- [ ] **Step 3: Create R0 worktree** — `remediate/ui-r0-verification`; dispatch R0 plan only
- [ ] **Step 4: Merge R0** — review agent APPROVE; confirm `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run build`, `npm run test:browser` all pass on `dev`
- [ ] **Step 5: Create R1 worktree** — dispatch R1; merge before any R2–R5
- [ ] **Step 6: Spawn R2–R5 worktrees** — only after R1 merged; confirm forbidden-file lists are disjoint
- [ ] **Step 7: Merge R2–R5** — all four on `dev` before route cohorts
- [ ] **Step 8: Spawn R6–R10 worktrees** — parallel when inventories disjoint; assign one plan per subagent
- [ ] **Step 9: Merge R6–R10** — rebase any stragglers on updated `dev`
- [ ] **Step 10: Serialize finance** — R11 alone, then R12, then R13, then R14; never two finance waves concurrently
- [ ] **Step 11: Dispatch R15 Task 1–4** — manifest generator lands (may merge before route cohorts for fixture discovery)
- [ ] **Step 12: Dispatch R15 QA cohorts R15-QA1–R15-QA10** — after R6–R14 merged; R15-QA7 filters `shared-shell`, R15-QA8 filters `resource-table`, and R15-QA9 filters `glide` variants on the same real route entries; QA agents do not patch
- [ ] **Step 13: Confirm manifest closure** — every product `page.tsx` appears exactly once, every required route variant has evidence, and no route or variant has `qaStatus` pending, blocked, or fail
- [ ] **Step 14: Dispatch R16** — on final integrated SHA only; cold QA subagent after automated gates pass
- [ ] **Step 15: Record signoff** — `docs/ui-remediation/final-signoff.md` with SHA, command outputs, reviewer names

---

## Program status checklist

| Gate | Command / artifact | Owner | Status |
| --- | --- | --- | --- |
| R0 lint clean | `npm run lint` exit 0 | R0 | [ ] |
| R0 typecheck clean | `npm run typecheck` exit 0 | R0 | [ ] |
| R0 unit clean | `npm run test:unit` exit 0 | R0 | [ ] |
| R0 build clean | `npm run build` exit 0 | R0 | [ ] |
| R0 browser harness | `npm run test:browser` exit 0 | R0 | [ ] |
| R1 token convergence | `npm run check:legacy-tokens` exit 0 | R1 | [ ] |
| R2 overlay contract | `npm run check:overlay-z-index` exit 0 | R2 | [ ] |
| R3 table contract tests | `npm run test:unit -- src/components/data-table` exit 0 | R3 | [ ] |
| R4 form contract tests | `npm run test:unit -- src/components/auto-form` exit 0 | R4 | [ ] |
| R5 page shell tests | `npm run test:unit -- src/components/layout` exit 0 | R5 | [ ] |
| R6–R14 route cohorts merged | 9 PRs merged sequentially per merge order | R6–R14 | [ ] |
| Route manifest generated | `docs/ui-remediation/route-manifest.json` | R15 | [ ] |
| R15 QA cohorts pass | `docs/ui-remediation/qa-evidence/` complete | R15 | [ ] |
| R16 integrated SHA | `scripts/ui-remediation/verify-final-integration.sh` exit 0 | R16 | [ ] |
| Final signoff recorded | `docs/ui-remediation/final-signoff.md` | R16 | [ ] |

---

## Out of program (do not dispatch here)

- Historical migration plans under `docs/superpowers/plans/2026-07-09-*` and `2026-07-11-*` — evidence only, not current truth
- Backend API changes in `schedjuice-reimagined-be`
- Broad migration rollback to pre-July shadcn stack
- Pixel-snapshot every route/theme/viewport combination
- Unrelated product features discovered during route inspection

---

## Self-review (orchestrator)

**Spec coverage:** R0–R16 map to spec §6, §7, §9, §10, §11, §14. Manifest control plane assigned to R15. Final SHA verification assigned to R16.

**Placeholder scan:** No omitted-code markers or unresolved angle-bracket placeholders remain. JavaScript/TypeScript spread syntax is not used in this document.

**Type consistency:** Branch names and worker filenames match the complete R0–R16 portfolio. Student-payment route entries carry variant ownership for R12 (shared-shell + ResourceTable) and R13 (Glide) without duplicating `pagePath`.

## Portfolio readiness

All R0–R16 worker plan files listed in the portfolio table are present. Critical review findings from the foundation, route/finance, and control-plane passes have been reconciled into the plans (schema nullability, ownership gaps, artifact paths, browser-spec tasks, payment-admin coverage, finance serialization). Execution remains gated by the dependency DAG and R0’s zero-skip verification foundation.
