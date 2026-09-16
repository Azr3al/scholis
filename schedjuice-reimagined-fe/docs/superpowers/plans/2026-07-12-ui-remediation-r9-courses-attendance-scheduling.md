# Courses Attendance Scheduling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair course record-body, attendance, scheduling, roster, grading, and assignment routes for shell consistency, dense operational layouts, table overflow, and marking/grading interaction stability.

**Architecture:** Course tabs share a record-body composition helper. Attendance marking and god-view tables adopt R3 min-width metadata. Course create wizard steps use R5 progressive header actions. Assignment/submission flows verify R2 overlay stacking for rubric dialogs and file previews.

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

**Route count:** 47 product routes (excludes design/debug/artifacts and all finance R11–R14 routes)

All FE commands run from `schedjuice-reimagined-fe/`.

## Current-state evidence (base `05ac447b`)

| Location | Issue |
| --- | --- |
| 13/47 owned pages | Import `@/app/_chrome/*` at base SHA |
| `src/app/(internal)/courses/[id]/page.tsx` | Course hub shell-delegated — body tabs must not duplicate shell title |
| `src/app/(internal)/courses/[id]/attendance/marking/[eventIndex]/page.tsx` | High-risk dense ops — sticky toolbar + table overflow |
| `src/components/attendance-god-view/*.tsx` | Uses `_chrome/badge` in owned components |
| 11/47 owned pages | Missing `PageContainer` (create wizard steps, course index) |
| `/courses/[id]/student-payments` excluded | Owned by R12 — do not edit in R9 |
| Cohort scan | `_chrome` pages: 13; legacy token pages: 5; missing PageContainer (internal): see manifest |

**Pages with `@/app/_chrome/*` imports (migrate in this plan):**

- `src/app/(internal)/assignments/[id]/grading/[submissionId]/page.tsx`
- `src/app/(internal)/assignments/[id]/page.tsx`
- `src/app/(internal)/courses/[id]/availability/page.tsx`
- `src/app/(internal)/courses/[id]/checkin-history/[eventIndex]/page.tsx`
- `src/app/(internal)/courses/[id]/email-templates/[templateId]/page.tsx`
- `src/app/(internal)/courses/[id]/email-templates/[templateId]/user-emails/[emailId]/page.tsx`
- `src/app/(internal)/courses/[id]/grading/reports/[batchId]/page.tsx`
- `src/app/(internal)/courses/[id]/grading/reports/page.tsx`
- `src/app/(internal)/courses/[id]/grading/results/page.tsx`
- `src/app/(internal)/courses/[id]/meeting-attendance/page.tsx`
- `src/app/(internal)/courses/[id]/recordings/page.tsx`
- `src/app/(internal)/courses/[id]/students/history/page.tsx`
- `src/app/(internal)/submissions/[id]/page.tsx`

**R5 contracts to consume (do not redefine):** `PageContainer`, `PageTitle`, `PageHeader`, `PageSection`, `usePageHeader`, `page-composition.ts` width/density map.

---


## Stop conditions

Stop and report (do not patch shared contracts locally) when:

1. Current branch base SHA differs from `05ac447b10966131d4f37a2ba724110c33d66dd4` and owned page files changed upstream — re-read routes and confirm plan validity.
2. Any file in **Forbidden shared files** below changed on your branch — escalate to the owning R1–R5 plan.
3. `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run build`, or `npm run test:browser` fails after your change and the failure is outside owned files.
4. Required auth storage state, course/event/submission fixture, or teacher/admin/student permission is unavailable — STOP before execution, report the affected route as BLOCKED, and do not run or skip any browser test.
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

### Page routes (47)

