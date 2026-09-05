# Document Editor Format Toolbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New documents always have a text block to type in, formatting lives in a top chrome toolbar (not a floating bar), and common document shortcuts (undo, block copy/paste, bold/italic) work.

**Architecture:** Backend seeds each create with a fresh-id empty text block (`new_empty_document()`). Frontend `ensureTextBlock` restores one empty text block whenever the page would be `blocks: []`. Paragraph presets stamp `fontSize`/`bold`/`italic` with no stored `style` field. A second header row hosts the format toolbar. Undo and an in-memory block clipboard live in the editor session.

**Tech Stack:** Django 4.2 + DRF, Next.js App Router, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-17-document-editor-format-toolbar-design.md`

## Global Constraints

- Pages may never stay `blocks: []`. Images-only pages are allowed. Restore text only when every top-level block is gone.
- Formatting is **block-level**. No inline runs, underline, lists, indent, custom hex, or stored `style` enum.
- Paragraph presets stamp metrics only. Picker shows Body when size/weight do not match a row.
- Toolbar is a second chrome row, always visible, **disabled** (not hidden) when selection is not a text block. Not a `role="dialog"`. Remove `TextFormatBar`.
- Native ⌘/Ctrl+C/X/V/A when caret is in INPUT/TEXTAREA/contentEditable. Block clipboard is in-memory, this tab only.
- Undo: document JSON snapshots only (not title), cap 50. Delete-last + ensure is one undo step.
- BE tests: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh <target>` (always `--keepdb --noinput`).
- FE tests: `cd schedjuice-reimagined-fe && npm run test:unit -- <path>`
- High-value tests only. No happy-path-only “renders” smoke.
- Do not touch the Railway/dev database.
- Two git repos: commit BE files in `schedjuice-reimagined-be`, FE files in `schedjuice-reimagined-fe`.
- Do not mix the unrelated TokenUser document 500 fix into these commits if it is still uncommitted.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `schedjuice-reimagined-be/app_documents/document.py` | Modify | `starter_text_block()`, `new_empty_document()` |
| `schedjuice-reimagined-be/app_documents/services.py` | Modify | Create uses `new_empty_document()` |
| `schedjuice-reimagined-be/app_documents/tests/test_document.py` | Modify | Unique ids + one empty text block |
| `schedjuice-reimagined-be/app_documents/tests/test_api.py` | Modify | Two creates do not share block ids |
| `schedjuice-reimagined-fe/src/lib/document-template/types.ts` | Modify | Optional `bold` / `italic` on `TextBlock` |
| `schedjuice-reimagined-fe/src/lib/document-template/insert.ts` | Modify | Default text includes bold/italic false; export `findBlock` |
| `schedjuice-reimagined-fe/src/lib/document-template/empty.ts` | Modify | `emptyDocument` seeds text; `ensureTextBlock` |
| `schedjuice-reimagined-fe/src/lib/document-template/empty.test.ts` | Create | Empty vs image-only |
| `schedjuice-reimagined-fe/src/lib/document-template/insert.test.ts` | Modify | Last-block remove + ensure |
| `schedjuice-reimagined-fe/src/lib/document-template/paragraph.ts` | Create | Presets, match, stamp, colors, sizes |
| `schedjuice-reimagined-fe/src/lib/document-template/paragraph.test.ts` | Create | Heading 1 stamp, no `style` |
| `schedjuice-reimagined-fe/src/lib/document-template/history.ts` | Create | Undo/redo stack cap 50 |
| `schedjuice-reimagined-fe/src/lib/document-template/history.test.ts` | Create | Undo last-block delete |
| `schedjuice-reimagined-fe/src/lib/document-template/clipboard.ts` | Create | Clone ids, paste rules |
| `schedjuice-reimagined-fe/src/lib/document-template/clipboard.test.ts` | Create | Column sibling vs page-level paste |
| `schedjuice-reimagined-fe/src/lib/document-template/editor-shortcuts.ts` | Create | Pure key resolver |
| `schedjuice-reimagined-fe/src/lib/document-template/editor-shortcuts.test.ts` | Create | Textarea copy skipped; B/I/Z |
| `schedjuice-reimagined-fe/src/components/document-editor/document-format-toolbar.tsx` | Create | Chrome format row |
| `schedjuice-reimagined-fe/src/components/document-editor/document-format-toolbar.test.tsx` | Create | Disabled when no text; not a dialog |
| `schedjuice-reimagined-fe/src/components/document-editor/document-editor-shell.tsx` | Modify | `formatBar` slot under header |
| `schedjuice-reimagined-fe/src/components/document-editor/document-page.tsx` | Modify | Controlled selection; drop floating bar + empty copy; bold/italic styles |
| `schedjuice-reimagined-fe/src/components/document-editor/document-editor.tsx` | Modify | Load ensure + dirty; toolbar; history; shortcuts |

---

### Task 1: Seed create with a unique empty text block

**Files:**
- Modify: `schedjuice-reimagined-be/app_documents/document.py`
- Modify: `schedjuice-reimagined-be/app_documents/services.py`
- Modify: `schedjuice-reimagined-be/app_documents/tests/test_document.py`
- Modify: `schedjuice-reimagined-be/app_documents/tests/test_api.py`

