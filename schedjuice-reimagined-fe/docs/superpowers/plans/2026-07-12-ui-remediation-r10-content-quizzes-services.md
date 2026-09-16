# Content Quizzes Services — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair quizzes, docs, announcements, certificates, news, library, forms, and admin service routes for content hierarchy, public take-flow layout, rich-text/composer overlays, and list/detail consistency.

**Architecture:** Internal content routes adopt R5 page headers and R3 tables where lists exist. Public quiz take routes use a minimal chrome layout verified against R1 tokens. Service action pages use dominant form region + quiet help sidebar per R5 composition contract.

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

**Route count:** 45 product routes (excludes design/debug/artifacts and all finance R11–R14 routes)

All FE commands run from `schedjuice-reimagined-fe/`.

## Current-state evidence (base `05ac447b`)

| Location | Issue |
| --- | --- |
| 5/45 owned pages | Import `@/app/_chrome/*` at base SHA |
| `src/app/(quiz-v3)/take/[code]/quiz/page.tsx` | Public take flow uses legacy `bg-card` tokens |
| `src/app/(internal)/quizzes-v3/page.tsx` | Uses `AcademicPageHeader` + ResourceTable — migrate to R5 list pattern |
| `src/app/(docs)/help/page.tsx` | Mixed sj/legacy tokens in help center |
| `src/app/(internal)/services/campus-checkins/page.tsx` | `_chrome` DatePicker + ResourceTable — verify R2 popover stack |
| 34/45 owned pages | Use `PageContainer` — unify with R5 `PageHeader` where in-flow title remains |
| Cohort scan | `_chrome` pages: 5; legacy token pages: 8; missing PageContainer (internal): see manifest |

**Pages with `@/app/_chrome/*` imports (migrate in this plan):**

- `src/app/(internal)/announcements/[id]/page.tsx`
- `src/app/(internal)/certificates/[templateId]/generate/page.tsx`
- `src/app/(internal)/certificates/create/page.tsx`
- `src/app/(internal)/news/[id]/page.tsx`
- `src/app/(internal)/services/campus-checkins/page.tsx`

**R5 contracts to consume (do not redefine):** `PageContainer`, `PageTitle`, `PageHeader`, `PageSection`, `usePageHeader`, `page-composition.ts` width/density map.

---


## Stop conditions

Stop and report (do not patch shared contracts locally) when:

1. Current branch base SHA differs from `05ac447b10966131d4f37a2ba724110c33d66dd4` and owned page files changed upstream — re-read routes and confirm plan validity.
2. Any file in **Forbidden shared files** below changed on your branch — escalate to the owning R1–R5 plan.
3. `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run build`, or `npm run test:browser` fails after your change and the failure is outside owned files.
4. Required auth storage state, quiz/content/service fixture, or teacher/admin/student permission is unavailable — STOP before execution, report the affected route as BLOCKED, and do not run or skip any browser test.
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

### Page routes (45)

