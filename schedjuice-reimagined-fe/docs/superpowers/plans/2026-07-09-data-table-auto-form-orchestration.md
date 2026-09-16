# Data Table & AutoForm — Orchestration Index

> **For agentic workers:** This is the dispatcher brief. Do **not** implement UI here — only create worktrees, assign wave plans, run review agents, and merge to `dev`.

**Spec:** [`../specs/2026-07-09-data-table-auto-form-program-design.md`](../specs/2026-07-09-data-table-auto-form-program-design.md)  
**Playbook:** [`2026-07-09-data-table-auto-form-playbook.md`](2026-07-09-data-table-auto-form-playbook.md)

---

## Plan map

| Order | Plan | Branch | Parallel? |
| --- | --- | --- | --- |
| 1 | [`wave-t0-foundation`](2026-07-09-data-table-auto-form-wave-t0-foundation.md) | `migrate/ui-t0-foundation` | Alone first |
| 2 | [`wave-t1-index-lists`](2026-07-09-data-table-auto-form-wave-t1-index-lists.md) | `migrate/ui-t1-index-lists` | After T0 |
| 3 | [`wave-t2-embedded`](2026-07-09-data-table-auto-form-wave-t2-embedded.md) | `migrate/ui-t2-embedded` | After T1 (or parallel with T3 only if inventories disjoint — prefer serialize) |
| 4 | [`wave-t3-dense-ops`](2026-07-09-data-table-auto-form-wave-t3-dense-ops.md) | `migrate/ui-t3-dense-ops` | After T1; prefer after T2 if edit-kit still moving |
| 5 | [`wave-t4-delete-legacy-tables`](2026-07-09-data-table-auto-form-wave-t4-delete-legacy-tables.md) | `migrate/ui-t4-delete-tables` | After T1–T3 merged |
| 6 | [`wave-f0-foundation`](2026-07-09-data-table-auto-form-wave-f0-foundation.md) | `migrate/ui-f0-foundation` | **Default after T4** |
| 7 | [`wave-f1-create`](2026-07-09-data-table-auto-form-wave-f1-create.md) | `migrate/ui-f1-create` | After F0 |
| 8 | [`wave-f2-edit`](2026-07-09-data-table-auto-form-wave-f2-edit.md) | `migrate/ui-f2-edit` | After F0; can parallel F1 if disjoint |
| 9 | [`wave-f3-complex`](2026-07-09-data-table-auto-form-wave-f3-complex.md) | `migrate/ui-f3-complex` | After F1–F2 |
| 10 | [`wave-pn-package-cleanup`](2026-07-09-data-table-auto-form-wave-pn-package-cleanup.md) | `migrate/ui-pn-packages` | After F3 **and** chrome migration waves leave zero `ui/*` / Lucide / Radix consumers |

---

## Dispatcher checklist

- [ ] **Step 1: Merge T0** (migrate → review → `gh pr merge` to `dev`)
- [ ] **Step 2: Confirm** `src/components/data-table/`, `src/components/edit-kit/`, and pilot `src/sdk/` exist on `origin/dev`
- [ ] **Step 3: Run T1** (largest list cutover + SDK hooks per entity)
- [ ] **Step 4: Run T2 then T3** (embedded, then dense/editable/`UnManagedDataTable`)
- [ ] **Step 5: Merge T4** — grep proves zero legacy data-table imports; delete modules
- [ ] **Step 6: Run F0 → F1/F2 → F3**
- [ ] **Step 7: After chrome program + F3, run PN** package cleanup
- [ ] **Step 8: Spot-check** Campuses list, Course members, Check-in histories (editable), Campus create, Campus edit (autosave), light + dark

---

## Conflict rule

If two in-flight waves share a path:

1. Stop the later wave’s edits to that path.
2. Land the earlier PR (or extract shared module into T0/F0).
3. Rebase the later wave and continue.

**Delete-legacy rule:** when a PR removes the last consumer of a legacy helper, delete that helper in the **same** PR. No dual-API shims.

---

## Out of program (do not dispatch here)

- Chrome pattern-wave page reskins ([`2026-07-09-design-md-chrome-migration-orchestration.md`](2026-07-09-design-md-chrome-migration-orchestration.md))
- Glide `DataSheet` feature work (`src/components/data-sheet/`)
- Hand-composed complex entity forms beyond CRUD strangler (forms strategy north star)
