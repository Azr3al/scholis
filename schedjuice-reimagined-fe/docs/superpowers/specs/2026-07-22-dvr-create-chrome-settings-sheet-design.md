# DVR Create Chrome — Settings Sheet & Header Actions

**Date:** 2026-07-22  
**Status:** Approved (pending implementation plan)  
**Repos:** `schedjuice-reimagined-fe`  
**Approach:** Title-row actions (Approach 1) — Submit + settings in header; expiry/users in right Sheet  
**Related:** `2026-07-21-dvr-create-form-designer-layout-design.md` (preview + field catalog unchanged; this spec **supersedes** that doc’s sticky meta row / sticky footer decisions for create chrome)

## 1. Summary

Tighten the **Create Data Verification Request** shell so the primary action and secondary config are less loud:

- Smaller page title on one row with **Back**, a **settings** control, and **Submit**.
- **Expires on** and **Users** move into a right **Sheet** opened from the settings icon (defaults remain staff-only roles and expiry = today + 14 days).
- Remove the sticky bottom bar (including “N fields selected” and the footer Submit).

Preview + Fields catalog layout from the prior designer-layout spec stays as-is. No backend API changes.

## 2. Goals

1. Put **Submit** in the sticky header top-right (primary button).
2. Hide **Expires on** and **Users** behind a settings icon that opens a right Sheet.
3. Default expiry to **2 weeks** (`today + 14` local calendar days).
4. Keep staff-only role defaults (`DVR_STAFF_ROLE_DEFAULTS`).
5. Shrink the create page title (override `TypographyH1` size; keep `h1` semantics).
6. Remove the sticky bottom bar entirely.

## 3. Non-goals

- Edit DVR page chrome, verify page, or field catalog redesign.
- Badge / “defaults changed” indicator on the settings icon.
- Separate “save settings” mutation (sheet edits are live React state).
- Backend, permissions, or POST payload shape changes.
- Changing Name placement (stays always-visible under the title row).

## 4. Locked decisions

| Topic | Choice |
| --- | --- |
| Header layout | One row: `[Back] [Title…] …… [Settings] [Submit]` |
| Title size | Smaller than current `TypographyH1` (`text-4xl` / `lg:text-5xl`); use ~`text-2xl lg:text-3xl` via `className` override |
| Settings affordance | Ghost / icon button; `Settings` from iconoir; `aria-label="Request settings"` |
| Settings surface | Existing `Sheet` primitive, `side="right"`, ~`w-96` |
| Sheet contents | Expires on + Users (same labels, inputs, descriptions as today’s inline fields) |
| Sheet close | Backdrop, close control, and a **Done** button that only closes (state already applied) |
| Sheet title | “Request settings” |
| Expiry default | `defaultDvrExpiresOn` → `today + 14` days (was +7) |
| Role default | Unchanged staff roles |
| Bottom bar | Removed entirely (no field-count footer) |
| Validation | Unchanged on Submit (name, ≥1 field, ≥1 role, expiry present) |
| Preview / catalog | Unchanged |

## 5. Layout

### 5.1 Sticky header

```
┌─ sticky header ──────────────────────────────────────────────┐
│ [< Back]  Create Data Verification Request    [⚙] [Submit] │
│ Name * [_______________________________________________]     │
└──────────────────────────────────────────────────────────────┘
┌─ main ──────────────────────────────┬─ Fields catalog ───────┐
│ Preview (unchanged)                 │ (unchanged)            │
└─────────────────────────────────────┴────────────────────────┘
(no sticky footer)
```

- Left cluster: `BackButton` + title (title may wrap/truncate on narrow widths; Back stays visible).
- Right cluster: settings icon button, then primary Submit (`isLoading` from create mutation).
- Below: Name field only (full width within header).

### 5.2 Settings sheet

```
┌─ Request settings ──────────────────────── ✕ ─┐
│ Expires on *                                  │
│ [ date ]                                      │
│ Banner stops after this date. …               │
│                                               │
│ Users *                                       │
│ RoleChooser (staff checked by default)        │
│ Matching users see an in-app banner…          │
│                                               │
│                                    [ Done ]   │
└───────────────────────────────────────────────┘
```

State for `expiresOn` / `selectedRoles` lives in `DvrCreateDesigner` whether the sheet is open or closed.

### 5.3 Mobile

Same structure; title wraps; actions remain top-right. Sheet uses existing mobile width constraints (`max-w-[calc(100vw-3rem)]`).

## 6. Implementation notes

Primary touchpoints (expected, not binding on file splits):

- `src/components/dvr/dvr-create-designer.tsx` — chrome, sheet wiring, remove footer.
- `src/helpers/dvr.ts` — `defaultDvrExpiresOn` `+7` → `+14`.
- `src/helpers/dvr.test.ts` — update expiry default assertion.
- `src/components/dvr/dvr-create-designer.test.tsx` — high-value UI asserts for header Submit, settings sheet contents, absence of footer / inline expiry+users.

Reuse `Sheet` from `@/components/primitives` (same pattern as other right drawers).

## 7. Testing

High-value only:

1. **Helper:** `defaultDvrExpiresOn(fixedToday)` is `today + 14` (local ISO date).
2. **UI:** Gear opens sheet containing expiry date input and role chooser.
3. **UI:** Main sticky header does not render expiry/users; no sticky bottom Submit / field-count bar; Submit is in the header.

Do not add happy-path-only “renders title” smoke.

## 8. Supersedes (prior layout chrome)

Relative to `2026-07-21-dvr-create-form-designer-layout-design.md`:

- Sticky header no longer shows Expires / Roles inline.
- Sticky footer with selection hint + Submit is removed; Submit moves to header.
- Catalog remains always-visible on desktop (not a Sheet). The **settings** Sheet is only for expiry + users.