- `src/app/(internal)/assessments/submission-tracker/page.tsx`
- `src/app/(internal)/assignments/[id]/edit/page.tsx`
- `src/app/(internal)/assignments/[id]/grading/[submissionId]/page.tsx`
- `src/app/(internal)/assignments/[id]/page.tsx`
- `src/app/(internal)/attendances/god-view/page.tsx`
- `src/app/(internal)/courses/[id]/assessments/page.tsx`
- `src/app/(internal)/courses/[id]/attendance/marking/[eventIndex]/page.tsx`
- `src/app/(internal)/courses/[id]/attendance/page.tsx`
- `src/app/(internal)/courses/[id]/availability/page.tsx`
- `src/app/(internal)/courses/[id]/checkin-history/[eventIndex]/page.tsx`
- `src/app/(internal)/courses/[id]/daily-notes/[eventId]/page.tsx`
- `src/app/(internal)/courses/[id]/daily-notes/page.tsx`
- `src/app/(internal)/courses/[id]/edit/page.tsx`
- `src/app/(internal)/courses/[id]/email-templates/[templateId]/edit/page.tsx`
- `src/app/(internal)/courses/[id]/email-templates/[templateId]/page.tsx`
- `src/app/(internal)/courses/[id]/email-templates/[templateId]/user-emails/[emailId]/page.tsx`
- `src/app/(internal)/courses/[id]/email-templates/[templateId]/user-emails/page.tsx`
- `src/app/(internal)/courses/[id]/email-templates/create/page.tsx`
- `src/app/(internal)/courses/[id]/email-templates/page.tsx`
- `src/app/(internal)/courses/[id]/grading/page.tsx`
- `src/app/(internal)/courses/[id]/grading/reports/[batchId]/[studentId]/page.tsx`
- `src/app/(internal)/courses/[id]/grading/reports/[batchId]/page.tsx`
- `src/app/(internal)/courses/[id]/grading/reports/create/page.tsx`
- `src/app/(internal)/courses/[id]/grading/reports/page.tsx`
- `src/app/(internal)/courses/[id]/grading/results/[yearMonth]/page.tsx`
- `src/app/(internal)/courses/[id]/grading/results/page.tsx`
- `src/app/(internal)/courses/[id]/join-requests/page.tsx`
- `src/app/(internal)/courses/[id]/locked/page.tsx`
- `src/app/(internal)/courses/[id]/materials/page.tsx`
- `src/app/(internal)/courses/[id]/meeting-attendance/page.tsx`
- `src/app/(internal)/courses/[id]/members/page.tsx`
- `src/app/(internal)/courses/[id]/page.tsx`
- `src/app/(internal)/courses/[id]/recordings/page.tsx`
- `src/app/(internal)/courses/[id]/schedule/page.tsx`
- `src/app/(internal)/courses/[id]/students/history/page.tsx`
- `src/app/(internal)/courses/[id]/students/page.tsx`
- `src/app/(internal)/courses/create/page.tsx`
- `src/app/(internal)/courses/create/program/[programId]/intake/[intakeId]/add/page.tsx`
- `src/app/(internal)/courses/create/program/[programId]/intake/confirm/page.tsx`
- `src/app/(internal)/courses/create/program/[programId]/intake/dates/page.tsx`
- `src/app/(internal)/courses/create/program/[programId]/intake/preview/page.tsx`
- `src/app/(internal)/courses/create/program/[programId]/intake/structure/page.tsx`
- `src/app/(internal)/courses/create/program/[programId]/intake/subjects/page.tsx`
- `src/app/(internal)/courses/create/program/[programId]/manual/page.tsx`
- `src/app/(internal)/courses/create/program/[programId]/page.tsx`
- `src/app/(internal)/courses/page.tsx`
- `src/app/(internal)/submissions/[id]/page.tsx`

### Route-local component directories

- `src/components/courses/` (route-local components; modify only files imported by owned pages)
- `src/components/course-record/` (route-local components; modify only files imported by owned pages)
- `src/components/attendance/` (route-local components; modify only files imported by owned pages)
- `src/components/attendance-god-view/` (route-local components; modify only files imported by owned pages)
- `src/components/assignments/` (route-local components; modify only files imported by owned pages)
- `src/components/grading/` (route-local components; modify only files imported by owned pages)
- `src/components/submissions/` (route-local components; modify only files imported by owned pages)
- `src/components/assessments/` (route-local components; modify only files imported by owned pages)
- `src/components/scheduling/` (route-local components; modify only files imported by owned pages)
- `src/components/email-templates/` (route-local components; modify only files imported by owned pages)
- `src/components/daily-notes/` (route-local components; modify only files imported by owned pages)
- `src/components/recordings/` (route-local components; modify only files imported by owned pages)
- `src/components/meeting-attendance/` (route-local components; modify only files imported by owned pages)

