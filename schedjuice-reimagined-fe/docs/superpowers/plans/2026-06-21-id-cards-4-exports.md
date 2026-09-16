# ID Cards — Plan 4: Exports (PNG / PDF / bulk) + Admin Bulk UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Download a single badge as PNG and print-ready PDF (correct physical size), wire those into the `/id-card` page, and give admins a bulk page that generates a multi-card PDF sheet for many users.

**Architecture:** Rasterize the one `IdCardFace` SVG (images already inlined by `renderCardFaceToDataUrl`, Plan 3) to a PNG via the browser canvas at print DPI. Embed that PNG into a PDF at the exact card millimetre size using `@react-pdf/renderer` (single card = one card-sized page; bulk = a grid of cards on A4 pages). Download via the existing `downloadFile` helper, following the `payment-receipt.ts` pattern (dynamic `@react-pdf/renderer` import). Repo: `schedjuice-reimagined-fe`.

**Tech Stack:** `@react-pdf/renderer` (installed), browser `<canvas>`, TanStack Query, existing `downloadFile`. Conventions: `async-loading-states`, `no-chained-ternary`, `concise-ui-copy`.

**Spec:** `docs/superpowers/specs/2026-06-21-id-cards-design.md` (§1 exports: PDF, PNG, bulk; §6 admin bulk).
**Depends on:** Plans 2 + 3 (`renderCardFaceToDataUrl`, `buildIdCard`, `generateQrDataUrl`, `buildVerifyUrl`, dimensions).

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/id-card/file-name.ts` (NEW) | `cardFileName(name, ext)` (pure) |
| `src/lib/id-card/file-name.test.ts` (NEW) | Unit tests |
| `src/lib/id-card/raster.ts` (NEW) | `cardToPngDataUrl(vm, qr, dpi)` browser rasterizer |
| `src/components/id-card/id-card-pdf.tsx` (NEW) | Single + bulk react-pdf documents |
| `src/helpers/id-card-export.ts` (NEW) | `downloadCardPng`, `downloadCardPdf`, `downloadBulkCardsPdf` |
| `src/components/id-card/id-card-actions.tsx` (NEW) | Download PNG/PDF button group |
| `src/app/(internal)/id-card/page.tsx` | Add the actions |
| `src/app/(internal)/id-card/bulk/page.tsx` (NEW) | Admin bulk generation page |

**Run a single test:** `npm run test:unit -- src/lib/id-card/file-name.test.ts`

---

## Task 1: Filename helper (TDD)

**Files:**
- Create: `src/lib/id-card/file-name.ts`
- Test: `src/lib/id-card/file-name.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, expect, it } from "vitest";
import { cardFileName } from "./file-name";

