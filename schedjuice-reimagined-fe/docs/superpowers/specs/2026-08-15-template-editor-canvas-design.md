# Template editor canvas + chrome

**Date:** 2026-08-15  
**Status:** Draft (design)  
**Scope:** `schedjuice-reimagined-fe` (editor, compositor, adapters, Konva removal) + small `schedjuice-reimagined-be` document validation  
**Surfaces:** `/templates/award/:id`, `/templates/certificate/:id`, `/templates/id-card/:id`  
**Amends:** [Unified Image Template Editor](./2026-08-14-unified-template-editor-design.md) — chrome, canvas interaction, background/page size. API, permissions, lists, palettes, and “never store composites” stay.

## Problem

The shared editor shell exists, but it is not an editor. Layers render as a text list under a static photo. The left control is `T` / `Img` / a native `+` select. The top bar is a home icon on cool zinc greys (not DESIGN.md). There is no pan, zoom, drag, resize, or page selection. Konva is unused dead weight (`certificate/primitives` have no importers).

Admins need a real page: branded chrome, visible insert actions, a camera, draggable layers, and a crop window over the artwork — English-only for this surface (schools author these documents in English).

## Confirmed decisions

| Topic | Decision |
|---|---|
| Stage | Browser `<canvas>` 2D. No Konva / `react-konva`. Remove deps, unused primitives, and the Next `canvas` webpack external. |
| Page vs artwork | Page is a **crop window**. Artwork fills the page via `offsetX`, `offsetY`, `scale`. Camera pan/zoom is view-only and is not stored. |
| First background (award/cert) | Page size = image natural pixels; `scale = 1`; offset `0`; preset `original`. |
| Replace background | Keep page size and layers; cover-fit the new image. |
| ID card page | CR80 only: **2.125 × 3.375 in** portrait / **3.375 × 2.125 in** landscape at **300 dpi** (638×1013 / 1013×638 px). Same numbers as today’s template. |
| Award/cert presets | Original image; 16:9 HD **1920×1080**; A4 landscape **3508×2480** (297×210 mm @ 300 dpi); Custom W×H px. |
| Background adjust | With the page selected: drag to reposition, wheel/handles to scale the artwork *inside* the page. Minimum scale is **cover** (no empty corners). |
| Preset switch | Change the page window, then cover-fit (see algorithm). Layers keep document coordinates. |
| Layers | Drag to move; edge/corner handles to resize. No rotate. |
| Insert | Floating labeled stack: `Text`, `Photo`, `Fields`. Places a default box at the center of the **current view**. |
| Top bar | Cream identity strip (`--surface`). Text **Back** (not a home icon). Centered serif breadcrumb. Accent **Save**. Empty left Home rail gone. |
| Contrast | Semantic tokens only. Pasteboard/inspector use dark tokens (`DARK` in `palette.ts`). No `zinc-*` / cool greys. WCAG AA on chrome. |
| Language | English-only on this surface. No Myanmar face in the picker. No bilingual / `unicode-range` routing on the canvas. |
| Fonts | Picker: **Noto Sans**, **Fraunces**, **Adobe Caslon Pro**. Canvas uses **Latin-only** `@font-face` names pointed at the existing latin woff2 files — not `Schedjuice Sans` / `Schedjuice Serif` (those include Myanmar `unicode-range`). Stored `Arial` still paints. `document.fonts.load` before draw. |
| Compositor | One `composite(document, binder) → canvas` at **page** pixels. Editor HUD is not in the bitmap. Certificate generate and ID-card PDF **must** call `composite` — no second crop path. |
| Composites | Still never stored. |

## Non-goals

- Autosave, rotate, blend modes, filters, source/HTML view, multi-page
- Myanmar / bilingual template text
- Grant→image generate, bulk zip, Templates hub
- Changing certificate gallery IA or ID-card list/activate/delete
- Making ID-card templates A4 or 16:9

---

## Chrome

```
┌──────────────────────────────────────────────────────────────────┐
│  Back          Award titles / Top 1 / May template        Save   │
│  (cream bar, serif title, ink text, green Save)                  │
├───────────────────────────────────────────────┬──────────────────┤
│  pasteboard (warm dark)                       │ Inspector        │
│                                               │ (page or layer)  │
│   ┌─────────┐     ┌─────────────────┐         ├──────────────────┤
│   │ Text    │     │     page        │         │ Layers           │
│   │ Photo   │     │  (artwork crop) │         │                  │
│   │ Fields ▾│     └─────────────────┘         │                  │
│   └─────────┘           [ Fit  100% ]         │                  │
│                    Front | Back  (ID only)    │                  │
└───────────────────────────────────────────────┴──────────────────┘
```