### New helper modules (this plan)

- Create: `src/lib/ui-remediation/r9-course-record-layout-classes.ts`
- Create: `src/lib/ui-remediation/r9-course-record-layout-classes.test.ts`
- Create: `e2e/r9-courses-attendance-scheduling.spec.ts` (Playwright — post-R0 harness)

---

## Route manifest (R9)

| Route | Page file | Persona / permission | Shared patterns | Risk | Verification |
| --- | --- | --- | --- | --- | --- |
| `/(internal)/assessments/submission-tracker` | `src/app/(internal)/assessments/submission-tracker/page.tsx` | teacher/admin/student — Course record body tab | sj-tokens | low | manual |
| `/(internal)/assignments/[id]/edit` | `src/app/(internal)/assignments/[id]/edit/page.tsx` | teacher/student — Assignment workflow | sj-tokens | low | manual |
| `/(internal)/assignments/[id]/grading/[submissionId]` | `src/app/(internal)/assignments/[id]/grading/[submissionId]/page.tsx` | teacher/student — Assignment workflow | stale-_chrome, sj-tokens | high | automated + manual |
| `/(internal)/assignments/[id]` | `src/app/(internal)/assignments/[id]/page.tsx` | teacher/student — Assignment workflow | stale-_chrome, legacy-tokens, sj-tokens | high | automated + manual |
| `/(internal)/attendances/god-view` | `src/app/(internal)/attendances/god-view/page.tsx` | admin/principal — Cross-course attendance overview | sj-tokens | low | manual |
| `/(internal)/courses/[id]/assessments` | `src/app/(internal)/courses/[id]/assessments/page.tsx` | teacher/admin/student — Course record body tab | shell-delegated | low | manual |
| `/(internal)/courses/[id]/attendance/marking/[eventIndex]` | `src/app/(internal)/courses/[id]/attendance/marking/[eventIndex]/page.tsx` | teacher — Live attendance marking | shell-delegated | medium | automated + manual |
| `/(internal)/courses/[id]/attendance` | `src/app/(internal)/courses/[id]/attendance/page.tsx` | teacher/admin/student — Course record body tab | sj-tokens | low | manual |
| `/(internal)/courses/[id]/availability` | `src/app/(internal)/courses/[id]/availability/page.tsx` | teacher/admin/student — Course record body tab | stale-_chrome | medium | representative automated + manual |
| `/(internal)/courses/[id]/checkin-history/[eventIndex]` | `src/app/(internal)/courses/[id]/checkin-history/[eventIndex]/page.tsx` | teacher/admin/student — Course record body tab | stale-_chrome, legacy-tokens, sj-tokens, ResourceTable | high | automated + manual |
| `/(internal)/courses/[id]/daily-notes/[eventId]` | `src/app/(internal)/courses/[id]/daily-notes/[eventId]/page.tsx` | teacher/admin/student — Course record body tab | shell-delegated | low | manual |
| `/(internal)/courses/[id]/daily-notes` | `src/app/(internal)/courses/[id]/daily-notes/page.tsx` | teacher/admin/student — Course record body tab | shell-delegated | low | manual |
| `/(internal)/courses/[id]/edit` | `src/app/(internal)/courses/[id]/edit/page.tsx` | teacher/admin/student — Course record body tab | sj-tokens, AutoForm | low | manual |
| `/(internal)/courses/[id]/email-templates/[templateId]/edit` | `src/app/(internal)/courses/[id]/email-templates/[templateId]/edit/page.tsx` | teacher/admin/student — Course record body tab | shell-delegated | low | manual |
| `/(internal)/courses/[id]/email-templates/[templateId]` | `src/app/(internal)/courses/[id]/email-templates/[templateId]/page.tsx` | teacher/admin/student — Course record body tab | stale-_chrome, ResourceTable | medium | representative automated + manual |
| `/(internal)/courses/[id]/email-templates/[templateId]/user-emails/[emailId]` | `src/app/(internal)/courses/[id]/email-templates/[templateId]/user-emails/[emailId]/page.tsx` | teacher/admin/student — Course record body tab | stale-_chrome, sj-tokens | medium | representative automated + manual |
| `/(internal)/courses/[id]/email-templates/[templateId]/user-emails` | `src/app/(internal)/courses/[id]/email-templates/[templateId]/user-emails/page.tsx` | teacher/admin/student — Course record body tab | shell-delegated | low | manual |
| `/(internal)/courses/[id]/email-templates/create` | `src/app/(internal)/courses/[id]/email-templates/create/page.tsx` | teacher/admin/student — Course record body tab | shell-delegated | low | manual |
| `/(internal)/courses/[id]/email-templates` | `src/app/(internal)/courses/[id]/email-templates/page.tsx` | teacher/admin/student — Course record body tab | ResourceTable | low | manual |
| `/(internal)/courses/[id]/grading` | `src/app/(internal)/courses/[id]/grading/page.tsx` | teacher/admin — Grading and reports | ResourceTable | medium | representative automated + manual |
| `/(internal)/courses/[id]/grading/reports/[batchId]/[studentId]` | `src/app/(internal)/courses/[id]/grading/reports/[batchId]/[studentId]/page.tsx` | teacher/admin — Grading and reports | shell-delegated | medium | representative automated + manual |
| `/(internal)/courses/[id]/grading/reports/[batchId]` | `src/app/(internal)/courses/[id]/grading/reports/[batchId]/page.tsx` | teacher/admin — Grading and reports | stale-_chrome | high | automated + manual |
| `/(internal)/courses/[id]/grading/reports/create` | `src/app/(internal)/courses/[id]/grading/reports/create/page.tsx` | teacher/admin — Grading and reports | legacy-tokens, sj-tokens | high | automated + manual |
| `/(internal)/courses/[id]/grading/reports` | `src/app/(internal)/courses/[id]/grading/reports/page.tsx` | teacher/admin — Grading and reports | stale-_chrome | high | automated + manual |
| `/(internal)/courses/[id]/grading/results/[yearMonth]` | `src/app/(internal)/courses/[id]/grading/results/[yearMonth]/page.tsx` | teacher/admin — Grading and reports | shell-delegated | medium | representative automated + manual |
| `/(internal)/courses/[id]/grading/results` | `src/app/(internal)/courses/[id]/grading/results/page.tsx` | teacher/admin — Grading and reports | stale-_chrome | high | automated + manual |
| `/(internal)/courses/[id]/join-requests` | `src/app/(internal)/courses/[id]/join-requests/page.tsx` | teacher/admin/student — Course record body tab | ResourceTable | low | manual |
| `/(internal)/courses/[id]/locked` | `src/app/(internal)/courses/[id]/locked/page.tsx` | teacher/admin/student — Course record body tab | shell-delegated | low | manual |
| `/(internal)/courses/[id]/materials` | `src/app/(internal)/courses/[id]/materials/page.tsx` | teacher/admin/student — Course record body tab | shell-delegated | low | manual |
| `/(internal)/courses/[id]/meeting-attendance` | `src/app/(internal)/courses/[id]/meeting-attendance/page.tsx` | teacher/admin/student — Course record body tab | stale-_chrome, legacy-tokens, sj-tokens | high | automated + manual |
| `/(internal)/courses/[id]/members` | `src/app/(internal)/courses/[id]/members/page.tsx` | teacher/admin/student — Course record body tab | sj-tokens, ResourceTable | low | manual |
| `/(internal)/courses/[id]` | `src/app/(internal)/courses/[id]/page.tsx` | teacher/admin/student — Course record body tab | missing-PageContainer | low | manual |
| `/(internal)/courses/[id]/recordings` | `src/app/(internal)/courses/[id]/recordings/page.tsx` | teacher/admin/student — Course record body tab | stale-_chrome, sj-tokens | medium | representative automated + manual |
| `/(internal)/courses/[id]/schedule` | `src/app/(internal)/courses/[id]/schedule/page.tsx` | teacher/admin/student — Course record body tab | shell-delegated | low | manual |
| `/(internal)/courses/[id]/students/history` | `src/app/(internal)/courses/[id]/students/history/page.tsx` | teacher/admin/student — Course record body tab | stale-_chrome, sj-tokens | medium | representative automated + manual |
| `/(internal)/courses/[id]/students` | `src/app/(internal)/courses/[id]/students/page.tsx` | teacher/admin/student — Course record body tab | ResourceTable | low | manual |
| `/(internal)/courses/create` | `src/app/(internal)/courses/create/page.tsx` | admin — Course creation wizard | legacy-tokens, missing-PageContainer | medium | representative automated + manual |
| `/(internal)/courses/create/program/[programId]/intake/[intakeId]/add` | `src/app/(internal)/courses/create/program/[programId]/intake/[intakeId]/add/page.tsx` | admin — Course creation wizard | missing-PageContainer | low | manual |
| `/(internal)/courses/create/program/[programId]/intake/confirm` | `src/app/(internal)/courses/create/program/[programId]/intake/confirm/page.tsx` | admin — Course creation wizard | missing-PageContainer | low | manual |
| `/(internal)/courses/create/program/[programId]/intake/dates` | `src/app/(internal)/courses/create/program/[programId]/intake/dates/page.tsx` | admin — Course creation wizard | missing-PageContainer | low | manual |
| `/(internal)/courses/create/program/[programId]/intake/preview` | `src/app/(internal)/courses/create/program/[programId]/intake/preview/page.tsx` | admin — Course creation wizard | missing-PageContainer | low | manual |
| `/(internal)/courses/create/program/[programId]/intake/structure` | `src/app/(internal)/courses/create/program/[programId]/intake/structure/page.tsx` | admin — Course creation wizard | missing-PageContainer | low | manual |
| `/(internal)/courses/create/program/[programId]/intake/subjects` | `src/app/(internal)/courses/create/program/[programId]/intake/subjects/page.tsx` | admin — Course creation wizard | missing-PageContainer | low | manual |
| `/(internal)/courses/create/program/[programId]/manual` | `src/app/(internal)/courses/create/program/[programId]/manual/page.tsx` | admin — Course creation wizard | missing-PageContainer | low | manual |
| `/(internal)/courses/create/program/[programId]` | `src/app/(internal)/courses/create/program/[programId]/page.tsx` | admin — Course creation wizard | missing-PageContainer | low | manual |
| `/(internal)/courses` | `src/app/(internal)/courses/page.tsx` | teacher/admin/student — Course record body tab | missing-PageContainer | low | manual |
| `/(internal)/submissions/[id]` | `src/app/(internal)/submissions/[id]/page.tsx` | teacher/student — Assignment workflow | stale-_chrome, sj-tokens | medium | representative automated + manual |

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
npm run test:unit -- src/lib/ui-remediation/r9-course-record-layout-classes.test.ts
```

Expected: all tests PASS

**Cohort-scoped browser test:**

```bash
npm run test:browser -- e2e/r9-courses-attendance-scheduling.spec.ts
```

Expected: all tests PASS; screenshots written to `e2e/screenshots/r9/`

**Production build smoke:**

```bash
npm run build
```

Expected: Exit 0

---

## Role, theme, and viewport matrix

| Surface | Roles | Themes | Viewports | Notes |
| --- | --- | --- | --- | --- |
| Representative automated route `/(internal)/courses/[id]/attendance/marking/[eventIndex]` | See route manifest persona column | light + dark | 1280×800 desktop; 390×844 mobile | Primary browser spec |
| All `R9` routes | Per manifest | light required; dark where internal shell | desktop 1280; mobile 390 for routes with toolbars/tables | Manual checklist below |
| Overlay-heavy routes (date pickers, dialogs, comboboxes) | Same as route | both | desktop | Verify R2 layer: dropdown above sticky toolbar |

---

## Manual route checklist

- [ ] `/(internal)/assessments/submission-tracker` — teacher/admin/student; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/assignments/[id]/edit` — teacher/student; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/assignments/[id]/grading/[submissionId]` — teacher/student; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/assignments/[id]` — teacher/student; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/attendances/god-view` — admin/principal; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/courses/[id]/assessments` — teacher/admin/student; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/courses/[id]/attendance/marking/[eventIndex]` — teacher; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/courses/[id]/attendance` — teacher/admin/student; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/courses/[id]/availability` — teacher/admin/student; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/courses/[id]/checkin-history/[eventIndex]` — teacher/admin/student; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/courses/[id]/daily-notes/[eventId]` — teacher/admin/student; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/courses/[id]/daily-notes` — teacher/admin/student; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/courses/[id]/edit` — teacher/admin/student; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/courses/[id]/email-templates/[templateId]/edit` — teacher/admin/student; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/courses/[id]/email-templates/[templateId]` — teacher/admin/student; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/courses/[id]/email-templates/[templateId]/user-emails/[emailId]` — teacher/admin/student; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/courses/[id]/email-templates/[templateId]/user-emails` — teacher/admin/student; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/courses/[id]/email-templates/create` — teacher/admin/student; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/courses/[id]/email-templates` — teacher/admin/student; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/courses/[id]/grading` — teacher/admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/courses/[id]/grading/reports/[batchId]/[studentId]` — teacher/admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/courses/[id]/grading/reports/[batchId]` — teacher/admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/courses/[id]/grading/reports/create` — teacher/admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/courses/[id]/grading/reports` — teacher/admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/courses/[id]/grading/results/[yearMonth]` — teacher/admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/courses/[id]/grading/results` — teacher/admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/courses/[id]/join-requests` — teacher/admin/student; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/courses/[id]/locked` — teacher/admin/student; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/courses/[id]/materials` — teacher/admin/student; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/courses/[id]/meeting-attendance` — teacher/admin/student; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/courses/[id]/members` — teacher/admin/student; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/courses/[id]` — teacher/admin/student; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/courses/[id]/recordings` — teacher/admin/student; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/courses/[id]/schedule` — teacher/admin/student; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/courses/[id]/students/history` — teacher/admin/student; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/courses/[id]/students` — teacher/admin/student; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/courses/create` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/courses/create/program/[programId]/intake/[intakeId]/add` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/courses/create/program/[programId]/intake/confirm` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/courses/create/program/[programId]/intake/dates` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/courses/create/program/[programId]/intake/preview` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/courses/create/program/[programId]/intake/structure` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/courses/create/program/[programId]/intake/subjects` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/courses/create/program/[programId]/manual` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/courses/create/program/[programId]` — admin; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/courses` — teacher/admin/student; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present
- [ ] `/(internal)/submissions/[id]` — teacher/student; light + dark; desktop 1280px; mobile 390px where layout differs; confirm no horizontal overflow, overlays clickable, loading/empty/error states present

