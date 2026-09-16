# Staff & Student ID Cards — Design

**Date:** 2026-06-21
**Status:** Approved (design); implementation pending
**Author:** brainstorming session

## 1. Summary

Interactive, single-sided **portrait lanyard ID badges** for staff and students, inspired by
the [Vercel Ship 3D event badge](https://vercel.com/blog/building-an-interactive-3d-event-badge-with-react-three-fiber).

The feature has two faces:

1. **Interactive 3D web experience** — a draggable badge that drops in on a physics lanyard
   (real WebGL/physics, like the Vercel demo).
2. **Print-ready export** — PDF + PNG of the same card, plus an admin bulk multi-card PDF sheet.

A **single source of truth** (one SVG card-face component) drives the 3D texture, the on-screen
preview, and every export, guaranteeing the on-screen badge and the printed card are identical.

## 2. Goals / Non-goals

### Goals

- A delightful, on-brand interactive 3D lanyard badge.
- Self-service: every user can view and download their own badge.
- Admin: bulk-generate and print badges for staff & students.
- A scannable QR "smart verify" link usable by anyone (logged in or not).
- Print fidelity: exports match the on-screen card exactly.

### Non-goals

- Double-sided cards (single-sided only).
- Physical card stock / NFC / mag-stripe encoding.
- Replacing building check-in (QR points at identity verification, not attendance).

## 3. Decisions (from brainstorming)

| Topic | Decision |
| --- | --- |
| Scope | Both interactive 3D web **and** exportable print-ready versions |
| Placement | Both self-service ("My ID") **and** admin bulk generation/print |
| QR target | **Smart verify link** → short opaque URL → minimal public "verified identity" card; links to internal profile if the scanner is logged in |
| Orientation | **Portrait lanyard badge** (slot at top) |
| Exports | PDF, PNG, and bulk multi-card PDF (no direct browser-print) |
| Tech | **Hybrid** — real WebGL lanyard + shared 2D SVG card face reused for print |
| Staff vs student | Same layout, different accent color + role label |
| Staff accent | Schedjuice emerald (`#5ea37e` / `oklch(0.66 0.09 159.28)`) |
| Student accent | Warm amber/gold (default) |
| Branding overrides | Admin can override **accent color, logo, and org name** (tenant-level) |

## 4. Card content

Required (user-specified): **name, email, QR (smart verify), emergency phone number**.

Confirmed additional fields:

- **ID photo** — `id_photo_url` → fall back to `profile_image` → fall back to monogram/initials avatar.
- **Role / title** — e.g. "Teacher", "Student" (role pill, accent-colored).
- **Org name + logo** — from tenant branding (admin-overridable).
- **Emergency contact** — name + phone + relationship.
- **Blood type** — NEW field (`blood_type`); row omitted gracefully if blank.

Explicitly excluded for now: user ID `code`, validity/expiry dates, program/batch/department.

### Lo-fi face layout (portrait)

```
            ╲  ╱                 ← lanyard strap (meshline), org wordmark repeating
        ┌────●────┐              ← clip + slot
   ┌────┴─────────┴────┐
   │ ◆ SCHEDJUICE       │        header: logo + org name, hairline divider
   │ ───────────────────│
   │      ┌────────┐    │
   │      │  ID    │    │        ID photo (id_photo_url → profile_image → monogram)
   │      │ PHOTO  │    │
   │      └────────┘    │
   │   Thiri Kyaw       │        name (display, tracking-tight)
   │  ┌─────────┐       │
   │  │ TEACHER │       │        role pill (accent = role color)
   │  └─────────┘       │
   │  ✉  tk@schedjuice…  │        email
   │  ✚  Blood  O+      │        blood type (omitted if blank)
   │ ───────────────────│
   │ ┌──────┐ EMERGENCY │
   │ │▓ QR ▓│ +95 9 7xx… │        QR (smart verify) + emergency contact
   │ │▓▓▓▓▓▓│ Su Su (Sis)│
   │ └──────┘            │
   │ ▔▔▔ accent strip ▔▔ │        accent foot strip
   └─────────────────────┘
```

## 5. Architecture

```
buildIdCard(account, tenant)
        │  resolves: photo source, role→accent (with tenant override),
        │            org name/logo (with override), emergency block,
        │            blood type, verify URL
        ▼
   CardViewModel
        │
        ▼
   <IdCardFace/>   ← ONE SVG component = the only card design
        ├─► DOM render            → web preview + static fallback
        ├─► WebGL texture         → drawn onto the badge mesh
        └─► rasterize to canvas   → PNG  → embedded into PDF (single + bulk sheet)
```

### Single source of truth

The card face is defined **once** as an SVG React component (`IdCardFace`). All consumers render
that same component:

- **Web/preview/fallback:** rendered directly as DOM SVG.
- **3D badge:** the SVG is rasterized to a canvas and used as the badge mesh's texture.
- **Exports:** the SVG is rasterized at print DPI to PNG; the PNG is embedded into a PDF at exact
  physical size. Bulk export lays out a grid of PNGs across pages.

Rasterizing to PNG and embedding into the PDF (rather than re-implementing the card in
`@react-pdf/renderer` primitives) avoids dual-rendering divergence — there is only one layout.

## 6. Components & routes

- **`LanyardBadge`** — isolated `'use client'` WebGL leaf component.
  - `@react-three/fiber` `<Canvas>` + `<Physics>` (rapier) rope joints + `meshline` strap.
  - Card mesh material uses the rasterized `IdCardFace` as its map; clearcoat/iridescence for foil sheen.
  - Lazy-loaded (`next/dynamic`, `ssr: false`).
  - **Fallback** to static `<IdCardFace/>` when WebGL is unavailable or `prefers-reduced-motion` is set.
  - Perpetual-motion / physics fully isolated here; never re-renders parent layout.
- **`IdCardFace`** — pure SVG card-face component (view-model in, SVG out). No data fetching.
- **`/id-card`** (self-service) — interactive badge + "Download PDF" / "Download PNG".
- **Admin bulk** — multi-select users → server route generates a multi-card PDF sheet
  (`@react-pdf/renderer` + `@napi-rs/canvas`, both already installed).
- **`/verify/[token]`** (public smart link) — minimal verified-identity card (photo, name, role,
  org, "verified" check). Shows "View full profile" → `/users/[id]` only if the scanner is
  authenticated.

## 7. Data flow

1. Server fetches `accountType` (+ tenant branding) and builds `CardViewModel`.
2. A **signed/opaque verify token** is generated (backend); the QR encodes
   `https://<host>/verify/<token>`.
3. `/verify/[token]` resolves the token server-side to a minimal public identity payload.
   If the request is authenticated, it additionally exposes the internal-profile link.

## 8. Branding (admin-overridable, tenant-level)

Tenant branding settings drive the card chrome:

- `card_org_name` (defaults to tenant/org name)
- `card_logo` (defaults to Schedjuice logo from `brand-assets/`)
- `card_staff_accent` (default emerald `#5ea37e`)
- `card_student_accent` (default amber)

`buildIdCard` reads these with the listed fallbacks so the card always renders even before an
admin configures branding.

## 9. States (required)

- **Loading:** card-silhouette skeleton matching the badge shape (no generic spinner).
- **No photo:** monogram/initials avatar (never a generic user glyph).
- **No WebGL / reduced motion:** static `IdCardFace` (no `<Canvas>`).
- **Missing optional field (blood type):** row omitted, layout reflows cleanly.
- **Exporting:** download button shows inline progress state.
- **Verify token invalid/expired:** clear public "Couldn't verify this badge" message.

## 10. Visual / motion direction

- Brand: neutral base, emerald (staff) / amber (student) accent. No purple, no neon glow.
- Typography: Geist (already installed) — display name `tracking-tight`, mono for any codes/QR caption.
- Card surface: subtle iridescent foil (clearcoat in 3D; CSS sheen + 1px inner border in fallback).
- Lanyard: physics drop-in + draggable fling, tilt-back-to-camera correction (per Vercel approach).
- Performance: animate transform/opacity only; WebGL isolated and lazy; grain/foil on fixed
  `pointer-events-none` layers only.

## 11. New dependencies

- 3D: `three`, `@types/three`, `@react-three/fiber`, `@react-three/drei`, `@react-three/rapier`, `meshline`
- QR: `qrcode` (+ `@types/qrcode`)
- SVG → raster for exports: client `<canvas>` rasterization; server-side via `@napi-rs/canvas`
  (installed) + an SVG renderer (e.g. `@resvg/resvg-js`) if server rendering is required.

(Already installed and reused: `motion`, `geist`, `@react-pdf/renderer`, `@napi-rs/canvas`.)

## 12. Backend work to flag (dependencies, not built here)

1. **`blood_type`** field on the user model (+ expose on profile API).
2. **Signed verify token + public minimal-identity endpoint** powering `/verify/[token]`
   (must not leak sequential user IDs; token resolves to safe public fields only).
3. Confirm **`id_photo_url`** is exposed on the staff/user profile API
   (currently seen on the student data-sheet row, not the generic `accountType`).
4. **Tenant branding fields** for card overrides (org name, logo, staff/student accents).

## 13. Open questions / future

- Should student badges encode batch/program later (currently excluded)?
- Expiry/valid-thru for staff badges if HR adopts contract dates?
- Apple/Google Wallet pass export (future, out of scope now).
