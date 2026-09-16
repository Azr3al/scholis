# Course edit — preselect Category & Payment Plan from FKs

**Status:** approved design (planning phase)  
**Date:** 2026-07-21  
**Repos:** `schedjuice-reimagined-fe`  
**Surface:** Course edit (`/courses/[id]/edit`) — Category and Payment Plan fields

## Context

On course edit, Category and Payment Plan use `EntitySelect`. When a course already has those relations, both dropdowns show the empty placeholder (“Select”) even though:

- The course GET response includes existing foreign keys (numeric ids; nested expand objects are often absent).
- Opening either dropdown shows a full list of named options.

The edit page already requests `expand: ["category", "payment_plan", …]` and already has `buildCourseFormValues` + `coerceEntityId` intended to flatten FKs into form ids. The symptom (placeholder with options loaded) means **EntitySelect is receiving `value` ≤ 0**, not a missing label from expand.

## Goals

1. On load, Category and Payment Plan show the course’s current selection **by name** (matched from the options list).
2. Works when the API returns **FK-only** shapes: integer `category` / `payment_plan` and/or `category_id` / `payment_plan_id`, and when nested `{ id, … }` is present.
3. Changing, clearing (where allowed), and saving still work; payment-plan mandatory rules and the explicit “Save payment plan” button stay as today.
4. After save + reload, preselection still works.

## Non-goals

- Fixing backend expand so retrieve always returns nested objects.
- Changing EntitySelect list fetching, create-course / intake forms, or other screens (unless the same helper is reused later).
- Redesigning select UX or autosave for payment plan (remains explicit save / non-autosave).

## Approach (chosen)

**Frontend-only: bind selects from FK integers.**

Expand is not required for labels on this screen — options already include names. Nested expand remains a nice-to-have / follow-up for other consumers, not part of this fix.

### Rejected alternatives

| Approach | Why not |
| --- | --- |
| Backend-only expand | Nested objects alone do not fix empty selects if form still does not pass a positive id to EntitySelect |
| Both BE expand + FE bind | Extra scope; FK binding is sufficient for this bug |

## Architecture / data flow

```
GET courses/:id
  → set course state from query data (must include FK fields)
  → buildCourseFormValues(course)
       category     ← coerceEntityId(category ?? category_id)
       payment_plan ← coerceEntityId(payment_plan ?? payment_plan_id)
       other FKs    ← id from nested object or raw value
  → adminForm.reset(formValues)
  → AutoForm Controller field.value
  → EntitySelect value={coerceEntityId(field.value) ?? 0}
  → Select shows matching option label (or existing id-fallback if not in list)
```

## Fix strategy

Verify then fix these break points (in order):

1. **`buildCourseFormValues`** — Prefer relation / `*_id` for category and payment plan; coerce number, numeric string, and `{ id }`. **Extract** to a pure helper (e.g. `helpers/course-form-values.ts`) so it is unit-tested without mounting the edit page.
2. **Course load effect** — Today `setCourse` runs on `isSuccess` without depending on `data`. Wire course state from query data so reset always sees the FK fields on first load and after refetch.
3. **Reset timing** — Call `reset(buildCourseFormValues(...))` when course data is present so Controllers receive positive ids (no empty preselect race).
4. **EntitySelect** — Touch only if form values are correct and the select still shows “Select” (unexpected given current id-fallback behavior).

## Files

| File | Change |
| --- | --- |
| `src/helpers/course-form-values.ts` (new) | Extracted `buildCourseFormValues` + types |
| `src/helpers/course-form-values.test.ts` (new) | FK-only, nested `{ id }`, missing → `null` |
| `src/app/(internal)/courses/[id]/edit/page.tsx` | Import helper; reliable `setCourse` from query `data`; reset with coerced FK ids |

Leave alone unless proven necessary: `entity-select.tsx`, Select primitive, BE serializers/expand.

## Testing

High-value only:

- **Unit:** `src/helpers/course-form-values.test.ts`
  - FK-only (`category_id` / `payment_plan_id` and/or integer `category` / `payment_plan`) → positive ids
  - Nested `{ id }` → positive ids
  - Missing / null / invalid → `null`
- **Optional thin assert:** EntitySelect with `value > 0` and options loaded does not show empty placeholder — only if cheap with existing harness; do **not** mount the full edit page for smoke.

Manual acceptance: open a course with existing category + payment plan FKs; both selects show names; save/reload still correct.

## Done when

Goals and manual acceptance pass on a real course with existing FKs; unit tests for the form-value helper cover FK-only shapes.
