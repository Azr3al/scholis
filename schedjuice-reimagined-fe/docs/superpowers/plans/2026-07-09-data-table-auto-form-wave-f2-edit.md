# Wave F2 — Edit / Settings Autosave Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans.

**Goal:** Migrate edit/settings pages to `saveMode="edit"` with optimistic autosave, `savedTick`, logical groups, and high-risk opt-outs.

**Depends on:** F0. Can parallel F1 if file inventories disjoint.  
**Branch:** `migrate/ui-f2-edit`

---

## Inventory

| Path | Autosave today | Target |
| --- | --- | --- |
| `…/campuses/[id]/edit/page.tsx` | ✅ GenericForm autosave | New auto-form edit |
| `…/course-roles/[id]/edit/page.tsx` | ✅ | New + groups |
| `…/discounts/[id]/edit/page.tsx` | ✅ | New + groups |
| `…/payment-plans/[id]/edit/page.tsx` | ✅ | New + groups |
| `…/subjects/[id]/edit/page.tsx` | ❌ submit | Enable edit autosave |
| `…/categories/[id]/edit/page.tsx` | ✅ direct AutoForm | New package |
| `…/payment-methods/[id]/edit/page.tsx` | ✅ | New |
| `…/payment-infos/[id]/edit/page.tsx` | ✅ | May need F3 overrides |
| `…/departments/[id]/edit/page.tsx` | ✅ AutoForm | Info tab only; jobs table already T2 |
| `…/programs/[id]/edit/page.tsx` | ❌ | Enable autosave + groups |
| `…/programs/[id]/settings/page.tsx` | ❌ | Autosave safe fields |
| `…/intakes/[id]/edit/page.tsx` | ❌ | Enable autosave |
| `…/visibilities/[id]/edit/page.tsx` | ❌ | F3 if custom Select/accordions |
| `…/data-verification-requests/[id]/verify/page.tsx` | ❌ | Explicit submit OK if verification is high-risk |
| `…/courses/[id]/edit/page.tsx` | ✅ AutoFormObject | Align with new groups/skeleton; may stay sectioned hand layout — use new field renderer |
| `…/assignments/[id]/edit/page.tsx` | ❌ | Via AssignmentForm |
| `…/email-templates/.../edit/page.tsx` | ❌ | Via template form |
| Org record panels (`org-schema-section-panel`, shell) | Section Save | Prefer keep section Save (multi-field) — wire Field primitives + tick; do not force blur-autosave on whole org schema |

**Skeletons:** course edit loading + visibilities edit + DVR verify → group-aware.

---

### Tasks

- [ ] **Task 1:** Worktree.
- [ ] **Task 2:** Migrate already-autosaving GenericForm edits first (prove parity).
- [ ] **Task 3:** Enable autosave on programs/intakes/subjects edits with high-risk opt-outs as needed.
- [ ] **Task 4:** Course edit — replace skeleton; ensure no layout jump; field isolation.
- [ ] **Task 5:** Org panels — Field/edit-kit alignment without breaking section Save UX (DESIGN.md prefers section edit mode for multi-field).
- [ ] **Task 6:** Grep + smoke campus edit (tick), program edit, course edit; PR.

## Review brief

```
F2: edit pages on saveMode=edit where appropriate; savedTick reserved; high-risk not blur-saved; skeletons match groups; org section Save preserved where required.
```
