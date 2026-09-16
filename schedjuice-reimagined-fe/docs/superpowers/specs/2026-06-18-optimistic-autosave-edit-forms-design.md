# Optimistic Autosave for Edit Forms — Design

**Date:** 2026-06-18
**Status:** Approved (design); pending implementation plan
**Branch:** `dev`

## Problem

Edit "save sidebars" group save buttons per section (e.g. the profile completion sheet renders one `Save {group.name}` button per config group). This forces users to save section-by-section, prevents partial/incremental saving across sections, and produces opaque failures like the per-group "Could not save." toast with no clear recovery.

More broadly: explicit save buttons on edit forms are friction. From now on, **most edit forms should save optimistically and automatically**. Create forms keep their explicit submit.

## Goals

- Replace explicit/grouped save buttons on **edit** forms with **automatic optimistic autosave on blur**.
- Provide one reusable engine (`useAutosaveForm`) plus shared status UI, so new edit forms adopt autosave by default.
- Preserve user input on failure; never silently lose typed data.
- Keep create flows on explicit submit (unchanged).

## Non-Goals

- Converting create forms (`*/create`) — they stay explicit submit.
- Converting Tier 3 forms (rich-text/attachment/stateful/workflow) — see scope.
- A batch/transactional save endpoint — autosave reuses existing per-entity update.
- Real-time collaboration / conflict resolution beyond last-write-wins.

## Tech Context

- Next.js 15 (App Router), React 19.
- Forms: react-hook-form 7 + Zod 3 (`@hookform/resolvers`), rendered via `AutoForm` (`src/components/ui/auto-form.tsx`) and `GenericForm` (`src/components/form/generic-form.tsx`).
- Data: TanStack Query v4 + Axios client (`src/lib/api.ts`), CRUD helpers in `src/app/client-api/utils.ts`.
- Updates go through `updateEntity(entity, id, data)` → **PUT** `entity/id`. There is **no PATCH helper** today.
- Toasts: `useToast` (`src/components/ui/use-toast.ts`) + `Toaster`.
- Server field errors map to RHF via `setFormErrrors` (`src/helpers/form.ts`); dirty guard via `FormDirtyBeforeUnload` (`src/components/form/form-dirty-before-unload.tsx`).
- The profile completion flow (`src/components/custom-fields/completion/*`) is the closest existing pattern and the motivating example (the screenshot): each group is its own `useForm` + `useMutation` sending a **partial** body through `updateEntity`.

## Design Decisions (locked)

| Decision | Choice |
|----------|--------|
| Save trigger | **On blur**, for every field type |
| Interdependent fields | **Dirty-diff flush** by default (send all dirty+valid fields on each blur) **+ explicit atomic units** where needed |
| Failure behavior | **Keep user's value** + inline **Retry**; roll back cache; instant controls snap back |
| Validation gating | Invalid field never fires a save; inline error; stays "unsaved" until valid |
| Status surfacing | **Both** — quiet form-level header summary + per-field markers only when `saving`/`error` |
| Architecture | **`useAutosaveForm` hook (engine)** + thin `autosave` prop on `AutoForm`/`GenericForm` |
| Rollout | Pilot (completion sheet) + all Tier 1 + `users`/`courses` with field-level boundary |

## Architecture

### `useAutosaveForm` hook

The engine, layered on an existing react-hook-form instance.

```ts
useAutosaveForm({
  form,                       // UseFormReturn — existing RHF instance
  save: (diff) => Promise,    // typically (diff) => updateEntity(apiUrl, id, diff)
  queryKey,                   // TanStack key for optimistic cache write + rollback
  units?: string[][],         // explicit atomic field groups (e.g. [["start_date","end_date"]])
  enabled?: boolean,          // default true; create forms pass false to no-op
}) => {
  status: 'idle' | 'saving' | 'saved' | 'error',
  fieldStatus: Record<string, 'saving' | 'saved' | 'error'>,
  retry: (field: string) => void,
  retryAll: () => void,
  bindField: (name: string) => { onBlur: () => void },
}
```

