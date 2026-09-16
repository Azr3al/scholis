# Optimistic Autosave — Phase 2 (users, courses, nav guard) Design

**Date:** 2026-06-18
**Status:** Approved (design); pending implementation plan
**Branch:** `dev`
**Builds on:** `2026-06-18-optimistic-autosave-edit-forms-design.md` (Phase 1, implemented)

## Problem

Phase 1 shipped the reusable autosave engine (`useAutosaveForm`), status UI, the completion-sheet pilot, and all Tier 1 entity edits. Phase 2 converts the two complex edit forms deferred from Phase 1 — `users/[id]/edit` and `courses/[id]/edit` — and repurposes the navigation guard. These forms each need a field-inclusion boundary, bespoke payload transforms, and (for users) validation without a Zod resolver.

## Goals

- Autosave the safe portions of `courses/[id]/edit` and `users/[id]/edit` on blur, reusing the Phase 1 engine.
- Keep rich-text/attachment/sub-editor/schedule portions on their existing explicit save.
- Repurpose the dirty-state navigation guard to warn only when an autosave is in-flight or errored.

## Non-Goals

- No change to create flows (`UserForm` create mode untouched).
- No autosave for: course schedule dates, daily note, Zoom, calendar tab; user custom-field sections.
- No new batch endpoint; partial PUT via `updateEntity` (Phase 1 path).

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Course Schedule card (start_date/end_date) | Dedicated **"Save schedule"** button (explicit) |
| User custom-field (config) sections | Scoped **"Save custom fields"** button (explicit) |
| Navigation guard | New `AutosaveUnloadGuard` — warns only on in-flight/errored autosave |
| User validation (no resolver) | New optional `validateFields` hook option + custom `composedSchema` validator |

Inherited from Phase 1 (unchanged): on-blur trigger, dirty-diff flush, optimistic write + keep-value-on-failure + cache rollback, form-level `AutosaveStatus` + per-field `FieldSaveIndicator`, partial PUT via `updateEntity`.

## Engine Enhancement — `validateFields`

`useAutosaveForm` gains one optional option:

```ts
/** Return the subset of `fields` that are currently invalid. Default uses the form's resolver. */
validateFields?: (fields: string[]) => Promise<string[]>;
```

- **Default (unchanged behavior):** `await form.trigger(fields)`, then `fields.filter((f) => form.getFieldState(f).invalid)`.
- **Courses:** uses the default (form has `zodResolver(partiallyOmittedCourseSchema)`).
- **Users:** supplies a custom validator — run `composedSchema.safeParse(form.getValues())`, collect issue paths, `form.setError` the invalid keys (so inline errors render), and return the subset whose top-level key intersects `fields`.

The hook's `handleBlur` calls `validateFields(group)` instead of inlining `form.trigger`. (Alternative — adding a resolver to `UserForm` — rejected: shared with create mode and its manual two-step validation.)

## `courses/[id]/edit`

- **Form:** `adminForm`, schema `partiallyOmittedCourseSchema`, rendered as `AutoFormObject` cards in the `edit-info` tab.
- **Autosave cards:** `basics` (program, intake, title, description, category, level, section), `details` (subject, payment_plan, code, batch_number, exam_session_date, exam_board), and `other` (custom fields). Source of truth: `course-edit-sections.ts`.
- **Excluded (keep explicit):**
  - **`schedule` card** (start_date, end_date) → dedicated **"Save schedule"** button calling the existing `onSubmit`/`courseUpdateMutation` path for those fields.
  - Daily Note (TipTap) + "Save Daily Note"; `CourseZoomMeetingEditSection`; `MicrosoftTeamCard`; the entire `edit-schedule` Calendar tab.