- `src/app/(docs)/help/[slug]/page.tsx`
- `src/app/(docs)/help/category/[slug]/page.tsx`
- `src/app/(docs)/help/page.tsx`
- `src/app/(docs)/platform/docs/[id]/page.tsx`
- `src/app/(docs)/platform/docs/new/page.tsx`
- `src/app/(docs)/platform/docs/page.tsx`
- `src/app/(internal)/ai-detector/page.tsx`
- `src/app/(internal)/announcements/[id]/edit/page.tsx`
- `src/app/(internal)/announcements/[id]/page.tsx`
- `src/app/(internal)/announcements/create/page.tsx`
- `src/app/(internal)/announcements/page.tsx`
- `src/app/(internal)/certificates/[templateId]/generate/page.tsx`
- `src/app/(internal)/certificates/categories/page.tsx`
- `src/app/(internal)/certificates/create/page.tsx`
- `src/app/(internal)/certificates/documentation/page.tsx`
- `src/app/(internal)/certificates/page.tsx`
- `src/app/(internal)/changelog/page.tsx`
- `src/app/(internal)/form-designer/page.tsx`
- `src/app/(internal)/forms/create/page.tsx`
- `src/app/(internal)/forms/edit/page.tsx`
- `src/app/(internal)/forms/page.tsx`
- `src/app/(internal)/library/page.tsx`
- `src/app/(internal)/news/[id]/edit/page.tsx`
- `src/app/(internal)/news/[id]/page.tsx`
- `src/app/(internal)/news/create/page.tsx`
- `src/app/(internal)/news/page.tsx`
- `src/app/(internal)/quizzes-v3/[id]/attempts/[attemptId]/page.tsx`
- `src/app/(internal)/quizzes-v3/[id]/edit/page.tsx`
- `src/app/(internal)/quizzes-v3/[id]/page.tsx`
- `src/app/(internal)/quizzes-v3/[id]/preview/page.tsx`
- `src/app/(internal)/quizzes-v3/[id]/responses/page.tsx`
- `src/app/(internal)/quizzes-v3/create/page.tsx`
- `src/app/(internal)/quizzes-v3/page.tsx`
- `src/app/(internal)/quizzes-v3/question-bank/page.tsx`
- `src/app/(internal)/services/bulk-emails/page.tsx`
- `src/app/(internal)/services/campus-checkin/page.tsx`
- `src/app/(internal)/services/campus-checkins/page.tsx`
- `src/app/(internal)/services/org-wide-announcements/create/page.tsx`
- `src/app/(internal)/services/org-wide-announcements/page.tsx`
- `src/app/(internal)/services/password-change-request/page.tsx`
- `src/app/(internal)/services/upload-access-log/page.tsx`
- `src/app/(quiz-v3)/take/[code]/attempt/[attemptId]/page.tsx`
- `src/app/(quiz-v3)/take/[code]/done/page.tsx`
- `src/app/(quiz-v3)/take/[code]/page.tsx`
- `src/app/(quiz-v3)/take/[code]/quiz/page.tsx`

### Route-local component directories

- `src/components/quiz-v3/` (route-local components; modify only files imported by owned pages)
- `src/components/quizzes/` (route-local components; modify only files imported by owned pages)
- `src/components/docs/` (route-local components; modify only files imported by owned pages)
- `src/components/help/` (route-local components; modify only files imported by owned pages)
- `src/components/announcements/` (route-local components; modify only files imported by owned pages)
- `src/components/news/` (route-local components; modify only files imported by owned pages)
- `src/components/library/` (route-local components; modify only files imported by owned pages)
- `src/components/certificates/` (route-local components; modify only files imported by owned pages)
- `src/components/forms/` (route-local components; modify only files imported by owned pages)
- `src/components/form-designer/` (route-local components; modify only files imported by owned pages)
- `src/components/changelog/` (route-local components; modify only files imported by owned pages)
- `src/components/ai-detector/` (route-local components; modify only files imported by owned pages)
- `src/components/services/` (route-local components; modify only files imported by owned pages)

### New helper modules (this plan)

- Create: `src/lib/ui-remediation/r10-content-route-classes.ts`
- Create: `src/lib/ui-remediation/r10-content-route-classes.test.ts`
- Create: `e2e/r10-content-quizzes-services.spec.ts` (Playwright — post-R0 harness)

---

## Route manifest (R10)

