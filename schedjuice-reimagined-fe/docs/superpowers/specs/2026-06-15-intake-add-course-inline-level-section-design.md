# Intake add-course inline level/section — design spec

> **Status:** Draft (brainstorming 2026-06-15)  
> **Scope:** `schedjuice-reimagined-fe` only (no backend changes)  
> **Surface:** `ExistingIntakeAddFormMulti` — `/courses/create/program/[programId]/intake/[intakeId]/add`

---

## 1. Problem

When adding classes to an existing K-12 intake (`subject_strategy = multi`), admins must select level and section from program structure. If the program has no levels, the form blocks with a link to program settings. If the program has levels but needs a new level or section for this intake, admins must leave the flow and edit structure elsewhere.

Subjects already support inline creation in this form; levels and sections do not.

---

## 2. Goals

1. **Empty program** — remove the hard blocker; admins can create the first level from the add-class form.
2. **Existing program** — admins can create a new level or section ad-hoc while adding a class.
3. **Immediate persistence** — level and section are POSTed as soon as created (same as program settings).
4. **New level defaults** — creating a level auto-creates section `"A"`; subjects chosen on the class row become `ProgramLevelSubject` defaults on submit.
5. **Consistency** — reuse `EntityCombobox` `onCreateNew` pattern (same as subjects).

## Non-goals

- Changing the first-intake wizard structure step (already has inline setup).
- Changing ACCA `required` add-course form (`ExistingIntakeAddForm`).
- Backend API or model changes.
- Inline level/section editing or deletion from this form.

---

## 3. Decisions log

| Topic | Decision |
| --- | --- |
| Scenarios | Both empty program and ad-hoc additions to existing structure |
| Persistence timing | Immediate on create (A) |
| New level sections | Auto-create section `"A"` (A) |
| Subject defaults | Row subjects saved as `ProgramLevelSubject` when level was created in this form session (A) |
| UX approach | Combobox `onCreateNew` + shared create helpers (approaches 1 + 3) |
| Empty-state blocker | Remove; always show class form |

---

## 4. UX

### Level field

- Existing `EntityCombobox` for `program-levels` gains `onCreateNew` with dialog (name input).
- On success: select new level on row, auto-select section A, empty subjects, title `{Level} Section A - {Intake}`.

### Section field

- Existing `EntityCombobox` for `program-level-sections` gains `onCreateNew` when a level is selected.
- On success: select new section, update title.

### Empty program

- Remove the "no levels → program settings" dead-end.
- Show normal multi-row class form; level combobox exposes "+ Create level".

### Unchanged

- Section remains optional in combobox (but new levels pre-select A).
- Subject chips, category override, title editing, multi-row add/remove.
- Post-create redirect (single class → schedule tab; multiple → intake detail).

---

## 5. Architecture

### New helper module

`src/helpers/program-structure-create.ts`

| Function | Responsibility |
| --- | --- |
| `createProgramLevelWithDefaultSection(programId, name, sortOrder?)` | POST level, POST section A, return ids/names |
| `createProgramSection(levelId, name, sortOrder?)` | POST section, return id/name |
| `saveProgramLevelSubjects(levelId, subjectIds[])` | POST `program-level-subjects`; skip if level already has subjects |
| `levelCreateConfig(programId, …)` | `EntityComboboxCreateNewConfig` for level combobox |
| `sectionCreateConfig(levelId, …)` | `EntityComboboxCreateNewConfig` for section combobox |

Mirror patterns from `subject-create-config.ts` and create logic in `program-structure-editor.tsx` (persist mode).

### Form state

`ExistingIntakeAddFormMulti` tracks `newlyCreatedLevelIds: Set<number>` (levels created via inline create in this session).

### Optional refactor

`ProgramStructureEditor` persist mode may call the same helpers to avoid duplicating "level + section A" logic. Not required for initial ship.

### Backend

No changes. Uses existing endpoints:

- `POST program-levels`
- `POST program-level-sections`
- `POST program-level-subjects`

---

## 6. Data flow

### Inline level create

1. Admin submits create dialog.
2. `createProgramLevelWithDefaultSection` runs.
3. Invalidate queries: `existing-intake-add-levels`, `existing-intake-add-sections`, `existing-intake-add-level-subjects`.
4. Add `levelId` to `newlyCreatedLevelIds`.
5. `setRowLevel(levelId)` — subjects empty (no `ProgramLevelSubject` yet).

### Inline section create

1. `createProgramSection` for selected level.
2. Invalidate section queries.
3. `setRowSection(sectionId)`.

### Course submit (per row)

1. Existing validation and course + `course-subjects` creation.
2. If `row.level_id ∈ newlyCreatedLevelIds` and level has no existing `ProgramLevelSubject` rows: `saveProgramLevelSubjects(levelId, row.subject_ids)`.
3. Guard prevents duplicate defaults if admin creates two classes for the same new level.

---

## 7. Error handling

| Case | Behavior |
| --- | --- |
| Duplicate level/section name | API error toast; no selection change |
| Form abandoned after inline create | Orphan level/section persist (acceptable; matches program settings) |
| Submit without subjects | Existing validation blocks |
| Category missing | Existing `needsCategory` flow unchanged |

---

## 8. Testing

### Unit (`program-structure-create.test.ts`)

- Level create posts level then section A with correct sort orders.
- `saveProgramLevelSubjects` no-ops when level already has subjects.
- Error messages propagate from failed POSTs.

### Manual

1. Zero-level program: inline level → add subjects → create class → verify program structure + course.
2. Existing program: inline new section → create class.
3. Two class rows sharing a newly created level → `ProgramLevelSubject` written once.

---

## 9. Files to touch

| File | Change |
| --- | --- |
| `src/helpers/program-structure-create.ts` | New helpers + combobox configs |
| `src/helpers/program-structure-create.test.ts` | Unit tests |
| `src/components/scheduling/existing-intake-add-form-multi.tsx` | `onCreateNew`, remove blocker, submit hook for level subjects |
| `src/components/program/program-structure-editor.tsx` | Optional: use shared helpers |
