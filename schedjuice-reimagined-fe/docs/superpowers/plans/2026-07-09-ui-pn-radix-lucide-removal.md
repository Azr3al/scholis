# PN — Zero `@/components/ui` + Lucide → Uninstall Radix/Lucide

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Remap every product consumer off `@/components/ui/*` and `lucide-react`, delete unused `src/components/ui/**`, then `npm uninstall` Lucide + `@radix-ui/*`.

**Branch:** `migrate/ui-pn-packages` (or wave sub-branches with disjoint inventories)  
**Depends on:** Tables T4 + AutoForm F3 already on `dev`.  
**Playbook swaps:** [`2026-07-09-design-md-chrome-migration-playbook.md`](2026-07-09-design-md-chrome-migration-playbook.md) import table — **expanded** so modules without a primitive twin are still remapped (hand-compose / Field / data-table), not left behind.

---

## Architecture

1. **Foundation (shared):** Remove Lucide from `src/components/primitives` (Button spinner → Iconoir). Any shared helper for card/badge chrome if needed.
2. **Parallel remaps** by **disjoint path inventories** (separate worktrees/branches). Each wave: remap imports + Lucide→Iconoir in touched files; do not invent new primitives.
3. **Validate:** `rg` gates on touched paths; unit tests for touched packages; no new Lucide/`@/components/ui` in scope.
4. **Review:** Separate reviewer per wave PR.
5. **Final PN:** After all consumers gone — delete `src/components/ui/**`, uninstall packages, prove greps clean.

## Import remap rules (expanded)

| Legacy | Replacement |
| --- | --- |
| `ui/button` | `primitives` `Button` / `buttonVariants` — map `default`→`primary`, `destructive`→`danger`, `outline`→`secondary` |
| `ui/input`, `textarea`, `checkbox`, `switch`, `slider` | matching primitives |
| `ui/select` | primitives `Select` (API differs — copy patterns from existing primitive consumers) |
| `ui/dialog`, `alert-dialog`, `sheet`, `popover`, `tooltip`, `tabs`, `separator`, `skeleton`, `avatar` | matching primitives |
| `ui/dropdown-menu` | primitives `Menu` |
| `ui/use-toast` / `ui/toast` | primitives `useToast` / toast |
| `ui/form` (`Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage`, `FormDescription`) | primitives `Field` + RHF `Controller` / existing Field patterns — **do not** keep shadcn Form |
| `ui/table` (non–data-table) | Prefer `@/components/data-table` `Table` when list-like; else plain `<table>` + token classes |
| `ui/card`, `ui/badge` | Hand-compose: `border-border bg-surface rounded-*` / small pill with `bg-surface-hover text-text-secondary` — no new primitive unless blocked |
| `ui/label` | `Field.Label` or `<label className="…">` |
| `ui/progress`, `ui/command`, `ui/calendar`, `ui/chart`, etc. | Closest primitive or hand-compose; note gaps in PR if blocked |
| `lucide-react` | `iconoir-react` equivalents in every touched file |
| Relative `../ui/…` | Same remaps to `@/components/…` |

**Do not** reintroduce `@/components/ui/auto-form` or legacy DataTable (already deleted).

**Out of scope for behavior:** debug/demo pages may be remapped or deleted if Lucide-only dead weight; prefer remap if still linked from nav.

## Parallel wave inventories (disjoint)

| Wave | Branch | Paths |
| --- | --- | --- |
| PN0 | `migrate/ui-pn0-primitives` | `src/components/primitives/**` only (Lucide out of Button) |
| PN1 | `migrate/ui-pn1-app-internal` | `src/app/**` |
| PN2 | `migrate/ui-pn2-course` | `src/components/course/**`, `src/components/scheduling/**` |
| PN3 | `migrate/ui-pn3-quiz-users-org` | `src/components/quiz-v3/**`, `users/**`, `org/**`, `record/**`, `user-hub/**`, `user-logs/**` |
| PN4 | `migrate/ui-pn4-rest-components` | All other `src/components/**` except `ui/**` and paths in PN2–PN3; plus `src/hooks/**`, `src/config/**`, `src/helpers/**` if they import ui/lucide |
| PN5 | `migrate/ui-pn5-delete-uninstall` | **After PN1–4 merged:** delete `src/components/ui/**`, uninstall lucide + radix, final greps |

## Acceptance (final)

```bash
rg -n "from [\"']@/components/ui/|from [\"'].*components/ui/" src --glob '!**/components/ui/**'
# Expect: zero (and ui dir deleted)

rg -n "from [\"']lucide-react[\"']" src
# Expect: zero

rg -n "@radix-ui/" package.json
# Expect: zero after uninstall

test ! -d src/components/ui
```

## Review brief

```
PN: no @/components/ui or lucide in wave inventory; API maps correct (Button variants, Select, Field); no behavior regressions; Iconoir only.
```