| Route | Page file | Persona / permission | Shared patterns | Risk | Verification |
| --- | --- | --- | --- | --- | --- |
| `/(docs)/help/[slug]` | `src/app/(docs)/help/[slug]/page.tsx` | authenticated reader — Help center | legacy-tokens | low | manual |
| `/(docs)/help/category/[slug]` | `src/app/(docs)/help/category/[slug]/page.tsx` | authenticated reader — Help center | legacy-tokens | low | manual |
| `/(docs)/help` | `src/app/(docs)/help/page.tsx` | authenticated reader — Help center | sj-tokens | low | manual |
| `/(docs)/platform/docs/[id]` | `src/app/(docs)/platform/docs/[id]/page.tsx` | platform admin — Internal docs editor | shell-delegated | low | manual |
| `/(docs)/platform/docs/new` | `src/app/(docs)/platform/docs/new/page.tsx` | platform admin — Internal docs editor | shell-delegated | low | manual |
| `/(docs)/platform/docs` | `src/app/(docs)/platform/docs/page.tsx` | platform admin — Internal docs editor | legacy-tokens | low | manual |
| `/(internal)/ai-detector` | `src/app/(internal)/ai-detector/page.tsx` | admin/teacher — Content or tooling | sj-tokens | low | manual |
| `/(internal)/announcements/[id]/edit` | `src/app/(internal)/announcements/[id]/edit/page.tsx` | admin/teacher — Content publishing | missing-PageContainer | low | manual |
| `/(internal)/announcements/[id]` | `src/app/(internal)/announcements/[id]/page.tsx` | admin/teacher — Content publishing | stale-_chrome | medium | representative automated + manual |
| `/(internal)/announcements/create` | `src/app/(internal)/announcements/create/page.tsx` | admin/teacher — Content publishing | shell-delegated | low | manual |
| `/(internal)/announcements` | `src/app/(internal)/announcements/page.tsx` | admin/teacher — Content publishing | sj-tokens | low | manual |
| `/(internal)/certificates/[templateId]/generate` | `src/app/(internal)/certificates/[templateId]/generate/page.tsx` | admin/teacher — Certificate templates | stale-_chrome | medium | representative automated + manual |
| `/(internal)/certificates/categories` | `src/app/(internal)/certificates/categories/page.tsx` | admin/teacher — Certificate templates | sj-tokens | low | manual |
| `/(internal)/certificates/create` | `src/app/(internal)/certificates/create/page.tsx` | admin/teacher — Certificate templates | stale-_chrome, legacy-tokens | medium | representative automated + manual |
| `/(internal)/certificates/documentation` | `src/app/(internal)/certificates/documentation/page.tsx` | admin/teacher — Certificate templates | sj-tokens | low | manual |
| `/(internal)/certificates` | `src/app/(internal)/certificates/page.tsx` | admin/teacher — Certificate templates | sj-tokens | low | manual |
| `/(internal)/changelog` | `src/app/(internal)/changelog/page.tsx` | admin/teacher — Content or tooling | legacy-tokens | low | manual |
| `/(internal)/form-designer` | `src/app/(internal)/form-designer/page.tsx` | admin/teacher — Content or tooling | legacy-tokens | low | manual |
| `/(internal)/forms/create` | `src/app/(internal)/forms/create/page.tsx` | admin/teacher — Content or tooling | shell-delegated | low | manual |
| `/(internal)/forms/edit` | `src/app/(internal)/forms/edit/page.tsx` | admin/teacher — Content or tooling | shell-delegated | low | manual |
| `/(internal)/forms` | `src/app/(internal)/forms/page.tsx` | admin/teacher — Content or tooling | shell-delegated | low | manual |
| `/(internal)/library` | `src/app/(internal)/library/page.tsx` | admin/teacher — Content or tooling | sj-tokens | low | manual |
| `/(internal)/news/[id]/edit` | `src/app/(internal)/news/[id]/edit/page.tsx` | admin/teacher — Content publishing | shell-delegated | low | manual |
| `/(internal)/news/[id]` | `src/app/(internal)/news/[id]/page.tsx` | admin/teacher — Content publishing | stale-_chrome | medium | representative automated + manual |
| `/(internal)/news/create` | `src/app/(internal)/news/create/page.tsx` | admin/teacher — Content publishing | shell-delegated | low | manual |
| `/(internal)/news` | `src/app/(internal)/news/page.tsx` | admin/teacher — Content publishing | ResourceTable | low | manual |
| `/(internal)/quizzes-v3/[id]/attempts/[attemptId]` | `src/app/(internal)/quizzes-v3/[id]/attempts/[attemptId]/page.tsx` | teacher/admin — Quiz authoring and review | sj-tokens | low | manual |
| `/(internal)/quizzes-v3/[id]/edit` | `src/app/(internal)/quizzes-v3/[id]/edit/page.tsx` | teacher/admin — Quiz authoring and review | sj-tokens | low | manual |
| `/(internal)/quizzes-v3/[id]` | `src/app/(internal)/quizzes-v3/[id]/page.tsx` | teacher/admin — Quiz authoring and review | sj-tokens | low | manual |
| `/(internal)/quizzes-v3/[id]/preview` | `src/app/(internal)/quizzes-v3/[id]/preview/page.tsx` | teacher/admin — Quiz authoring and review | shell-delegated | low | manual |
| `/(internal)/quizzes-v3/[id]/responses` | `src/app/(internal)/quizzes-v3/[id]/responses/page.tsx` | teacher/admin — Quiz authoring and review | sj-tokens | low | manual |
| `/(internal)/quizzes-v3/create` | `src/app/(internal)/quizzes-v3/create/page.tsx` | teacher/admin — Quiz authoring and review | sj-tokens | low | manual |
| `/(internal)/quizzes-v3` | `src/app/(internal)/quizzes-v3/page.tsx` | teacher/admin — Quiz authoring and review | AcademicPageHeader, ResourceTable | low | manual |
| `/(internal)/quizzes-v3/question-bank` | `src/app/(internal)/quizzes-v3/question-bank/page.tsx` | teacher/admin — Quiz authoring and review | sj-tokens, AcademicPageHeader, ResourceTable | low | manual |
| `/(internal)/services/bulk-emails` | `src/app/(internal)/services/bulk-emails/page.tsx` | admin — One-off admin service action | shell-delegated | low | manual |
| `/(internal)/services/campus-checkin` | `src/app/(internal)/services/campus-checkin/page.tsx` | admin — One-off admin service action | legacy-tokens | low | manual |
| `/(internal)/services/campus-checkins` | `src/app/(internal)/services/campus-checkins/page.tsx` | admin — One-off admin service action | stale-_chrome, ResourceTable | medium | representative automated + manual |
| `/(internal)/services/org-wide-announcements/create` | `src/app/(internal)/services/org-wide-announcements/create/page.tsx` | admin — One-off admin service action | shell-delegated | low | manual |
| `/(internal)/services/org-wide-announcements` | `src/app/(internal)/services/org-wide-announcements/page.tsx` | admin — One-off admin service action | shell-delegated | low | manual |
| `/(internal)/services/password-change-request` | `src/app/(internal)/services/password-change-request/page.tsx` | admin — One-off admin service action | shell-delegated | low | manual |
| `/(internal)/services/upload-access-log` | `src/app/(internal)/services/upload-access-log/page.tsx` | admin — One-off admin service action | sj-tokens | low | manual |
| `/(quiz-v3)/take/[code]/attempt/[attemptId]` | `src/app/(quiz-v3)/take/[code]/attempt/[attemptId]/page.tsx` | student/unauthenticated — Public quiz take flow | shell-delegated | medium | automated + manual |
| `/(quiz-v3)/take/[code]/done` | `src/app/(quiz-v3)/take/[code]/done/page.tsx` | student/unauthenticated — Public quiz take flow | sj-tokens | medium | automated + manual |
| `/(quiz-v3)/take/[code]` | `src/app/(quiz-v3)/take/[code]/page.tsx` | student/unauthenticated — Public quiz take flow | sj-tokens | medium | automated + manual |
| `/(quiz-v3)/take/[code]/quiz` | `src/app/(quiz-v3)/take/[code]/quiz/page.tsx` | student/unauthenticated — Public quiz take flow | legacy-tokens | medium | automated + manual |

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
npm run test:unit -- src/lib/ui-remediation/r10-content-route-classes.test.ts
```

Expected: all tests PASS

**Cohort-scoped browser test:**

```bash
npm run test:browser -- e2e/r10-content-quizzes-services.spec.ts
```

Expected: all tests PASS; screenshots written to `e2e/screenshots/r10/`

**Production build smoke:**

```bash
npm run build
```

Expected: Exit 0

---

## Role, theme, and viewport matrix

| Surface | Roles | Themes | Viewports | Notes |
| --- | --- | --- | --- | --- |
| Representative automated route `/(internal)/quizzes-v3` | See route manifest persona column | light + dark | 1280×800 desktop; 390×844 mobile | Primary browser spec |
| All `R10` routes | Per manifest | light required; dark where internal shell | desktop 1280; mobile 390 for routes with toolbars/tables | Manual checklist below |
| Overlay-heavy routes (date pickers, dialogs, comboboxes) | Same as route | both | desktop | Verify R2 layer: dropdown above sticky toolbar |

---

## Manual route checklist

- [ ] `/(docs)/help/[slug]` — authenticated reader; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(docs)/help/category/[slug]` — authenticated reader; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(docs)/help` — authenticated reader; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(docs)/platform/docs/[id]` — platform admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(docs)/platform/docs/new` — platform admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(docs)/platform/docs` — platform admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/ai-detector` — admin/teacher; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/announcements/[id]/edit` — admin/teacher; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/announcements/[id]` — admin/teacher; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/announcements/create` — admin/teacher; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/announcements` — admin/teacher; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/certificates/[templateId]/generate` — admin/teacher; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/certificates/categories` — admin/teacher; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/certificates/create` — admin/teacher; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/certificates/documentation` — admin/teacher; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/certificates` — admin/teacher; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/changelog` — admin/teacher; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/form-designer` — admin/teacher; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/forms/create` — admin/teacher; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/forms/edit` — admin/teacher; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/forms` — admin/teacher; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/library` — admin/teacher; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/news/[id]/edit` — admin/teacher; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/news/[id]` — admin/teacher; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/news/create` — admin/teacher; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/news` — admin/teacher; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/quizzes-v3/[id]/attempts/[attemptId]` — teacher/admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/quizzes-v3/[id]/edit` — teacher/admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/quizzes-v3/[id]` — teacher/admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/quizzes-v3/[id]/preview` — teacher/admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/quizzes-v3/[id]/responses` — teacher/admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/quizzes-v3/create` — teacher/admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/quizzes-v3` — teacher/admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/quizzes-v3/question-bank` — teacher/admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/services/bulk-emails` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/services/campus-checkin` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/services/campus-checkins` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/services/org-wide-announcements/create` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/services/org-wide-announcements` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/services/password-change-request` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/services/upload-access-log` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(quiz-v3)/take/[code]/attempt/[attemptId]` — student/unauthenticated; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(quiz-v3)/take/[code]/done` — student/unauthenticated; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(quiz-v3)/take/[code]` — student/unauthenticated; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(quiz-v3)/take/[code]/quiz` — student/unauthenticated; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present

---

## Mechanical migration batches

#### Batch A — quizzes internal (`quizzes-internal`)

**Files (explicit):**

- `src/app/(internal)/quizzes-v3/[id]/attempts/[attemptId]/page.tsx`
- `src/app/(internal)/quizzes-v3/[id]/edit/page.tsx`
- `src/app/(internal)/quizzes-v3/[id]/page.tsx`
- `src/app/(internal)/quizzes-v3/[id]/preview/page.tsx`
- `src/app/(internal)/quizzes-v3/[id]/responses/page.tsx`
- `src/app/(internal)/quizzes-v3/create/page.tsx`
- `src/app/(internal)/quizzes-v3/page.tsx`
- `src/app/(internal)/quizzes-v3/question-bank/page.tsx`

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

#### Batch B — public quiz take (`quizzes-public-take`)

**Files (explicit):**

- `src/app/(quiz-v3)/take/[code]/attempt/[attemptId]/page.tsx`
- `src/app/(quiz-v3)/take/[code]/done/page.tsx`
- `src/app/(quiz-v3)/take/[code]/page.tsx`
- `src/app/(quiz-v3)/take/[code]/quiz/page.tsx`

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

#### Batch C — docs and help (`docs-help`)

**Files (explicit):**

- `src/app/(docs)/help/[slug]/page.tsx`
- `src/app/(docs)/help/category/[slug]/page.tsx`
- `src/app/(docs)/help/page.tsx`
- `src/app/(docs)/platform/docs/[id]/page.tsx`
- `src/app/(docs)/platform/docs/new/page.tsx`
- `src/app/(docs)/platform/docs/page.tsx`

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

#### Batch D — content publishing (`content-publish`)

**Files (explicit):**

- `src/app/(internal)/ai-detector/page.tsx`
- `src/app/(internal)/announcements/[id]/edit/page.tsx`
- `src/app/(internal)/announcements/[id]/page.tsx`
- `src/app/(internal)/announcements/create/page.tsx`
- `src/app/(internal)/announcements/page.tsx`
- `src/app/(internal)/certificates/[templateId]/generate/page.tsx`
- `src/app/(internal)/certificates/categories/page.tsx`
- `src/app/(internal)/certificates/create/page.tsx`
- `src/app/(internal)/certificates/documentation/page.tsx`
- `src/app/(internal)/certificates/page.tsx`
- `src/app/(internal)/changelog/page.tsx`
- `src/app/(internal)/form-designer/page.tsx`
- `src/app/(internal)/forms/create/page.tsx`
- `src/app/(internal)/forms/edit/page.tsx`
- `src/app/(internal)/forms/page.tsx`
- `src/app/(internal)/library/page.tsx`
- `src/app/(internal)/news/[id]/edit/page.tsx`
- `src/app/(internal)/news/[id]/page.tsx`
- `src/app/(internal)/news/create/page.tsx`
- `src/app/(internal)/news/page.tsx`
- `src/app/(internal)/services/org-wide-announcements/create/page.tsx`
- `src/app/(internal)/services/org-wide-announcements/page.tsx`

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

#### Batch E — admin services (`services`)

**Files (explicit):**

- `src/app/(internal)/services/bulk-emails/page.tsx`
- `src/app/(internal)/services/campus-checkin/page.tsx`
- `src/app/(internal)/services/campus-checkins/page.tsx`
- `src/app/(internal)/services/org-wide-announcements/create/page.tsx`
- `src/app/(internal)/services/org-wide-announcements/page.tsx`
- `src/app/(internal)/services/password-change-request/page.tsx`
- `src/app/(internal)/services/upload-access-log/page.tsx`

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

### Task 1: Route layout helper (R10)

**Files:**
- Create: `src/lib/ui-remediation/r10-content-route-classes.ts`
- Create: `src/lib/ui-remediation/r10-content-route-classes.test.ts`

- [x] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { contentListToolbarClassName, contentRouteBodyClassName } from "./r10-content-route-classes";

describe("contentRouteBodyClassName", () => {
  it("centers public take flow", () => {
    expect(contentRouteBodyClassName("take-flow")).toContain("max-w-3xl");
  });
});

describe("contentListToolbarClassName", () => {
  it("keeps toolbar actions wrapping", () => {
    expect(contentListToolbarClassName()).toContain("flex-wrap");
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/ui-remediation/r10-content-route-classes.test.ts`

