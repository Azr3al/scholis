# Course Feed Composer — Paste Images as Attachments

> Make clipboard images pasteable in the course feed composer as gallery attachments (same path as paperclip / drag-drop).

**Status:** Design approved (brainstorming 2026-07-09).
**Related:**
- [2026-07-06-course-feed-composer-defaults-design.md](./2026-07-06-course-feed-composer-defaults-design.md) — composer defaults
- [2026-07-07-daily-lesson-images-design.md](./2026-07-07-daily-lesson-images-design.md) — attachment gallery (non-goal: TipTap inline images)
- [2026-07-06-announcement-rich-text-design.md](./2026-07-06-announcement-rich-text-design.md) — TipTap toolbar (no image extension)

---

## 1. Context

Teachers compose announcements and daily lessons in `CourseFeedComposer`. Images are **gallery attachments**, not inline TipTap nodes:

- Paperclip → file picker via `useAttachmentDropzone.open()`
- Drag-and-drop onto the composer card → `useAttachmentDropzone` `onDrop`
- Submit → multipart `files` → `AnnouncementAttachment`

**Gap:** Paste (`Ctrl/Cmd+V`) does nothing. Chat already handles clipboard files (`chat-section.tsx` `handleComposerPaste`); the feed composer does not.

---

## 2. Goals

1. Paste image/file blobs anywhere on the course feed composer card → append to `attachments` (same as drag-drop).
2. Work for **announcements and daily lessons**, create and edit.
3. Reuse existing type filter, `isImageOnly`, max-files (10), and toast behavior.
4. Leave text/HTML-only paste alone so title and TipTap keep working.

## 3. Non-Goals

- Inline images inside TipTap (`QuizImage` / `@tiptap/extension-image`)
- Legacy announcement form and org-wide announcement form
- Backend / API / Teams sync changes
- New file size limits (chat’s 15 MB toast is out of scope; feed dropzone has none today)

---

## 4. Locked Decisions

| # | Decision | Choice |
| --- | --- | --- |
| 1 | Paste destination | Gallery attachments, not TipTap body |
| 2 | Paste surface | Entire composer card (same root as drag-drop) |
| 3 | Post types | Announcements + daily lessons |
| 4 | Surfaces | Course feed composer only |
| 5 | Implementation | Extend `useAttachmentDropzone` with shared `addFiles` + `onPaste` |
| 6 | Text-only clipboard | No `preventDefault`; normal paste proceeds |
| 7 | Mixed text + files | If any files present, `preventDefault` and add files only |
| 8 | Validation | Identical to drag-drop (`isAllowedFileType` / `isImageOnly` / maxFiles / toasts) |

---

## 5. Architecture

### 5.1 `useAttachmentDropzone`

Refactor `onDrop`’s accept-and-append logic into an internal **`addFiles(files: File[])`** helper that:

1. Filters allowed types: when `isImageOnly`, accept only `image/*` (react-dropzone `accept` does not run on paste); otherwise use `isAllowedFileType`
2. Enforces `maxFiles` remaining capacity
3. Calls `setAttachments([...attachments, ...toAdd])`
4. Shows the existing destructive / limit / skipped toasts

Add **`onPaste`**:

1. Read `clipboardData.files` and `clipboardData.items` (kind `file`), dedupe by `name-size` (chat pattern)
2. If no files → return without `preventDefault`
3. Else `preventDefault()` and `addFiles(files)`

Return `onPaste` from the hook alongside `getRootProps`, `getInputProps`, `isDragActive`, `open`. Callers that omit wiring are unchanged.

### 5.2 `CourseFeedComposer`

On the card root that already spreads `dropzone.getRootProps()`, also set:

```tsx
onPaste={dropzone.onPaste}
```

No TipTap config changes. Submit / multipart / preview paths unchanged.

### 5.3 Flow

```
Paste on composer card
  → dropzone.onPaste
  → extract clipboard File blobs
  → addFiles (shared with onDrop)
  → attachments → UploadPreview
  → existing multipart submit
```

---

## 6. Error Handling & Edge Cases

| Case | Behavior |
| --- | --- |
| Unsupported type | Existing “Unsupported file type” toast; file not added |
| At max (10) | Existing “Limit reached” / “Some files skipped” toasts |
| Create mode `isImageOnly` | Non-images rejected; edit allows full attachment set |
| Screenshot paste (`image/png`, generic name) | Accepted as a `File` blob |
| Text/HTML only | No-op for attachments; browser/editor paste continues |
| Mixed clipboard | Files win; prevent default so binary doesn’t land in the editor |

---

## 7. Testing

- Hook/unit: image paste → attachments grow; text-only → no change; over limit → toast + partial add; `isImageOnly` rejects non-image.
- No backend tests (no API change).
- Manual smoke: paste screenshot into create announcement and daily lesson; confirm thumbnail + successful post.

---

## 8. Implementation Notes

- Prefer extracting `addFiles` so drag-drop and paste cannot drift.
- Do not merge chat’s 15 MB check unless product asks later.
- Keep paste opt-in via returned `onPaste` so other `useAttachmentDropzone` callers stay behavior-identical.
