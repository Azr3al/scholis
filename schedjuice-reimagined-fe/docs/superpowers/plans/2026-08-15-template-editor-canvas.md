# Template Editor Canvas + Chrome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the full-screen template editor into a real `<canvas>` page — branded chrome, pan/zoom camera, draggable/resizable layers, crop-window background, named page presets — and remove Konva.

**Architecture:** Pure helpers own crop math, hit-testing, presets, and fonts. `composite(document, binder)` paints page pixels (clipped background + layers). HTML `EditorShell` is cream `Back` + dark pasteboard. Certificate generate and ID-card PDF call `composite`, not a second draw path. Camera is session-only.

**Tech Stack:** Django 4.2 + DRF (`validate_award_document`, ID-card `background_transform` JSON), Next.js App Router `(template-editor)`, canvas 2D, Vitest, Testing Library. No Konva.

**Spec:** `docs/superpowers/specs/2026-08-15-template-editor-canvas-design.md` (amends `2026-08-14-unified-template-editor-design.md`)

## Global Constraints

- Never persist composited PNG/JPEG/data-URL **output**. Background artwork + layer JSON + live ids only.
- English-only on this surface. No Myanmar face in the picker. Canvas must not use `Schedjuice Sans` / `Schedjuice Serif`.
- Page is a crop window (`offsetX`, `offsetY`, `scale`). Camera pan/zoom is not stored.
- ID-card templates stay CR80 (2.125 × 3.375 in @ 300 dpi). No 16:9 / A4 on ID cards.
- Award/cert presets: original image; 16:9 HD 1920×1080; A4 landscape 3508×2480; custom W×H px (max 8192).
- Cover-fit: `scale = max(currentScale, max(Pw/Iw, Ph/Ih))`, then clamp offset so the page has no empty corners.
- Certificate generate and ID-card PDF **must** call `composite`.
- No rotate, autosave, bilingual, Templates hub, grant→image generate, bulk zip.
- BE tests: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh <target>` (always `--keepdb --noinput`).
- FE tests: `cd schedjuice-reimagined-fe && npm run test:unit -- <path>`
- High-value tests only. No happy-path-only “renders” / Save-200 smoke.
- Do not touch the Railway/dev database.
- Semantic tokens only in editor chrome. No `zinc-*`. Header is `data-theme="light"`; pasteboard/inspector `data-theme="dark"`.
- `Back` (text), not a home icon. Dirty close still uses `shouldConfirmClose`.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `schedjuice-reimagined-fe/src/lib/image-template/types.ts` | Modify | `BackgroundFill`, `pagePreset`, fill on award/cert/ID docs |
| `schedjuice-reimagined-fe/src/lib/image-template/award-document.ts` | Modify | Empty doc + parse defaults for fill/preset |
| `schedjuice-reimagined-fe/src/lib/image-template/cover-fit.ts` | Create | Cover scale, clamp fill, apply preset |
| `schedjuice-reimagined-fe/src/lib/image-template/page-presets.ts` | Create | Named sizes; kind-filtered lists |
| `schedjuice-reimagined-fe/src/lib/image-template/canvas-fonts.ts` | Create | English allowlist + canvas family names |
| `schedjuice-reimagined-fe/src/lib/image-template/camera.ts` | Create | Zoom clamp, screen ↔ document |
| `schedjuice-reimagined-fe/src/lib/image-template/hit-test.ts` | Create | Page / layer / handle hits |
| `schedjuice-reimagined-fe/src/lib/image-template/pointer-session.ts` | Create | Pan vs move vs resize vs adjust (no camera mutation of fill) |
| `schedjuice-reimagined-fe/src/lib/image-template/composite.ts` | Create | `pagePixelSize`, `backgroundDestRect`, `composite` |
| `schedjuice-reimagined-fe/src/lib/image-template/insert-chrome.ts` | Create | Text / Photo / Fields split |
| `schedjuice-reimagined-fe/src/lib/image-template/adapters/certificate.ts` | Modify | `page` + `backgroundTransform`; legacy defaults |
| `schedjuice-reimagined-fe/src/lib/image-template/adapters/id-card.ts` | Modify | `BackgroundFill` per face; persist transform |
| `schedjuice-reimagined-fe/src/components/template-editor/editor-shell.tsx` | Modify | Cream Back bar, labeled insert, tokens |
| `schedjuice-reimagined-fe/src/components/template-editor/artboard.tsx` | Create | Canvas + camera HUD + pointer |
| `schedjuice-reimagined-fe/src/app/(template-editor)/layout.tsx` | Modify | Dark pasteboard tokens, no zinc |
| `schedjuice-reimagined-fe/src/app/globals.css` | Modify | Latin-only canvas `@font-face` |
| `schedjuice-reimagined-fe/src/components/template-editor/{award,certificate,id-card}-editor.tsx` | Modify | Artboard, page inspector, Back |
| `schedjuice-reimagined-fe/src/helpers/image-editor/functions.ts` | Modify | Generate row via `composite` |
| `schedjuice-reimagined-fe/src/lib/id-card/render-template.ts` | Modify | Draw background via `backgroundDestRect` / `composite` |
| `schedjuice-reimagined-fe/src/components/certificate/primitives/text.tsx` | Delete | Konva |
| `schedjuice-reimagined-fe/src/components/certificate/primitives/rectangle.tsx` | Delete | Konva |
| `schedjuice-reimagined-fe/package.json` | Modify | Remove `konva`, `react-konva` |
| `schedjuice-reimagined-fe/next.config.js` | Modify | Remove `canvas` webpack external |
| `schedjuice-reimagined-be/app_awards/document.py` | Modify | Empty fill; reject `scale <= 0` |
| `schedjuice-reimagined-be/app_organization/models.py` | Modify | `background_transform` JSONField |
| `schedjuice-reimagined-be/app_organization/id_card_template_serializers.py` | Modify | Read/write transform |
| `schedjuice-reimagined-be/app_organization/migrations/` | Create | `background_transform` |

---

### Task 1: Document types + parse defaults

**Files:**
- Modify: `schedjuice-reimagined-fe/src/lib/image-template/types.ts`
- Modify: `schedjuice-reimagined-fe/src/lib/image-template/award-document.ts`
- Create: `schedjuice-reimagined-fe/src/lib/image-template/award-document.test.ts`

**Interfaces:**
- Consumes: existing `AwardOrCertificateDocument` shape
- Produces: `BackgroundFill`, `PagePreset`, `IDENTITY_FILL`, `normalizeBackgroundFill(url, raw)`, `emptyAwardDocument()` with fill + `pagePreset: "original"`

- [ ] **Step 1: Write the failing parse-defaults test**

Create `schedjuice-reimagined-fe/src/lib/image-template/award-document.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { emptyAwardDocument, parseAwardDocument } from "./award-document";

