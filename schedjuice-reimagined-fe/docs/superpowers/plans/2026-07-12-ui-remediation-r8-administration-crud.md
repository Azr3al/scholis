# Administration CRUD — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair administration list/detail/create/edit/settings routes (users, orgs, reference data, logs, leads, points, imports) for unified headers, table/form sizing, token vocabulary, and empty/loading/error states.

**Architecture:** Index routes keep ResourceTable but supply R3 column metadata via route-local column builders. Create/edit routes use R4 contextual AutoForm width. Detail routes replace `_chrome/card` stacks with R5 section composition and `usePageHeader` actions. Legacy `AcademicPageHeader` usages migrate to shell header config.

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

**Route count:** 81 product routes (excludes design/debug/artifacts and all finance R11–R14 routes)

All FE commands run from `schedjuice-reimagined-fe/`.

## Current-state evidence (base `05ac447b`)

| Location | Issue |
| --- | --- |
| 12/81 owned pages | Import `@/app/_chrome/*` (badge/card/table) at base SHA |
| 5/81 owned pages | Still use `AcademicPageHeader` instead of R5 `PageHeader`/`usePageHeader` |
| 18/81 owned pages | Use AutoForm — rely on R4 contextual width; remove local `max-w-xl` overrides only in owned files |
| 14/81 owned pages | ResourceTable indexes — add R3 column metadata in route-local column builders |
| `src/app/(internal)/users/page.tsx` | Missing `PageContainer`; list chrome delegated to child component |
| `src/app/(internal)/custom-field-definitions/page.tsx` | Legacy tokens without `PageContainer` |
| Cohort scan | `_chrome` pages: 13; legacy token pages: 5; missing PageContainer (internal): see manifest |

**Pages with `@/app/_chrome/*` imports (migrate in this plan):**

- `src/app/(internal)/(department)/departments/[id]/page.tsx`
- `src/app/(internal)/campuses/[id]/page.tsx`
- `src/app/(internal)/categories/[id]/page.tsx`
- `src/app/(internal)/course-roles/[id]/page.tsx`
- `src/app/(internal)/data-verification-requests/[id]/page.tsx`
- `src/app/(internal)/data-verification-requests/create/page.tsx`
- `src/app/(internal)/intakes/[id]/page.tsx`
- `src/app/(internal)/programs/[id]/page.tsx`
- `src/app/(internal)/programs/[id]/settings/page.tsx`
- `src/app/(internal)/storage/page.tsx`
- `src/app/(internal)/subjects/[id]/page.tsx`
- `src/app/(internal)/users/[id]/assign-courses/page.tsx`
- `src/app/(internal)/visibilities/[id]/page.tsx`

**R5 contracts to consume (do not redefine):** `PageContainer`, `PageTitle`, `PageHeader`, `PageSection`, `usePageHeader`, `page-composition.ts` width/density map.

---


## Stop conditions

Stop and report (do not patch shared contracts locally) when:

1. Current branch base SHA differs from `05ac447b10966131d4f37a2ba724110c33d66dd4` and owned page files changed upstream — re-read routes and confirm plan validity.
2. Any file in **Forbidden shared files** below changed on your branch — escalate to the owning R1–R5 plan.
3. `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run build`, or `npm run test:browser` fails after your change and the failure is outside owned files.
4. Required auth storage state, organization/user record fixture, CRUD permission, or persona is unavailable — STOP before execution, report the affected route as BLOCKED, and do not run or skip any browser test.
5. A defect requires editing `src/components/data-table/resource-table.tsx`, `src/components/auto-form/**`, or `src/components/shell/**`.

**Escape hatch:** Document a narrow, evidence-backed exception in `docs/superpowers/specs/ui-remediation-exceptions.md` and stop implementation until approved.

---

## Forbidden shared files

| Path | Owner plan | Reason |
| --- | --- | --- |
| `src/app/globals.css` | R1 | Token vocabulary and theme runtime |
| `src/components/shell/**` | R5 (+ R2 for overlays in shell) | App shell, sidebar, panel header |
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

### Page routes (81)