---

## Mechanical migration batches

#### Batch A — course index and create wizard (`course-index-create`)

**Files (explicit):**

- `src/app/(internal)/courses/create/page.tsx`
- `src/app/(internal)/courses/create/program/[programId]/intake/[intakeId]/add/page.tsx`
- `src/app/(internal)/courses/create/program/[programId]/intake/confirm/page.tsx`
- `src/app/(internal)/courses/create/program/[programId]/intake/dates/page.tsx`
- `src/app/(internal)/courses/create/program/[programId]/intake/preview/page.tsx`
- `src/app/(internal)/courses/create/program/[programId]/intake/structure/page.tsx`
- `src/app/(internal)/courses/create/program/[programId]/intake/subjects/page.tsx`
- `src/app/(internal)/courses/create/program/[programId]/manual/page.tsx`
- `src/app/(internal)/courses/create/program/[programId]/page.tsx`
- `src/app/(internal)/courses/page.tsx`

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

#### Batch B — course record tabs (`course-record-tabs`)

**Files (explicit):**

- `src/app/(internal)/courses/[id]/assessments/page.tsx`
- `src/app/(internal)/courses/[id]/attendance/page.tsx`
- `src/app/(internal)/courses/[id]/availability/page.tsx`
- `src/app/(internal)/courses/[id]/checkin-history/[eventIndex]/page.tsx`
- `src/app/(internal)/courses/[id]/daily-notes/[eventId]/page.tsx`
- `src/app/(internal)/courses/[id]/daily-notes/page.tsx`
- `src/app/(internal)/courses/[id]/edit/page.tsx`
- `src/app/(internal)/courses/[id]/email-templates/[templateId]/edit/page.tsx`
- `src/app/(internal)/courses/[id]/email-templates/[templateId]/page.tsx`
- `src/app/(internal)/courses/[id]/email-templates/[templateId]/user-emails/[emailId]/page.tsx`
- `src/app/(internal)/courses/[id]/email-templates/[templateId]/user-emails/page.tsx`
- `src/app/(internal)/courses/[id]/email-templates/create/page.tsx`
- `src/app/(internal)/courses/[id]/email-templates/page.tsx`
- `src/app/(internal)/courses/[id]/grading/page.tsx`
- `src/app/(internal)/courses/[id]/join-requests/page.tsx`
- `src/app/(internal)/courses/[id]/locked/page.tsx`
- `src/app/(internal)/courses/[id]/materials/page.tsx`
- `src/app/(internal)/courses/[id]/meeting-attendance/page.tsx`
- `src/app/(internal)/courses/[id]/members/page.tsx`
- `src/app/(internal)/courses/[id]/recordings/page.tsx`
- `src/app/(internal)/courses/[id]/schedule/page.tsx`
- `src/app/(internal)/courses/[id]/students/history/page.tsx`
- `src/app/(internal)/courses/[id]/students/page.tsx`

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