Expected: FAIL with "Cannot find module" or missing export

- [x] **Step 3: Write minimal implementation**

```typescript
export function contentRouteBodyClassName(variant: "editorial" | "tool" | "take-flow"): string {
  if (variant === "take-flow") {
    return "mx-auto w-full max-w-3xl px-4 py-6";
  }
  if (variant === "tool") {
    return "flex min-w-0 flex-col gap-6";
  }
  return "flex min-w-0 flex-col gap-8";
}

export function contentListToolbarClassName(): string {
  return "flex min-w-0 flex-wrap items-center justify-between gap-3";
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/ui-remediation/r10-content-route-classes.test.ts`

Expected: PASS (3+ tests)

- [x] **Step 5: Commit**

```bash
git add src/lib/ui-remediation/r10-content-route-classes.ts src/lib/ui-remediation/r10-content-route-classes.test.ts
git commit -m "$(cat <<'EOF'
feat(ui-r10): add route layout helper for content quizzes services

EOF
)"
```

---

### Task 2: Representative browser spec (R10)

**Files:**
- Create: `e2e/r10-content-quizzes-services.spec.ts`

- [x] **Step 1: Write failing Playwright spec**

```typescript
import { test, expect } from "@playwright/test";

test.describe("R10 representative routes", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  test("/quizzes-v3 has no document horizontal overflow", async ({ page }) => {
    await page.goto("/quizzes-v3");
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });

  test("/quizzes-v3 panel header visible in light and dark", async ({ page }) => {
    await page.goto("/quizzes-v3");
    await page.waitForLoadState("networkidle");
    const header = page.locator("[data-testid='panel-header']");
    await expect(header).toBeVisible();
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(header).toBeVisible();
  });
});
```