- `src/app/(internal)/(department)/departments/[id]/edit/page.tsx`
- `src/app/(internal)/(department)/departments/[id]/page.tsx`
- `src/app/(internal)/(department)/departments/create/page.tsx`
- `src/app/(internal)/(department)/departments/page.tsx`
- `src/app/(internal)/administration/roles/page.tsx`
- `src/app/(internal)/campuses/[id]/edit/page.tsx`
- `src/app/(internal)/campuses/[id]/page.tsx`
- `src/app/(internal)/campuses/create/page.tsx`
- `src/app/(internal)/campuses/page.tsx`
- `src/app/(internal)/categories/[id]/edit/page.tsx`
- `src/app/(internal)/categories/[id]/page.tsx`
- `src/app/(internal)/categories/create/page.tsx`
- `src/app/(internal)/categories/page.tsx`
- `src/app/(internal)/categories/sort-order/page.tsx`
- `src/app/(internal)/course-roles/[id]/edit/page.tsx`
- `src/app/(internal)/course-roles/[id]/page.tsx`
- `src/app/(internal)/course-roles/create/page.tsx`
- `src/app/(internal)/course-roles/page.tsx`
- `src/app/(internal)/custom-field-definitions/create/page.tsx`
- `src/app/(internal)/custom-field-definitions/page.tsx`
- `src/app/(internal)/data-verification-requests/[id]/edit/page.tsx`
- `src/app/(internal)/data-verification-requests/[id]/page.tsx`
- `src/app/(internal)/data-verification-requests/[id]/verify/page.tsx`
- `src/app/(internal)/data-verification-requests/create/page.tsx`
- `src/app/(internal)/data-verification-requests/page.tsx`
- `src/app/(internal)/id-card/bulk/page.tsx`
- `src/app/(internal)/id-card/page.tsx`
- `src/app/(internal)/id-card/settings/page.tsx`
- `src/app/(internal)/imports/page.tsx`
- `src/app/(internal)/intakes/[id]/edit/page.tsx`
- `src/app/(internal)/intakes/[id]/page.tsx`
- `src/app/(internal)/intakes/create/page.tsx`
- `src/app/(internal)/intakes/page.tsx`
- `src/app/(internal)/leads/page.tsx`
- `src/app/(internal)/leads/settings/page.tsx`
- `src/app/(internal)/logs/page.tsx`
- `src/app/(internal)/logs/settings/page.tsx`
- `src/app/(internal)/organizations/[id]/admins/create/page.tsx`
- `src/app/(internal)/organizations/[id]/page.tsx`
- `src/app/(internal)/organizations/create/page.tsx`
- `src/app/(internal)/organizations/page.tsx`
- `src/app/(internal)/organizations/profile/page.tsx`
- `src/app/(internal)/points/page.tsx`
- `src/app/(internal)/points/settings/page.tsx`
- `src/app/(internal)/programs/[id]/edit/page.tsx`
- `src/app/(internal)/programs/[id]/page.tsx`
- `src/app/(internal)/programs/[id]/settings/page.tsx`
- `src/app/(internal)/programs/create/page.tsx`
- `src/app/(internal)/programs/page.tsx`
- `src/app/(internal)/storage/page.tsx`
- `src/app/(internal)/student-registration/page.tsx`
- `src/app/(internal)/subjects/[id]/edit/page.tsx`
- `src/app/(internal)/subjects/[id]/page.tsx`
- `src/app/(internal)/subjects/create/page.tsx`
- `src/app/(internal)/subjects/page.tsx`
- `src/app/(internal)/users/[id]/assign-courses/page.tsx`
- `src/app/(internal)/users/[id]/page.tsx`
- `src/app/(internal)/users/[id]/settings/page.tsx`
- `src/app/(internal)/users/bulk-create/page.tsx`
- `src/app/(internal)/users/create/page.tsx`
- `src/app/(internal)/users/page.tsx`
- `src/app/(internal)/visibilities/[id]/edit/page.tsx`
- `src/app/(internal)/visibilities/[id]/page.tsx`
- `src/app/(internal)/visibilities/create/page.tsx`
- `src/app/(internal)/visibilities/page.tsx`
- `src/app/(internal)/payment-plans/page.tsx`
- `src/app/(internal)/payment-plans/create/page.tsx`
- `src/app/(internal)/payment-plans/[id]/page.tsx`
- `src/app/(internal)/payment-plans/[id]/edit/page.tsx`
- `src/app/(internal)/payment-methods/page.tsx`
- `src/app/(internal)/payment-methods/create/page.tsx`
- `src/app/(internal)/payment-methods/[id]/page.tsx`
- `src/app/(internal)/payment-methods/[id]/edit/page.tsx`
- `src/app/(internal)/payment-infos/page.tsx`
- `src/app/(internal)/payment-infos/create/page.tsx`
- `src/app/(internal)/payment-infos/[id]/page.tsx`
- `src/app/(internal)/payment-infos/[id]/edit/page.tsx`
- `src/app/(internal)/discounts/page.tsx`
- `src/app/(internal)/discounts/create/page.tsx`
- `src/app/(internal)/discounts/[id]/page.tsx`
- `src/app/(internal)/discounts/[id]/edit/page.tsx`

### Route-local column builders (payment admin)

- `src/app/(internal)/payment-plans/payment-plan-columns.tsx`
- `src/app/(internal)/payment-methods/payment-method-columns.tsx`
- `src/app/(internal)/payment-infos/payment-info-columns.tsx`
- `src/app/(internal)/discounts/discount-columns.tsx`

### Route-local component directories

