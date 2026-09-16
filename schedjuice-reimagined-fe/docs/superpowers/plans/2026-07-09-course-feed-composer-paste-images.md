# Course Feed Composer Paste Images — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let teachers paste clipboard images/files anywhere on the course feed composer card so they become gallery attachments (same path as paperclip / drag-drop).

**Architecture:** Extract pure clipboard + file-accept helpers next to `useAttachmentDropzone`, unit-test them with Vitest, then wire `addFiles` + `onPaste` through the hook and attach `onPaste` on the `CourseFeedComposer` card root. No TipTap or backend changes.

**Tech Stack:** React, `react-dropzone`, Vitest, existing `isAllowedFileType` / toast patterns.

**Repo:** `schedjuice-reimagined-fe` (branch `dev`)

**Spec:** [2026-07-09-course-feed-composer-paste-images-design.md](../specs/2026-07-09-course-feed-composer-paste-images-design.md)

---

## File map

| File | Responsibility |
| --- | --- |
| `src/components/attachment-uploader/attachment-dropzone-files.ts` | Pure helpers: collect clipboard files, filter/accept files for attachments |
| `src/components/attachment-uploader/attachment-dropzone-files.test.ts` | Vitest coverage for helpers |
| `src/components/attachment-uploader/use-attachment-dropzone.ts` | Shared `addFiles`; return `onPaste`; reuse helpers from `onDrop` |
| `src/components/course/feed/course-feed-composer.tsx` | Wire `onPaste={dropzone.onPaste}` on composer card root |

**Unchanged:** TipTap config, backend, legacy/org-wide announcement forms (they keep dropzone without wiring paste).

---

### Task 1: Pure clipboard + accept helpers (TDD)

**Files:**
- Create: `src/components/attachment-uploader/attachment-dropzone-files.ts`
- Create: `src/components/attachment-uploader/attachment-dropzone-files.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `attachment-dropzone-files.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  collectClipboardFiles,
  filterFilesForAttachments,
} from "./attachment-dropzone-files";

function makeFile(
  name: string,
  type: string,
  size = 10,
): File {
  const blob = new Blob([new Uint8Array(size)], { type });
  return new File([blob], name, { type });
}

describe("collectClipboardFiles", () => {
  it("returns empty array when clipboardData is null", () => {
    expect(collectClipboardFiles(null)).toEqual([]);
  });

  it("collects files from clipboardData.files", () => {
    const img = makeFile("shot.png", "image/png");
    const dt = {
      files: [img] as unknown as FileList,
      items: [] as unknown as DataTransferItemList,
    } as DataTransfer;
    Object.defineProperty(dt, "files", {
      value: {
        length: 1,
        item: (i: number) => (i === 0 ? img : null),
        [0]: img,
      },
    });
    Object.defineProperty(dt, "items", {
      value: { length: 0 },
    });
    expect(collectClipboardFiles(dt)).toEqual([img]);
  });

  it("collects files from clipboardData.items and dedupes by name+size", () => {
    const img = makeFile("shot.png", "image/png", 20);
    const item = {
      kind: "file",
      getAsFile: () => img,
    };
    const dt = {
      files: { length: 0, item: () => null },
      items: { length: 1, 0: item },
    } as unknown as DataTransfer;
    expect(collectClipboardFiles(dt)).toEqual([img]);
  });

  it("skips zero-size files", () => {
    const empty = makeFile("empty.png", "image/png", 0);
    const dt = {
      files: {
        length: 1,
        item: (i: number) => (i === 0 ? empty : null),
        0: empty,
      },
      items: { length: 0 },
    } as unknown as DataTransfer;
    expect(collectClipboardFiles(dt)).toEqual([]);
  });
});

