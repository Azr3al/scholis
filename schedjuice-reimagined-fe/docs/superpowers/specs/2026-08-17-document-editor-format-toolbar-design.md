# Document editor — starter text, format toolbar, shortcuts

**Date:** 2026-08-17  
**Status:** Draft (pending review)  
**Scope:** `schedjuice-reimagined-be` + `schedjuice-reimagined-fe`  
**Surface:** `/templates/document/:id`  
**Supersedes (UI only):** empty `blocks: []` starter, right-side floating font/align bar, and “Start writing…” empty copy in [Document Template Editor](./2026-08-17-document-template-editor-design.md). Block types, variables, save/publish, and library stay.

## Problem

A new document opens with nowhere to type. Deleting the last block leaves the same blank page. Formatting is a small floating control (font + align) that appears only when a text block is selected. Common document shortcuts (undo, copy/paste block, bold/italic) are missing.

## Decisions (locked)

| Question | Decision |
|---|---|
| Empty page | Never `blocks: []`. If it would be empty, insert one empty text block |
| Images-only | Allowed. Restore text only when **every** top-level block is gone |
| Formatting model | **Block-level** this slice. Inline character runs later |
| Paragraph styles | Title / Heading 1 / Subheading / Body **stamp** size/weight. No stored `style` field |
| Toolbar | Second chrome row **above** the pasteboard, always visible; disabled when selection is not a text block |
| Floating format bar | Remove |
| Bold / italic | Optional booleans on the text block JSON |
| Color | Four swatches only. No custom hex this slice |
| Copy/paste | Native C/X/V/A when caret is in a text field. Block C/X/V when a block is selected and caret is not in an input |
| Block clipboard | In-memory, this editor tab only (does not overwrite OS clipboard) |
| Undo | Session stack of document snapshots, cap 50. ⌘/Ctrl+Z / Shift+Z |

## Goals / non-goals

**Goals**

- New and emptied documents always have one empty text block to type in
- Top toolbar: paragraph preset, font, size, bold, italic, color, align
- Shortcuts listed below

**Non-goals**

- Inline rich text / mixed styles inside one block
- Underline, letter-spacing, lists, indent
- Stored heading `style` enum or theme restyle
- OS-clipboard block JSON
- Cross-document paste
- Cmd+C stealing from the textarea

## Never-empty page

`ensureTextBlock(doc)`: if `doc.blocks.length === 0`, append `defaultTextBlock()` (empty string, Noto Sans, 12pt, `#111111`, align left, `bold`/`italic` false) and select that block.

Run:

1. After GET → `asBlockDocument` (injected block → mark dirty)
2. After delete / Backspace / cut that would leave `[]`

`create_document_template` seeds the same starter block. `EMPTY_DOCUMENT["blocks"]` is that one text block; **create assigns a fresh block `id`** (do not reuse a constant uuid across templates).

Existing saved empty drafts get a text block on open. Column children are unchanged: emptying a column does not insert page-level text.

Delete still removes the selected block; we only insert when the **page** is empty.

## Format toolbar

Second header row under Back / title / Save / Publish, above the dark pasteboard.

```
┌─────────────────────────────────────────────────────────────────┐
│ Back   Documents / Untitled    Draft              Save  Publish │
├─────────────────────────────────────────────────────────────────┤
│ [ Body ▾ ]  [ Noto Sans ▾ ]  [ 12 ▾ ]  B  I     ■  [ L C R ]   │
├─────────────────────────────────────────────────────────────────┤
│                    pasteboard + page                            │
```

On open, select the first text block if one exists (so controls start enabled). Image-only documents keep the first block selected; the toolbar stays **visible and disabled**. Same when the user later selects image, columns, grades table, or nothing.

Applies to the selected **text** block (top-level or a text child inside columns).