- `src/components/users/` (route-local components; modify only files imported by owned pages)
- `src/components/organizations/` (route-local components; modify only files imported by owned pages)
- `src/components/departments/` (route-local components; modify only files imported by owned pages)
- `src/components/campuses/` (route-local components; modify only files imported by owned pages)
- `src/components/categories/` (route-local components; modify only files imported by owned pages)
- `src/components/subjects/` (route-local components; modify only files imported by owned pages)
- `src/components/programs/` (route-local components; modify only files imported by owned pages)
- `src/components/intakes/` (route-local components; modify only files imported by owned pages)
- `src/components/course-roles/` (route-local components; modify only files imported by owned pages)
- `src/components/visibilities/` (route-local components; modify only files imported by owned pages)
- `src/components/custom-field-definitions/` (route-local components; modify only files imported by owned pages)
- `src/components/data-verification-requests/` (route-local components; modify only files imported by owned pages)
- `src/components/id-card/` (route-local components; modify only files imported by owned pages)
- `src/components/imports/` (route-local components; modify only files imported by owned pages)
- `src/components/storage/` (route-local components; modify only files imported by owned pages)
- `src/components/student-registration/` (route-local components; modify only files imported by owned pages)
- `src/components/logs/` (route-local components; modify only files imported by owned pages)
- `src/components/leads/` (route-local components; modify only files imported by owned pages)
- `src/components/points/` (route-local components; modify only files imported by owned pages)
- `src/components/administration/` (route-local components; modify only files imported by owned pages)

### New helper modules (this plan)

- Create: `src/lib/ui-remediation/r8-admin-crud-layout-classes.ts`
- Create: `src/lib/ui-remediation/r8-admin-crud-layout-classes.test.ts`
- Create: `e2e/r8-administration-crud.spec.ts` (Playwright — post-R0 harness)

---

## Route manifest (R8)