Responsibilities:
- Attach blur handling per field (via `bindField`, or auto-bound by the `AutoForm` integration).
- Validation gating (uses the form's Zod resolver / `trigger`).
- Dirty-diff collection + explicit-unit resolution.
- Optimistic cache write + rollback against `queryKey`.
- Per-field and form-level status state machine.
- In-flight de-dupe / serialization per entity.

### `AutoForm` / `GenericForm` integration

Add an opt-in prop:

```tsx
autosave={{ apiUrl, entityId, queryKey, units?, enabled? }}
```

When present, the renderer instantiates `useAutosaveForm` internally, auto-binds blur on every rendered field, hides the Submit button, and renders the form-level `AutosaveStatus`. Tier 1 conversions become a near one-line flip. Completion sheet and `users`/`courses` call the hook directly for their custom layouts.

## Behavior Detail

### Save trigger + dirty-diff flush
- Trigger is field `onBlur` for all field types (text, toggle, select, date).
- On blur, collect **all currently dirty + valid** fields and send them as one payload, so incidental co-edits batch together.
- A field that is not dirty does not trigger a network request on blur.

### Explicit atomic units
- `units` declares groups of fields that must save together (e.g. cross-field validation like `start_date ≤ end_date`, or a field that drives config refetch like `roles`).
- A unit flushes only when focus leaves the **whole** unit AND **every** field in it is valid.
- A config-driving field (e.g. `roles`) is modeled as its own unit; dependent fields re-render from refreshed config after it saves.

### Validation gating
- An invalid field (per Zod resolver) never fires a save; it shows its inline error and remains marked unsaved until corrected.
- Server-side field errors map back to inline messages via the existing `setFormErrrors` helper; `scheduleScrollToFirstFormError` may be reused for visibility.

### Optimistic update + failure
- On valid blur: optimistically write the new value(s) into the TanStack cache entry for `queryKey`, mark affected field(s) `saving`, call `save(diff)`.
- **Success:** field(s) → `saved` (rendered silently), form summary → "All changes saved".
- **Failure:** keep the user's typed value in form state; **roll back the cache** to its pre-save snapshot; mark field(s) `error` with inline **Retry**. Instant controls (toggle/select/date) visually snap back to last-saved value since there is no typed text to preserve. Form summary → "Couldn't save changes" with **Retry all**.

### Status UI (new shared components)
- `AutosaveStatus` (form-level): cycles `All changes saved` → `Saving…` → `Couldn't save changes` (+ Retry all). Placed in the sidebar/sheet header or form header.
- `FieldSaveIndicator` (per-field): renders only when the field is `saving` or `error` (saved state stays silent to reduce noise); `error` shows Retry.
- Visual style per the design-taste-frontend skill: neutral palette (Zinc/Slate), no AI-purple, no outer glows, quiet inline indicators, tactile Retry affordance.

### Backend / partial-update semantics
- Autosave sends **partial diffs** through the existing `updateEntity` (PUT) — the same path the completion flow already uses successfully.
- **Assumption to verify:** the backend treats PUT as a partial update (confirmed in practice for the completion/users endpoint). If a specific Tier 1 endpoint rejects partial PUT (requires full object), add a `patchEntity` (PATCH) helper in `src/app/client-api/utils.ts` and pass it as that form's `save` fn. No batch endpoint required.

### Navigation guard
- With blur-commit autosave, unsaved valid changes are rare. Repurpose `FormDirtyBeforeUnload` to warn only when a save is **in-flight** or in **error** state, rather than on any dirty field.

## Scope — Forms to Convert

### Pilot
- **Profile completion sheet** (`src/components/custom-fields/completion/completion-form.tsx`, `completion-group-form.tsx`, `completion-sheet.tsx`, `admin-completion-sheet.tsx`): drop the per-group `Save {group.name}` buttons; each `CompletionGroupForm` uses `useAutosaveForm`; a single `AutosaveStatus` summary lives in the sheet header.

### Tier 1 — low-risk single-entity edits (add `autosave` prop, remove Submit, keep `DeleteZone`)
1. `categories/[id]/edit`
2. `campuses/[id]/edit`
3. `departments/[id]/edit`  *(under `(department)` route group)*
4. `course-roles/[id]/edit`
5. `payment-plans/[id]/edit`
6. `payment-methods/[id]/edit`
7. `payment-infos/[id]/edit`  *(has a default toggle — instant control)*

### Tier 2.5 — explicitly requested, field-level boundary
- **`users/[id]/edit`**: autosave the standard scalar sections (profile, payroll, HR, etc.); **exclude the custom-field section entirely** (custom fields are handled by the completion flow). Remove the single "Save profile" only for the autosaved sections.
- **`courses/[id]/edit`**: autosave the **Course Information scalar fields only**. **Exclude** schedule-specific fields, the entire calendar editor, the TipTap daily note, and Zoom sub-editors — all keep their current explicit-save mechanics.

### Out of scope (Tier 3 — keep explicit save)
`news`, `assignments` (TipTap + attachments), `announcements` (redirects to unified detail), `quizzes-v3` (Zustand), `quizzes` v2, `programs` edit + settings (child inline-mutation editors), `forms/edit` (field designer), `data-verification-requests` (workflow), course `email-templates` edit. Tier 2 `visibilities` / `organizations` / `organizations/profile` deferred (need explicit-unit coverage for coupled payloads).

## Edge Cases & Risks

- **Rapid blur/refocus:** de-dupe in-flight saves per unit; coalesce.
- **Overlapping saves to same entity:** serialize per entity; last-write-wins on the optimistic cache.
- **Unmount mid-save:** allow the request to finish; guard against setState after unmount.
- **Create forms:** pass `enabled: false` so the hook no-ops; explicit submit remains.
- **Config-driving fields:** modeled as their own unit so dependent fields re-render from refreshed config.
- **Partial PUT rejection:** mitigated by the `patchEntity` fallback (see Backend section).
- **Cache shape mismatch:** optimistic writer must match the `fetchEntity` cache shape (`data.data.data`) used by each form's query.

## Testing

- **Unit (hook):** dirty-diff collection, validation gating, optimistic write + rollback, explicit units, retry/retryAll, in-flight de-dupe, `enabled:false` no-op.
- **Component (pilot):** completion sheet — blur → save, failure → keep value + Retry, instant-control snap-back, form-level summary transitions.

## Implementation Phasing

The implementation plan sequences this spec in two phases (same scope, lower risk):
- **Phase 1:** reusable engine + status UI, completion-sheet pilot, all Tier 1 conversions. Independently shippable.
- **Phase 2:** `users/[id]/edit` and `courses/[id]/edit` (bespoke payload transforms + field boundaries) and the navigation-guard repurpose. Deferred to a follow-up plan, seeded with concrete boundaries.

## Open Items / Assumptions

1. Confirm backend PUT-as-partial for each Tier 1 endpoint (add `patchEntity` where needed).
2. Confirm exact `queryKey`s and cache shapes per converted form for optimistic writes.
3. Confirm `courses` "Course Information" field boundary (which fields are scalar info vs schedule-specific) during implementation.