describe("parseAwardDocument", () => {
  it("fills identity crop when legacy background is only a url", () => {
    const parsed = parseAwardDocument({
      version: 1,
      kind: "award",
      unit: "px",
      width: 800,
      height: 600,
      background: { url: "https://example.com/bg.png" },
      layers: [],
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.background).toEqual({
      url: "https://example.com/bg.png",
      offsetX: 0,
      offsetY: 0,
      scale: 1,
    });
    expect(parsed?.pagePreset).toBe("original");
  });
});

describe("emptyAwardDocument", () => {
  it("starts with identity fill and original preset", () => {
    const doc = emptyAwardDocument();
    expect(doc.background).toEqual({
      url: null,
      offsetX: 0,
      offsetY: 0,
      scale: 1,
    });
    expect(doc.pagePreset).toBe("original");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/image-template/award-document.test.ts`

Expected: FAIL (`pagePreset` / `offsetX` undefined, or type errors)

- [ ] **Step 3: Write minimal types + parse**

In `types.ts`, add and switch `background` shapes:

```ts
export type PagePreset =
  | "original"
  | "hd_16_9"
  | "a4_landscape"
  | "id_cr80_portrait"
  | "id_cr80_landscape"
  | "custom";

export type BackgroundFill = {
  url: string | null;
  offsetX: number;
  offsetY: number;
  scale: number;
};

export type AwardOrCertificateDocument = {
  version: 1;
  kind: "award" | "certificate";
  unit: "px";
  width: number;
  height: number;
  pagePreset: "original" | "hd_16_9" | "a4_landscape" | "custom";
  background: BackgroundFill;
  layers: Layer[];
};

export type IdCardDocument = {
  version: 1;
  kind: "id_card";
  unit: "in";
  width: number;
  height: number;
  dpi: 300;
  pagePreset: "id_cr80_portrait" | "id_cr80_landscape";
  background: { front: BackgroundFill; back: BackgroundFill };
  faces: { front: Layer[]; back: Layer[] };
};
```

In `award-document.ts`:

```ts
export const IDENTITY_FILL = { offsetX: 0, offsetY: 0, scale: 1 } as const;

export function normalizeBackgroundFill(
  url: string | null,
  raw: unknown,
): BackgroundFill {
  const record = raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
  const offsetX = Number(record.offsetX ?? 0);
  const offsetY = Number(record.offsetY ?? 0);
  const scale = Number(record.scale ?? 1);
  return {
    url: typeof record.url === "string" || record.url === null ? (record.url as string | null) : url,
    offsetX: Number.isFinite(offsetX) ? offsetX : 0,
    offsetY: Number.isFinite(offsetY) ? offsetY : 0,
    scale: Number.isFinite(scale) && scale > 0 ? scale : 1,
  };
}

export function emptyAwardDocument(): AwardOrCertificateDocument {
  return {
    version: 1,
    kind: "award",
    unit: "px",
    width: 0,
    height: 0,
    pagePreset: "original",
    background: { url: null, ...IDENTITY_FILL },
    layers: [],
  };
}
```

`parseAwardDocument`: if `kind !== "award"` or layers missing, return null. Otherwise return a document with `normalizeBackgroundFill` and `pagePreset` default `"original"` when missing or invalid for awards.

Fix any TypeScript breaks in editors/adapters in this task only as far as adding `...IDENTITY_FILL` and `pagePreset` so the repo typechecks. Adapter behavior changes are later tasks.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/image-template/award-document.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add schedjuice-reimagined-fe/src/lib/image-template/types.ts \
  schedjuice-reimagined-fe/src/lib/image-template/award-document.ts \
  schedjuice-reimagined-fe/src/lib/image-template/award-document.test.ts
# plus any compile-only adapter/editor type fixes
git commit -m "feat(templates): store background fill and page preset on documents"
```

---

### Task 2: BE award document validation

**Files:**
- Modify: `schedjuice-reimagined-be/app_awards/document.py`
- Modify: `schedjuice-reimagined-be/app_awards/tests/test_award_templates.py`

**Interfaces:**
- Consumes: `EMPTY_AWARD_DOCUMENT`
- Produces: `validate_award_document` rejects `background.scale <= 0` / non-finite; accepts `pagePreset` + fill; `EMPTY_AWARD_DOCUMENT` includes identity fill

- [ ] **Step 1: Write the failing validator tests**

Add to `ValidateAwardDocumentTests` in `test_award_templates.py`:

```python
    def test_rejects_non_positive_background_scale(self):
        doc = dict(EMPTY_AWARD_DOCUMENT)
        doc["background"] = {
            "url": None,
            "offsetX": 0,
            "offsetY": 0,
            "scale": 0,
        }
        with self.assertRaises(ValidationError) as ctx:
            validate_award_document(doc)
        self.assertIn("background", ctx.exception.detail)

    def test_accepts_page_preset_and_fill_without_400(self):
        doc = dict(EMPTY_AWARD_DOCUMENT)
        doc["pagePreset"] = "hd_16_9"
        doc["width"] = 1920
        doc["height"] = 1080
        doc["background"] = {
            "url": None,
            "offsetX": -10,
            "offsetY": -4,
            "scale": 1.2,
        }
        validate_award_document(doc)

    def test_still_rejects_layer_output_data_url(self):
        doc = dict(EMPTY_AWARD_DOCUMENT)
        doc["layers"] = [
            {
                "id": "1",
                "type": "text",
                "x": 0,
                "y": 0,
                "width": 1,
                "height": 1,
                "z": 0,
                "text": "x",
                "dataUrl": "data:image/png;base64,aaa",
            }
        ]
        with self.assertRaises(ValidationError) as ctx:
            validate_award_document(doc)
        self.assertIn("layers", ctx.exception.detail)
```

(`test_still_rejects_layer_output_data_url` already exists as `test_rejects_output_data_url_on_layer` — do **not** duplicate it; keep the existing test.)

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_awards.tests.test_award_templates.ValidateAwardDocumentTests`

Expected: FAIL on `test_rejects_non_positive_background_scale` (scale 0 currently accepted)

- [ ] **Step 3: Implement validation**

Update `EMPTY_AWARD_DOCUMENT`:

```python
EMPTY_AWARD_DOCUMENT = {
    "version": 1,
    "kind": "award",
    "unit": "px",
    "width": 0,
    "height": 0,
    "pagePreset": "original",
    "background": {"url": None, "offsetX": 0, "offsetY": 0, "scale": 1},
    "layers": [],
}

AWARD_PAGE_PRESETS = frozenset({"original", "hd_16_9", "a4_landscape", "custom"})
```

In `validate_award_document`, after kind check:

```python
    preset = document.get("pagePreset", "original")
    if preset not in AWARD_PAGE_PRESETS:
        raise ValidationError({"pagePreset": "Invalid page preset."})
    background = document.get("background", {})
    if not isinstance(background, dict):
        raise ValidationError({"background": "Must be an object."})
    scale = background.get("scale", 1)
    try:
        scale_num = float(scale)
    except (TypeError, ValueError) as exc:
        raise ValidationError({"background": {"scale": "Must be a number."}}) from exc
    if not (scale_num > 0) or scale_num != scale_num:  # NaN
        raise ValidationError({"background": {"scale": "Must be greater than 0."}})
    for key in ("offsetX", "offsetY"):
        if key in background:
            try:
                val = float(background[key])
            except (TypeError, ValueError) as exc:
                raise ValidationError({"background": {key: "Must be a number."}}) from exc
            if val != val:
                raise ValidationError({"background": {key: "Must be finite."}})
```

Keep existing layer / data-URL checks.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_awards.tests.test_award_templates.ValidateAwardDocumentTests`

Expected: PASS (including existing unknown-type / data-URL / kind tests)

- [ ] **Step 5: Commit**

```bash
git add app_awards/document.py app_awards/tests/test_award_templates.py
git commit -m "fix(awards): reject non-positive background scale on templates"
```

---

### Task 3: Cover-fit + page presets

**Files:**
- Create: `schedjuice-reimagined-fe/src/lib/image-template/cover-fit.ts`
- Create: `schedjuice-reimagined-fe/src/lib/image-template/cover-fit.test.ts`
- Create: `schedjuice-reimagined-fe/src/lib/image-template/page-presets.ts`
- Create: `schedjuice-reimagined-fe/src/lib/image-template/page-presets.test.ts`

**Interfaces:**
- Consumes: `BackgroundFill`, `PagePreset`, `TemplateKind`
- Produces: `coverScale`, `clampBackgroundFill`, `applyPresetCoverFit`, `pagePresetsForKind`, `sizeForPreset`

- [ ] **Step 1: Write the failing tests**

`cover-fit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyPresetCoverFit, clampBackgroundFill, coverScale } from "./cover-fit";

describe("cover-fit", () => {
  it("coverScale is max of both axes", () => {
    expect(coverScale({ width: 1000, height: 500 }, { width: 1920, height: 1080 })).toBe(
      Math.max(1920 / 1000, 1080 / 500),
    );
  });

  it("hd_16_9 to a4_landscape still covers (no reset-to-1 empty corners)", () => {
    const image = { width: 1920, height: 1080 };
    const fromPage = { width: 1920, height: 1080 };
    const zoomed = { url: "x", offsetX: -200, offsetY: -50, scale: 1.4 };
    const clampedZoomed = clampBackgroundFill(zoomed, image, fromPage);
    const a4 = { width: 3508, height: 2480 };
    const next = applyPresetCoverFit(clampedZoomed, image, a4);
    expect(next.scale).toBeGreaterThanOrEqual(coverScale(image, a4));
    const again = clampBackgroundFill(next, image, a4);
    expect(again.offsetX).toBeLessThanOrEqual(0);
    expect(again.offsetY).toBeLessThanOrEqual(0);
    expect(image.width * again.scale + again.offsetX).toBeGreaterThanOrEqual(a4.width - 0.01);
    expect(image.height * again.scale + again.offsetY).toBeGreaterThanOrEqual(a4.height - 0.01);
  });
});
```

`page-presets.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { pagePresetsForKind, sizeForPreset } from "./page-presets";

describe("pagePresetsForKind", () => {
  it("id_card offers only CR80 portrait and landscape", () => {
    expect(pagePresetsForKind("id_card")).toEqual([
      "id_cr80_portrait",
      "id_cr80_landscape",
    ]);
    expect(pagePresetsForKind("id_card")).not.toContain("hd_16_9");
    expect(pagePresetsForKind("id_card")).not.toContain("a4_landscape");
  });

  it("award offers original, 16:9, A4, custom — not CR80", () => {
    expect(pagePresetsForKind("award")).toEqual([
      "original",
      "hd_16_9",
      "a4_landscape",
      "custom",
    ]);
  });

  it("CR80 portrait is 2.125 x 3.375 in", () => {
    expect(sizeForPreset("id_cr80_portrait")).toEqual({
      width: 2.125,
      height: 3.375,
      unit: "in",
    });
  });

  it("16:9 HD is 1920 x 1080 px", () => {
    expect(sizeForPreset("hd_16_9")).toEqual({
      width: 1920,
      height: 1080,
      unit: "px",
    });
  });

  it("A4 landscape is 3508 x 2480 px", () => {
    expect(sizeForPreset("a4_landscape")).toEqual({
      width: 3508,
      height: 2480,
      unit: "px",
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/image-template/cover-fit.test.ts src/lib/image-template/page-presets.test.ts`

Expected: FAIL (modules missing)

- [ ] **Step 3: Implement**

`cover-fit.ts`:

```ts
import type { BackgroundFill } from "./types";

export function coverScale(
  image: { width: number; height: number },
  page: { width: number; height: number },
): number {
  if (image.width <= 0 || image.height <= 0) return 1;
  return Math.max(page.width / image.width, page.height / image.height);
}

export function clampBackgroundFill(
  fill: BackgroundFill,
  image: { width: number; height: number },
  page: { width: number; height: number },
): BackgroundFill {
  const minScale = coverScale(image, page);
  const scale = Math.min(Math.max(fill.scale, minScale), minScale * 8);
  const drawnW = image.width * scale;
  const drawnH = image.height * scale;
  const minX = Math.min(0, page.width - drawnW);
  const minY = Math.min(0, page.height - drawnH);
  return {
    ...fill,
    scale,
    offsetX: Math.min(0, Math.max(fill.offsetX, minX)),
    offsetY: Math.min(0, Math.max(fill.offsetY, minY)),
  };
}

export function applyPresetCoverFit(
  fill: BackgroundFill,
  image: { width: number; height: number },
  page: { width: number; height: number },
): BackgroundFill {
  return clampBackgroundFill(fill, image, page);
}
```

`page-presets.ts`:

```ts
import type { PagePreset, TemplateKind } from "./types";

export function pagePresetsForKind(kind: TemplateKind): PagePreset[] {
  if (kind === "id_card") return ["id_cr80_portrait", "id_cr80_landscape"];
  return ["original", "hd_16_9", "a4_landscape", "custom"];
}

export function sizeForPreset(
  preset: Exclude<PagePreset, "original" | "custom">,
): { width: number; height: number; unit: "px" | "in" } {
  if (preset === "hd_16_9") return { width: 1920, height: 1080, unit: "px" };
  if (preset === "a4_landscape") return { width: 3508, height: 2480, unit: "px" };
  if (preset === "id_cr80_portrait") return { width: 2.125, height: 3.375, unit: "in" };
  return { width: 3.375, height: 2.125, unit: "in" };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/image-template/cover-fit.test.ts src/lib/image-template/page-presets.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/image-template/cover-fit.ts src/lib/image-template/cover-fit.test.ts \
  src/lib/image-template/page-presets.ts src/lib/image-template/page-presets.test.ts
git commit -m "feat(templates): cover-fit crop math and named page presets"
```

---

### Task 4: Certificate adapter crop fields

**Files:**
- Modify: `schedjuice-reimagined-fe/src/lib/image-template/adapters/certificate.ts`
- Modify: `schedjuice-reimagined-fe/src/lib/image-template/adapters/certificate.test.ts`

**Interfaces:**
- Consumes: `normalizeBackgroundFill`, `AwardOrCertificateDocument`
- Produces: `certificateGraphicsToDocument` defaults fill; `documentToCertificateGraphics` writes `page` + `backgroundTransform`; Arial round-trips

- [ ] **Step 1: Extend the failing/new tests in `certificate.test.ts`**

Keep the existing minimal / malformed / `{{name}}` tests. Add:

```ts
  it("legacy graphics_data without page gets identity fill and original preset", () => {
    const doc = certificateGraphicsToDocument({
      backgroundImageDataUrl: "https://example.com/bg.png",
      elements: [],
    });
    expect(doc.background.offsetX).toBe(0);
    expect(doc.background.offsetY).toBe(0);
    expect(doc.background.scale).toBe(1);
    expect(doc.pagePreset).toBe("original");
  });

  it("round-trips Arial and crop fields so ZIP generate can read them", () => {
    const graphics = {
      backgroundImageDataUrl: "https://example.com/bg.png",
      page: { width: 1920, height: 1080, preset: "hd_16_9" as const },
      backgroundTransform: { offsetX: -20, offsetY: -10, scale: 1.2 },
      elements: [
        {
          text: "{{name}}",
          x: 10,
          y: 20,
          fontSize: 24,
          fontFamily: "Arial",
          color: "#000",
        },
      ],
    };
    const back = documentToCertificateGraphics(certificateGraphicsToDocument(graphics));
    expect(back.elements[0]).toMatchObject({ fontFamily: "Arial", text: "{{name}}" });
    expect(back.page).toEqual({ width: 1920, height: 1080, preset: "hd_16_9" });
    expect(back.backgroundTransform).toEqual({
      offsetX: -20,
      offsetY: -10,
      scale: 1.2,
    });
  });
```

- [ ] **Step 2: Run tests to verify new cases fail**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/image-template/adapters/certificate.test.ts`

Expected: FAIL (`page` / `backgroundTransform` undefined)

- [ ] **Step 3: Implement adapter**

`certificateGraphicsToDocument`: read `graphics.page` if a record with numeric width/height; otherwise width/height stay 0 (first-open image size is the editor’s job). `pagePreset` from `page.preset` if it is `"original" | "hd_16_9" | "a4_landscape" | "custom"`, else `"original"`. `background: normalizeBackgroundFill(backgroundUrl, graphics.backgroundTransform)` with url from `backgroundImageDataUrl`.

`documentToCertificateGraphics` return type:

```ts
{
  backgroundImageDataUrl: string;
  elements: SerializedElement[];
  page: { width: number; height: number; preset: AwardOrCertificateDocument["pagePreset"] };
  backgroundTransform: { offsetX: number; offsetY: number; scale: number };
}
```

Write those fields from the document. Keep `backgroundImageDataUrl` as source artwork (not a composite).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/image-template/adapters/certificate.test.ts src/lib/image-template/adapters/certificate-save-guard.test.ts`

Expected: PASS (malformed still does not save)

- [ ] **Step 5: Commit**

```bash
git add src/lib/image-template/adapters/certificate.ts src/lib/image-template/adapters/certificate.test.ts
git commit -m "feat(templates): persist certificate page size and background crop"
```

---

### Task 5: ID-card fill + `background_transform`

**Files:**
- Modify: `schedjuice-reimagined-fe/src/lib/image-template/adapters/id-card.ts`
- Modify: `schedjuice-reimagined-fe/src/lib/image-template/adapters/id-card.test.ts`
- Modify: `schedjuice-reimagined-be/app_organization/models.py`
- Modify: `schedjuice-reimagined-be/app_organization/id_card_template_serializers.py`
- Create: migration `background_transform` via `makemigrations`
- Modify: `schedjuice-reimagined-be/app_organization/tests/test_id_card_templates.py`
- Modify: `schedjuice-reimagined-fe/src/app/client-api/id-card-templates.ts` (`background_transform` on PATCH)
- Modify: `schedjuice-reimagined-fe/src/types/id-card-template.ts` (type field)

**Interfaces:**
- Consumes: `normalizeBackgroundFill`, `IdCardDocument`
- Produces: per-face `BackgroundFill`; `documentToIdCardPayload` includes `background_transform`; API JSONField

- [ ] **Step 1: Write the failing FE adapter tests**

Add to `id-card.test.ts`:

```ts
  it("legacy template without transform gets identity fill per face", () => {
    const doc = idCardTemplateToDocument({
      width_in: 2.125,
      height_in: 3.375,
      background_url: null,
      slots: [],
    });
    expect(doc.background.front).toMatchObject({
      url: null,
      offsetX: 0,
      offsetY: 0,
      scale: 1,
    });
    expect(doc.background.back).toMatchObject({
      offsetX: 0,
      offsetY: 0,
      scale: 1,
    });
    expect(doc.pagePreset).toBe("id_cr80_portrait");
  });

  it("writes background_transform, not into slots", () => {
    const doc = idCardTemplateToDocument({
      width_in: 3.375,
      height_in: 2.125,
      background_url: "https://example.com/f.png",
      slots: [],
      background_transform: {
        front: { offsetX: -0.1, offsetY: 0, scale: 1.2 },
        back: { offsetX: 0, offsetY: 0, scale: 1 },
      },
    });
    const payload = documentToIdCardPayload(doc);
    expect(payload.background_transform.front).toEqual({
      offsetX: -0.1,
      offsetY: 0,
      scale: 1.2,
    });
    expect(payload.slots).toEqual([]);
  });
```

Rename usage: keep `documentToIdCardSlots` as a wrapper that returns `{ slots, back_slots }` from `documentToIdCardPayload` so existing save code compiles until the editor task switches.

Landscape 3.375×2.125 → `pagePreset: "id_cr80_landscape"`; portrait 2.125×3.375 → `"id_cr80_portrait"`.

- [ ] **Step 2: Run FE tests to verify they fail**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/image-template/adapters/id-card.test.ts`

Expected: FAIL

- [ ] **Step 3: Implement adapter + BE field**

Adapter: `background.front = normalizeBackgroundFill(background_url, background_transform?.front)`; same for back. Export `documentToIdCardPayload`.

BE `IdCardTemplate.background_transform = JSONField(default=dict)` with default:

```python
def default_id_card_background_transform():
    fill = {"offsetX": 0, "offsetY": 0, "scale": 1}
    return {"front": dict(fill), "back": dict(fill)}
```

Serializer: include `background_transform` (optional). Validate `scale > 0` if present; invalid → 400.

BE test: PATCH with `background_transform.front.scale = 0` → 400; PATCH with valid fill persists (assert the stored JSON, not status-200-only).

Migration from `schedjuice-reimagined-be`:

```bash
./env/bin/python manage.py makemigrations app_organization --name idcard_background_transform
```

Do not migrate the Railway/dev DB. Tests apply via `migrate_schemas`.

FE `UpdateIdCardTemplatePayload.background_transform` appended as JSON string on FormData.

- [ ] **Step 4: Run tests**

FE: `cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/image-template/adapters/id-card.test.ts`

BE: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_organization.tests.test_id_card_templates`

Expected: PASS

- [ ] **Step 5: Commit** (FE and BE separately)

```bash
# FE
git commit -m "feat(templates): persist ID card background crop per face"
# BE
git commit -m "feat(id-cards): store background_transform JSON on templates"
```

---

### Task 6: English canvas font allowlist

**Files:**
- Create: `schedjuice-reimagined-fe/src/lib/image-template/canvas-fonts.ts`
- Create: `schedjuice-reimagined-fe/src/lib/image-template/canvas-fonts.test.ts`
- Modify: `schedjuice-reimagined-fe/src/app/globals.css` (Latin-only canvas faces)

**Interfaces:**
- Produces: `CANVAS_FONT_ALLOWLIST`, `canvasFontFamily(stored)`, `isCanvasAllowlistFont`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { CANVAS_FONT_ALLOWLIST, canvasFontFamily } from "./canvas-fonts";

describe("canvas fonts", () => {
  it("allowlist has no Myanmar face", () => {
    const joined = CANVAS_FONT_ALLOWLIST.map((f) => f.family.toLowerCase()).join(" ");
    expect(joined).not.toMatch(/myanmar/);
    expect(joined).not.toMatch(/schedjuice sans/);
    expect(joined).not.toMatch(/schedjuice serif/);
  });

  it("stored Arial still round-trips as Arial", () => {
    expect(canvasFontFamily("Arial")).toBe("Arial");
  });

  it("unknown faces fall back to Noto Sans", () => {
    expect(canvasFontFamily("Comic Sans MS")).toBe("Noto Sans");
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/image-template/canvas-fonts.test.ts`

Expected: FAIL

- [ ] **Step 3: Implement**

```ts
export const CANVAS_FONT_ALLOWLIST = [
  { label: "Noto Sans", family: "Noto Sans" },
  { label: "Fraunces", family: "Fraunces" },
  { label: "Adobe Caslon Pro", family: "Adobe Caslon Pro" },
] as const;

const ALLOWED = new Set<string>([
  ...CANVAS_FONT_ALLOWLIST.map((f) => f.family),
  "Arial",
]);

export function canvasFontFamily(stored?: string): string {
  if (stored && ALLOWED.has(stored)) return stored;
  return "Noto Sans";
}
```

In `globals.css` after the Caslon face, add Latin-only families (no Myanmar `unicode-range`):

```css
@font-face {
  font-family: "Noto Sans";
  font-weight: 400;
  font-display: swap;
  src: url("/fonts/noto-sans-latin-400.woff2") format("woff2");
}
@font-face {
  font-family: "Fraunces";
  font-weight: 500;
  font-display: swap;
  src: url("/fonts/fraunces-latin-500.woff2") format("woff2");
}
```

(Add 600 weights if those woff2 files already exist next to the 400/500 files.)

- [ ] **Step 4: Run to verify pass**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/image-template/canvas-fonts.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(templates): English-only canvas font allowlist"
```

---

### Task 7: Camera, hit-test, pointer session

**Files:**
- Create: `schedjuice-reimagined-fe/src/lib/image-template/camera.ts`
- Create: `schedjuice-reimagined-fe/src/lib/image-template/camera.test.ts`
- Create: `schedjuice-reimagined-fe/src/lib/image-template/hit-test.ts`
- Create: `schedjuice-reimagined-fe/src/lib/image-template/hit-test.test.ts`
- Create: `schedjuice-reimagined-fe/src/lib/image-template/pointer-session.ts`
- Create: `schedjuice-reimagined-fe/src/lib/image-template/pointer-session.test.ts`

**Interfaces:**
- Consumes: `Layer`, `BackgroundFill`, `Camera = { x: number; y: number; zoom: number }`
- Produces: `clampZoom`, `screenToDocument`, `hitTest`, `reducePointer` — pan must not return a new fill

- [ ] **Step 1: Write failing tests**

`camera.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { clampZoom, screenToDocument } from "./camera";

describe("camera", () => {
  it("clamps zoom to 25%–400%", () => {
    expect(clampZoom(0.1)).toBe(0.25);
    expect(clampZoom(8)).toBe(4);
    expect(clampZoom(1)).toBe(1);
  });

  it("screenToDocument inverts pan and zoom", () => {
    const camera = { x: 100, y: 50, zoom: 2 };
    expect(screenToDocument(camera, { x: 100, y: 50 })).toEqual({ x: 0, y: 0 });
    expect(screenToDocument(camera, { x: 120, y: 60 })).toEqual({ x: 10, y: 5 });
  });
});
```

`hit-test.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hitTest } from "./hit-test";
import type { Layer } from "./types";

const page = { width: 400, height: 300 };
const camera = { x: 0, y: 0, zoom: 1 };
const low: Layer = {
  id: "a",
  type: "text",
  text: "a",
  x: 0,
  y: 0,
  width: 100,
  height: 40,
  z: 0,
};
const high: Layer = { ...low, id: "b", z: 1, text: "b" };

describe("hitTest", () => {
  it("topmost layer wins", () => {
    expect(hitTest({ layers: [low, high], page, camera, point: { x: 10, y: 10 } })).toEqual({
      kind: "layer",
      layerId: "b",
    });
  });

  it("empty page pixel selects page", () => {
    expect(hitTest({ layers: [low], page, camera, point: { x: 200, y: 200 } })).toEqual({
      kind: "page",
    });
  });

  it("handle beats move on the selected layer", () => {
    const hit = hitTest({
      layers: [low],
      page,
      camera,
      point: { x: 100, y: 40 },
      selectedId: "a",
    });
    expect(hit.kind).toBe("handle");
    if (hit.kind === "handle") expect(hit.layerId).toBe("a");
  });
});
```

`pointer-session.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { reducePointer } from "./pointer-session";

const fill = { url: "u", offsetX: -10, offsetY: -4, scale: 1.2 };

describe("reducePointer", () => {
  it("camera pan does not mutate background fill", () => {
    const start = reducePointer(
      { mode: "idle", camera: { x: 0, y: 0, zoom: 1 }, fill, layers: [], selectedId: null },
      { type: "down", point: { x: 10, y: 10 }, spaceKey: true },
    );
    const moved = reducePointer(start, {
      type: "move",
      point: { x: 40, y: 30 },
      spaceKey: true,
    });
    expect(moved.fill).toEqual(fill);
    expect(moved.camera).not.toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it("adjust-background drag changes offsetX/offsetY", () => {
    const start = reducePointer(
      {
        mode: "idle",
        camera: { x: 0, y: 0, zoom: 1 },
        fill,
        layers: [],
        selectedId: "page",
        adjustBackground: true,
      },
      { type: "down", point: { x: 10, y: 10 }, spaceKey: false },
    );
    const moved = reducePointer(start, {
      type: "move",
      point: { x: 26, y: 10 },
      spaceKey: false,
    });
    expect(moved.fill.offsetX).not.toBe(fill.offsetX);
    expect(moved.fill.offsetY).toBe(fill.offsetY);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/image-template/camera.test.ts src/lib/image-template/hit-test.test.ts src/lib/image-template/pointer-session.test.ts`

Expected: FAIL

- [ ] **Step 3: Implement**

`clampZoom(z) => Math.min(4, Math.max(0.25, z))`.

`screenToDocument(camera, p) => ({ x: (p.x - camera.x) / camera.zoom, y: (p.y - camera.y) / camera.zoom })`.

`hitTest`: convert point to document space; if `selectedId` matches a layer, test 8 handles as 10×10 **screen** pixel boxes around the layer rect edges/corners (divide handle size by zoom). Then layers by descending `z` whose rect contains the point. Else if point is inside page rect, `{ kind: "page" }`. Else `{ kind: "none" }`.

`reducePointer`: `spaceKey` + down → pan mode (camera only). `adjustBackground` + down on page → adjust mode (fill offsets += delta / zoom, then caller clamps). Layer down → move. Handle down → resize. Ignore fill changes in pan mode.

- [ ] **Step 4: Run to verify pass**

Same command as Step 2. Expected: PASS

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(templates): camera, hit-test, and pointer session for the artboard"
```

---

### Task 8: Compositor page size + crop dest rect

**Files:**
- Create: `schedjuice-reimagined-fe/src/lib/image-template/composite.ts`
- Create: `schedjuice-reimagined-fe/src/lib/image-template/composite.test.ts`

**Interfaces:**
- Consumes: `TemplateDocument`, `BackgroundFill`, `DEFAULT_ID_CARD_*`, `templatePixelSize` from `@/lib/id-card/template-geometry`
- Produces: `pagePixelSize(doc, face?)`, `backgroundDestRect(fill, image, page)`, `createCompositeCanvas(page)` (width/height only — draw comes when images exist)

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import { backgroundDestRect, pagePixelSize } from "./composite";
import { emptyAwardDocument } from "./award-document";

describe("pagePixelSize", () => {
  it("is page width x height, not the source image", () => {
    const doc = {
      ...emptyAwardDocument(),
      width: 800,
      height: 600,
      background: {
        url: "https://example.com/4000x3000.png",
        offsetX: -100,
        offsetY: -50,
        scale: 0.5,
      },
    };
    expect(pagePixelSize(doc)).toEqual({ width: 800, height: 600 });
  });
});

describe("backgroundDestRect", () => {
  it("places the image using offset and scale (crop lives outside the page)", () => {
    const rect = backgroundDestRect(
      { url: "u", offsetX: -100, offsetY: -40, scale: 2 },
      { width: 500, height: 300 },
      { width: 800, height: 600 },
    );
    expect(rect).toEqual({ x: -100, y: -40, width: 1000, height: 600 });
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/image-template/composite.test.ts`

Expected: FAIL

- [ ] **Step 3: Implement**

```ts
export function pagePixelSize(
  doc: TemplateDocument,
  face: "front" | "back" = "front",
): { width: number; height: number } {
  if (doc.kind === "id_card") {
    return templatePixelSize(doc.width, doc.height, doc.dpi);
  }
  return { width: doc.width, height: doc.height };
}

export function backgroundDestRect(
  fill: BackgroundFill,
  image: { width: number; height: number },
  _page: { width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  return {
    x: fill.offsetX,
    y: fill.offsetY,
    width: image.width * fill.scale,
    height: image.height * fill.scale,
  };
}
```

Add `export async function composite(...)` that: if page width/height is 0, return a 1×1 canvas; else create canvas at `pagePixelSize`, clip to page, `drawImage` background at `backgroundDestRect`, then draw layers (text via `canvasFontFamily`, photos as placeholder rects if binder missing). Missing photo/signature → placeholder, never throw.

If jsdom lacks `document.createElement("canvas").getContext`, keep `composite` thin and unit-test `pagePixelSize` / `backgroundDestRect` only in this task; wire `composite` draw in Task 12 with the same dest rect.

- [ ] **Step 4: Run to verify pass**

Same command. Expected: PASS

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(templates): compositor uses page size as the crop window"
```

---

### Task 9: Editor chrome (Back, insert stack, tokens)

**Files:**
- Create: `schedjuice-reimagined-fe/src/lib/image-template/insert-chrome.ts`
- Create: `schedjuice-reimagined-fe/src/lib/image-template/insert-chrome.test.ts`
- Modify: `schedjuice-reimagined-fe/src/components/template-editor/editor-shell.tsx`
- Create: `schedjuice-reimagined-fe/src/components/template-editor/editor-shell.test.tsx`
- Modify: `schedjuice-reimagined-fe/src/app/(template-editor)/layout.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/template-editor/{award,certificate,id-card}-editor.tsx` (Home → Back label / `onBack`)

**Interfaces:**
- Consumes: `paletteForKind`, `Menu`, `Button`
- Produces: `insertChromeForKind(kind)`; shell with text `Back`, no `⌂`, no native `<select>`

- [ ] **Step 1: Write failing tests**

`insert-chrome.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { insertChromeForKind } from "./insert-chrome";

describe("insertChromeForKind", () => {
  it("omits Photo for certificates", () => {
    const chrome = insertChromeForKind("certificate");
    expect(chrome.showPhoto).toBe(false);
    expect(chrome.fieldItems).toEqual([]);
  });

  it("award Fields list has student name and not QR", () => {
    const chrome = insertChromeForKind("award");
    expect(chrome.showPhoto).toBe(true);
    expect(chrome.fieldItems.map((i) => i.key)).toContain("student_name");
    expect(chrome.fieldItems.map((i) => i.key)).not.toContain("qr");
    expect(chrome.fieldItems.map((i) => i.key)).not.toContain("text");
    expect(chrome.fieldItems.map((i) => i.key)).not.toContain("photo");
  });
});
```

`editor-shell.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EditorShell } from "./editor-shell";

describe("EditorShell", () => {
  it("uses a text Back control, not a home icon", () => {
    render(
      <EditorShell
        breadcrumb="Award titles / May"
        backHref="/award-titles/1/edit"
        onBack={() => {}}
        onSave={() => {}}
        showPhoto
        fieldItems={[{ key: "student_name", label: "Student name" }]}
        onAdd={vi.fn()}
        inspector={null}
        layers={null}
      >
        <div />
      </EditorShell>,
    );
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
    expect(screen.queryByLabelText("Home")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/image-template/insert-chrome.test.ts src/components/template-editor/editor-shell.test.tsx`

Expected: FAIL (`Home` still present)

- [ ] **Step 3: Implement**

`insertChromeForKind`: `paletteForKind` minus `text`/`photo` for fields; `showPhoto` if some item has `key === "photo"`.

Replace `EditorShell` chrome:

- Outer: `flex h-dvh flex-col bg-surface-sunken text-text-primary`
- Header: `data-theme="light"` island, `bg-surface text-text-primary border-b border-border`, `Button variant="ghost" size="sm"` children `Back`, serif centered breadcrumb, `Save`
- Body: `data-theme="dark"` grid `minmax(0,1fr) 16rem` — **no** 2.5rem Home rail
- Insert: stacked `Button variant="ghost"` `Text`, optional `Photo`, `Menu` trigger `Fields` with `fieldItems` (hide Fields if empty)
- Pasteboard: `bg-surface-sunken`; inspector `border-border text-text-primary`
- No `zinc-*`, no `<select>`

Layout: `sj-root min-h-dvh bg-surface-sunken text-text-primary antialiased` (not `bg-zinc-950`).

Rename `onHome` → `onBack` in the three editors; malformed-state link text `Back` not `Home`.

- [ ] **Step 4: Run to verify pass**

Same command as Step 2. Expected: PASS

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(templates): branded Back bar and labeled insert stack"
```

---

### Task 10: Artboard canvas in the three editors

**Files:**
- Create: `schedjuice-reimagined-fe/src/components/template-editor/artboard.tsx`
- Modify: `award-editor.tsx`, `certificate-editor.tsx`, `id-card-editor.tsx`
- Modify: `createAwardLayer` / `createIdCardLayer` to accept `{ x, y }` from view center

**Interfaces:**
- Consumes: `reducePointer`, `hitTest`, `composite` / dest rect, `shouldConfirmClose`
- Produces: pan/zoom/drag/resize/page-select on the canvas; `Fit` / `%` chip

- [ ] **Step 1: Write a failing caller-contract test for place-at-view-center**

Create `schedjuice-reimagined-fe/src/lib/image-template/place-layer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { layerOriginForViewCenter } from "./place-layer";

describe("layerOriginForViewCenter", () => {
  it("centers a 200x40 box on the document point under the view center", () => {
    expect(
      layerOriginForViewCenter({
        viewCenterDocument: { x: 400, y: 300 },
        width: 200,
        height: 40,
      }),
    ).toEqual({ x: 300, y: 280 });
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/image-template/place-layer.test.ts`

Expected: FAIL

- [ ] **Step 3: Implement `place-layer.ts` and `Artboard`**

```ts
export function layerOriginForViewCenter(args: {
  viewCenterDocument: { x: number; y: number };
  width: number;
  height: number;
}): { x: number; y: number } {
  return {
    x: args.viewCenterDocument.x - args.width / 2,
    y: args.viewCenterDocument.y - args.height / 2,
  };
}
```

`Artboard` (client component): pasteboard `onWheel` (ctrl/meta → zoom toward pointer via `clampZoom`; else pan camera, unless `adjustBackground` then scale fill then `clampBackgroundFill`). Space+drag → `reducePointer` pan. Pointer down/move/up → `reducePointer`. Draw: put `composite` bitmap (or background + layer rects if images not ready) then HUD selection/handles in screen space. Empty page (`width === 0` or no url): `Add background` button calling `onPickBackground`. Chip: `Fit` sets camera to fit page in the pasteboard rect; label shows `Math.round(zoom * 100) + "%"`.

Replace the white `max-w-3xl` list in all three editors with `<Artboard ... />`. Selection state: `selectedId: string | "page" | null`. Esc per spec. Insert `onAdd` uses `layerOriginForViewCenter`. ID cards: Front/Back toggle still under the artboard; fill is `document.background[face]`.

Save ID cards with `background_transform` from `documentToIdCardPayload`. Save awards/certs with the filled document (already PATCH `document`).

- [ ] **Step 4: Run unit tests**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/image-template/place-layer.test.ts src/lib/image-template/pointer-session.test.ts src/lib/image-template/hit-test.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(templates): canvas artboard with pan, zoom, drag, and resize"
```

---

### Task 11: Page inspector (presets + adjust + replace)

**Files:**
- Create: `schedjuice-reimagined-fe/src/components/template-editor/page-inspector.tsx`
- Create: `schedjuice-reimagined-fe/src/lib/image-template/apply-page-preset.test.ts`
- Create: `schedjuice-reimagined-fe/src/lib/image-template/apply-page-preset.ts`
- Modify: the three editors’ inspector when selection is page / none

**Interfaces:**
- Consumes: `pagePresetsForKind`, `sizeForPreset`, `applyPresetCoverFit`, `clampBackgroundFill`
- Produces: `applyPagePreset(doc, preset, imageSize, custom?)`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import { applyPagePreset } from "./apply-page-preset";
import { emptyAwardDocument } from "./award-document";
import { pagePresetsForKind } from "./page-presets";

describe("applyPagePreset", () => {
  it("does not offer 16:9 on id_card via pagePresetsForKind", () => {
    expect(pagePresetsForKind("id_card")).not.toContain("hd_16_9");
  });

  it("custom sizes above 8192 are rejected", () => {
    expect(() =>
      applyPagePreset(emptyAwardDocument(), "custom", { width: 100, height: 100 }, {
        width: 9000,
        height: 100,
      }),
    ).toThrow(/8192/);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/image-template/apply-page-preset.test.ts`

Expected: FAIL

- [ ] **Step 3: Implement**

`applyPagePreset`: for `original`, set page to `imageSize` (px) and identity-then-cover. For named px presets, set width/height from `sizeForPreset`. For CR80, set inches. For `custom`, require 1..8192 else throw. Then `background = applyPresetCoverFit(background, imageSize, pagePx)`.

`PageInspector`: select of `pagePresetsForKind(kind)`; custom W×H inputs for award/cert; Replace file input; `Adjust` toggle (`aria-pressed`). Labels: `ID card · portrait`, `ID card · landscape`, `16:9 HD`, `A4 landscape`, `Original image`, `Custom`.

Replace background: keep page size; `clampBackgroundFill` with `scale = coverScale` (replace file resets to cover, centered) per spec.

- [ ] **Step 4: Run to verify pass**

Same command. Expected: PASS

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(templates): page presets and adjust-background inspector"
```

---

### Task 12: Generate and ID-card PDF use `composite`

**Files:**
- Modify: `schedjuice-reimagined-fe/src/lib/image-template/composite.ts` (full paint)
- Modify: `schedjuice-reimagined-fe/src/helpers/image-editor/functions.ts`
- Create: `schedjuice-reimagined-fe/src/helpers/image-editor/generate-via-composite.test.ts`
- Modify: `schedjuice-reimagined-fe/src/lib/id-card/render-template.ts`
- Create: `schedjuice-reimagined-fe/src/lib/id-card/render-template-crop.test.ts`

**Interfaces:**
- Consumes: `certificateGraphicsToDocument`, `pagePixelSize`, `backgroundDestRect`, `idCardTemplateToDocument`
- Produces: generate data URL canvas sized to **page**, not source image; ID-card draw uses dest rect

- [ ] **Step 1: Write failing tests**

`generate-via-composite.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { certificateGraphicsToDocument } from "@/lib/image-template/adapters/certificate";
import { pagePixelSize } from "@/lib/image-template/composite";

describe("certificate generate page size", () => {
  it("uses stored page, not a 4000px source image", () => {
    const doc = certificateGraphicsToDocument({
      backgroundImageDataUrl: "https://example.com/4000x3000.png",
      page: { width: 800, height: 600, preset: "custom" },
      backgroundTransform: { offsetX: -10, offsetY: -10, scale: 1 },
      elements: [{ text: "{{name}}", x: 0, y: 0, fontSize: 12, fontFamily: "Arial" }],
    });
    expect(pagePixelSize(doc)).toEqual({ width: 800, height: 600 });
  });
});
```

`render-template-crop.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { backgroundDestRect } from "@/lib/image-template/composite";

describe("id card background crop", () => {
  it("does not stretch with drawImage(0,0,pageW,pageH) when scale is set", () => {
    const page = { width: 638, height: 1013 };
    const image = { width: 2000, height: 2000 };
    const rect = backgroundDestRect(
      { url: "u", offsetX: -100, offsetY: -50, scale: 0.6 },
      image,
      page,
    );
    expect(rect.width).toBe(1200);
    expect(rect.height).toBe(1200);
    expect(rect.x).toBe(-100);
  });
});
```

- [ ] **Step 2: Run to verify fail** (if dest rect already passes, the generate test still locks the adapter contract)

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/helpers/image-editor/generate-via-composite.test.ts src/lib/id-card/render-template-crop.test.ts`

- [ ] **Step 3: Implement**

Add `export async function compositeCertificateGraphics(graphics, csvRow)`:

1. `doc = certificateGraphicsToDocument(graphics)`
2. Map text layers through existing `parseTemplate(text, csvRow)`
3. `canvas = await composite(doc, binderFromRow)`
4. Return `canvas.toDataURL()`

Change `generateCertificates` to call `compositeCertificateGraphics` with the template’s `graphics_data` (passed in — do **not** read layer positions from the live Konva/TextElement store). Update `GenerateContainer` / generate page to pass `template.graphics_data` + `csvJsonRow`.

`renderIdCardTemplateToCanvas`: load transform from `template.background_transform[side]`; `drawImage(bg, rect.x, rect.y, rect.width, rect.height)` after `ctx.beginPath(); ctx.rect(0,0,pageW,pageH); ctx.clip()`. Prefer calling `composite(idCardTemplateToDocument(template), idCardBinder(vm), { face: side })` if the binder can supply photo/QR; otherwise dest-rect draw **must** match `backgroundDestRect` (no `drawImage(bg, 0, 0, width, height)` stretch).

- [ ] **Step 4: Run tests**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/helpers/image-editor/generate-via-composite.test.ts src/lib/id-card/render-template-crop.test.ts src/lib/image-template/adapters/certificate.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(templates): generate and ID PDF paint through the page compositor"
```

---

### Task 13: Remove Konva

**Files:**
- Delete: `schedjuice-reimagined-fe/src/components/certificate/primitives/text.tsx`
- Delete: `schedjuice-reimagined-fe/src/components/certificate/primitives/rectangle.tsx`
- Modify: `schedjuice-reimagined-fe/package.json` (remove `konva`, `react-konva`)
- Modify: `schedjuice-reimagined-fe/next.config.js` (remove webpack `canvas` external)
- Create: `schedjuice-reimagined-fe/src/lib/image-template/konva-gone.test.ts`

**Interfaces:**
- Produces: zero `from "konva"` / `from "react-konva"` under `src/`

- [ ] **Step 1: Write the failing import scan** (will fail while primitives still exist)

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return [path];
  });
}

describe("konva removal", () => {
  it("src has no konva or react-konva imports", () => {
    const root = join(process.cwd(), "src");
    const hits: string[] = [];
    for (const file of walk(root)) {
      if (!/\.(ts|tsx|js|jsx)$/.test(file)) continue;
      const text = readFileSync(file, "utf8");
      if (/from ['"]react-konva['"]|from ['"]konva['"]/.test(text)) hits.push(file);
    }
    expect(hits).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/image-template/konva-gone.test.ts`

Expected: FAIL (primitives still import `react-konva`)

- [ ] **Step 3: Delete primitives, deps, webpack external**

Confirm no other importers (`rg "react-konva|from 'konva'"`). Delete the two primitive files. Remove the two package.json dependencies. Remove:

```js
webpack: (config) => {
  config.externals = [...config.externals, { canvas: "canvas" }];
  return config;
},
```

Run `npm install` in `schedjuice-reimagined-fe` so lockfile drops Konva.

- [ ] **Step 4: Run to verify pass**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/image-template/konva-gone.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git commit -m "chore(templates): remove unused Konva from the certificate editor"
```

---

## Self-review (spec coverage)

| Spec requirement | Task |
|---|---|
| Cream Back bar, no home icon, no Home rail | 9 |
| Tokens / no zinc / light header + dark pasteboard | 9 |
| Labeled Text / Photo / Fields; cert hides Photo | 9 |
| Camera pinch/ctrl-wheel, space-pan, Fit/%, 25–400% | 7, 10 |
| Page = crop window; first place original; replace cover-fits | 3, 10, 11 |
| Named presets; ID CR80 only | 3, 11 |
| Drag + resize, no rotate; insert at view center | 7, 10 |
| English fonts, no Myanmar, Arial round-trip | 4, 6 |
| `composite` page size; generate/PDF use it | 8, 12 |
| BE scale <= 0 400; fill accepted | 2 |
| Konva gone | 13 |
| Dirty Back confirm | 9 (existing `shouldConfirmClose`) |
| Never store composites | adapters keep source artwork URL only |