| Route | Page file | Persona / permission | Shared patterns | Risk | Verification |
| --- | --- | --- | --- | --- | --- |
| `/(internal)/(department)/departments/[id]/edit` | `src/app/(internal)/(department)/departments/[id]/edit/page.tsx` | admin — Department CRUD | sj-tokens, ResourceTable, AutoForm | low | manual |
| `/(internal)/(department)/departments/[id]` | `src/app/(internal)/(department)/departments/[id]/page.tsx` | admin — Department CRUD | stale-_chrome, ResourceTable | medium | representative automated + manual |
| `/(internal)/(department)/departments/create` | `src/app/(internal)/(department)/departments/create/page.tsx` | admin — Department CRUD | AutoForm | low | manual |
| `/(internal)/(department)/departments` | `src/app/(internal)/(department)/departments/page.tsx` | admin — Department CRUD | ResourceTable | low | manual |
| `/(internal)/administration/roles` | `src/app/(internal)/administration/roles/page.tsx` | admin — Reference data CRUD | shell-delegated | low | manual |
| `/(internal)/campuses/[id]/edit` | `src/app/(internal)/campuses/[id]/edit/page.tsx` | admin — Reference data CRUD | AutoForm | low | manual |
| `/(internal)/campuses/[id]` | `src/app/(internal)/campuses/[id]/page.tsx` | admin — Reference data CRUD | stale-_chrome | medium | representative automated + manual |
| `/(internal)/campuses/create` | `src/app/(internal)/campuses/create/page.tsx` | admin — Reference data CRUD | AutoForm | low | manual |
| `/(internal)/campuses` | `src/app/(internal)/campuses/page.tsx` | admin — Reference data CRUD | ResourceTable | low | manual |
| `/(internal)/categories/[id]/edit` | `src/app/(internal)/categories/[id]/edit/page.tsx` | admin — Reference data CRUD | AutoForm | low | manual |
| `/(internal)/categories/[id]` | `src/app/(internal)/categories/[id]/page.tsx` | admin — Reference data CRUD | stale-_chrome, ResourceTable | medium | representative automated + manual |
| `/(internal)/categories/create` | `src/app/(internal)/categories/create/page.tsx` | admin — Reference data CRUD | AutoForm | low | manual |
| `/(internal)/categories` | `src/app/(internal)/categories/page.tsx` | admin — Reference data CRUD | ResourceTable | low | manual |
| `/(internal)/categories/sort-order` | `src/app/(internal)/categories/sort-order/page.tsx` | admin — Reference data CRUD | sj-tokens | low | manual |
| `/(internal)/course-roles/[id]/edit` | `src/app/(internal)/course-roles/[id]/edit/page.tsx` | admin — Reference data CRUD | AutoForm | low | manual |
| `/(internal)/course-roles/[id]` | `src/app/(internal)/course-roles/[id]/page.tsx` | admin — Reference data CRUD | stale-_chrome | medium | representative automated + manual |
| `/(internal)/course-roles/create` | `src/app/(internal)/course-roles/create/page.tsx` | admin — Reference data CRUD | AutoForm | low | manual |
| `/(internal)/course-roles` | `src/app/(internal)/course-roles/page.tsx` | admin — Reference data CRUD | AcademicPageHeader, ResourceTable | low | manual |
| `/(internal)/custom-field-definitions/create` | `src/app/(internal)/custom-field-definitions/create/page.tsx` | admin — Reference data CRUD | legacy-tokens, missing-PageContainer | medium | representative automated + manual |
| `/(internal)/custom-field-definitions` | `src/app/(internal)/custom-field-definitions/page.tsx` | admin — Reference data CRUD | legacy-tokens, missing-PageContainer | medium | representative automated + manual |
| `/(internal)/data-verification-requests/[id]/edit` | `src/app/(internal)/data-verification-requests/[id]/edit/page.tsx` | admin/student — Verification workflow | shell-delegated | low | manual |
| `/(internal)/data-verification-requests/[id]` | `src/app/(internal)/data-verification-requests/[id]/page.tsx` | admin/student — Verification workflow | stale-_chrome | medium | representative automated + manual |
| `/(internal)/data-verification-requests/[id]/verify` | `src/app/(internal)/data-verification-requests/[id]/verify/page.tsx` | admin/student — Verification workflow | AutoForm | low | manual |
| `/(internal)/data-verification-requests/create` | `src/app/(internal)/data-verification-requests/create/page.tsx` | admin/student — Verification workflow | stale-_chrome, legacy-tokens, AutoForm | medium | representative automated + manual |
| `/(internal)/data-verification-requests` | `src/app/(internal)/data-verification-requests/page.tsx` | admin/student — Verification workflow | ResourceTable | low | manual |
| `/(internal)/id-card/bulk` | `src/app/(internal)/id-card/bulk/page.tsx` | admin — ID card tooling | sj-tokens | low | manual |
| `/(internal)/id-card` | `src/app/(internal)/id-card/page.tsx` | admin — ID card tooling | sj-tokens | low | manual |
| `/(internal)/id-card/settings` | `src/app/(internal)/id-card/settings/page.tsx` | admin — ID card tooling | missing-PageContainer | low | manual |
| `/(internal)/imports` | `src/app/(internal)/imports/page.tsx` | admin — Reference data CRUD | AcademicPageHeader | low | manual |
| `/(internal)/intakes/[id]/edit` | `src/app/(internal)/intakes/[id]/edit/page.tsx` | admin — Reference data CRUD | sj-tokens, AutoForm | low | manual |
| `/(internal)/intakes/[id]` | `src/app/(internal)/intakes/[id]/page.tsx` | admin — Reference data CRUD | stale-_chrome, ResourceTable | medium | representative automated + manual |
| `/(internal)/intakes/create` | `src/app/(internal)/intakes/create/page.tsx` | admin — Reference data CRUD | missing-PageContainer | low | manual |
| `/(internal)/intakes` | `src/app/(internal)/intakes/page.tsx` | admin — Reference data CRUD | AcademicPageHeader, ResourceTable | low | manual |
| `/(internal)/leads` | `src/app/(internal)/leads/page.tsx` | admin — Reference data CRUD | shell-delegated | low | manual |
| `/(internal)/leads/settings` | `src/app/(internal)/leads/settings/page.tsx` | admin — Reference data CRUD | sj-tokens | low | manual |
| `/(internal)/logs` | `src/app/(internal)/logs/page.tsx` | admin — Reference data CRUD | sj-tokens, ResourceTable | low | manual |
| `/(internal)/logs/settings` | `src/app/(internal)/logs/settings/page.tsx` | admin — Reference data CRUD | sj-tokens | low | manual |
| `/(internal)/organizations/[id]/admins/create` | `src/app/(internal)/organizations/[id]/admins/create/page.tsx` | platform admin — Multi-tenant org admin | AutoForm | low | manual |
| `/(internal)/organizations/[id]` | `src/app/(internal)/organizations/[id]/page.tsx` | platform admin — Multi-tenant org admin | missing-PageContainer | low | manual |
| `/(internal)/organizations/create` | `src/app/(internal)/organizations/create/page.tsx` | platform admin — Multi-tenant org admin | AutoForm | low | manual |
| `/(internal)/organizations` | `src/app/(internal)/organizations/page.tsx` | platform admin — Multi-tenant org admin | ResourceTable | low | manual |
| `/(internal)/organizations/profile` | `src/app/(internal)/organizations/profile/page.tsx` | platform admin — Multi-tenant org admin | missing-PageContainer | low | manual |
| `/(internal)/points` | `src/app/(internal)/points/page.tsx` | admin — Reference data CRUD | sj-tokens | low | manual |
| `/(internal)/points/settings` | `src/app/(internal)/points/settings/page.tsx` | admin — Reference data CRUD | sj-tokens | low | manual |
| `/(internal)/programs/[id]/edit` | `src/app/(internal)/programs/[id]/edit/page.tsx` | admin — Reference data CRUD | AutoForm | low | manual |
| `/(internal)/programs/[id]` | `src/app/(internal)/programs/[id]/page.tsx` | admin — Reference data CRUD | stale-_chrome, ResourceTable | medium | representative automated + manual |
| `/(internal)/programs/[id]/settings` | `src/app/(internal)/programs/[id]/settings/page.tsx` | admin — Reference data CRUD | stale-_chrome, AutoForm | medium | representative automated + manual |
| `/(internal)/programs/create` | `src/app/(internal)/programs/create/page.tsx` | admin — Reference data CRUD | AutoForm | low | manual |
| `/(internal)/programs` | `src/app/(internal)/programs/page.tsx` | admin — Reference data CRUD | AcademicPageHeader, ResourceTable | low | manual |
| `/(internal)/storage` | `src/app/(internal)/storage/page.tsx` | admin — Reference data CRUD | stale-_chrome, sj-tokens | medium | representative automated + manual |
| `/(internal)/student-registration` | `src/app/(internal)/student-registration/page.tsx` | admin — Registration pipeline | ResourceTable | low | manual |
| `/(internal)/subjects/[id]/edit` | `src/app/(internal)/subjects/[id]/edit/page.tsx` | admin — Reference data CRUD | AutoForm | low | manual |
| `/(internal)/subjects/[id]` | `src/app/(internal)/subjects/[id]/page.tsx` | admin — Reference data CRUD | stale-_chrome | medium | representative automated + manual |
| `/(internal)/subjects/create` | `src/app/(internal)/subjects/create/page.tsx` | admin — Reference data CRUD | legacy-tokens, AutoForm | low | manual |
| `/(internal)/subjects` | `src/app/(internal)/subjects/page.tsx` | admin — Reference data CRUD | sj-tokens, AcademicPageHeader | low | manual |
| `/(internal)/users/[id]/assign-courses` | `src/app/(internal)/users/[id]/assign-courses/page.tsx` | admin — User directory and records | stale-_chrome, ResourceTable | medium | representative automated + manual |
| `/(internal)/users/[id]` | `src/app/(internal)/users/[id]/page.tsx` | admin — User directory and records | legacy-tokens, sj-tokens, usePageHeader | medium | representative automated + manual |
| `/(internal)/users/[id]/settings` | `src/app/(internal)/users/[id]/settings/page.tsx` | admin — User directory and records | missing-PageContainer | low | manual |
| `/(internal)/users/bulk-create` | `src/app/(internal)/users/bulk-create/page.tsx` | admin — User directory and records | missing-PageContainer | low | manual |
| `/(internal)/users/create` | `src/app/(internal)/users/create/page.tsx` | admin — User directory and records | shell-delegated | low | manual |
| `/(internal)/users` | `src/app/(internal)/users/page.tsx` | admin — User directory and records | missing-PageContainer | low | manual |
| `/(internal)/visibilities/[id]/edit` | `src/app/(internal)/visibilities/[id]/edit/page.tsx` | admin — Reference data CRUD | AutoForm | low | manual |
| `/(internal)/visibilities/[id]` | `src/app/(internal)/visibilities/[id]/page.tsx` | admin — Reference data CRUD | stale-_chrome | medium | representative automated + manual |
| `/(internal)/visibilities/create` | `src/app/(internal)/visibilities/create/page.tsx` | admin — Reference data CRUD | AutoForm | low | manual |
| `/(internal)/visibilities` | `src/app/(internal)/visibilities/page.tsx` | admin — Reference data CRUD | ResourceTable | low | manual |
| `/(internal)/payment-plans` | `src/app/(internal)/payment-plans/page.tsx` | admin — Payment admin CRUD | ResourceTable | low | manual |
| `/(internal)/payment-plans/create` | `src/app/(internal)/payment-plans/create/page.tsx` | admin — Payment admin CRUD | AutoForm | low | manual |
| `/(internal)/payment-plans/[id]` | `src/app/(internal)/payment-plans/[id]/page.tsx` | admin — Payment admin CRUD | sj-tokens | low | manual |
| `/(internal)/payment-plans/[id]/edit` | `src/app/(internal)/payment-plans/[id]/edit/page.tsx` | admin — Payment admin CRUD | AutoForm | low | manual |
| `/(internal)/payment-methods` | `src/app/(internal)/payment-methods/page.tsx` | admin — Payment admin CRUD | ResourceTable | low | manual |
| `/(internal)/payment-methods/create` | `src/app/(internal)/payment-methods/create/page.tsx` | admin — Payment admin CRUD | AutoForm | low | manual |
| `/(internal)/payment-methods/[id]` | `src/app/(internal)/payment-methods/[id]/page.tsx` | admin — Payment admin CRUD | sj-tokens | low | manual |
| `/(internal)/payment-methods/[id]/edit` | `src/app/(internal)/payment-methods/[id]/edit/page.tsx` | admin — Payment admin CRUD | AutoForm | low | manual |
| `/(internal)/payment-infos` | `src/app/(internal)/payment-infos/page.tsx` | admin — Payment admin CRUD | ResourceTable | low | manual |
| `/(internal)/payment-infos/create` | `src/app/(internal)/payment-infos/create/page.tsx` | admin — Payment admin CRUD | AutoForm | low | manual |
| `/(internal)/payment-infos/[id]` | `src/app/(internal)/payment-infos/[id]/page.tsx` | admin — Payment admin CRUD | sj-tokens | low | manual |
| `/(internal)/payment-infos/[id]/edit` | `src/app/(internal)/payment-infos/[id]/edit/page.tsx` | admin — Payment admin CRUD | AutoForm | low | manual |
| `/(internal)/discounts` | `src/app/(internal)/discounts/page.tsx` | admin — Payment admin CRUD | ResourceTable | low | manual |
| `/(internal)/discounts/create` | `src/app/(internal)/discounts/create/page.tsx` | admin — Payment admin CRUD | AutoForm | low | manual |
| `/(internal)/discounts/[id]` | `src/app/(internal)/discounts/[id]/page.tsx` | admin — Payment admin CRUD | sj-tokens | low | manual |
| `/(internal)/discounts/[id]/edit` | `src/app/(internal)/discounts/[id]/edit/page.tsx` | admin — Payment admin CRUD | AutoForm | low | manual |

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
npm run test:unit -- src/lib/ui-remediation/r8-admin-crud-layout-classes.test.ts
```

Expected: all tests PASS

**Cohort-scoped browser test:**

```bash
npm run test:browser -- e2e/r8-administration-crud.spec.ts
```

Expected: all tests PASS; screenshots written to `e2e/screenshots/r8/`

**Production build smoke:**

```bash
npm run build
```

Expected: Exit 0

---

## Role, theme, and viewport matrix

| Surface | Roles | Themes | Viewports | Notes |
| --- | --- | --- | --- | --- |
| Representative automated route `/(internal)/users` | See route manifest persona column | light + dark | 1280×800 desktop; 390×844 mobile | Primary browser spec |
| All `R8` routes | Per manifest | light required; dark where internal shell | desktop 1280; mobile 390 for routes with toolbars/tables | Manual checklist below |
| Overlay-heavy routes (date pickers, dialogs, comboboxes) | Same as route | both | desktop | Verify R2 layer: dropdown above sticky toolbar |

---

## Manual route checklist

- [ ] `/(internal)/(department)/departments/[id]/edit` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/(department)/departments/[id]` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/(department)/departments/create` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/(department)/departments` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/administration/roles` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/campuses/[id]/edit` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/campuses/[id]` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/campuses/create` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/campuses` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/categories/[id]/edit` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/categories/[id]` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/categories/create` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/categories` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/categories/sort-order` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/course-roles/[id]/edit` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/course-roles/[id]` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/course-roles/create` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/course-roles` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/custom-field-definitions/create` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/custom-field-definitions` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/data-verification-requests/[id]/edit` — admin/student; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/data-verification-requests/[id]` — admin/student; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/data-verification-requests/[id]/verify` — admin/student; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/data-verification-requests/create` — admin/student; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/data-verification-requests` — admin/student; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/id-card/bulk` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/id-card` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/id-card/settings` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/imports` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/intakes/[id]/edit` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/intakes/[id]` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/intakes/create` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/intakes` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/leads` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/leads/settings` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/logs` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/logs/settings` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/organizations/[id]/admins/create` — platform admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/organizations/[id]` — platform admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/organizations/create` — platform admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/organizations` — platform admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/organizations/profile` — platform admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/points` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/points/settings` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/programs/[id]/edit` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/programs/[id]` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/programs/[id]/settings` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/programs/create` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/programs` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/storage` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/student-registration` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/subjects/[id]/edit` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/subjects/[id]` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/subjects/create` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/subjects` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/users/[id]/assign-courses` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/users/[id]` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/users/[id]/settings` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/users/bulk-create` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/users/create` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/users` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/visibilities/[id]/edit` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/visibilities/[id]` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/visibilities/create` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/visibilities` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/payment-plans` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/payment-plans/create` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/payment-plans/[id]` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/payment-plans/[id]/edit` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/payment-methods` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/payment-methods/create` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/payment-methods/[id]` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/payment-methods/[id]/edit` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/payment-infos` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/payment-infos/create` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/payment-infos/[id]` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/payment-infos/[id]/edit` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/discounts` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/discounts/create` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/discounts/[id]` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/discounts/[id]/edit` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present

---

## Mechanical migration batches

#### Batch A — users and organizations (`users-orgs`)

**Files (explicit):**

- `src/app/(internal)/organizations/[id]/admins/create/page.tsx`
- `src/app/(internal)/organizations/[id]/page.tsx`
- `src/app/(internal)/organizations/create/page.tsx`
- `src/app/(internal)/organizations/page.tsx`
- `src/app/(internal)/organizations/profile/page.tsx`
- `src/app/(internal)/users/[id]/assign-courses/page.tsx`
- `src/app/(internal)/users/[id]/page.tsx`
- `src/app/(internal)/users/[id]/settings/page.tsx`
- `src/app/(internal)/users/bulk-create/page.tsx`
- `src/app/(internal)/users/create/page.tsx`
- `src/app/(internal)/users/page.tsx`

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

#### Batch B — reference data CRUD (`reference-data`)

**Files (explicit):**

- `src/app/(internal)/(department)/departments/[id]/edit/page.tsx`
- `src/app/(internal)/(department)/departments/[id]/page.tsx`
- `src/app/(internal)/(department)/departments/create/page.tsx`
- `src/app/(internal)/(department)/departments/page.tsx`
- `src/app/(internal)/campuses/[id]/edit/page.tsx`
- `src/app/(internal)/campuses/[id]/page.tsx`
- `src/app/(internal)/campuses/create/page.tsx`
- `src/app/(internal)/campuses/page.tsx`
- `src/app/(internal)/categories/[id]/edit/page.tsx`
- `src/app/(internal)/categories/[id]/page.tsx`
- `src/app/(internal)/categories/create/page.tsx`
- `src/app/(internal)/categories/page.tsx`
- `src/app/(internal)/categories/sort-order/page.tsx`
- `src/app/(internal)/course-roles/[id]/edit/page.tsx`
- `src/app/(internal)/course-roles/[id]/page.tsx`
- `src/app/(internal)/course-roles/create/page.tsx`
- `src/app/(internal)/course-roles/page.tsx`
- `src/app/(internal)/custom-field-definitions/create/page.tsx`
- `src/app/(internal)/custom-field-definitions/page.tsx`
- `src/app/(internal)/data-verification-requests/[id]/edit/page.tsx`
- `src/app/(internal)/data-verification-requests/[id]/page.tsx`
- `src/app/(internal)/data-verification-requests/[id]/verify/page.tsx`
- `src/app/(internal)/data-verification-requests/create/page.tsx`
- `src/app/(internal)/data-verification-requests/page.tsx`
- `src/app/(internal)/intakes/[id]/edit/page.tsx`
- `src/app/(internal)/intakes/[id]/page.tsx`
- `src/app/(internal)/intakes/create/page.tsx`
- `src/app/(internal)/intakes/page.tsx`
- `src/app/(internal)/programs/[id]/edit/page.tsx`
- `src/app/(internal)/programs/[id]/page.tsx`
- `src/app/(internal)/programs/[id]/settings/page.tsx`
- `src/app/(internal)/programs/create/page.tsx`
- `src/app/(internal)/programs/page.tsx`
- `src/app/(internal)/subjects/[id]/edit/page.tsx`
- `src/app/(internal)/subjects/[id]/page.tsx`
- `src/app/(internal)/subjects/create/page.tsx`
- `src/app/(internal)/subjects/page.tsx`
- `src/app/(internal)/visibilities/[id]/edit/page.tsx`
- `src/app/(internal)/visibilities/[id]/page.tsx`
- `src/app/(internal)/visibilities/create/page.tsx`
- `src/app/(internal)/visibilities/page.tsx`
- `src/app/(internal)/payment-plans/page.tsx`
- `src/app/(internal)/payment-plans/create/page.tsx`
- `src/app/(internal)/payment-plans/[id]/page.tsx`
- `src/app/(internal)/payment-plans/[id]/edit/page.tsx`
- `src/app/(internal)/payment-methods/page.tsx`
- `src/app/(internal)/payment-methods/create/page.tsx`
- `src/app/(internal)/payment-methods/[id]/page.tsx`
- `src/app/(internal)/payment-methods/[id]/edit/page.tsx`
- `src/app/(internal)/payment-infos/page.tsx`
- `src/app/(internal)/payment-infos/create/page.tsx`
- `src/app/(internal)/payment-infos/[id]/page.tsx`
- `src/app/(internal)/payment-infos/[id]/edit/page.tsx`
- `src/app/(internal)/discounts/page.tsx`
- `src/app/(internal)/discounts/create/page.tsx`
- `src/app/(internal)/discounts/[id]/page.tsx`
- `src/app/(internal)/discounts/[id]/edit/page.tsx`
- `src/app/(internal)/payment-plans/payment-plan-columns.tsx`
- `src/app/(internal)/payment-methods/payment-method-columns.tsx`
- `src/app/(internal)/payment-infos/payment-info-columns.tsx`
- `src/app/(internal)/discounts/discount-columns.tsx`

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

#### Batch C — settings and tools (`settings-tools`)

**Files (explicit):**

- `src/app/(internal)/administration/roles/page.tsx`
- `src/app/(internal)/id-card/bulk/page.tsx`
- `src/app/(internal)/id-card/page.tsx`
- `src/app/(internal)/id-card/settings/page.tsx`
- `src/app/(internal)/imports/page.tsx`
- `src/app/(internal)/leads/page.tsx`
- `src/app/(internal)/leads/settings/page.tsx`
- `src/app/(internal)/logs/page.tsx`
- `src/app/(internal)/logs/settings/page.tsx`
- `src/app/(internal)/points/page.tsx`
- `src/app/(internal)/points/settings/page.tsx`
- `src/app/(internal)/storage/page.tsx`
- `src/app/(internal)/student-registration/page.tsx`

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

### Task 1: Route layout helper (R8)

**Files:**
- Create: `src/lib/ui-remediation/r8-admin-crud-layout-classes.ts`
- Create: `src/lib/ui-remediation/r8-admin-crud-layout-classes.test.ts`

- [x] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import {
  adminCrudDetailSectionClassName,
  adminCrudHeaderActionRowClassName,
  adminListEmptyStateClassName,
} from "./r8-admin-crud-layout-classes";

describe("adminCrudHeaderActionRowClassName", () => {
  it("wraps actions on narrow viewports", () => {
    expect(adminCrudHeaderActionRowClassName()).toContain("flex-wrap");
  });
});

describe("adminListEmptyStateClassName", () => {
  it("uses semantic surface tokens", () => {
    expect(adminListEmptyStateClassName()).toContain("bg-surface");
    expect(adminListEmptyStateClassName()).toContain("text-text-muted");
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/ui-remediation/r8-admin-crud-layout-classes.test.ts`