#### Batch C — attendance and grading (`attendance-grading`)

**Files (explicit):**

- `src/app/(internal)/assignments/[id]/grading/[submissionId]/page.tsx`
- `src/app/(internal)/attendances/god-view/page.tsx`
- `src/app/(internal)/courses/[id]/attendance/marking/[eventIndex]/page.tsx`
- `src/app/(internal)/courses/[id]/attendance/page.tsx`
- `src/app/(internal)/courses/[id]/grading/page.tsx`
- `src/app/(internal)/courses/[id]/grading/reports/[batchId]/[studentId]/page.tsx`
- `src/app/(internal)/courses/[id]/grading/reports/[batchId]/page.tsx`
- `src/app/(internal)/courses/[id]/grading/reports/create/page.tsx`
- `src/app/(internal)/courses/[id]/grading/reports/page.tsx`
- `src/app/(internal)/courses/[id]/grading/results/[yearMonth]/page.tsx`
- `src/app/(internal)/courses/[id]/grading/results/page.tsx`
- `src/app/(internal)/courses/[id]/meeting-attendance/page.tsx`

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

#### Batch D — assignments and submissions (`assignments-submissions`)

**Files (explicit):**

- `src/app/(internal)/assessments/submission-tracker/page.tsx`
- `src/app/(internal)/assignments/[id]/edit/page.tsx`
- `src/app/(internal)/assignments/[id]/grading/[submissionId]/page.tsx`
- `src/app/(internal)/assignments/[id]/page.tsx`
- `src/app/(internal)/courses/[id]/page.tsx`
- `src/app/(internal)/submissions/[id]/page.tsx`

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

