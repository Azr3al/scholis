# Qualifications Inline Images — Plan 3: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable paste/drop/toolbar image upload in the qualifications TipTap editor (images only), with presigned URLs resolved on the public profile API — GitHub-style inline images.

**Architecture:** Reuse `QuizImage` TipTap extension pattern and `uploadAttachments` helper. Upload to `table_name=user_qualifications` keyed by user id. BE walks qualifications JSON before public response and swaps `attachmentId` for presigned `src`. Separate from certification file uploads.

**Tech Stack:** TipTap, React, Django JSON walker, `PrivateMediaStorage`.

**Spec:** `docs/superpowers/specs/2026-07-05-staff-certifications-public-profile-design.md` §7  
**Depends on:** Plans 1 + 2 (public profile editor and `/public/people/` endpoint exist)

**Reference:** `src/components/editor/quiz-image-extension.ts`, `src/components/editor/menu.tsx`, `src/components/product-docs/docs-markdown-editor.tsx`

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/components/editor/attachment-image-extension.ts` (NEW) | Generalized TipTap image attrs |
| `src/components/editor/qualifications-image-upload.ts` (NEW) | Upload + replace/remove helpers |
| `src/components/editor/config.ts` | Optional: export quals editor extensions |
| `src/components/users/user-public-profile-fields.tsx` | Enable image upload on quals editor |
| `app_auth/qualifications_media.py` (NEW) | Resolve attachment IDs in JSON |
| `app_auth/views.py` | Call resolver in `PublicProfileView` |
| `app_auth/tests/test_qualifications_media.py` (NEW) | JSON walker tests |

---

## Task 1: Generalized TipTap attachment image extension

**Files:**
- Create: `src/components/editor/attachment-image-extension.ts`

- [ ] **Step 1: Create extension (copy from quiz, rename)**

```typescript
import Image from "@tiptap/extension-image";