Expected: FAIL with "Cannot find module" or missing export

- [x] **Step 3: Write minimal implementation**

```typescript
export function adminCrudHeaderActionRowClassName(): string {
  return "flex min-w-0 flex-wrap items-center justify-end gap-2";
}

export function adminCrudDetailSectionClassName(): string {
  return "flex flex-col gap-6";
}

export function adminListEmptyStateClassName(): string {
  return "rounded-lg border border-border bg-surface p-8 text-center text-text-muted";
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/ui-remediation/r8-admin-crud-layout-classes.test.ts`

Expected: PASS (3+ tests)

- [x] **Step 5: Commit**

```bash
git add src/lib/ui-remediation/r8-admin-crud-layout-classes.ts src/lib/ui-remediation/r8-admin-crud-layout-classes.test.ts
git commit -m "$(cat <<'EOF'
feat(ui-r8): add route layout helper for administration crud

EOF
)"
```

---

### Task 2: Representative browser spec (R8)

**Files:**
- Create: `e2e/r8-administration-crud.spec.ts`

- [x] **Step 1: Write failing Playwright spec**

```typescript
import { test, expect } from "@playwright/test";

test.describe("R8 representative routes", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  test("/users has no document horizontal overflow", async ({ page }) => {
    await page.goto("/users");
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });

  test("/users panel header visible in light and dark", async ({ page }) => {
    await page.goto("/users");
    await page.waitForLoadState("networkidle");
    const header = page.locator("[data-testid='panel-header']");
    await expect(header).toBeVisible();
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(header).toBeVisible();
  });
});
```

