# Payment upload compact spacing

**Date:** 2026-07-21  
**Surface:** `/finances/student-payments/upload` (part fields + screenshot dropzone)  
**Package:** `schedjuice-reimagined-fe`

## Problem

The upload payment form feels vertically sparse. Contributors:

1. Part section uses `gap-4` between stacked fields.
2. Every field reserves `min-h-5` for errors even when valid.
3. `FileDragAndDrop` uses large padding (`p-6` / `sm:p-8`) for a single-file screenshot.

Operators must scroll more than needed for a routine finance entry task.

## Goals

- Make a clean (no-error) part form noticeably more compact.
- Keep inline field errors readable; avoid a hard layout snap when they appear.
- Leave billing plan, month chips, discount picker, and page chrome unchanged.
- Do not change default dropzone density for other callers.

## Non-goals

- Two-column field layout (Amount | Date, etc.).
- Global changes to `Field.Root` gap for the whole app.
- Redesigning validation rules, OCR, or multipart submit behavior.
- Densifying the billing-period / payment-plan block in this pass.

## Approach

**Upload layout helpers + compact dropzone + collapsing field error** (page-scoped density, opt-in dropzone).

Rejected alternatives:

- Page-only class hacks with no shared helpers (fragile, hard to test).
- Global Field / dropzone densification (blast radius across unrelated forms).

## Design

### Density (within a payment part)

| Area | Today | Compact |
| --- | --- | --- |
| Part section stack | `gap-4` via `uploadPartSectionClassName()` | `gap-2` (or `gap-2.5` if `gap-2` feels cramped in QA) |
| Screenshot block | `space-y-3` | `space-y-2` |
| Between multipart parts | `border-t` + `pt-4` | unchanged |
| `Field.Root` (global) | `gap-2` | unchanged globally; optional `gap-1.5` via className on this page only |

Helpers live in `src/lib/finances/upload-form-layout.ts` and are applied from `student-payments/upload/page.tsx`. Multipart parts share the same helpers.

### Compact dropzone

Add an opt-in prop on `FileDragAndDrop`, e.g. `density?: "default" | "compact"` (default `"default"`).

When `density="compact"`:

- Outer dropzone padding: `p-3 sm:p-4` (from `p-6 sm:p-8`)
- Inner stack: `gap-2` (from `gap-3`); Add button top margin: `mt-2` (from `mt-4`)
- Slightly smaller icon treatment
- Copy and behavior unchanged (drag/drop, browse, max files, accept rules)

Upload page passes `density="compact"` for part screenshots (`maxFiles={1}`). Other routes omit the prop and keep current size.

### Collapsing field errors

Replace each reserved `min-h-5` error slot under part fields with a small component `UploadFieldError` (finances/upload-scoped; not a global Field change):

- **Empty message:** fully collapsed — no reserved height.
- **With message:** expands under the control; `role="alert"`; existing danger text styles.
- **Open:** ~180ms ease-out expand; light fade-in on text.
- **Close:** ~120–150ms collapse (slightly faster than open).
- **Invalid chrome:** `Field.Root` `invalid` / border updates immediately; only the message slot animates.
- **Reduced motion:** if `prefers-reduced-motion: reduce`, show/hide with no transition.

Prefer CSS grid `0fr` → `1fr` (overflow hidden) over measuring height. Reach for `motion/react` only if CSS is awkward for multiline messages.

**Unchanged:** validation rules, `fieldErrors` shape, clear-on-edit helpers, scroll-to-`data-field-name` on submit failure. Form-level and plan-level errors stay as today (outside the dense part stack).

Optional fields that currently use empty `min-h-5` placeholders with no error wiring (Description, Remarks, Date) drop the empty spacer entirely — no collapsing slot unless/until they gain errors.

### Target rhythm (lofi)

```
Screenshot
[ compact dropzone ........ ]
[ preview if any ]

Payment method
[ combobox ................ ]

Transaction ID
[ input ................... ]
‹error expands here when invalid›

Amount
[ input .............. Ks ]

Date on screenshot
[ input ................... ]

Description / Remarks
[ inputs .................. ]
```

## Testing

High-value only (no page happy-path smoke):

1. **Layout helpers** — compact part / stack class strings match denser values (`upload-form-layout` unit test).
2. **Field error** — empty: no `role="alert"` / no visible message; with message: alert text present and slot not stuck at zero height.
3. **Dropzone** — `density="compact"` applies tighter padding/gap classes; default density classes unchanged.
4. **Optional** — reduced-motion path uses zero transition duration / no transition class if easy to assert.

Skip re-testing OCR, multipart validation rules, and full upload submit flows already covered elsewhere.

### Manual QA

1. Clean form: shorter than today; no empty gaps under fields.
2. Submit invalid: first error expands smoothly; scroll-to-field still works.
3. Fix field: error collapses; layout settles.
4. OS reduced-motion on: errors appear/disappear with no animation.
5. Multipart: each part uses the same density; “Add another screenshot” still fine.
6. Other `FileDragAndDrop` callers without compact: unchanged size.

## Success criteria

1. Clean single-part form uses less vertical space mainly from removed error slots + tighter gaps + shorter dropzone.
2. Inline errors remain under their fields and remain accessible (`role="alert"`, existing invalid styling).
3. Error appearance does not snap harshly under normal motion preferences.
4. Billing / months / discount UI and non-upload dropzones are unchanged.