# DVR Create Form-Designer Layout — Design Spec

**Date:** 2026-07-21  
**Status:** Approved  
**Repos:** `schedjuice-reimagined-fe`  
**Approach:** Shared `DvrVerifyForm` with `verify` | `preview` modes; create page as designer-style shell (Approach 1)  
**Related:** `2026-07-21-dvr-custom-fields-design.md` (field catalog + verify render path unchanged)

## 1. Summary

Redesign **Create Data Verification Request** so the main content area shows a live **form preview** of what recipients will fill, and a persistent **right-hand field catalog** holds Include / Required toggles (same semantics as today). Preview and the real verify page share one component (`DvrVerifyForm`) with a mode flag. Apply a **medium** UX polish to that shared form (hierarchy, mobile, empty/error states) so create-preview and verify stay consistent.

No backend API or `fields[]` shape changes.

## 2. Goals

1. Create page layout: sticky meta controls + main preview + always-visible right field catalog (desktop); stacked on mobile.
2. Include / Required toggles live only in the catalog; toggling updates the preview immediately.
3. Preview reuses `DvrVerifyForm` in `preview` mode (same widgets as verify; no PATCH / no recipient Submit).
4. Medium verify UX polish on the shared form: clearer hierarchy, required markers, empty state, stronger errors, better mobile.
5. Existing create validation and POST payload behavior preserved.

## 3. Non-goals

- Multi-step verify wizard, progress tracker, or deep success-page redesign.
- Drag-and-drop reorder of fields on create.
- Creating/editing custom field definitions from the DVR create page.
- Editing DVR `fields` after create (still delete-only / immutable fields).
- Sheet-only field picker on desktop (catalog is always visible; not an openable Sheet).
- Backend or permission model changes.

## 4. Locked decisions

| Topic | Choice |
| --- | --- |
| Add interaction | Include toggles in right catalog; all fields remain listed (not click-to-add) |
| Required control | Stays in catalog next to Include (not on preview rows) |
| Meta fields (name, expiry, roles) + Submit | Sticky header / sticky footer; main column is preview-only |
| Catalog chrome | Always-visible right column on `lg+`; stacks under preview on `<lg` (not a Sheet) |
| Preview fidelity | Reuse `DvrVerifyForm` with `mode: "preview"` |
| Verify UX depth | Medium polish on shared form (not light-only, not deep redesign) |
| Architecture | Single shared form component + create shell (Approach 1) |
| API / payload | Unchanged `{ name, expires_on, requested_user_types, fields: [{ name, required }] }` |
| Defaults | Unchanged from current create (built-ins + active customs, etc.) |

## 5. Layout (create)

### 5.1 Desktop (`lg+`)