**Interfaces:**
- Consumes: existing `EMPTY_DOCUMENT` page shape (`version: 1`, A4 portrait mm)
- Produces: `starter_text_block() -> dict`, `new_empty_document() -> dict`

Do **not** put a starter block on the module-level `EMPTY_DOCUMENT` constant — a shared `id` would leak across creates. Keep `EMPTY_DOCUMENT` as the page shell with `"blocks": []` for validator tests that replace `blocks`. Production create calls `new_empty_document()`.

- [ ] **Step 1: Write the failing unit tests**

Add to `test_document.py`:

```python
from app_documents.document import (
    EMPTY_DOCUMENT,
    new_empty_document,
    next_untitled_name,
    validate_document,
)


class NewEmptyDocumentTests(SimpleTestCase):
    def test_one_empty_text_block_with_unique_ids(self):
        a = new_empty_document()
        b = new_empty_document()
        self.assertEqual(len(a["blocks"]), 1)
        block = a["blocks"][0]
        self.assertEqual(block["type"], "text")
        self.assertEqual(block["text"], "")
        self.assertEqual(block["align"], "left")
        self.assertEqual(block["fontFamily"], "Noto Sans")
        self.assertEqual(block["fontSize"], 12)
        self.assertEqual(block["color"], "#111111")
        self.assertFalse(block["bold"])
        self.assertFalse(block["italic"])
        self.assertNotEqual(block["id"], b["blocks"][0]["id"])
        validate_document(a)
```

Add to `DocumentTemplateApiTests` in `test_api.py` (after the existing create helpers):

```python
    def test_two_creates_do_not_share_starter_block_id(self):
        with schema_context(self.schema_name):
            first = self._client(self.admin).post(
                f"{self.api_prefix}/document-templates",
                {"scope": "org"},
                format="json",
            )
            second = self._client(self.admin).post(
                f"{self.api_prefix}/document-templates",
                {"scope": "org"},
                format="json",
            )
        self.assertEqual(first.status_code, 201, first.content)
        self.assertEqual(second.status_code, 201, second.content)
        blocks_a = first.json()["data"]["document"]["blocks"]
        blocks_b = second.json()["data"]["document"]["blocks"]
        self.assertEqual(len(blocks_a), 1)
        self.assertEqual(blocks_a[0]["type"], "text")
        self.assertEqual(blocks_a[0]["text"], "")
        self.assertNotEqual(blocks_a[0]["id"], blocks_b[0]["id"])
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_documents.tests.test_document.NewEmptyDocumentTests
```

Expected: FAIL (`new_empty_document` not defined).

- [ ] **Step 3: Implement `starter_text_block` / `new_empty_document` and use them on create**

In `document.py`:

```python
import uuid

def starter_text_block() -> dict:
    return {
        "id": str(uuid.uuid4()),
        "type": "text",
        "text": "",
        "align": "left",
        "fontFamily": "Noto Sans",
        "fontSize": 12,
        "color": "#111111",
        "bold": False,
        "italic": False,
    }


def new_empty_document() -> dict:
    return {
        "version": 1,
        "page": {"preset": "a4_portrait", "width": 210, "height": 297, "unit": "mm"},
        "blocks": [starter_text_block()],
    }
```

Keep existing `EMPTY_DOCUMENT` with `"blocks": []`. Do not require non-empty `blocks` in `validate_document` (saved empty drafts still load).

In `create_document_template` (`services.py`):

```python
from app_documents.document import new_empty_document, next_untitled_name, validate_document
```

Replace `document=dict(EMPTY_DOCUMENT)` with `document=new_empty_document()`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_documents.tests.test_document app_documents.tests.test_api
```

Expected: PASS (including the new unique-id cases).

- [ ] **Step 5: Commit (BE repo only)**

```bash
cd schedjuice-reimagined-be
git add app_documents/document.py app_documents/services.py app_documents/tests/test_document.py app_documents/tests/test_api.py
git commit -m "feat: seed new documents with a unique empty text block"
```

---

### Task 2: `ensureTextBlock` and never-empty page helpers

**Files:**
- Modify: `schedjuice-reimagined-fe/src/lib/document-template/types.ts`
- Modify: `schedjuice-reimagined-fe/src/lib/document-template/insert.ts`
- Modify: `schedjuice-reimagined-fe/src/lib/document-template/empty.ts`
- Create: `schedjuice-reimagined-fe/src/lib/document-template/empty.test.ts`
- Modify: `schedjuice-reimagined-fe/src/lib/document-template/insert.test.ts`

**Interfaces:**
- Consumes: `BlockDocument`, `defaultTextBlock()`
- Produces:

```ts
export type EnsureTextBlockResult = {
  document: BlockDocument;
  injected: boolean;
};

export function ensureTextBlock(doc: BlockDocument): EnsureTextBlockResult;
export function findBlock(
  document: BlockDocument,
  id: string | null,
): DocumentBlock | ColumnChild | null;
export function findFirstTextBlockId(document: BlockDocument): string | null;
```

- [ ] **Step 1: Write the failing tests**

`empty.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { asBlockDocument, emptyDocument, ensureTextBlock } from "./empty";
import { defaultImageBlock } from "./insert";