**Top.** `Back` runs the existing dirty-close confirm, then returns to the list (`homeHref`). Keyboard: ⌘/Ctrl+S save, Z undo, Shift+Z redo, Delete/Backspace remove selected layer, Space+drag pan. **Esc:** if adjusting background → stop adjusting, page stays selected; else if a layer is selected → select page; else → selection `none` (inspector still shows page).

**Insert.** `Text` / `Photo` / `Fields` are text-led (DESIGN.md). `Fields` is a menu of the kind palette, not a native `<select>`. `Photo` is omitted when the kind has no photo slot (certificates: `Text` plus freeform only). Clicking an item appends a layer and selects it.

**Inspector.** Selection `page` → size preset, replace background, Adjust. Selection layer → font/size/color/align, corner radius, or user bind. Nothing selected → page inspector. Layers list at the bottom still selects/deletes.

**Tokens.** Semantic Tailwind tokens only — no `zinc-*`. The header is a `data-theme="light"` island so `--surface` is cream. The pasteboard, insert stack, and inspector sit under `data-theme="dark"` (warm grey-brown, lifted greens). Do not use raw `bg-zinc-950`.

---

## Camera (view)

Not stored. On load, `Fit` the page in the pasteboard.

| Gesture | Effect |
|---|---|
| Ctrl/Cmd + wheel, or pinch | Zoom toward pointer |
| Two-finger scroll, or Space + drag | Pan |
| Wheel without modifier | Pan (does not zoom) |
| `Fit` / `%` chip | Fit page, or show current zoom |

Clamp zoom **25%–400%**. Space+drag never starts a layer drag or background adjust.

---

## Page, crop, and presets

### Document fields (additive, `version` stays 1)

```
type BackgroundFill = {
  url: string | null;
  offsetX: number; // document units; image top-left vs page origin
  offsetY: number;
  scale: number;   // image pixel → document unit; must be finite and > 0
};

pagePreset:
  | "original"
  | "hd_16_9"
  | "a4_landscape"
  | "id_cr80_portrait"
  | "id_cr80_landscape"
  | "custom"
```

Awards/certs: `unit: "px"`; `background: BackgroundFill`; `pagePreset` in `{ original, hd_16_9, a4_landscape, custom }`.  
ID cards: `unit: "in"`; `dpi: 300`; `background: { front: BackgroundFill, back: BackgroundFill }`; `pagePreset` in `{ id_cr80_portrait, id_cr80_landscape }` only.

Missing crop fields (legacy): `offsetX = 0`, `offsetY = 0`, `scale = 1`. Award/cert `width`/`height` `0` still means “no page until a background is placed.” ID cards keep today’s CR80 defaults.

### Named sizes

| Preset | Page size |
|---|---|
| Original image | Natural pixel size of the current background |
| 16:9 HD | 1920 × 1080 px |
| A4 landscape | 3508 × 2480 px |
| ID card portrait | 2.125 × 3.375 in @ 300 dpi → 638 × 1013 px |
| ID card landscape | 3.375 × 2.125 in @ 300 dpi → 1013 × 638 px |
| Custom | Typed W×H (awards/certs, px). Min 1×1, max **8192** on a side |

Typing W×H that does not match a named size sets `pagePreset: "custom"`. Matching a named size may snap the dropdown label to that preset.

### Cover-fit (preset change, replace image, clamp after adjust)

Image natural size `Iw × Ih`. Page `Pw × Ph`.

1. `coverScale = max(Pw / Iw, Ph / Ih)`
2. `scale = max(currentScale, coverScale)` — never below cover
3. Clamp `offsetX` / `offsetY` so every page pixel maps onto the image (no empty corners)

Switching preset uses this with `currentScale` from before the switch (so a zoomed crop does not reset to 1 unless it would uncover). Replacing the file sets `scale = coverScale` and centers the image, then clamps.

**Adjust background:** drag changes offset (then clamp). Unmodified wheel / scale handles change `scale` (then `max` with cover, then clamp offset). Max scale: **8 × coverScale**. While adjusting, Ctrl/Cmd+wheel still zooms the **camera**; Space+drag still pans the **view**.

**Empty page.** No background: empty state `Add background` (same picker as inspector). Save still 400 without a background.

---

## Layers on the canvas

Each layer is drawn at document `x, y, width, height`. Text/field/named-person wrap and clip to the box. Photo/signature/QR fill the box (binder or placeholder).

**Hit-test** (document space, after camera inverse): handles beat body; topmost layer (`z`) wins; a page pixel with no layer selects `page`.

**Handles** are constant **screen** pixels (not scaled by camera). No rotate.

Adding from the insert stack: default size, position such that the box center equals the center of the current view (in document space).

