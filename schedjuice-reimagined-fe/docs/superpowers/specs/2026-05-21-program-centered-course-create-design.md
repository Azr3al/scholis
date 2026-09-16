# Program-centered course create — design spec

> **Status:** Approved (brainstorming 2026-05-21)  
> **Scope:** `schedjuice-reimagined-fe` + backend changes in `schedjuice-reimagined-be`  
> **Replaces:** Stepper-based `CourseCreateForm`, `@modal` course create, `auto-form.tsx` usage in course/intake create flows

---

## 1. Problem

Course creation was built before program-centered scheduling. The current `CourseCreateForm` is a 788-line stepper wired through `auto-form.tsx` with inline `fieldType` lambdas. It does not match how schools actually schedule:

- **ACCA-style** (`subject_strategy = required`): one course per exam paper, bulk-generated from an intake.
- **K-12-style** (`subject_strategy = multi`): one course per class (level × section), each course teaches multiple subjects via `CourseSubject`, with **different subject sets per level** (e.g. Year 6 has no Physics; Year 7 does).

Intake creation is a separate, underpowered wizard at `/intakes/create` with no inline structure setup and a flat `subject_ids` bundle that cannot express per-level curriculum.

---

## 2. Goals

1. **Unified entry** — one “Add classes” flow that adapts by program config.
2. **URL-driven** — each step is a route; browser back/forward works; no modal create.
3. **Hand-composed forms** — no `auto-form.tsx`; explicit fields per surface.
4. **Program-first routing** — skip program picker when `program_count === 1`; show hub when multiple programs.
5. **Intake onboarding** — first intake for a program includes inline level/section setup; later intakes skip structure.
6. **Per-level curriculum** — subjects attached to levels (`ProgramLevelSubject`), inherited by all sections; hybrid defaults (program settings + per-intake override).
7. **Bulk preview** — checkbox list generated from `ProgramLevel`, `Section`, and `subject_strategy`; admins check/uncheck and edit titles.

## Non-goals

- Rebuilding program settings page in full (reuse/extend existing editors where possible).
- Greenfield v2 field library (`src/components/fields/`) — use existing form primitives as interim.
- Changing `subject_strategy = optional | none` semantics beyond current validation helpers.

---

## 3. Decisions log

| Topic | Decision |
| --- | --- |
| Entry IA | Unified “Add classes” flow (not separate `/courses/create` vs `/intakes/create` nav paths for admins) |
| Multi-program | Program picker hub when `program_count > 1`; auto-select when `program_count === 1` |
| Architecture | Approach 2 — thin router + dedicated surfaces; **URL-driven** route tree |
| Modal create | **Delete entirely** — no `@modal` slot, no `?modal=create`, no `isModal` prop |
| Manual programs | Single scrollable page (grouped sections, one Save) — no stepper |
| First intake | Full wizard: structure → subjects → dates → preview → confirm |
| Later intakes | dates → subjects → preview → confirm; structure edits in program settings only |
| K-12 subjects | Per-level bundles; sections inherit from level |
| Subject defaults | Hybrid — defaults on `ProgramLevelSubject`; overridable per intake at `/intake/subjects` |
| `ProgramSubject` | Unchanged — used for `required` (ACCA) only |
| `CourseSubject` | Created at generation from level's subject list (`multi`) |

---

## 4. URL map

```
/courses/create
  └─ program_count === 1  → redirect /courses/create/program/{id}
  └─ program_count > 1    → ProgramPicker

/courses/create/program/[programId]
  └─ redirect by course_creation_method + intake_count

/courses/create/program/[programId]/manual
  └─ ManualCourseForm (single page)

/courses/create/program/[programId]/intake/structure   ← first intake only
/courses/create/program/[programId]/intake/subjects    ← per-level curriculum
/courses/create/program/[programId]/intake/dates
/courses/create/program/[programId]/intake/preview     ← checkbox list
/courses/create/program/[programId]/intake/confirm
```

### Redirect rules

**At `/courses/create/program/[programId]`:**

| Condition | Redirect |
| --- | --- |
| `course_creation_method = manual` | `/manual` |
| `course_creation_method = intake_based` AND `intake_count === 0` | `/intake/structure` |
| `course_creation_method = intake_based` AND `intake_count > 0` | `/intake/dates` |

**Guards (middleware or layout `redirect`):**

- `/intake/structure` when `intake_count > 0` → `/intake/dates`
- `/intake/dates` (or later steps) when `intake_count === 0` AND program has zero levels → `/intake/structure`

### Deleted routes / code