describe("ensureTextBlock", () => {
  it("injects one empty text block into an empty page", () => {
    const { document, injected } = ensureTextBlock({
      version: 1,
      page: { preset: "a4_portrait", width: 210, height: 297, unit: "mm" },
      blocks: [],
    });
    expect(injected).toBe(true);
    expect(document.blocks).toHaveLength(1);
    expect(document.blocks[0]).toMatchObject({
      type: "text",
      text: "",
      fontSize: 12,
      bold: false,
      italic: false,
    });
  });

  it("leaves an image-only document unchanged", () => {
    const image = defaultImageBlock();
    const source = {
      version: 1 as const,
      page: { preset: "a4_portrait" as const, width: 210, height: 297, unit: "mm" as const },
      blocks: [image],
    };
    const { document, injected } = ensureTextBlock(source);
    expect(injected).toBe(false);
    expect(document.blocks).toEqual([image]);
  });
});

describe("asBlockDocument", () => {
  it("does not inject while parsing an empty saved draft", () => {
    const parsed = asBlockDocument({
      version: 1,
      page: { preset: "a4_portrait", width: 210, height: 297, unit: "mm" },
      blocks: [],
    });
    expect(parsed.blocks).toEqual([]);
  });
});

describe("emptyDocument", () => {
  it("starts with one empty text block", () => {
    const doc = emptyDocument();
    expect(doc.blocks).toHaveLength(1);
    expect(doc.blocks[0]?.type).toBe("text");
  });
});
```

Add to `insert.test.ts`:

```ts
import { ensureTextBlock } from "./empty";
import { insertBlock, removeBlock } from "./insert";

describe("removeBlock + ensureTextBlock", () => {
  it("restores one text block after deleting the last top-level block", () => {
    const only = {
      version: 1 as const,
      page: {
        preset: "a4_portrait" as const,
        width: 210,
        height: 297,
        unit: "mm" as const,
      },
      blocks: [{ ...defaultTextBlock(), id: "only" }],
    };
    const { document, injected } = ensureTextBlock(removeBlock(only, "only"));
    expect(injected).toBe(true);
    expect(document.blocks).toHaveLength(1);
    expect(document.blocks[0]?.type).toBe("text");
    expect(document.blocks[0]?.id).not.toBe("only");
  });

  it("does not insert page text when a column child is deleted", () => {
    const page = emptyDocument();
    const withColumns = insertBlock(page, "columns");
    const columnsId = withColumns.blocks.find((block) => block.type === "columns")?.id;
    const child = { ...defaultTextBlock(), id: "col-child" };
    const withChild = insertColumnChild(withColumns, columnsId!, 0, child);
    const { document, injected } = ensureTextBlock(
      removeBlock(withChild, "col-child"),
    );
    expect(injected).toBe(false);
    expect(document.blocks.some((block) => block.type === "columns")).toBe(true);
  });
});
```

Import `defaultTextBlock` and `insertColumnChild` in that test file.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/lib/document-template/empty.test.ts src/lib/document-template/insert.test.ts
```

Expected: FAIL (`ensureTextBlock` not defined / empty page still `[]`).

- [ ] **Step 3: Implement types, defaults, `ensureTextBlock`, `findBlock`**

`types.ts` — add to `TextBlock`:

```ts
  bold?: boolean;
  italic?: boolean;
```

`insert.ts` — `defaultTextBlock`:

```ts
export function defaultTextBlock(): TextBlock {
  return {
    id: newId(),
    type: "text",
    text: "",
    align: "left",
    fontFamily: "Noto Sans",
    fontSize: 12,
    color: "#111111",
    bold: false,
    italic: false,
  };
}
```

Export `findBlock` and `findFirstTextBlockId` from `insert.ts` (move the walk currently private in `document-page.tsx`):

```ts
export function findBlock(
  document: BlockDocument,
  id: string | null,
): DocumentBlock | ColumnChild | null {
  if (!id) return null;
  for (const block of document.blocks) {
    if (block.id === id) return block;
    if (block.type === "columns") {
      for (const child of [...block.columns[0], ...block.columns[1]]) {
        if (child.id === id) return child;
      }
    }
  }
  return null;
}

export function findFirstTextBlockId(document: BlockDocument): string | null {
  for (const block of document.blocks) {
    if (block.type === "text") return block.id;
    if (block.type === "columns") {
      for (const child of [...block.columns[0], ...block.columns[1]]) {
        if (child.type === "text") return child.id;
      }
    }
  }
  return null;
}
```

`empty.ts`:

```ts
import { defaultTextBlock } from "./insert";
import type { BlockDocument } from "./types";

export function emptyDocument(): BlockDocument {
  return {
    version: 1,
    page: { preset: "a4_portrait", width: 210, height: 297, unit: "mm" },
    blocks: [defaultTextBlock()],
  };
}

export function asBlockDocument(raw: unknown): BlockDocument {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return emptyDocument();
  }
  const rec = raw as Partial<BlockDocument>;
  if (rec.version !== 1 || !rec.page || !Array.isArray(rec.blocks)) {
    return emptyDocument();
  }
  return {
    version: 1,
    page: {
      preset: rec.page.preset ?? "a4_portrait",
      width: Number(rec.page.width) || 210,
      height: Number(rec.page.height) || 297,
      unit: "mm",
    },
    blocks: rec.blocks,
  };
}

export type EnsureTextBlockResult = {
  document: BlockDocument;
  injected: boolean;
};

export function ensureTextBlock(doc: BlockDocument): EnsureTextBlockResult {
  if (doc.blocks.length > 0) return { document: doc, injected: false };
  return { document: { ...doc, blocks: [defaultTextBlock()] }, injected: true };
}
```

`insert.test.ts` existing grades_table case uses `emptyDocument()` then inserts — table is still `blocks.at(-1)`. Keep that assertion.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/lib/document-template/empty.test.ts src/lib/document-template/insert.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit (FE repo)**

```bash
cd schedjuice-reimagined-fe
git add src/lib/document-template/types.ts src/lib/document-template/insert.ts src/lib/document-template/empty.ts src/lib/document-template/empty.test.ts src/lib/document-template/insert.test.ts
git commit -m "feat: restore an empty text block when a document page is empty"
```

---

### Task 3: Paragraph preset stamp (no `style` field)

**Files:**
- Create: `schedjuice-reimagined-fe/src/lib/document-template/paragraph.ts`
- Create: `schedjuice-reimagined-fe/src/lib/document-template/paragraph.test.ts`

**Interfaces:**
- Consumes: `TextBlock`
- Produces:

```ts
export const FONT_SIZE_OPTIONS = [10, 11, 12, 14, 16, 18, 22, 28, 36] as const;
export const TEXT_COLOR_SWATCHES = ["#111111", "#6b7280", "#2f6e58", "#b91c1c"] as const;
export type ParagraphPresetId = "title" | "heading1" | "subheading" | "body";
export function matchParagraphPreset(block: TextBlock): ParagraphPresetId;
export function stampParagraphPreset(block: TextBlock, id: ParagraphPresetId): TextBlock;
```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { defaultTextBlock } from "./insert";
import { matchParagraphPreset, stampParagraphPreset } from "./paragraph";

describe("stampParagraphPreset", () => {
  it("Heading 1 stamps 22pt bold and does not write style", () => {
    const next = stampParagraphPreset(defaultTextBlock(), "heading1");
    expect(next.fontSize).toBe(22);
    expect(next.bold).toBe(true);
    expect(next.italic).toBe(false);
    expect(next).not.toHaveProperty("style");
  });

  it("keeps an existing font family", () => {
    const block = { ...defaultTextBlock(), fontFamily: "Georgia", italic: true };
    const next = stampParagraphPreset(block, "title");
    expect(next.fontFamily).toBe("Georgia");
    expect(next.fontSize).toBe(28);
    expect(next.bold).toBe(true);
    expect(next.italic).toBe(false);
  });

  it("uses Noto Sans when fontFamily is unset", () => {
    const block = defaultTextBlock();
    delete block.fontFamily;
    const next = stampParagraphPreset(block, "body");
    expect(next.fontFamily).toBe("Noto Sans");
  });
});