- [x] **Step 2: Confirm browser preconditions, then verify the new assertions fail**

Before running, confirm `e2e/.auth/admin.json`, an authorized quiz manager, and the `/quizzes-v3` list fixture are available. If any precondition is missing, STOP and report R10 BLOCKED; do not execute with skipped tests.

Run: `npm run test:browser -- e2e/r10-content-quizzes-services.spec.ts`

Expected: Auth and fixture setup succeeds, no test is skipped, and the new layout assertion fails before the route migration. Missing setup is a STOP/BLOCKED condition, not an expected test failure.

- [x] **Step 3: Commit spec**

```bash
git add e2e/r10-content-quizzes-services.spec.ts
git commit -m "$(cat <<'EOF'
test(ui-r10): add representative browser spec for content quizzes services

EOF
)"
```

---

## Independent QA handoff prompt

Paste verbatim to a fresh QA subagent (read-only — no patching):

```
You are independent QA for UI remediation plan R10 (Content Quizzes Services).
Base SHA target: 05ac447b10966131d4f37a2ba724110c33d66dd4 (final verification on integrated main after all cohorts merge).

Acceptance criteria:
1. All 45 routes in the manifest table pass verification mode listed.
2. No `@/app/_chrome/*` imports remain in owned page or route-local component files.
3. No legacy token classes (`text-muted-foreground`, `bg-card`, `bg-background`, `text-foreground`) in owned files unless covered by a documented R1 exception.
4. Internal routes use PageContainer + usePageHeader per R5 unless listed as documented dense/full-width exception.
5. npm run lint, typecheck, test:unit, build, test:browser pass with zero skipped tests.
6. Confirm auth storage state, quiz/content/service fixtures, and every required persona/permission before running QA. If any is unavailable, STOP and report the affected route BLOCKED; do not run a reduced or skipped suite.

Fixture URLs (representative):
- /quizzes-v3

Commands:
npm run lint
npm run typecheck
npm run test:unit -- src/lib/ui-remediation/r10-content-route-classes.test.ts
npm run test:browser -- e2e/r10-content-quizzes-services.spec.ts
npm run build

Return PASS/FAIL/BLOCKED per route with screenshot path, role, viewport, theme, reproduction steps for failures, and suspected owner plan (R1–R5 shared vs R10 local). BLOCKED means QA stopped before execution because a required fixture, permission, or auth precondition was missing; it never means a skipped test.
```

---

## Self-review (author checklist)

- [x] Spec §7 route family R10 — every owned product route listed exactly once
- [x] Spec §8 contracts — consumes R1–R5; forbidden shared files enumerated
- [x] Spec §9 verification — commands and browser assertions included
- [x] Spec §10 — stop conditions, commits, independent QA prompt present
- [x] Placeholder and omitted-code scan passed