### Task 1: Route layout helper (R9)

**Files:**
- Create: `src/lib/ui-remediation/r9-course-record-layout-classes.ts`
- Create: `src/lib/ui-remediation/r9-course-record-layout-classes.test.ts`

- [x] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import {
  attendanceMarkingToolbarClassName,
  courseOperationalTableShellClassName,
  courseRecordTabStackClassName,
} from "./r9-course-record-layout-classes";

describe("courseOperationalTableShellClassName", () => {
  it("scrolls horizontally before crushing columns", () => {
    expect(courseOperationalTableShellClassName()).toContain("overflow-x-auto");
  });
});

describe("attendanceMarkingToolbarClassName", () => {
  it("uses sticky in-flow layer token", () => {
    expect(attendanceMarkingToolbarClassName()).toContain("z-sticky");
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/ui-remediation/r9-course-record-layout-classes.test.ts`

Expected: FAIL with "Cannot find module" or missing export

- [x] **Step 3: Write minimal implementation**

```typescript
export function courseRecordTabStackClassName(): string {
  return "flex min-w-0 flex-col gap-6";
}

export function courseOperationalTableShellClassName(): string {
  return "min-w-0 overflow-x-auto";
}

export function attendanceMarkingToolbarClassName(): string {
  return "sticky top-0 z-sticky flex min-w-0 flex-wrap items-center gap-2 bg-surface pb-3";
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/ui-remediation/r9-course-record-layout-classes.test.ts`

Expected: PASS (3+ tests)

- [x] **Step 5: Commit**

```bash
git add src/lib/ui-remediation/r9-course-record-layout-classes.ts src/lib/ui-remediation/r9-course-record-layout-classes.test.ts
git commit -m "$(cat <<'EOF'
feat(ui-r9): add route layout helper for courses attendance scheduling

EOF
)"
```

---

### Task 2: Representative browser spec (R9)

**Files:**
- Create: `e2e/r9-courses-attendance-scheduling.spec.ts`

- [x] **Step 1: Write failing Playwright spec**

```typescript
import { test, expect } from "@playwright/test";

test.describe("R9 representative routes", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  test("/courses/1/attendance/marking/0 has no document horizontal overflow", async ({ page }) => {
    await page.goto("/courses/1/attendance/marking/0");
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });

  test("/courses/1/attendance/marking/0 panel header visible in light and dark", async ({ page }) => {
    await page.goto("/courses/1/attendance/marking/0");
    await page.waitForLoadState("networkidle");
    const header = page.locator("[data-testid='panel-header']");
    await expect(header).toBeVisible();
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(header).toBeVisible();
  });
});
```

- [x] **Step 2: Confirm browser preconditions, then verify the new assertions fail**

Before running, confirm `e2e/.auth/admin.json`, course ID `1`, event index `0`, and teacher permission are available. If any precondition is missing, STOP and report R9 BLOCKED; do not execute with skipped tests.

Run: `npm run test:browser -- e2e/r9-courses-attendance-scheduling.spec.ts`

Expected: Auth and fixture setup succeeds, no test is skipped, and the new layout assertion fails before the route migration. Missing setup is a STOP/BLOCKED condition, not an expected test failure.

- [x] **Step 3: Commit spec**

```bash
git add e2e/r9-courses-attendance-scheduling.spec.ts
git commit -m "$(cat <<'EOF'
test(ui-r9): add representative browser spec for courses attendance scheduling

EOF
)"
```

---

## Independent QA handoff prompt

Paste verbatim to a fresh QA subagent (read-only — no patching):

```
You are independent QA for UI remediation plan R9 (Courses Attendance Scheduling).
Base SHA target: 05ac447b10966131d4f37a2ba724110c33d66dd4 (final verification on integrated main after all cohorts merge).

Acceptance criteria:
1. All 47 routes in the manifest table pass verification mode listed.
2. No `@/app/_chrome/*` imports remain in owned page or route-local component files.
3. No legacy token classes (`text-muted-foreground`, `bg-card`, `bg-background`, `text-foreground`) in owned files unless covered by a documented R1 exception.
4. Internal routes use PageContainer + usePageHeader per R5 unless listed as documented dense/full-width exception.
5. npm run lint, typecheck, test:unit, build, test:browser pass with zero skipped tests.
6. Confirm auth storage state, course/event/submission fixtures, and every required persona/permission before running QA. If any is unavailable, STOP and report the affected route BLOCKED; do not run a reduced or skipped suite.

Fixture URLs (representative):
- /courses/1/attendance/marking/0

Commands:
npm run lint
npm run typecheck
npm run test:unit -- src/lib/ui-remediation/r9-course-record-layout-classes.test.ts
npm run test:browser -- e2e/r9-courses-attendance-scheduling.spec.ts
npm run build

Return PASS/FAIL/BLOCKED per route with screenshot path, role, viewport, theme, reproduction steps for failures, and suspected owner plan (R1–R5 shared vs R9 local). BLOCKED means QA stopped before execution because a required fixture, permission, or auth precondition was missing; it never means a skipped test.
```

---

## Self-review (author checklist)

- [x] Spec §7 route family R9 — every owned product route listed exactly once
- [x] Spec §8 contracts — consumes R1–R5; forbidden shared files enumerated
- [x] Spec §9 verification — commands and browser assertions included
- [x] Spec §10 — stop conditions, commits, independent QA prompt present
- [x] Placeholder and omitted-code scan passed