describe("matchParagraphPreset", () => {
  it("treats unmatched size as Body without changing the block", () => {
    const block = { ...defaultTextBlock(), fontSize: 18, bold: false };
    expect(matchParagraphPreset(block)).toBe("body");
  });

  it("matches Title by 28pt + bold even if italic is on", () => {
    const block = { ...defaultTextBlock(), fontSize: 28, bold: true, italic: true };
    expect(matchParagraphPreset(block)).toBe("title");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/lib/document-template/paragraph.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement `paragraph.ts`**

```ts
import type { TextBlock } from "./types";

export const FONT_SIZE_OPTIONS = [10, 11, 12, 14, 16, 18, 22, 28, 36] as const;
export const TEXT_COLOR_SWATCHES = [
  "#111111",
  "#6b7280",
  "#2f6e58",
  "#b91c1c",
] as const;

export type ParagraphPresetId = "title" | "heading1" | "subheading" | "body";

const PRESETS: Record<
  ParagraphPresetId,
  { fontSize: number; bold: boolean; italic: boolean }
> = {
  title: { fontSize: 28, bold: true, italic: false },
  heading1: { fontSize: 22, bold: true, italic: false },
  subheading: { fontSize: 16, bold: false, italic: false },
  body: { fontSize: 12, bold: false, italic: false },
};

export function matchParagraphPreset(block: TextBlock): ParagraphPresetId {
  const size = block.fontSize ?? 12;
  const bold = Boolean(block.bold);
  const ids: ParagraphPresetId[] = ["title", "heading1", "subheading", "body"];
  for (const id of ids) {
    const preset = PRESETS[id];
    if (preset.fontSize === size && preset.bold === bold) return id;
  }
  return "body";
}

export function stampParagraphPreset(
  block: TextBlock,
  id: ParagraphPresetId,
): TextBlock {
  const preset = PRESETS[id];
  return {
    ...block,
    fontFamily: block.fontFamily ?? "Noto Sans",
    fontSize: preset.fontSize,
    bold: preset.bold,
    italic: preset.italic,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/lib/document-template/paragraph.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/lib/document-template/paragraph.ts src/lib/document-template/paragraph.test.ts
git commit -m "feat: stamp document paragraph presets without a style field"
```

---

### Task 4: Format toolbar chrome (remove floating bar)

**Files:**
- Create: `schedjuice-reimagined-fe/src/components/document-editor/document-format-toolbar.tsx`
- Create: `schedjuice-reimagined-fe/src/components/document-editor/document-format-toolbar.test.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/document-editor/document-editor-shell.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/document-editor/document-page.tsx`

**Interfaces:**
- Consumes: `stampParagraphPreset`, `matchParagraphPreset`, `CANVAS_FONT_ALLOWLIST`, `FONT_SIZE_OPTIONS`, `TEXT_COLOR_SWATCHES`
- Produces: `DocumentFormatToolbar({ block, onChange })`; `DocumentEditorShell` optional `formatBar?: ReactNode`. Editor wiring of `selectedId` + `formatBar` is Task 5.

- [ ] **Step 1: Write the failing toolbar tests**

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultTextBlock } from "@/lib/document-template/insert";
import { DocumentFormatToolbar } from "./document-format-toolbar";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("DocumentFormatToolbar", () => {
  it("is not a dialog", () => {
    render(
      <DocumentFormatToolbar block={defaultTextBlock()} onChange={vi.fn()} />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("disables Bold when no text block is selected", () => {
    render(<DocumentFormatToolbar block={null} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Bold" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Italic" })).toBeDisabled();
  });

  it("Bold click stamps bold true on the selected text block", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const block = defaultTextBlock();
    render(<DocumentFormatToolbar block={block} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Bold" }));
    expect(onChange).toHaveBeenCalledWith({ ...block, bold: true });
    expect(onChange.mock.calls[0][0]).not.toHaveProperty("style");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/components/document-editor/document-format-toolbar.test.tsx
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement toolbar, shell slot, page styles; delete `TextFormatBar`**

`document-format-toolbar.tsx` — light-theme row, `Select` size `"compact"`:

- Paragraph: items Title / Heading 1 / Subheading / Body; `aria-label="Paragraph"`; `value={block ? matchParagraphPreset(block) : "body"}`; `onValueChange` → `stampParagraphPreset`.
- Font: `CANVAS_FONT_ALLOWLIST`; `aria-label="Font family"`.
- Size: `FONT_SIZE_OPTIONS` as strings; `aria-label="Font size"`.
- Bold / Italic buttons (`aria-label="Bold"` / `"Italic"`, `aria-pressed`).
- Four color buttons `aria-label={`Text color ${hex}`}` with `backgroundColor: hex`.
- Align left/center/right (`aria-label="Align left"` etc).
- When `block` is null: every control `disabled`, `onChange` never fires.

Shell: add `formatBar?: ReactNode`. Render it as a second `data-theme="light"` row under the Back/title/Save header, `border-b border-border bg-surface px-3 py-1.5`.

`document-page.tsx`:

- Delete `TextFormatBar` and its call site.
- Delete the `Start writing…` empty copy (`blocks.length === 0` branch).
- Import `findBlock` from `@/lib/document-template/insert` and delete the local copy.
- `TextBlockView` style:

```ts
    fontWeight: block.bold ? 700 : 400,
    fontStyle: block.italic ? "italic" : "normal",
```

Do not wire `formatBar` in `document-editor.tsx` yet (Task 5). After this task the floating bar is gone and the shell can render a toolbar slot; formatting returns when Task 5 passes `formatBar`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/components/document-editor/document-format-toolbar.test.tsx src/components/document-editor/document-editor-shell.test.tsx src/lib/document-template/paragraph.test.ts
```

Expected: PASS. Existing shell Back-confirm tests still pass.

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/components/document-editor/document-format-toolbar.tsx src/components/document-editor/document-format-toolbar.test.tsx src/components/document-editor/document-editor-shell.tsx src/components/document-editor/document-page.tsx
git commit -m "feat: add a document format toolbar slot and drop the floating bar"
```

---

### Task 5: Load inject marks dirty; select first text block; delete uses ensure

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/document-editor/document-editor.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/document-editor/document-page.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/document-editor/document-editor-shell.tsx` (only if `formatBar` is not already plumbed)

**Interfaces:**
- Consumes: `asBlockDocument`, `ensureTextBlock`, `findFirstTextBlockId`, `findBlock`, `replaceBlock`, `removeBlock`, `DocumentFormatToolbar`
- Produces: `applyDocument(next)` that always runs `ensureTextBlock`; load sets `dirty` when `injected`; `formatBar` receives the selected text block

Task 2 already covers inject math. This task wires the editor. Do not add a QueryClient page test.

- [ ] **Step 1: Lift selection and wrap document writes**

In `DocumentEditor`:

```ts
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const applyDocument = (next: BlockDocument) => {
    const { document: ensured, injected } = ensureTextBlock(next);
    setDocument(ensured);
    setDirty(true);
    if (injected) {
      setSelectedId(ensured.blocks[0]?.id ?? null);
    }
  };
```

On `query.data` load (replace the current `setDocument(asBlockDocument(...)); setDirty(false)`):

```ts
    const parsed = asBlockDocument(query.data.document);
    const { document: ensured, injected } = ensureTextBlock(parsed);
    setDocument(ensured);
    setDirty(injected);
    setSelectedId(
      findFirstTextBlockId(ensured) ?? ensured.blocks[0]?.id ?? null,
    );
```

Same pattern in save/publish `onSuccess` **except** `setDirty(false)` and do not treat inject as dirty after a successful save (server should already have the block if they saved). If save round-trips empty `[]`, inject + `setDirty(true)` is correct.

Pass into `DocumentPage`: `selectedId`, `onSelect={setSelectedId}`, `onChange={applyDocument}`.

Pass into `DocumentEditorShell`:

```tsx
      formatBar={
        <DocumentFormatToolbar
          block={selected?.type === "text" ? selected : null}
          onChange={(next) => {
            if (!document) return;
            applyDocument(replaceBlock(document, next));
          }}
        />
      }
```

where `selected = findBlock(document, selectedId)`.

`DocumentPage`: remove internal `selectedId` state. Delete/Backspace and trash call `onChange(removeBlock(...))` (parent ensures). After a non-inject delete, `onSelect(null)` unless the removed id was not selected.

Remove the page-level Delete/Backspace listener here — Task 7 owns all shortcuts. Until Task 7 lands, **keep** the existing Delete/Backspace handler but route it through `onChange(removeBlock(...))` so ensure still runs.

- [ ] **Step 2: Run related unit tests**

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/lib/document-template/empty.test.ts src/lib/document-template/insert.test.ts src/components/document-editor/document-format-toolbar.test.tsx src/components/document-editor/document-editor-shell.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/components/document-editor/document-editor.tsx src/components/document-editor/document-page.tsx
git commit -m "feat: wire the format toolbar and inject text on empty load"
```

---

### Task 6: Undo / redo stack

**Files:**
- Create: `schedjuice-reimagined-fe/src/lib/document-template/history.ts`
- Create: `schedjuice-reimagined-fe/src/lib/document-template/history.test.ts`
- Modify: `schedjuice-reimagined-fe/src/components/document-editor/document-editor.tsx`

**Interfaces:**
- Consumes: `BlockDocument`, `ensureTextBlock`, `removeBlock`
- Produces:

```ts
export const HISTORY_CAP = 50;
export type DocumentHistory = { past: BlockDocument[]; future: BlockDocument[] };
export function emptyHistory(): DocumentHistory;
export function commitChange(history: DocumentHistory, current: BlockDocument): DocumentHistory;
export function undo(history: DocumentHistory, current: BlockDocument): { history: DocumentHistory; document: BlockDocument } | null;
export function redo(history: DocumentHistory, current: BlockDocument): { history: DocumentHistory; document: BlockDocument } | null;
```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { emptyDocument, ensureTextBlock } from "./empty";
import {
  HISTORY_CAP,
  commitChange,
  emptyHistory,
  redo,
  undo,
} from "./history";
import { defaultTextBlock, removeBlock } from "./insert";

describe("document history", () => {
  it("undo after deleting the last block restores that block, not the injected empty one", () => {
    const original = {
      ...emptyDocument(),
      blocks: [{ ...defaultTextBlock(), id: "keep-me", text: "Hello" }],
    };
    const afterDelete = ensureTextBlock(removeBlock(original, "keep-me")).document;
    const history = commitChange(emptyHistory(), original);
    const undone = undo(history, afterDelete);
    expect(undone).not.toBeNull();
    expect(undone!.document.blocks).toHaveLength(1);
    expect(undone!.document.blocks[0]).toMatchObject({ id: "keep-me", text: "Hello" });
  });

  it("undo at the bottom is a no-op", () => {
    expect(undo(emptyHistory(), emptyDocument())).toBeNull();
  });

  it("caps past at 50", () => {
    let history = emptyHistory();
    let current = emptyDocument();
    for (let i = 0; i < HISTORY_CAP + 5; i += 1) {
      history = commitChange(history, current);
      current = { ...current, blocks: [{ ...defaultTextBlock(), text: String(i) }] };
    }
    expect(history.past).toHaveLength(HISTORY_CAP);
  });

  it("redo after undo restores the post-delete ensured document", () => {
    const original = {
      ...emptyDocument(),
      blocks: [{ ...defaultTextBlock(), id: "keep-me", text: "Hello" }],
    };
    const afterDelete = ensureTextBlock(removeBlock(original, "keep-me")).document;
    const undone = undo(commitChange(emptyHistory(), original), afterDelete);
    const redone = redo(undone!.history, undone!.document);
    expect(redone).not.toBeNull();
    expect(redone!.document.blocks[0]?.id).toBe(afterDelete.blocks[0]?.id);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/lib/document-template/history.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement history and wire `applyDocument`**

`history.ts` — `structuredClone` snapshots. `commitChange` pushes `current` onto `past`, clears `future`, slices `past` to `HISTORY_CAP`. `undo`/`redo` return `null` when the stack is empty.

In `DocumentEditor`, hold `history` in `useRef<DocumentHistory>` so keydown (Task 7) sees the latest. `applyDocument`:

```ts
    historyRef.current = commitChange(historyRef.current, document);
    // then ensure + setDocument as today
```

Do **not** commit on load or on undo/redo apply. Reset `historyRef` to `emptyHistory()` on `query.data` load.

Undo apply: `const result = undo(historyRef.current, document); if (!result) return; historyRef.current = result.history; setDocument(result.document); setDirty(true);`

- [ ] **Step 4: Run tests**

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/lib/document-template/history.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/lib/document-template/history.ts src/lib/document-template/history.test.ts src/components/document-editor/document-editor.tsx
git commit -m "feat: add a session undo stack for document edits"
```

---

### Task 7: Block clipboard and shortcuts

**Files:**
- Create: `schedjuice-reimagined-fe/src/lib/document-template/clipboard.ts`
- Create: `schedjuice-reimagined-fe/src/lib/document-template/clipboard.test.ts`
- Create: `schedjuice-reimagined-fe/src/lib/document-template/editor-shortcuts.ts`
- Create: `schedjuice-reimagined-fe/src/lib/document-template/editor-shortcuts.test.ts`
- Modify: `schedjuice-reimagined-fe/src/components/document-editor/document-editor.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/document-editor/document-page.tsx`

**Interfaces:**
- Consumes: `findBlock`, `ensureTextBlock`, `removeBlock`, `replaceBlock`, history helpers
- Produces:

```ts
export function isTypingTarget(target: EventTarget | null): boolean;
export function cloneBlockWithNewIds<T extends DocumentBlock | ColumnChild>(block: T): T;
export function pasteBlock(
  document: BlockDocument,
  selectedId: string | null,
  copied: DocumentBlock | ColumnChild,
): BlockDocument;

export type EditorShortcutAction =
  | { type: "copy" }
  | { type: "cut" }
  | { type: "paste" }
  | { type: "delete" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "save" }
  | { type: "toggleBold" }
  | { type: "toggleItalic" };

export function resolveEditorShortcut(
  event: {
    key: string;
    metaKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
    target: EventTarget | null;
  },
  ctx: { hasSelection: boolean; hasClipboard: boolean; titleFocused: boolean },
): EditorShortcutAction | null;
```

Paste rules (spec):

- Selection is a **child inside columns** and copied item is `text` or `image` → insert as next sibling in that column (new id).
- Otherwise insert after the selected **top-level** block, or append if nothing is selected.
- Copied `columns` / `grades_table` never insert inside a column.

- [ ] **Step 1: Write the failing tests**

`clipboard.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { pasteBlock } from "./clipboard";
import { emptyDocument } from "./empty";
import {
  defaultImageBlock,
  defaultTextBlock,
  insertBlock,
  insertColumnChild,
} from "./insert";

describe("pasteBlock", () => {
  it("pastes text as the next sibling inside a column", () => {
    let doc = insertBlock(emptyDocument(), "columns");
    const columns = doc.blocks.find((block) => block.type === "columns")!;
    const child = defaultTextBlock();
    doc = insertColumnChild(doc, columns.id, 0, { ...child, id: "c1", text: "A" });
    const next = pasteBlock(doc, "c1", { ...defaultTextBlock(), text: "B" });
    const cols = next.blocks.find((block) => block.type === "columns");
    expect(cols?.type).toBe("columns");
    if (cols?.type !== "columns") return;
    expect(cols.columns[0]).toHaveLength(2);
    expect(cols.columns[0][1]?.type).toBe("text");
    expect(cols.columns[0][1]?.id).not.toBe("c1");
  });

  it("pastes a columns block at page level even when a column child is selected", () => {
    let doc = insertBlock(emptyDocument(), "columns");
    const columns = doc.blocks.find((block) => block.type === "columns")!;
    doc = insertColumnChild(doc, columns.id, 0, { ...defaultTextBlock(), id: "c1" });
    const copied = insertBlock(emptyDocument(), "columns").blocks.find(
      (block) => block.type === "columns",
    )!;
    const next = pasteBlock(doc, "c1", copied);
    expect(next.blocks.filter((block) => block.type === "columns")).toHaveLength(2);
    expect(next.blocks.some((block) => block.id === copied.id)).toBe(false);
  });
});
```

`editor-shortcuts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveEditorShortcut } from "./editor-shortcuts";

function textarea() {
  const el = document.createElement("textarea");
  document.body.appendChild(el);
  return el;
}

describe("resolveEditorShortcut", () => {
  it("does not handle copy when a textarea is focused", () => {
    const action = resolveEditorShortcut(
      { key: "c", metaKey: true, ctrlKey: false, shiftKey: false, target: textarea() },
      { hasSelection: true, hasClipboard: false, titleFocused: false },
    );
    expect(action).toBeNull();
  });

  it("copies a selected block when focus is not a text field", () => {
    const action = resolveEditorShortcut(
      { key: "c", metaKey: true, ctrlKey: false, shiftKey: false, target: document.body },
      { hasSelection: true, hasClipboard: false, titleFocused: false },
    );
    expect(action).toEqual({ type: "copy" });
  });

  it("does not toggle bold while the title field is focused", () => {
    const input = document.createElement("input");
    input.setAttribute("aria-label", "Template name");
    const action = resolveEditorShortcut(
      { key: "b", metaKey: true, ctrlKey: false, shiftKey: false, target: input },
      { hasSelection: true, hasClipboard: false, titleFocused: true },
    );
    expect(action).toBeNull();
  });

  it("toggles bold from a text-block textarea", () => {
    const action = resolveEditorShortcut(
      { key: "b", metaKey: true, ctrlKey: false, shiftKey: false, target: textarea() },
      { hasSelection: true, hasClipboard: false, titleFocused: false },
    );
    expect(action).toEqual({ type: "toggleBold" });
  });

  it("paste with an empty buffer is a no-op", () => {
    const action = resolveEditorShortcut(
      { key: "v", metaKey: true, ctrlKey: false, shiftKey: false, target: document.body },
      { hasSelection: true, hasClipboard: false, titleFocused: false },
    );
    expect(action).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/lib/document-template/clipboard.test.ts src/lib/document-template/editor-shortcuts.test.ts
```

Expected: FAIL (modules not found).

- [ ] **Step 3: Implement clipboard, shortcuts, and the editor listener**

`isTypingTarget`: `INPUT` / `TEXTAREA` / `isContentEditable`.

`cloneBlockWithNewIds`: new `id`; if `columns`, new ids on every child too.

`pasteBlock`: locate selection with a column walk (export a small `findColumnChildLocation` from `clipboard.ts` if it keeps `insert.ts` smaller). Insert cloned block per the rules above.

`resolveEditorShortcut`:

- `mod = metaKey || ctrlKey`
- If typing target: ignore `c`/`x`/`v`/`a` and Delete/Backspace; still handle `s`, `z` / Shift+`z`, and `b`/`i` unless `titleFocused`
- If not typing and `hasSelection`: `c` copy, `x` cut, Delete/Backspace delete
- `v` paste only when `hasClipboard`
- `s` save, `z` undo, Shift+`z` redo
- Return null for everything else

`DocumentEditor` window `keydown`:

```ts
    const action = resolveEditorShortcut(event, {
      hasSelection: Boolean(selectedId),
      hasClipboard: Boolean(clipboardRef.current),
      titleFocused:
        (event.target as HTMLElement | null)?.getAttribute("aria-label") ===
        "Template name",
    });
    if (!action) return;
    event.preventDefault();
    // dispatch: copy/cut/paste/delete/undo/redo/save/toggleBold/toggleItalic
```

Copy: `clipboardRef.current = findBlock(document, selectedId)` (structured clone, keep ids until paste clones).

Cut: copy, then `applyDocument(removeBlock(document, selectedId))`.

Paste: `applyDocument(pasteBlock(document, selectedId, clipboardRef.current))` then select the new block id if cheap (optional: leave selection on original).

Delete: same as cut without copying.

Toggle B/I: if `findBlock` is text, `replaceBlock` with flipped flag.

Keep existing ⌘S save; fold it into this listener so it is not registered twice.

Remove `DocumentPage`’s Delete/Backspace `useEffect`.

Do **not** write to `navigator.clipboard` for block copy.

- [ ] **Step 4: Run tests**

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/lib/document-template/clipboard.test.ts src/lib/document-template/editor-shortcuts.test.ts src/lib/document-template/history.test.ts src/lib/document-template/empty.test.ts src/lib/document-template/insert.test.ts src/lib/document-template/paragraph.test.ts src/components/document-editor/document-format-toolbar.test.tsx src/components/document-editor/document-editor-shell.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/lib/document-template/clipboard.ts src/lib/document-template/clipboard.test.ts src/lib/document-template/editor-shortcuts.ts src/lib/document-template/editor-shortcuts.test.ts src/components/document-editor/document-editor.tsx src/components/document-editor/document-page.tsx
git commit -m "feat: add document block clipboard and formatting shortcuts"
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
|---|---|
| Create seeds one empty text block; unique ids | 1 |
| `ensureTextBlock([])` injects; image-only unchanged | 2 |
| Last top-level delete → one text, not `[]` | 2, 5 |
| Column empty does not insert page text | 2 |
| Load inject marks dirty; select first text | 5 |
| Heading 1 22pt bold, no `style` | 3, 4 |
| Toolbar row, disabled not hidden, not a dialog | 4 |
| Remove floating `TextFormatBar` | 4 |
| Font allowlist, sizes, B/I, four colors, align | 4 |
| `bold`/`italic` JSON + render | 2, 4 |
| Native C/X/V/A in textarea | 7 |
| In-memory block copy/cut/paste + nested rules | 7 |
| ⌘S / Z / Shift+Z / B / I | 6, 7 |
| Undo after last-block delete restores original | 6 |
| Empty `text: ""` still valid; validator unchanged | 1 (no extra required-blocks rule) |

Out of scope left out: underline, custom color, lists, Cmd+A all blocks, OS clipboard JSON, cross-document paste.
