# DESIGN.md Chrome Migration — Orchestration Index

> **For agentic workers:** This is the dispatcher brief. Do **not** migrate UI in this document’s execution — only create worktrees, assign wave plans, run review agents, and merge to `dev`.

**Spec:** [`../specs/2026-07-09-design-md-chrome-migration-program-design.md`](../specs/2026-07-09-design-md-chrome-migration-program-design.md)  
**Playbook:** [`2026-07-09-design-md-chrome-migration-playbook.md`](2026-07-09-design-md-chrome-migration-playbook.md)

---

## Plan map

| Order | Plan | Branch | Parallel? |
| --- | --- | --- | --- |
| 1 | [`wave-0-dead-code`](2026-07-09-design-md-chrome-migration-wave-0-dead-code.md) | `migrate/ui-w0-dead-code` | Alone first |
| 2a | [`wave-1-list`](2026-07-09-design-md-chrome-migration-wave-1-list.md) | `migrate/ui-w1-list-chrome` | After W0; parallel with 2b–2d |
| 2b | [`wave-2-detail`](2026-07-09-design-md-chrome-migration-wave-2-detail.md) | `migrate/ui-w2-detail-chrome` | After W0 |
| 2c | [`wave-3-create-edit`](2026-07-09-design-md-chrome-migration-wave-3-create-edit.md) | `migrate/ui-w3-create-edit-chrome` | After W0 |
| 2d | [`wave-4-dashboard`](2026-07-09-design-md-chrome-migration-wave-4-dashboard.md) | `migrate/ui-w4-dashboard-chrome` | After W0 |

**Wave 0.5 shared chrome:** skipped — `PageContainer` has no legacy `ui/*` imports. If a wave discovers a shared wrapper collision, open a tiny PR first and rebase the others.

---

## Dispatcher checklist

- [ ] **Step 1: Merge Wave 0** (migrate agent → review agent → `gh pr merge` to `dev`)
- [ ] **Step 2: Confirm `origin/dev` has no `src/components/quizv2`**
- [ ] **Step 3: Spawn four worktrees** from updated `origin/dev` for Waves 1–4
- [ ] **Step 4: Assign each migrate sub-agent its plan path only** (no cross-wave file edits)
- [ ] **Step 5: As each PR opens, assign a review sub-agent** using that plan’s review brief
- [ ] **Step 6: Merge passing PRs to `dev`**; if two land close together, rebase remaining worktrees
- [ ] **Step 7: After all four merge, spot-check** Campuses list, Course members, Departments create, Finance school-overview (light + dark)

---

## Conflict rule

If `git diff` for two in-flight waves shares a path:

1. Stop the later wave’s edits to that path.
2. Land the earlier PR (or a Wave 0.5 extraction).
3. Rebase the later wave and continue.

---

## Out of program (do not dispatch here)

- Data-table + AutoForm program — see [`2026-07-09-data-table-auto-form-orchestration.md`](2026-07-09-data-table-auto-form-orchestration.md)
- Package removal (PN) lives in that program after F3 + these chrome waves
- `debug/**` reskins