- **Hook wiring:** `useAutosaveForm({ form: adminForm, queryKey: [`getCourse${id}`], units: [["intake","level","section","subject"]], buildPayload, save })`.
  - `buildPayload(fields, values)` mirrors `onSubmit`: build the changed-field subset, run `validateCourseProgramFields` (block + `setError` on failure), `sanitizeCoursePayloadForProgram`, `cleanDatesForBackend(payload, ["start_date","end_date"])`, and the `exam_session_date` → first-of-month ISO normalization.
  - `save(payload)` = `updateEntity("courses", id, payload)` with `setFormErrrors` on catch + rethrow.
  - Blur binding: `onBlurCapture` on the `edit-info` `<form>` (it uses `AutoFormObject`, not `AutoForm`).
  - Replace "Save information" with `AutosaveStatus`.
- **program** is read-only in edit (`programReadOnly: true`), so it won't change; it's still listed in the unit for validation context.

## `users/[id]/edit` (in `UserForm`, edit branch only)

- **Files:** `src/components/users/user-form.tsx` (gate all wiring behind `mode === "edit"`), reached via `user-edit-form-inner.tsx`.
- **Autosave:** non-`config` sections (builtin scalar fields rendered via `renderUserSectionFields`).
- **Excluded:** `section.kind === "config"` sections (custom fields) → one scoped **"Save custom fields"** button that sends only `custom_data` via `collectGroupPayload(configFields, prepareUserFormPayload(...))` through the existing `editMutation` path.
- **Hook wiring:** `useAutosaveForm({ form, queryKey: ["getUser", userId], buildPayload, validateFields, save })`.
  - `buildPayload(fields, values)` = `prepareUserFormPayload(pick(values, fields), { mode: "edit", tenant, fields: configFields })` restricted to changed builtin fields.
  - `validateFields` = custom `composedSchema` validator (see Engine Enhancement).
  - `save(payload)` = `updateEntity("users", userId, payload)`; on success invalidate `["getUser", userId]`; on catch `setFormErrrors` + rethrow.
  - Blur binding: builtin sections render via `GroupSection`/`renderUserSectionFields`; attach `onBlurCapture` on the `<form>` (or the builtin-sections wrapper) and forward the target `name`.
  - Replace "Save profile" with `AutosaveStatus`; keep the Cancel link.
- **Optimistic write** best-effort against `["getUser", userId]` (cache holds the axios response; builtin diff merges into `data.data`).

## Navigation Guard

- **New:** `src/components/form/autosave-unload-guard.tsx` — `AutosaveUnloadGuard({ status })` adds a `beforeunload` listener only while `status === "saving" || status === "error"`.
- **Wire:** replace `FormDirtyBeforeUnload` in `users/[id]/edit` (`UserForm`) and `courses/[id]/edit` with `AutosaveUnloadGuard` fed the autosave `status`.
- Non-autosaved forms keep `FormDirtyBeforeUnload` unchanged.

## Testing

- Pure helpers: if an issue-path → field-name mapper is extracted for the user `validateFields`, unit-test it (node Vitest). Extract the course `exam_session_date`/date-cleaning subset logic into a pure helper if it isn't already, and test it.
- React wiring (hook option, form conversions, guard): verified via `npm run lint` + `tsc`/`npm run build` + manual checklist (Vitest is node-only, no Testing Library — same constraint as Phase 1).

## Manual Verification Checklist

- Course basics/details/other fields autosave on blur; Schedule card still uses "Save schedule"; daily note/zoom/calendar unchanged.
- Course program cross-field invalid (e.g. level/section) blocks save + shows inline error; fixing it saves.
- User builtin fields autosave on blur; custom-field sections save via "Save custom fields"; create flow unchanged.
- Forced 400 keeps typed value + shows `Couldn't save changes` / Retry; instant controls snap back.
- `beforeunload` warns only while a save is in-flight/errored.

## Open Items / Assumptions

1. Confirm every non-`config` user section field autosaves sensibly (profile image, address composites); leave any lossy field out during implementation.
2. Confirm the course `buildPayload` validation matches the current `onSubmit` semantics for partial payloads.
3. Confirm `updateEntity` PUT accepts the partial course/user payloads (holds for Phase 1 and completion).