- `src/app/(internal)/courses/@modal/(.)create/page.tsx` — delete
- `courses/@modal/` directory — delete if empty
- `modal` parallel slot in `courses/layout.tsx` — remove; layout becomes `{children}` only
- `router.push("/courses/create?modal=create")` on courses list — change to `/courses/create`
- `CourseCreateForm` `isModal` prop and all modal-specific styling branches — delete with component

---

## 5. UX flows

### 5.1 Program picker (`/courses/create`)

When `program_count > 1`, show hub cards:

- Program name
- Creation method label (Manual / Intake-based)
- Subject strategy label
- Click → `/courses/create/program/[id]`

When `program_count === 0`, empty state with link to program management.

### 5.2 Manual course (`.../manual`)

Single scrollable page, grouped `<FormSection>`-style blocks:

1. **Identity** — title, description, category
2. **Program fields** — subject / level / section (visibility from `shouldShowCourseProgramField`)
3. **Schedule** — start/end dates, duration presets
4. **Details** — remaining org `course_fields` (payment plan, code, exam fields, …)
5. **Footer** — Save → POST `courses` → redirect to course edit

Program field is read-only (shown as disabled input with program name). Validation via existing `validateCourseProgramFields` + `sanitizeCoursePayloadForProgram`.

### 5.3 Intake — first intake (`intake_count === 0`)

| Step | Route | Content |
| --- | --- | --- |
| Structure | `/intake/structure` | Inline create/edit `ProgramLevel` + `ProgramLevelSection` (reuse patterns from `ProgramLevelsEditor`) |
| Subjects | `/intake/subjects` | Per-level subject chips; defaults empty until set; inline “+ Create subject” |
| Dates | `/intake/dates` | Intake name, start/end, default category |
| Preview | `/intake/preview` | POST create intake + `preview-courses`; checkbox list |
| Confirm | `/intake/confirm` | Summary → POST `generate-courses` → redirect to intake detail |

### 5.4 Intake — subsequent (`intake_count > 0`)

| Step | Route | Content |
| --- | --- | --- |
| Dates | `/intake/dates` | Intake name, start/end, default category |
| Subjects | `/intake/subjects` | Pre-filled from `ProgramLevelSubject`; overridable per level |
| Preview | `/intake/preview` | Same as first intake |
| Confirm | `/intake/confirm` | Same as first intake |

Structure changes only via program settings (`/programs/[id]/settings`).

### 5.5 Course preview (checkbox list)

Grouped by level for `multi`; flat list for `required`.

**`required` strategy** — one row per active `ProgramSubject`:

```
☑ ACCA F1 - Term 1 2026
☑ ACCA F2 - Term 1 2026
```

**`multi` strategy** — level header + section rows:

```
Year 6 — Maths · English · Science · Myanmar  [Edit subjects]
  ☑ Section A — Year 6 Section A - Term 1
  ☑ Section B — Year 6 Section B - Term 1
Year 7 — Maths · English · Science · Physics · Myanmar  [Edit subjects]
  ☑ Section A — ...
```

Each row: checkbox + editable title. Level header subject edit navigates back to `/intake/subjects` or opens inline drawer (implementation choice: prefer inline on preview via shared context state to avoid losing checkbox selections).

**`optional` / `none`** — level × section rows without subject column (same as current multi row generation, no `CourseSubject` at generation).

---

## 6. Data model

### 6.1 New: `ProgramLevelSubject`

```python
class ProgramLevelSubject(BaseModel):
    level = FK(ProgramLevel, related_name="level_subjects")
    subject = FK(Subject, related_name="program_level_subjects")
    sort_order = PositiveIntegerField(default=0)
    is_active = BooleanField(default=True)

    Meta:
        unique_together = [level, subject]
        ordering = [sort_order, id]
```

### 6.2 Entity roles

| Entity | Role |
| --- | --- |
| `Subject` | Tenant-wide catalog |
| `ProgramSubject` | Program catalog for `required` — one generated course per subject |
| `ProgramLevelSubject` | Level curriculum for `multi` — all sections in level inherit |
| `Course.subject` | Single FK for `optional` / `required` courses |
| `CourseSubject` | M2M on course for `multi` — populated at generation from level's subjects |

### 6.3 API additions

| Endpoint | Purpose |
| --- | --- |
| `GET/POST program-level-subjects` | CRUD (list filtered by `level`) |
| `PATCH/DELETE program-level-subjects/:id` | Update/remove |
| `organizations/public` | Add `program_count` (active programs) |
| `programs/:id` or search fields | Add `intake_count` |
| `POST intakes/:id/generate-courses` | Accept `defaults.level_subject_ids: Record<levelId, subjectId[]>` instead of flat `subject_ids` |

### 6.4 Generation payload change

**Before:**

```json
{ "defaults": { "subject_ids": [1, 2, 3] } }
```

**After:**