export const AttachmentImage = Image.extend({
  name: "image",

  addAttributes() {
    return {
      ...this.parent?.(),
      attachmentId: {
        default: null as number | null,
        parseHTML: (element) => {
          const v = element.getAttribute("data-attachment-id");
          if (v == null || v === "") return null;
          const n = Number(v);
          return Number.isFinite(n) ? n : null;
        },
        renderHTML: (attributes) => {
          if (attributes.attachmentId == null) return {};
          return { "data-attachment-id": String(attributes.attachmentId) };
        },
      },
      pending: { default: false },
      uploadId: { default: null as string | null },
    };
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/components/editor/attachment-image-extension.ts
git commit -m "feat(fe): add AttachmentImage TipTap extension"
```

---

## Task 2: Qualifications image upload helpers

**Files:**
- Create: `src/components/editor/qualifications-image-upload.ts`

- [ ] **Step 1: Implement upload helpers**

Adapt from `menu.tsx` `handleQuizImageFile`:

```typescript
import type { Editor } from "@tiptap/core";
import { v4 as uuid } from "uuid";
import { parseAttachmentUploadIds, uploadAttachments } from "@/helpers/file";
import { axiosInstance } from "@/helpers/axios"; // adjust import

const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;

export function isAcceptedQualificationImage(file: File): boolean {
  return ACCEPTED_IMAGE_TYPES.includes(file.type) && file.size <= MAX_BYTES;
}

async function fetchQualificationAttachmentUrl(
  attachmentId: number,
  userId: number,
): Promise<string | null> {
  try {
    const res = await axiosInstance.get<{ data: { url: string } }>(
      `/attachments/${attachmentId}/presigned`,
      { params: { table_name: "user_qualifications", foreign_key: userId } },
    );
    return res.data.data?.url ?? null;
  } catch {
    return null;
  }
}

export function replaceImageAttrsByUploadId(
  editor: Editor,
  uploadId: string,
  attrs: Record<string, unknown>,
) {
  const { state } = editor;
  let found = false;
  state.doc.descendants((node, pos) => {
    if (found || node.type.name !== "image") return;
    if (node.attrs.uploadId !== uploadId) return;
    found = true;
    editor.view.dispatch(
      state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs }),
    );
  });
}

export function removeImageByUploadId(editor: Editor, uploadId: string) {
  const { state } = editor;
  state.doc.descendants((node, pos) => {
    if (node.type.name !== "image" || node.attrs.uploadId !== uploadId) return;
    editor.view.dispatch(state.tr.delete(pos, pos + node.nodeSize));
  });
}

export async function insertQualificationImage(
  editor: Editor,
  file: File,
  userId: number,
  onPendingDelta: (delta: number) => void,
): Promise<void> {
  if (!isAcceptedQualificationImage(file)) {
    throw new Error("unsupported_image");
  }
  const uploadId = uuid();
  const preview = URL.createObjectURL(file);
  onPendingDelta(1);
  editor
    .chain()
    .focus()
    .insertContent({
      type: "image",
      attrs: { src: preview, attachmentId: null, pending: true, uploadId },
    })
    .run();

  try {
    const res = await uploadAttachments(
      [file],
      "user_qualifications",
      String(userId),
    );
    const attachmentId = parseAttachmentUploadIds(res)[0];
    if (attachmentId == null) throw new Error("missing_attachment_id");
    const presigned =
      (await fetchQualificationAttachmentUrl(attachmentId, userId)) ?? preview;
    replaceImageAttrsByUploadId(editor, uploadId, {
      src: presigned,
      attachmentId,
      pending: false,
      uploadId: null,
    });
    URL.revokeObjectURL(preview);
  } catch {
    removeImageByUploadId(editor, uploadId);
    URL.revokeObjectURL(preview);
    throw new Error("upload_failed");
  } finally {
    onPendingDelta(-1);
  }
}
```

**Note:** Before implementing `fetchQualificationAttachmentUrl`, grep the codebase for an existing presigned attachment endpoint used by quiz images (`fetchQuizAttachmentPresignedUrl`) and reuse that pattern/API.

- [ ] **Step 2: Commit**

```bash
git add src/components/editor/qualifications-image-upload.ts
git commit -m "feat(fe): add qualifications image upload helpers"
```

---

## Task 3: Wire paste/drop into qualifications editor

**Files:**
- Modify: `src/components/users/user-public-profile-fields.tsx`
- Modify: `src/components/editor/config.ts` (if qualifications need custom extension set)

- [ ] **Step 1: Use editor options with `AttachmentImage`**

Either pass custom extensions to `useEditor` in `UserPublicProfileFields`, or add a `getQualificationsEditorOptions()` in `config.ts` that mirrors `getDefaultEditorOptions()` but swaps in `AttachmentImage`.

- [ ] **Step 2: Add paste and drop handlers on editor wrapper**

```typescript
const handlePaste = (event: ClipboardEvent) => {
  if (!editor || !userId) return;
  const items = event.clipboardData?.items;
  if (!items) return;
  for (const item of Array.from(items)) {
    if (!item.type.startsWith("image/")) continue;
    event.preventDefault();
    const file = item.getAsFile();
    if (file) {
      void insertQualificationImage(editor, file, userId, setPendingUploads).catch(() => {
        toast({ title: "Image upload failed", variant: "destructive" });
      });
    }
    return;
  }
};

const handleDrop = (event: DragEvent) => {
  if (!editor || !userId) return;
  const file = event.dataTransfer?.files?.[0];
  if (!file || !file.type.startsWith("image/")) return;
  event.preventDefault();
  void insertQualificationImage(editor, file, userId, setPendingUploads).catch(() => {
    toast({ title: "Image upload failed", variant: "destructive" });
  });
};
```

Attach via `onPaste` / `onDrop` on a wrapper `div` around `TextEditor`.

- [ ] **Step 3: Add toolbar image button (optional but recommended)**

Reuse pattern from `SimpleEditorMenu` — file input triggering `insertQualificationImage`.

- [ ] **Step 4: Commit**

```bash
git add src/components/users/user-public-profile-fields.tsx src/components/editor/config.ts
git commit -m "feat(fe): enable paste and drop images in qualifications editor"
```

---

## Task 4: Backend qualifications JSON image resolver

**Files:**
- Create: `app_auth/qualifications_media.py`
- Modify: `app_auth/views.py` (`PublicProfileView`)
- Create: `app_auth/tests/test_qualifications_media.py`

- [ ] **Step 1: Write failing test**

```python
from django.test import SimpleTestCase
from unittest.mock import patch

from app_auth.qualifications_media import resolve_qualifications_media_urls


class QualificationsMediaTests(SimpleTestCase):
    @patch("app_auth.qualifications_media._presign_attachment")
    def test_resolves_attachment_id_in_image_node(self, presign):
        presign.return_value = "https://signed.example/img.png"
        doc = {
            "type": "doc",
            "content": [
                {
                    "type": "image",
                    "attrs": {"attachmentId": 42, "src": "blob:pending"},
                }
            ],
        }
        out = resolve_qualifications_media_urls(doc)
        self.assertEqual(
            out["content"][0]["attrs"]["src"],
            "https://signed.example/img.png",
        )
```

- [ ] **Step 2: Implement resolver**

```python
# app_auth/qualifications_media.py
from __future__ import annotations

import copy
from typing import Any

from app_attachment.models import Attachment
from schedjuice_backend.storages import PrivateMediaStorage


def _presign_attachment(attachment_id: int) -> str | None:
    attachment = Attachment.objects.filter(pk=attachment_id).first()
    if attachment is None or not attachment.data:
        return None
    try:
        return PrivateMediaStorage().url(attachment.data.name, expire=3600)
    except Exception:
        return None


def resolve_qualifications_media_urls(doc: Any) -> Any:
    if not doc or not isinstance(doc, dict):
        return doc
    out = copy.deepcopy(doc)

    def walk(node: Any) -> None:
        if not isinstance(node, dict):
            return
        if node.get("type") == "image":
            attrs = node.setdefault("attrs", {})
            attachment_id = attrs.get("attachmentId")
            if attachment_id is not None:
                url = _presign_attachment(int(attachment_id))
                if url:
                    attrs["src"] = url
            return
        for child in node.get("content") or []:
            walk(child)

    walk(out)
    return out
```

- [ ] **Step 3: Call from `PublicProfileView`**

```python
from app_auth.qualifications_media import resolve_qualifications_media_urls

qualifications = resolve_qualifications_media_urls(user.qualifications)
```

- [ ] **Step 4: Run tests**

Run: `./scripts/run_backend_tests.sh app_auth.tests.test_qualifications_media -v 2`

- [ ] **Step 5: Commit**

```bash
git add app_auth/qualifications_media.py app_auth/views.py app_auth/tests/test_qualifications_media.py
git commit -m "feat(auth): resolve qualification inline image URLs for public profile"
```

---

## Task 5: End-to-end verification

- [ ] **Step 1: Manual test**

1. Open staff public profile editor
2. Paste screenshot into qualifications → image appears inline
3. Save public profile
4. Open `/people/{slug}` → image renders in qualifications section
5. Preview panel shows image before save (uses blob URL until save+reload — acceptable)

- [ ] **Step 2: Changelog**

Append inline qualification images bullet to changelog entry from Plan 2.

---

## Out of scope (explicit)

- Video paste in qualifications editor
- CodeMirror / docs editor port
- Image upload in certification file field (already handled by AttachmentUploader — separate from inline rich text)