---

## Architecture

```
EditorShell (HTML chrome)
  └── Artboard (camera)
        └── <canvas>  composite(document, binder)   // page pixels, then scaled by camera
              + HUD   selection, handles, adjust     // screen space
```

`composite` output size is **page width × height**, not the source image. Background is drawn with the fill transform and **clipped to the page**. Layers draw on top. Editor scales that bitmap by the camera and paints HUD.

Certificate ZIP generate and ID-card PDF **must** call this compositor. A crop that only exists in the editor is a bug.

### Adapters

**Certificate `graphics_data`** gains optional:

```
page: { width, height, preset }
backgroundTransform: { offsetX, offsetY, scale }
```

`backgroundImageDataUrl` remains the source artwork (existing exception — not a composited output). Old payloads without `page` / `backgroundTransform` → original / scale 1 / offset 0; page size follows the decoded image on first open, then saves the fields.

**ID card** payload gains per-face `offsetX`, `offsetY`, `scale` (default 1 / 0 / 0). Inch size still only CR80.

**Award** `document` JSON is native `TemplateDocument`. BE `validate_award_document` accepts `pagePreset` and `background.{offsetX,offsetY,scale}`; rejects non-finite or `scale <= 0`; still rejects layer output data-URLs. `EMPTY_AWARD_DOCUMENT` includes `offsetX: 0`, `offsetY: 0`, `scale: 1`, `pagePreset: "original"`.

### Konva removal

Delete `src/components/certificate/primitives/text.tsx` and `rectangle.tsx` if still unimported. Remove `konva` and `react-konva` from `package.json`. Remove the webpack `canvas` external in `next.config.js`. `src/` must have zero `from "konva"` / `from "react-konva"` imports.

Certificate **generate** (`helpers/image-editor` today) must paint via `composite`, not a parallel crop in the old TextElement path.

### Fonts

Picker labels: Noto Sans, Fraunces, Adobe Caslon Pro. Register Latin-only canvas families against `/fonts/noto-sans-latin-*.woff2`, `/fonts/fraunces-latin-*.woff2`, and the existing Caslon face. Do not use `Schedjuice Sans` or `Schedjuice Serif` on the canvas. ID-card default remains Adobe Caslon Pro. New award/cert text defaults to Noto Sans. Stored `Arial` still round-trips.

---

## Data flow

1. Load domain row → adapter → `TemplateDocument` (legacy crop defaults).
2. Decode background; `document.fonts.load` faces used on the page.
3. Session: document, selection (`page` \| layer id \| none), camera, `adjustBackground`, dirty, undo (includes page size and fill).
4. Pointer: screen → camera inverse → document space.
5. Save: existing adapters + new fields. No composited output. Dirty `Back` confirms.
6. Generate/PDF: same `composite`.

### Errors

| Case | Behavior |
|---|---|
| Malformed legacy payload | Toast, `Back`, do not PATCH (unchanged) |
| Save with no background | 400 + `details.background` (unchanged) |
| Image decode failure | Empty state; Save blocked until a valid background exists |
| Font face missing | Fallback draw; stay editable |
| `scale <= 0` / non-finite size | Validator/adapter 400 |
| Adjust vs camera | Adjust: drag / unmodified wheel move artwork. Ctrl/Cmd+wheel zooms camera. Space+drag always pans. Esc leaves adjust |

---

## Testing

High-value only. No “editor renders” / Save-200 smoke.

**FE**

- Legacy cert `graphics_data` with only `backgroundImageDataUrl` + `elements` loads; crop defaults; malformed payload does not PATCH.
- `composite` canvas is page width×height, not source image size; pixels outside the crop are absent.
- Cover-fit: `hd_16_9` → `a4_landscape` still covers (no empty corners from a reset-to-1).
- Hit-test: topmost layer wins; handle beats move; empty page pixel selects page; camera pan does not mutate `document.background`.
- Adjust-background drag changes `offsetX`/`offsetY`.
- ID-card page inspector offers only CR80 portrait/landscape — not 16:9 or A4.
- Font allowlist has no Myanmar face; stored `Arial` round-trips on the certificate adapter.
- Dirty `Back` confirms; cancel stays.
- No `konva` / `react-konva` imports under `src/`.

**BE**

- Award document with `background.scale <= 0` → 400.
- Award document with `pagePreset` + fill fields is **accepted** (does not 400); layer output data-URLs still 400.
- Existing 403/400/404 award-template tests stay.

---

## Follow-ons (not this slice)

- Myanmar / bilingual faces on the canvas
- Rotate, autosave, Templates hub
- Award grant generate / bulk zip
- Certificate “belongs to a catalog entity” gallery refactor