```json
{
  "defaults": {
    "level_subject_ids": {
      "12": [1, 2, 3, 5],
      "13": [1, 2, 3, 4, 5]
    }
  }
}
```

`intake_services.generate_intake_courses`: for each preview row with `level_id`, resolve subjects from `level_subject_ids[level_id]`; create `CourseSubject` rows. Remove global `subject_ids` application.

Per-intake overrides at `/intake/subjects` are persisted only in the generate payload (not a separate DB table for v1). Program-level defaults live in `ProgramLevelSubject`.

Optional follow-up (out of scope): `IntakeLevelSubject` snapshot table if audit/history needed.

---

## 7. Frontend architecture

### 7.1 Route files

```
src/app/(internal)/courses/create/
  layout.tsx
  page.tsx
  program/[programId]/
    page.tsx
    manual/page.tsx
    intake/
      layout.tsx
      structure/page.tsx
      subjects/page.tsx
      dates/page.tsx
      preview/page.tsx
      confirm/page.tsx
```

### 7.2 Components

```
src/components/scheduling/
  program-picker.tsx
  create-flow-context.tsx       # draft state across steps
  create-step-nav.tsx           # back/continue, URL navigation
  manual-course-form.tsx
  intake/
    structure-step.tsx
    level-subjects-step.tsx
    dates-step.tsx
    course-preview-step.tsx
    confirm-step.tsx
```

### 7.3 CreateFlowProvider state

Held in React context; mirrored to `sessionStorage` for refresh resilience:

```typescript
type CreateFlowState = {
  programId: number;
  // Intake draft
  intakeName?: string;
  startDate?: string;
  endDate?: string;
  categoryId?: number;
  intakeId?: number;                    // set after create on preview step
  levelSubjectOverrides?: Record<number, number[]>;  // levelId → subjectIds
  previewRows?: IntakePreviewCourseRow[];
  titleEdits?: Record<string, string>;
  excluded?: Record<string, boolean>;
};
```

URL is source of truth for **step**; context is source of truth for **draft data**.

### 7.4 Form composition rules

- No `auto-form.tsx`, no schema walking for render.
- Use explicit `FormItem` + `EntityCombobox` / inputs (interim until v2 `Field` primitives).
- Reuse `course-program-validation.ts` helpers for show/require/sanitize.
- Delete `course-create-form.tsx` and `course-program-field-config.tsx` after migration (inline field JSX into `manual-course-form.tsx` and intake steps).

### 7.5 Courses layout simplification

```tsx
// courses/layout.tsx — after cleanup
export default function CoursesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
```

---

## 8. Error handling

- DRF field errors on manual form → `setFormErrors` + scroll to first errored section (by section ref, not stepper index).
- Preview/generate failures → toast + stay on step; preserve checkbox state in context.
- Guard redirects → no toast; silent redirect to valid step.
- `CreateFlowProvider` clears sessionStorage on successful generate or explicit cancel (breadcrumb “Cancel” → `/courses`).

---

## 9. Testing

### Backend

- `ProgramLevelSubject` CRUD + uniqueness constraint
- `generate_intake_courses` with `level_subject_ids` — Year 6 courses get 4 subjects, Year 7 get 5
- Backward compat: reject or ignore deprecated `subject_ids` key (prefer reject with clear error)

### Frontend (manual QA)

- Single program tenant → `/courses/create` redirects straight to manual or intake
- Multi program → picker → correct branch
- First intake full path; second intake skips structure
- `/intake/structure` guard when intakes exist
- Preview checkbox include/exclude reflected in generate payload
- Modal code paths gone — create always full page
- Browser back through intake steps preserves draft (sessionStorage)

---

## 10. Migration / cleanup checklist

**Delete (do not deprecate):**

- [ ] `src/app/(internal)/courses/@modal/` (entire directory)
- [ ] Modal branch in `src/app/(internal)/courses/layout.tsx`
- [ ] `src/components/course/course-create-form.tsx`
- [ ] `src/components/course/course-program-field-config.tsx` (after inlining needed bits)
- [ ] `src/components/intake/intake-create-wizard.tsx` (replaced by URL intake steps)
- [ ] `isModal` prop and callers
- [ ] `/intakes/create` page may redirect to `/courses/create` or remain as alias — **decision: redirect** to unified entry

**Keep:**

- `src/helpers/course-program-validation.ts` (extend)
- `ProgramLevelsEditor`, `ProgramSubjectsEditor` in program settings
- Backend `preview-courses` / `generate-courses` endpoints (extend payload)

---

## 11. Open items (deferred)

- Inline subject create UX polish (dialog vs combobox creatable)
- `/intakes/create` standalone nav link removal from sidebar (if present)
- Course edit page alignment with manual form composition (separate task)
