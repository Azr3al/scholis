# DESIGN.md Chrome Migration Program — Design Spec

**Date:** 2026-07-09  
**Status:** Approved (brainstorming 2026-07-09)  
**Authority:** [`DESIGN.md`](../../../DESIGN.md) — palette, type, layout §9, motion §12, banned list §14  
**Predecessors:**
- Foundation — [`2026-06-21-design-foundation-phase-1.md`](2026-06-21-design-foundation-phase-1.md)
- App shell — [`2026-06-21-app-shell-sidebar-design.md`](2026-06-21-app-shell-sidebar-design.md)
- User / org / course record shells (June 2026 strangler pilots)
- Search widgets tranche — [`2026-07-06-legacy-ui-search-widgets-design.md`](2026-07-06-legacy-ui-search-widgets-design.md)

---

## 1. Summary

Finish migrating unfinished `schedjuice-reimagined-fe` product surfaces onto the DESIGN.md world using **Approach B**: visual/token chrome reskin (primitives, Iconoir, semantic tokens, §12 motion) while leaving **`DataTable` / `UnManagedDataTable` and `AutoForm` / `auto-form` internals** to separate future workflows.

Work is grouped by **shared chrome pattern** (not by product domain), executed as **Wave 0 dead-code cleanup** then **Waves 1–4 pattern migrations**, each as a self-contained plan for a migrate sub-agent in a git worktree. After each PR, a **separate review sub-agent** checks DESIGN.md / playbook compliance; on pass, merge to **`dev`**. Parallelism is allowed only when file inventories are disjoint.

---

## 2. Context

Phase 1 foundation and early strangler pilots shipped: `.sj-root` tokens, Base UI primitives, app shell, user/org/course record shells, Academic Hub, attendance dashboard/marking, find-page, and partial search-widget work.

Inventory snapshot (2026-07-09, approximate):

| Signal | Count |
| --- | --- |
| App Router `page.tsx` files | ~262 |
| Pages still importing `@/components/ui/*` | ~184 |
| Legacy `src/components/ui/*` components | ~71 |
| Primitives under `src/components/primitives/` | ~26 |

Already largely on the new world (do not re-migrate shells): app shell, user record, org record, course record shell + overview, attendance dashboard/marking, find-page, design showcase.

Still unfinished (chrome): most course sub-route bodies, finance, quizzes-v3 admin/take chrome, certificates, announcements, admin CRUD (campuses, categories, programs, …), public/auth product pages, docs shells where still on shadcn, shortcuts, assignments, etc.

Quiz **v1/v2** leftovers remain (`(quizv2)` routes, `components/quizv2`, `store/quizv2`) while product nav already points at **quizzes-v3** — confirmed dead for this program’s Wave 0.

---

## 3. Locked decisions

| Topic | Decision |
| --- | --- |
| Migration depth | **B — chrome / token reskin**; not full cutover of every widget |
| Deferred widgets | **`DataTable` / `UnManagedDataTable`** and **`AutoForm` / `auto-form`** — separate workflows |
| Grouping | **By shared chrome pattern** (list, detail, create/edit, dashboard) |
| Pipeline | **Fully automated:** migrate agent → PR → review agent → merge to `dev` |
| Product scope | **All unfinished product pages** except deferred widgets; **include** public/auth and quiz-v3 take chrome |
| Debug / demo | **Out of scope** (`debug/*`, demo-artifacts) unless confirmed dead in Wave 0 |
| Dead code | **Wave 0 own PR first** (or parallel-safe): delete quiz v1/v2 + other confirmed-dead code |
| Old quiz URLs | **Delete with no redirect** (`/quizzes`, `/qid/...` → 404) |
| Parallelism | Only with **disjoint file inventories**; shared wrappers via optional Wave 0.5 |
| Package removal | **Not this program** (Phase N: remove `components/ui`, Radix, Lucide, etc.) |

---

## 4. Goals & non-goals

### Goals

1. Reskin unfinished product page chrome to DESIGN.md (primitives, tokens, Iconoir, motion).
2. Delete quiz v1/v2 leftovers and other confirmed-dead code in Wave 0.
3. Produce **separate, agent-ready implementation plans** per wave for parallel worktrees.
4. Enforce quality via a dedicated review agent before each merge to `dev`.
5. Keep behavior and routes identical (except intentional dead-route removal).