describe("filterFilesForAttachments", () => {
  it("keeps images when isImageOnly", () => {
    const img = makeFile("a.png", "image/png");
    const pdf = makeFile("a.pdf", "application/pdf");
    const result = filterFilesForAttachments([img, pdf], {
      isImageOnly: true,
    });
    expect(result.accepted).toEqual([img]);
    expect(result.rejected.map((r) => r.file)).toEqual([pdf]);
  });

  it("uses isAllowedFileType when not image-only", () => {
    const img = makeFile("a.png", "image/png");
    const exe = makeFile("a.exe", "application/x-msdownload");
    const result = filterFilesForAttachments([img, exe], {
      isImageOnly: false,
    });
    expect(result.accepted).toEqual([img]);
    expect(result.rejected.map((r) => r.file)).toEqual([exe]);
  });

  it("respects remaining capacity", () => {
    const a = makeFile("a.png", "image/png");
    const b = makeFile("b.png", "image/png");
    const c = makeFile("c.png", "image/png");
    const result = filterFilesForAttachments([a, b, c], {
      isImageOnly: true,
      remainingSlots: 2,
    });
    expect(result.accepted).toEqual([a, b]);
    expect(result.skippedCount).toBe(1);
  });

  it("returns empty accepted when remainingSlots is 0", () => {
    const a = makeFile("a.png", "image/png");
    const result = filterFilesForAttachments([a], {
      isImageOnly: true,
      remainingSlots: 0,
    });
    expect(result.accepted).toEqual([]);
    expect(result.skippedCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/components/attachment-uploader/attachment-dropzone-files.test.ts
```

Expected: FAIL — module not found / exports missing.

- [ ] **Step 3: Implement helpers**

Create `attachment-dropzone-files.ts`:

```typescript
import { isAllowedFileType } from "@/helpers/file";

export function collectClipboardFiles(
  clipboardData: DataTransfer | null | undefined,
): File[] {
  if (!clipboardData) return [];

  const seen = new Map<string, File>();

  const filesList = clipboardData.files;
  if (filesList) {
    for (let i = 0; i < filesList.length; i++) {
      const f = filesList.item(i);
      if (f && f.size > 0) seen.set(`${f.name}-${f.size}`, f);
    }
  }

  const items = clipboardData.items;
  if (items) {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it?.kind === "file") {
        const f = it.getAsFile();
        if (f && f.size > 0) seen.set(`${f.name}-${f.size}`, f);
      }
    }
  }

  return Array.from(seen.values());
}

export type FilterFilesForAttachmentsOptions = {
  isImageOnly: boolean;
  /** How many more files may be added. Defaults to Infinity. */
  remainingSlots?: number;
};

export type FilterFilesForAttachmentsResult = {
  accepted: File[];
  rejected: { file: File; reason: "type" }[];
  skippedCount: number;
};

function isAcceptableAttachmentFile(
  file: File,
  isImageOnly: boolean,
): boolean {
  if (isImageOnly) {
    if (file.type?.startsWith("image/")) return true;
    const name = (file.name || "").toLowerCase();
    return (
      name.endsWith(".png") ||
      name.endsWith(".jpg") ||
      name.endsWith(".jpeg") ||
      name.endsWith(".gif") ||
      name.endsWith(".webp")
    );
  }
  return isAllowedFileType(file);
}

export function filterFilesForAttachments(
  files: File[],
  options: FilterFilesForAttachmentsOptions,
): FilterFilesForAttachmentsResult {
  const remainingSlots =
    options.remainingSlots === undefined
      ? Number.POSITIVE_INFINITY
      : Math.max(0, options.remainingSlots);

  const rejected: { file: File; reason: "type" }[] = [];
  const typedOk: File[] = [];

  for (const file of files) {
    if (isAcceptableAttachmentFile(file, options.isImageOnly)) {
      typedOk.push(file);
    } else {
      rejected.push({ file, reason: "type" });
    }
  }

  if (remainingSlots <= 0) {
    return {
      accepted: [],
      rejected,
      skippedCount: typedOk.length,
    };
  }

  const accepted = typedOk.slice(0, remainingSlots);
  return {
    accepted,
    rejected,
    skippedCount: typedOk.length - accepted.length,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/components/attachment-uploader/attachment-dropzone-files.test.ts
```

Expected: PASS (all tests green).

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add \
  src/components/attachment-uploader/attachment-dropzone-files.ts \
  src/components/attachment-uploader/attachment-dropzone-files.test.ts
git commit -m "$(cat <<'EOF'
Add clipboard and attachment file helpers for paste support.

EOF
)"
```

---

### Task 2: Extend `useAttachmentDropzone` with `addFiles` + `onPaste`

**Files:**
- Modify: `src/components/attachment-uploader/use-attachment-dropzone.ts`

- [ ] **Step 1: Update types and imports**

At the top of `use-attachment-dropzone.ts`, add:

```typescript
import {
  collectClipboardFiles,
  filterFilesForAttachments,
} from "./attachment-dropzone-files";
```

Change `AttachmentDropzoneBindings` to:

```typescript
export type AttachmentDropzoneBindings = {
  getRootProps: ReturnType<typeof useDropzone>["getRootProps"];
  getInputProps: ReturnType<typeof useDropzone>["getInputProps"];
  isDragActive: boolean;
  open: () => void;
  onPaste: (e: React.ClipboardEvent) => void;
};
```

Ensure `React` types are available (add `import type React from "react"` or use `import { useCallback, type ClipboardEvent } from "react"` and type `onPaste` as `(e: ClipboardEvent) => void` — prefer:

```typescript
import { useCallback, type ClipboardEvent } from "react";
// ...
onPaste: (e: ClipboardEvent) => void;
```

- [ ] **Step 2: Implement shared `addFiles` and reuse from `onDrop`**

Replace the body of `useAttachmentDropzone` so accept/limit logic goes through helpers:

```typescript
export function useAttachmentDropzone({
  attachments,
  setAttachments,
  maxFiles = 1,
  isImageOnly = false,
}: UseAttachmentDropzoneParams): AttachmentDropzoneBindings {
  const { toast } = useToast();

  const addFiles = useCallback(
    (incoming: File[]) => {
      const remaining = Math.max(0, maxFiles - attachments.length);
      const { accepted, rejected, skippedCount } = filterFilesForAttachments(
        incoming,
        { isImageOnly, remainingSlots: remaining },
      );

      for (const { file } of rejected) {
        toast({
          title: "Unsupported file type",
          description: isImageOnly
            ? `${file.name} is not an image.`
            : `${file.name} is not allowed. Allowed: photos, videos, PDF, Microsoft Office files`,
          variant: "destructive",
        });
      }

      if (remaining <= 0 && incoming.length > 0) {
        toast({
          title: "Limit reached",
          description: `You can only upload ${maxFiles} file${
            maxFiles > 1 ? "s" : ""
          }.`,
          variant: "destructive",
        });
        return;
      }

      if (accepted.length === 0) return;

      setAttachments([...attachments, ...accepted]);

      if (skippedCount > 0) {
        toast({
          title: "Some files skipped",
          description: `${skippedCount} file${
            skippedCount > 1 ? "s" : ""
          } were not added due to the ${maxFiles} file limit.`,
        });
      }
    },
    [attachments, isImageOnly, maxFiles, setAttachments, toast],
  );

  const onDrop = useCallback(
    (f: File[], rejections: FileRejection[]) => {
      if (rejections.length > 0) {
        rejections.forEach((r) => {
          toast({
            title: "Unsupported file",
            description:
              r.errors[0]?.message || "This file cannot be uploaded.",
            variant: "destructive",
          });
        });
      }
      addFiles(f || []);
    },
    [addFiles, toast],
  );

  const onPaste = useCallback(
    (e: ClipboardEvent) => {
      const files = collectClipboardFiles(e.clipboardData);
      if (files.length === 0) return;
      e.preventDefault();
      addFiles(files);
    },
    [addFiles],
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    maxFiles: maxFiles || 2,
    accept: isImageOnly
      ? { "image/*": [".png", ".jpg", ".jpeg", ".gif", ".webp"] }
      : ALLOWED_ACCEPT_FOR_DROPZONE,
    multiple: true,
    noClick: true,
    noKeyboard: true,
  });

  return { getRootProps, getInputProps, isDragActive, open, onPaste };
}
```

Notes for the implementer:

- Keep react-dropzone rejection toasts for drag-drop (dropzone `accept` still runs on drop).
- Paste never goes through react-dropzone `accept`; `filterFilesForAttachments` + `isImageOnly` must enforce create-mode image-only.
- Callers that ignore `onPaste` remain behavior-compatible aside from shared filter path (same outcomes for allowed types).

- [ ] **Step 3: Typecheck / unit tests still pass**

Run:

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/components/attachment-uploader/attachment-dropzone-files.test.ts
```

Expected: PASS.

If the project has a quick typecheck script, run it on the touched file; otherwise rely on IDE/tsc in CI.

- [ ] **Step 4: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/components/attachment-uploader/use-attachment-dropzone.ts
git commit -m "$(cat <<'EOF'
Add paste handler to attachment dropzone hook.

EOF
)"
```

---

### Task 3: Wire paste on `CourseFeedComposer`

**Files:**
- Modify: `src/components/course/feed/course-feed-composer.tsx`

- [ ] **Step 1: Attach `onPaste` on the composer card root**

Find the card root that spreads `dropzone.getRootProps(...)` (around the expanded composer return). Change it so paste is wired without breaking dropzone props.

Preferred pattern — pass `onPaste` into `getRootProps` so react-dropzone merges handlers correctly:

```tsx
<div
  {...dropzone.getRootProps({
    className: cn(
      "rounded-xl border border-border/60 bg-card p-4 transition-colors",
      "focus-within:border-border focus-within:bg-muted/20",
      mode === "edit" && "border-dashed",
      dropzone.isDragActive && "ring-2 ring-primary/30 bg-muted/30",
    ),
    onPaste: dropzone.onPaste,
  })}
>
```

Do **not** put a separate `onPaste={...}` after the spread if it would overwrite dropzone-merged props; prefer the `getRootProps({ onPaste })` form above.

- [ ] **Step 2: Manual smoke checklist (implementer)**

1. Open a course Overview feed as a teacher.
2. Expand composer → Announcement → paste a screenshot → thumbnail appears in attachment preview.
3. Switch to Daily lesson → paste another image → thumbnail appears.
4. Paste plain text into the title/body → text pastes normally; no attachment added.
5. In create mode, paste a non-image file (if OS allows) → unsupported toast; not added.
6. Add 10 images, paste another → limit toast; not added beyond 10.
7. Submit a post with a pasted image → feed gallery shows it.

- [ ] **Step 3: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/components/course/feed/course-feed-composer.tsx
git commit -m "$(cat <<'EOF'
Wire clipboard paste into course feed composer attachments.

EOF
)"
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
| --- | --- |
| Gallery attachments, not TipTap inline | Task 3 (attachments only) |
| Whole composer card paste surface | Task 3 `getRootProps({ onPaste })` |
| Announcements + daily lessons | Task 3 (same composer) |
| Course feed composer only | Task 3 only; other forms unchanged |
| Extend dropzone with shared add + paste | Tasks 1–2 |
| Text-only clipboard: no preventDefault | Task 2 `onPaste` early return |
| Mixed clipboard: files win | Task 2 preventDefault when files present |
| Same validation as drag-drop / isImageOnly | Task 1 filter + Task 2 `addFiles` |
| Hook/unit tests | Task 1 |
| No backend / size-limit invention | Out of plan |

No placeholders remaining. Types (`collectClipboardFiles`, `filterFilesForAttachments`, `onPaste`) are consistent across tasks.