- [x] **Step 2: Confirm browser preconditions, then verify the new assertions fail**

Before running, confirm `e2e/.auth/admin.json`, an authorized admin persona, and the `/users` list fixture are available. If any precondition is missing, STOP and report R8 BLOCKED; do not execute with skipped tests.

Run: `npm run test:browser -- e2e/r8-administration-crud.spec.ts`

Expected: Auth and fixture setup succeeds, no test is skipped, and the new layout assertion fails before the route migration. Missing setup is a STOP/BLOCKED condition, not an expected test failure.

- [x] **Step 3: Commit spec**

```bash
git add e2e/r8-administration-crud.spec.ts
git commit -m "$(cat <<'EOF'
test(ui-r8): add representative browser spec for administration crud

EOF
)"
```

---

## Independent QA handoff prompt

Paste verbatim to a fresh QA subagent (read-only — no patching):

```
You are independent QA for UI remediation plan R8 (Administration CRUD).
Base SHA target: 05ac447b10966131d4f37a2ba724110c33d66dd4 (final verification on integrated main after all cohorts merge).

Acceptance criteria:
1. All 81 routes in the manifest table pass verification mode listed.
2. No `@/app/_chrome/*` imports remain in owned page or route-local component files.
3. No legacy token classes (`text-muted-foreground`, `bg-card`, `bg-background`, `text-foreground`) in owned files unless covered by a documented R1 exception.
4. Internal routes use PageContainer + usePageHeader per R5 unless listed as documented dense/full-width exception.
5. npm run lint, typecheck, test:unit, build, test:browser pass with zero skipped tests.
6. Confirm auth storage state, CRUD fixtures, and every required persona/permission before running QA. If any is unavailable, STOP and report the affected route BLOCKED; do not run a reduced or skipped suite.

Fixture URLs (representative):
- /users

Commands:
npm run lint
npm run typecheck
npm run test:unit -- src/lib/ui-remediation/r8-admin-crud-layout-classes.test.ts
npm run test:browser -- e2e/r8-administration-crud.spec.ts
npm run build

Return PASS/FAIL/BLOCKED per route with screenshot path, role, viewport, theme, reproduction steps for failures, and suspected owner plan (R1–R5 shared vs R8 local). BLOCKED means QA stopped before execution because a required fixture, permission, or auth precondition was missing; it never means a skipped test.
```

---

## Self-review (author checklist)

- [x] Spec §7 route family R8 — every owned product route listed exactly once
- [x] Spec §8 contracts — consumes R1–R5; forbidden shared files enumerated
- [x] Spec §9 verification — commands and browser assertions included
- [x] Spec §10 — stop conditions, commits, independent QA prompt present
- [x] Placeholder and omitted-code scan passed