```
┌─ sticky header ──────────────────────────────────────────────┐
│  < Back                                                     │
│  Create Data Verification Request                           │
│  Name [____________]   Expires [____]   Roles [chooser…]    │
└─────────────────────────────────────────────────────────────┘
┌─ main (flex-1) ─────────────────────┬─ right catalog (~360) ─┐
│  Preview                            │  Fields *              │
│  ┌─────────────────────────────┐    │  Include + Required    │
│  │ DvrVerifyForm mode=preview  │    │  (built-ins)           │
│  └─────────────────────────────┘    │  Custom fields         │
└─────────────────────────────────────┴────────────────────────┘
┌─ sticky footer ─────────────────────────────────────────────┐
│  Selection / validation hints                  [ Submit ]   │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Mobile (`<lg`)

Stack order: sticky header → preview → field catalog → sticky footer. Catalog remains always in the page flow (scroll), not a Sheet.

### 5.3 Behavior

- Toggling Include / Required updates preview immediately.
- Main column has no duplicate field checkboxes.
- Submit still requires ≥1 included field, ≥1 role, and expiry set (same rules as today).

## 6. Shared form component & data flow

### 6.1 `DvrVerifyForm` modes

| Mode | Route / surface | Behavior |
| --- | --- | --- |
| `verify` | `/data-verification-requests/[id]/verify` | Current submit / PATCH flow |
| `preview` | Create page main column | Same field UI; no network write; inputs disabled or `readOnly`; hide recipient Submit (create sticky footer owns Submit) |

### 6.2 Preview data

- Field list = current Include selection as `DvrFieldConfig[]` (existing shape).
- Values = empty / stub demo user so widgets render without loading a real account.
- Custom fields resolve through existing helpers (`resolveDvrVerifyFields`, form-config filter) so field types match verify.

### 6.3 Create page state

- Owns Include / Required selection (extract UI into `DvrFieldCatalog`).
- Sticky header binds `name`, `expires_on`, `requested_user_types` (existing `RoleChooser`).
- Sticky footer Submit runs existing validation + POST (same endpoint / success redirect to detail).

## 7. Components & boundaries

| Unit | Responsibility |
| --- | --- |
| `create/page.tsx` and/or thin `DvrCreateDesigner` | Shell: sticky header/footer, 2-col layout, selection + submit ownership |
| `DvrFieldCatalog` (new; extract from current checkbox rows) | Built-in + custom Include / Required list for the right column |
| `DvrVerifyForm` (extended) | Shared field rendering; `mode: "verify" \| "preview"` |
| Existing helpers (`helpers/dvr.ts`, field-definition / form-config hooks) | Unchanged field model and allowlist semantics |

Primary files today:

- `schedjuice-reimagined-fe/src/app/(internal)/data-verification-requests/create/page.tsx`
- `schedjuice-reimagined-fe/src/components/dvr/dvr-verify-form.tsx`
- `schedjuice-reimagined-fe/src/helpers/dvr.ts`

## 8. Medium verify UX polish

Applied on the shared form (both modes where applicable):

1. Clear hierarchy: request title (or “Preview”), short helper line, then fields.
2. Required markers consistent with the existing form system; optional fields not marked required.
3. Grouping: follow existing form-config groups when present; otherwise flat list in catalog order.
4. Empty state when zero fields included: message in the preview pane (“Select at least one field”).
5. Stronger error summary / scroll-to-first-error on verify submit (reuse existing form helpers).
6. Mobile: single column, comfortable tap targets; sticky actions must not cover the last field.

**Explicitly out of this polish pass:** multi-step flow, progress UI, and a full success-experience redesign.

## 9. Errors, empty states, edge cases

| Case | Handling |
| --- | --- |
| 0 fields included | Preview empty state; Submit blocked with clear message (footer and/or existing toast pattern) |
| 0 roles / missing expiry | Same validation as today, surfaced near sticky controls |
| Custom definitions loading | Catalog skeleton/spinner for custom block; do not block built-ins |
| Custom definitions load failure | Inline/toast on custom block; built-ins remain usable |
| Deactivated custom after create | Unchanged verify behavior (omit silently) |
| Preview mode | Never PATCHes; keyboard submit on inputs does nothing |

## 10. Testing (high-value only)

Prefer behavioral risk over smoke:

1. Preview updates when Include is toggled off (field disappears).
2. Required-only change does not remove the field from preview.
3. Submit rejected with 0 fields selected (status / message shape).
4. Verify mode still rejects missing required fields (status + error shape).
5. Preview mode does not fire the user update mutation (mock assert).

Skip happy-path-only “page renders” coverage.

## 11. Implementation notes

- FE-only; follow existing Schedjuice admin/form primitives (no new marketing aesthetic).
- Prefer extracting catalog from create page over duplicating checkbox row markup.
- Keep `fields[]` serialization and defaults compatible with `2026-07-21-dvr-custom-fields-design.md`.
- Form-designer (`/form-designer`) is inspiration for split preview + side list only; do not wire DVR create through designer CRUD / DnD / field editor Sheet.