| Control | Behavior |
|---|---|
| Paragraph | Stamps metrics. Font unchanged if already set; else Noto Sans. Picker shows the matching preset, else **Body** when size/weight don’t match a row |
| Font | Award-canvas allowlist (`CANVAS_FONT_ALLOWLIST`) |
| Size | 10, 11, 12, 14, 16, 18, 22, 28, 36 pt |
| B / I | Toggle `bold` / `italic` (`true` or omit/false) |
| Color | `#111111`, `#6b7280`, `#2f6e58`, `#b91c1c` |
| Align | left / center / right (`align`) |

### Paragraph stamp table

| Preset | fontSize | bold | italic |
|---|---|---|---|
| Title | 28 | true | false |
| Heading 1 | 22 | true | false |
| Subheading | 16 | false | false |
| Body | 12 | false | false |

Matching: compare `fontSize` + `bold` (italic ignored). Anything that does not match a row shows **Body** in the picker; metrics stay as they are until the user picks a preset. Applying a preset always writes the table’s `bold` and `italic` (picking Title on an italic block clears italic).

Remove `TextFormatBar` on the right.

## Text JSON (additive)

```
{ id, type: "text", text, align, fontFamily?, fontSize?, color?, bold?, italic? }
```

BE `validate_document` still only requires `text` string + known `{{tokens}}`. Extra keys persist in JSONField.

## Shortcuts

When focus is `INPUT`, `TEXTAREA`, or `contentEditable`: **do not** handle C / X / V / A (native). **Do** handle S, Z, Shift+Z. Handle B / I only when focus is **not** the document title field.

When a **block** is selected and focus is not a text field:

| Shortcut | Action |
|---|---|
| ⌘/Ctrl+C | Copy block into the in-memory buffer |
| ⌘/Ctrl+X | Copy, then remove; `ensureTextBlock` if page empty |
| ⌘/Ctrl+V | Duplicate buffer block with a **new id**. If the selection is a **child inside columns** and the copied item is `text` or `image`, insert as the next sibling in that column. Otherwise insert after the selected **top-level** block (or at end if nothing is selected). Copying columns / grades table never inserts inside a column. |
| Delete / Backspace | Remove block; `ensureTextBlock` if page empty |

Always:

| Shortcut | Action |
|---|---|
| ⌘/Ctrl+S | Save |
| ⌘/Ctrl+Z | Undo last document snapshot |
| ⌘/Ctrl+Shift+Z | Redo |
| ⌘/Ctrl+B / I | Toggle bold / italic on the selected text block; no-op if selection is not text, or if focus is the title field |

Undo stack: document JSON only (not title). Push the pre-change snapshot once per user action. **Delete/cut of the last block plus `ensureTextBlock` is one undo step** (undo restores the deleted block, not the injected empty one). Cap 50. Selecting a block does not push. Redo with an empty redo stack is a no-op.

## Error handling

- Save/publish/token rules unchanged
- Empty `text: ""` is valid
- Paste with empty buffer: no-op
- Undo at stack bottom: no-op

## Tests (high-value)

- Create / `EMPTY_DOCUMENT`: exactly one empty text block; two creates do not share the same block id
- `ensureTextBlock([])` → one text block; document that already has an image is unchanged
- Removing the last top-level block yields one text block, not `[]`
- Heading 1 stamp sets `fontSize: 22`, `bold: true`, and does **not** write `style`
- Toolbar has no `role="dialog"`
- With a textarea focused, the document copy handler does not run (native copy still works)
- Undo after deleting the last block restores that deleted block (not the injected empty one)

## Where it lives

- BE: `EMPTY_DOCUMENT` + create id assignment — `app_documents/document.py`, `app_documents/services.py`
- FE: `ensureTextBlock` / `asBlockDocument` — `src/lib/document-template/empty.ts`, `insert.ts`
- FE: types `bold` / `italic` — `src/lib/document-template/types.ts`
- FE: chrome toolbar, remove `TextFormatBar` — `document-editor-shell.tsx`, `document-page.tsx`
- FE: undo + in-memory block clipboard — document editor page / hook (same session as the editor)

## Out of scope

Underline, custom color picker, lists, Cmd+A for all blocks, multi-select, drag-reorder (already unspecified for this slice).
