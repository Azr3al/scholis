# Wave F1 — Create Pages Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans.

**Goal:** Migrate create flows to new auto-form with `saveMode="create"`, real **logical groups**, and fidelity skeletons.

**Depends on:** F0.  
**Branch:** `migrate/ui-f1-create`

---

## Inventory (create / explicit-submit)

| Path | Today | Groups hint |
| --- | --- | --- |
| `…/programs/create/page.tsx` | GenericForm | Identity / academic |
| `…/subjects/create/page.tsx` | GenericForm | Details |
| `…/categories/create/page.tsx` | GenericForm | Details |
| `…/campuses/create/page.tsx` | GenericForm | Details |
| `…/(department)/departments/create/page.tsx` | GenericForm | Details |
| `…/course-roles/create/page.tsx` | GenericForm | Role meta |
| `…/discounts/create/page.tsx` | GenericForm | Discount |
| `…/payment-plans/create/page.tsx` | GenericForm | Plan |
| `…/payment-methods/create/page.tsx` | GenericForm | Method (+ bank) |
| `…/payment-infos/create/page.tsx` | GenericForm | Payment info — may need F3 field overrides |
| `…/data-verification-requests/create/page.tsx` | GenericForm | Complex — if too heavy, leave for F3 |
| `…/organizations/create/page.tsx` | AutoForm direct | Org basics |
| `…/organizations/[id]/admins/create/page.tsx` | AutoForm | F3 if custom fieldTypes dominate |
| `…/visibilities/create/page.tsx` | AutoForm | F3 |
| `…/components/course/assignment-form.tsx` | AutoForm | Create path via tab |
| `…/components/users/course-history/course-history-form.tsx` | AutoForm | Embedded |
| `…/components/email-templates/template-form.tsx` | AutoForm | Create |
| `…/components/registration/info-step.tsx` | AutoForm | Public — F3 if custom groups |
| `…/components/auth/login-form.tsx` | AutoForm | Auth — migrate controls to primitives; keep explicit submit |

**Skeletons:** `users/create` + `UserForm` — replace `AutoFormFieldsSkeleton` with section-aware skeleton matching `UserForm` sections (even if UserForm stays hand-composed).

**Skip for F3:** visibilities, DVR create if still on custom matrices, org admin create with EntityChooser, registration info-step if still heavily custom.

---

### Tasks

- [ ] **Task 1:** Worktree post-F0.
- [ ] **Task 2:** For each simple GenericForm create page — add `groups`, `saveMode="create"`, sticky footer, group skeleton on `fieldsLoading`.
- [ ] **Task 3:** Migrate direct AutoForm create pages that are simple (organizations/create, login-form).
- [ ] **Task 4:** User create loading skeletons → group-aware.
- [ ] **Task 5:** Grep migrated files — no `@/components/ui/auto-form` imports.
- [ ] **Task 6:** Smoke campuses create + programs create; PR.

## Review brief

```
F1: create inventory (non-F3) on new auto-form; groups present; skeletons match; no whole-form watch; sticky submit; complex overrides deferred to F3.
```