describe("cardFileName", () => {
  it("slugifies the name and appends the extension", () => {
    expect(cardFileName("Thiri Kyaw", "png")).toBe("id-card-thiri-kyaw.png");
  });
  it("strips punctuation and collapses spaces", () => {
    expect(cardFileName("  Daw   Khin (May) ", "pdf")).toBe("id-card-daw-khin-may.pdf");
  });
  it("falls back to 'id-card' for empty names", () => {
    expect(cardFileName("", "pdf")).toBe("id-card.pdf");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- src/lib/id-card/file-name.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
export function cardFileName(name: string, ext: "png" | "pdf"): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) return `id-card.${ext}`;
  return `id-card-${slug}.${ext}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- src/lib/id-card/file-name.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/id-card/file-name.ts src/lib/id-card/file-name.test.ts
git commit -m "feat(id-card): add export filename helper"
```

---

## Task 2: PNG rasterizer

**Files:**
- Create: `src/lib/id-card/raster.ts`

Browser-only (uses `Image`/`canvas`). The SVG from `renderCardFaceToDataUrl` already has photo/logo/QR inlined, so it rasterizes without tainting the canvas.

- [ ] **Step 1: Implement**

```typescript
import { cardPixelSize, EXPORT_DPI } from "./dimensions";
import { renderCardFaceToDataUrl } from "./svg-data-url";
import type { CardViewModel } from "./types";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Rasterize the card face to a PNG data URL at print resolution. */
export async function cardToPngDataUrl(
  vm: CardViewModel,
  qrDataUrl: string,
  dpi: number = EXPORT_DPI,
): Promise<string> {
  const svgDataUrl = await renderCardFaceToDataUrl(vm, qrDataUrl);
  const { width, height } = cardPixelSize(dpi);
  const img = await loadImage(svgDataUrl);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/png");
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/id-card/raster.ts
git commit -m "feat(id-card): add PNG rasterizer"
```

---

## Task 3: react-pdf documents (single + bulk)

**Files:**
- Create: `src/components/id-card/id-card-pdf.tsx`

Each card is a high-DPI PNG placed at the exact physical size. Single = a card-sized page. Bulk = an A4 page grid (2 columns × 4 rows = 8 per page).

- [ ] **Step 1: Implement**

```tsx
import { Document, Image, Page, View, StyleSheet } from "@react-pdf/renderer";
import { CARD_MM } from "@/lib/id-card/dimensions";

const MM_TO_PT = 2.834645669;
const CARD_PT = {
  width: CARD_MM.width * MM_TO_PT,
  height: CARD_MM.height * MM_TO_PT,
};

const A4_PT = { width: 595.28, height: 841.89 };
const GRID = { cols: 2, rows: 4, gap: 18, margin: 28 };

const styles = StyleSheet.create({
  cardPage: { padding: 0 },
  fill: { width: "100%", height: "100%" },
  sheetPage: { padding: GRID.margin },
  row: { flexDirection: "row" },
  cell: { margin: GRID.gap / 2 },
});

export function IdCardSinglePdf({ pngDataUrl }: { pngDataUrl: string }) {
  return (
    <Document>
      <Page size={[CARD_PT.width, CARD_PT.height]} style={styles.cardPage}>
        <Image src={pngDataUrl} style={styles.fill} />
      </Page>
    </Document>
  );
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function IdCardBulkPdf({ pngDataUrls }: { pngDataUrls: string[] }) {
  const perPage = GRID.cols * GRID.rows;
  const cellWidth =
    (A4_PT.width - GRID.margin * 2 - GRID.gap * GRID.cols) / GRID.cols;
  const cellHeight = (cellWidth * CARD_PT.height) / CARD_PT.width;
  const pages = chunk(pngDataUrls, perPage);

  return (
    <Document>
      {pages.map((pageItems, pageIndex) => (
        <Page key={pageIndex} size="A4" style={styles.sheetPage}>
          {chunk(pageItems, GRID.cols).map((rowItems, rowIndex) => (
            <View key={rowIndex} style={styles.row}>
              {rowItems.map((src, i) => (
                <View key={i} style={[styles.cell, { width: cellWidth, height: cellHeight }]}>
                  <Image src={src} style={styles.fill} />
                </View>
              ))}
            </View>
          ))}
        </Page>
      ))}
    </Document>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/id-card/id-card-pdf.tsx
git commit -m "feat(id-card): add single + bulk PDF documents"
```

---

## Task 4: Download helpers

**Files:**
- Create: `src/helpers/id-card-export.ts`

Follows `src/helpers/payment-receipt.ts`: dynamic `@react-pdf/renderer` import, `pdf().toBlob()`, `downloadFile`.

- [ ] **Step 1: Implement**

```typescript
import { cardToPngDataUrl } from "@/lib/id-card/raster";
import { cardFileName } from "@/lib/id-card/file-name";
import type { CardViewModel } from "@/lib/id-card/types";

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(",");
  const mime = head.match(/data:(.*);base64/)?.[1] ?? "image/png";
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export async function downloadCardPng(vm: CardViewModel, qrDataUrl: string): Promise<void> {
  const { downloadFile } = await import("@/helpers/file");
  const png = await cardToPngDataUrl(vm, qrDataUrl);
  const url = URL.createObjectURL(dataUrlToBlob(png));
  try {
    downloadFile(url, cardFileName(vm.name, "png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function downloadCardPdf(vm: CardViewModel, qrDataUrl: string): Promise<void> {
  const { pdf } = await import("@react-pdf/renderer");
  const { IdCardSinglePdf } = await import("@/components/id-card/id-card-pdf");
  const { downloadFile } = await import("@/helpers/file");

  const png = await cardToPngDataUrl(vm, qrDataUrl);
  const blob = await pdf(IdCardSinglePdf({ pngDataUrl: png })).toBlob();
  const url = URL.createObjectURL(blob);
  try {
    downloadFile(url, cardFileName(vm.name, "pdf"));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export type BulkCardInput = { vm: CardViewModel; qrDataUrl: string };

export async function downloadBulkCardsPdf(items: BulkCardInput[]): Promise<void> {
  const { pdf } = await import("@react-pdf/renderer");
  const { IdCardBulkPdf } = await import("@/components/id-card/id-card-pdf");
  const { downloadFile } = await import("@/helpers/file");

  const pngDataUrls: string[] = [];
  for (const item of items) {
    // Sequential keeps peak memory low for large batches.
    pngDataUrls.push(await cardToPngDataUrl(item.vm, item.qrDataUrl));
  }
  const blob = await pdf(IdCardBulkPdf({ pngDataUrls })).toBlob();
  const url = URL.createObjectURL(blob);
  try {
    downloadFile(url, `id-cards-${items.length}.pdf`);
  } finally {
    URL.revokeObjectURL(url);
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (Confirm `downloadFile(url, filename)` signature in `src/helpers/file.tsx`; adjust the call if it differs.)

- [ ] **Step 3: Commit**

```bash
git add src/helpers/id-card-export.ts
git commit -m "feat(id-card): add PNG/PDF/bulk download helpers"
```

---

## Task 5: `IdCardActions` button group + wire into `/id-card`

**Files:**
- Create: `src/components/id-card/id-card-actions.tsx`
- Modify: `src/app/(internal)/id-card/page.tsx`

- [ ] **Step 1: Implement the actions**

```tsx
"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { downloadCardPdf, downloadCardPng } from "@/helpers/id-card-export";
import type { CardViewModel } from "@/lib/id-card/types";

type IdCardActionsProps = {
  vm: CardViewModel;
  qrDataUrl: string;
};

export function IdCardActions({ vm, qrDataUrl }: IdCardActionsProps) {
  const { toast } = useToast();
  const [pending, setPending] = useState<"png" | "pdf" | null>(null);

  async function run(kind: "png" | "pdf") {
    setPending(kind);
    try {
      if (kind === "png") await downloadCardPng(vm, qrDataUrl);
      else await downloadCardPdf(vm, qrDataUrl);
    } catch {
      toast({ title: "Download failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="default" isLoading={pending === "pdf"} disabled={pending !== null} onClick={() => run("pdf")}>
        <Download className="size-4" aria-hidden />
        Download PDF
      </Button>
      <Button variant="outline" isLoading={pending === "png"} disabled={pending !== null} onClick={() => run("png")}>
        <Download className="size-4" aria-hidden />
        Download PNG
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Add the actions to the page**

In `src/app/(internal)/id-card/page.tsx`, import and render `IdCardActions` under the stage when a `vm` exists. Replace the page body's stage block:

```tsx
import { IdCardActions } from "@/components/id-card/id-card-actions";

// ...inside IdCardPage, after the stage container:
        {vm ? (
          <div className="flex justify-center">
            <IdCardActions vm={vm} qrDataUrl={qrDataUrl} />
          </div>
        ) : null}
```

(Keep the existing `<div className="relative min-h-[70dvh] ...">` block above it. `vm`/`qrDataUrl` already come from `useIdCard()`.)

- [ ] **Step 3: Verify visually**

Run: `npm run dev` → `/id-card` → click Download PDF and Download PNG.
Expected: a single-card PDF at ~54×86mm and a PNG download; buttons show a loading state (per `async-loading-states`).

- [ ] **Step 4: Commit**

```bash
git add src/components/id-card/id-card-actions.tsx "src/app/(internal)/id-card/page.tsx"
git commit -m "feat(id-card): add download actions to /id-card"
```

---

## Task 6: Admin bulk generation page

**Files:**
- Create: `src/app/(internal)/id-card/bulk/page.tsx`

Admin picks users by search, then generates one multi-card PDF. Uses `searchEntities` + `buildIdCard` + `generateQrDataUrl`.

- [ ] **Step 1: Implement**

```tsx
"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/use-toast";
import { searchEntities } from "@/app/client-api/utils";
import { useTenant } from "@/hooks/useTenant";
import { buildIdCard } from "@/lib/id-card/build-id-card";
import { buildVerifyUrl } from "@/lib/id-card/verify-url";
import { generateQrDataUrl } from "@/lib/id-card/qr";
import { downloadBulkCardsPdf, type BulkCardInput } from "@/helpers/id-card-export";
import type { accountType } from "@/types/user";

export default function BulkIdCardPage() {
  const { tenant } = useTenant();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Record<number, accountType>>({});
  const [generating, setGenerating] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["id-card-bulk-users", search],
    queryFn: () => searchEntities("users", { search }),
  });

  const users = useMemo(
    () => (data?.data?.data ?? []) as accountType[],
    [data],
  );
  const selectedList = Object.values(selected);

  function toggle(user: accountType) {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[user.id]) delete next[user.id];
      else next[user.id] = user;
      return next;
    });
  }

  async function generate() {
    if (!tenant || selectedList.length === 0) return;
    setGenerating(true);
    try {
      const items: BulkCardInput[] = [];
      for (const account of selectedList) {
        const vm = buildIdCard(account, tenant);
        const url = buildVerifyUrl(window.location.origin, vm.verifyToken);
        const qrDataUrl = await generateQrDataUrl(url);
        items.push({ vm, qrDataUrl });
      }
      await downloadBulkCardsPdf(items);
    } catch {
      toast({ title: "Generation failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <PageContainer>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Print ID cards</h1>
            <p className="text-sm text-muted-foreground">Select people, then download a print sheet.</p>
          </div>
          <Button
            isLoading={generating}
            disabled={selectedList.length === 0 || generating}
            onClick={generate}
          >
            <Download className="size-4" aria-hidden />
            {`Download (${selectedList.length})`}
          </Button>
        </div>

        <Input
          placeholder="Search people"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="divide-y divide-border/60 rounded-xl border border-border/60" aria-busy={isLoading}>
          {users.map((user) => (
            <label key={user.id} className="flex cursor-pointer items-center gap-3 px-4 py-3">
              <Checkbox checked={Boolean(selected[user.id])} onCheckedChange={() => toggle(user)} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium text-foreground">{user.name}</span>
                <span className="truncate text-xs text-muted-foreground">{user.email}</span>
              </span>
            </label>
          ))}
          {!isLoading && users.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">No people found.</p>
          ) : null}
        </div>
      </div>
    </PageContainer>
  );
}
```

> Note: `searchEntities` results are list payloads that may omit `id_verify_token` / `id_photo_url` depending on the backend list serializer. If the search list uses `UserSearchSerializer` (lightweight), the bulk flow must fetch each selected user via `fetchEntity("users", id)` before `buildIdCard` to get the token + presigned photo. Confirm against `app_auth/serializers.py`; if needed, replace the `selectedList` loop with a per-user `fetchEntity` fetch. (`UserSerializer` returns full fields including the new ones from Plan 1.)

- [ ] **Step 2: Verify visually**

Run: `npm run dev` → `/id-card/bulk` → search, select a few, Download.
Expected: an A4 PDF with up to 8 cards per page.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(internal)/id-card/bulk/page.tsx"
git commit -m "feat(id-card): add admin bulk print page"
```

---

## Self-Review

- **Spec §1 exports PNG/PDF/bulk:** Tasks 2–4 (PNG rasterizer, single PDF, bulk PDF) + Task 5/6 wiring. ✅
- **Spec §5 single source of truth:** all exports rasterize `IdCardFace` via `renderCardFaceToDataUrl`; no second card layout. ✅
- **Spec §6 admin bulk:** Task 6 page. ✅
- **Spec §9 exporting state:** buttons use `isLoading`/`disabled` (per `async-loading-states`); toast on failure. ✅
- **Placeholder scan:** full code in every step. ✅
- **Type consistency:** `CardViewModel`, `BulkCardInput { vm, qrDataUrl }`, `cardToPngDataUrl(vm, qr, dpi)`, `cardFileName(name, ext)` consistent across tasks; `CARD_MM` reused from Plan 2. ✅
- **Risk note:** canvas export requires the photo/logo hosts to allow CORS (handled by inlining in Plan 3; on CORS failure the face degrades to monogram). Confirm `downloadFile` signature and the bulk search serializer fields as noted.