### Non-goals

- Rewriting data-table or auto-form implementations.
- Domain-complete “Finance is done” PRs (domains converge as pattern waves merge).
- Migrating debug/demo tooling.
- Global shadcn/Radix/Lucide package deletion.
- Inventing new primitives mid-wave (missing primitive → follow-up note, use closest existing).

---

## 5. Wave structure

### Wave 0 — Dead code

**Own PR, lands before pattern waves touch those paths.**

Delete (minimum allowlist; expand only with import-graph proof):

| Path / area | Action |
| --- | --- |
| `src/app/(internal)/(quizv2)/**` | Delete |
| `src/app/(quizv2)/**` | Delete |
| `src/components/quizv2/**` | Delete |
| `src/store/quizv2.ts` | Delete |
| Nav / permissions / helpers still pointing at v2 `/quizzes` or `/qid` | Remove or retarget to quizzes-v3 only where a live product link is required |
| Other dead routes/components | Delete only if **no nav entry** and **zero remaining imports** |

**Acceptance:** `rg` shows zero imports of deleted modules; FE build/typecheck passes; nav exposes quizzes-v3 only.

### Wave 0.5 — Shared chrome (optional)

Only if inventory shows multiple waves needing the same shared wrapper (e.g. `PageContainer`, shared filter chrome). Tiny PR first; then pattern waves rebase.

### Waves 1–4 — Pattern migrations

| Wave | Pattern | Migrates | Leaves alone |
| --- | --- | --- | --- |
| **1** | List / index | Page chrome, headers, filters, empty states, buttons/badges/cards → primitives | Embedded table **bodies** |
| **2** | Detail / record body | Identity strips, section chrome, cards/sheets/dialogs around content | Table widgets; already-migrated record shells |
| **3** | Create / edit chrome | Layout, sticky actions, skeletons, non-auto-form controls | `AutoForm` field trees as-is |
| **4** | Dashboard / dense ops | Toolbars, status chrome, panels, motion entrances | Matrix/table cores that are deferred widgets |

**Inventory rule:** each plan lists exact files + touch / don’t-touch markers. Pages that are mostly a `DataTable` still get list chrome under Wave 1.

**Ordering:** Wave 0 first → optional 0.5 → Waves 1–4 in parallel only if disjoint; otherwise serialize overlapping files.

---

## 6. Shared migration playbook

**References:** app shell, user/org/course record, attendance dashboard/marking, find-page, staff search combobox patterns.

### Do

- Migrate chrome under the existing `.sj-root` shell token world (do not fight `ContentReset`).
- Swap `components/ui/{button,input,select,dialog,sheet,skeleton,badge,card,tabs,separator,tooltip,…}` → `components/primitives/*` where a primitive exists.
- Replace Lucide with Iconoir in touched files.
- Use semantic tokens only (`bg-surface`, `text-text-primary`, `border-border`, `text-accent`, …).
- Mount new sections with locked recipes from `src/lib/sj/motion.ts` (`crossfade` / `staggerList` / `popIn`) + `useReducedMotion()`.
- Keep behavior and routes identical (except Wave 0 deletions).
- Leave `DataTable` / `UnManagedDataTable` / `AutoForm` imports in place; only reskin surrounding chrome.

### Don’t

- Rewrite table column defs, form schemas, or API hooks “while there.”
- Expand into debug/demo pages.
- Delete shadcn packages globally.
- Add new primitives mid-wave without a follow-up note.

### Migrate agent self-check (before PR)

- Grep touched files: no new Lucide; no new `ui/*` except deferred table/auto-form.
- Light + dark smoke on 1–2 representative pages from the inventory.
- No intentional behavior changes.

### Review agent checklist

- Playbook compliance on the diff.
- Inventory boundaries respected (no out-of-wave files).
- Deferred widgets untouched internally.
- DESIGN.md §14 bans not violated in new code.
- Fail closed; max **2** fix rounds on the same PR, then escalate to human.

---

## 7. Orchestration pipeline

**Repo:** `schedjuice-reimagined-fe`  
**Base branch:** latest `dev`

Per wave:

1. **Implementation plan** — self-contained for one migrate sub-agent (inventory, playbook pointer, don’t-touch, acceptance commands, PR title/body template).
2. **Worktree** — branch `migrate/ui-<wave>-<pattern>` (e.g. `migrate/ui-w0-dead-code`, `migrate/ui-w1-list-chrome`).
3. **Migrate sub-agent** — execute plan only; open PR → `dev`.
4. **Review sub-agent** — read-only on that PR; pass/fail against playbook + DESIGN.md.
5. **Merge** — on pass, merge to `dev` (no force-push; normal merge/squash per repo norm).
6. **Rebase gate** — later waves recreate/rebase worktrees from post-merge `dev`.

### Conflict policy

- Shared wrappers → Wave 0.5 first.
- Otherwise inventories must be file-disjoint before parallel dispatch.
- Accidental table/auto-form edits → review rejects; revert those hunks.
- Merge conflicts → rebase, re-run acceptance, re-request review.

---

## 8. Verification

| Gate | Requirement |
| --- | --- |
| Typecheck / lint | Repo’s usual FE commands on touched scope |
| Grep | No new Lucide; no new `ui/*` except deferred `data-table` / `auto-form` |
| Smoke | 1–2 inventory pages, light + dark |
| Wave 0 | Build passes; zero imports of deleted modules; quizzes-v3-only nav |

---

## 9. Risks

| Risk | Mitigation |
| --- | --- |
| Parallel agents edit same shared chrome | Wave 0.5 or serialize overlapping files |
| Domains look half-migrated until all waves land | Expected under pattern grouping; document in PRs |
| Agent “fixes” tables/forms | Hard don’t-touch + review reject |
| Dead-code delete breaks a hidden deep link | Import-graph allowlist; no redirects by default |
| Review rubber-stamping | Fixed checklist; fail closed on §14 |

---

## 10. Deliverables

1. **This spec** — program design (committed).
2. **Implementation plans** (committed):
   - Playbook — [`../plans/2026-07-09-design-md-chrome-migration-playbook.md`](../plans/2026-07-09-design-md-chrome-migration-playbook.md)
   - Orchestration — [`../plans/2026-07-09-design-md-chrome-migration-orchestration.md`](../plans/2026-07-09-design-md-chrome-migration-orchestration.md)
   - Wave 0 — [`../plans/2026-07-09-design-md-chrome-migration-wave-0-dead-code.md`](../plans/2026-07-09-design-md-chrome-migration-wave-0-dead-code.md)
   - Wave 1 — [`../plans/2026-07-09-design-md-chrome-migration-wave-1-list.md`](../plans/2026-07-09-design-md-chrome-migration-wave-1-list.md)
   - Wave 2 — [`../plans/2026-07-09-design-md-chrome-migration-wave-2-detail.md`](../plans/2026-07-09-design-md-chrome-migration-wave-2-detail.md)
   - Wave 3 — [`../plans/2026-07-09-design-md-chrome-migration-wave-3-create-edit.md`](../plans/2026-07-09-design-md-chrome-migration-wave-3-create-edit.md)
   - Wave 4 — [`../plans/2026-07-09-design-md-chrome-migration-wave-4-dashboard.md`](../plans/2026-07-09-design-md-chrome-migration-wave-4-dashboard.md)
   - Wave 0.5 — **skipped** (no shared-wrapper collision at planning time)

Each wave plan is a standalone brief for one migrate sub-agent **plus** a paired review brief.

**Not deliverables of this program:** data-table program, auto-form program, Phase N package removal.

---

## 11. Approach record

Brainstorming compared three structures; **Approach 1 (pattern waves)** was chosen:

1. Wave 0 dead-code → Waves 1–4 by chrome pattern → review → merge `dev`
2. Rejected: domain-batched PRs (larger conflicts, weaker parallelism)
3. Rejected: one-page-family micro-PRs (plan/agent sprawl)

---

## 12. Open follow-ups (explicitly outside this program)

- Dedicated **data-table** DESIGN.md migration workflow
- Dedicated **auto-form** DESIGN.md migration workflow
- Phase **N** cleanup: remove `components/ui`, Radix, Lucide, `next-themes`, `components.json` once consumers are gone
- Optional later: redirects from deleted quiz v2 URLs (not in this program)
