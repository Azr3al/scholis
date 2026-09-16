# Certification Inline Composer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the certification add/edit dialog with a top composer slot that expands inline using Schedjuice motion tokens (`revealBar`, `crossfade`).

**Architecture:** Extract form fields from `UserCertificationsSection` into `CertificationComposer`. Parent owns `composerMode: null | "add" | { edit: certId }`, renders composer above the list inside `AnimatePresence`, and reuses existing React Query mutations. No API changes.

**Tech Stack:** React, TanStack Query, Motion (`motion/react`), existing form primitives + `AttachmentUploader`.

**Spec:** `docs/superpowers/specs/2026-07-05-staff-certifications-public-profile-design.md` §6.5–6.6  
**Design system:** `DESIGN.md` §12 (Dialogs & overlays)

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/components/users/certification-composer.tsx` (NEW) | Inline form panel: fields, Save/Cancel, `revealBar` wrapper |
| `src/components/users/user-certifications-section.tsx` | Remove Dialog; orchestrate composer + list |
| `src/lib/sj/motion.ts` | Reuse `revealBar`, `crossfade`, `crossfadeInstant` — no changes expected |

---

## Task 1: Extract `CertificationComposer`

**Files:**
- Create: `src/components/users/certification-composer.tsx`
- Reference: `src/components/users/user-certifications-section.tsx` (lines 30–45, 211–257)

- [ ] **Step 1: Create composer component**

```tsx
"use client";

import AttachmentUploader from "@/components/attachment-uploader/attachment-uploader";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { attachmentType } from "@/types/attachment";
import type { UserCertification } from "@/types/user-certification";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { crossfade, crossfadeInstant, revealBar } from "@/lib/sj/motion";

export type CertFormState = {
  title: string;
  issuing_organization: string;
  issued_on: Date | undefined;
  expires_on: Date | undefined;
  attachments: (attachmentType | File)[];
};

type CertificationComposerProps = {
  open: boolean;
  mode: "add" | "edit";
  form: CertFormState;
  onFormChange: (next: CertFormState | ((prev: CertFormState) => CertFormState)) => void;
  editing: UserCertification | null;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
};

export function CertificationComposer({
  open,
  mode,
  form,
  onFormChange,
  editing,
  onSave,
  onCancel,
  isSaving,
}: CertificationComposerProps) {
  const reduced = useReducedMotion();
  const barVariants = reduced ? crossfadeInstant : revealBar;
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    titleRef.current?.focus();
  }, [open, mode, editing?.id]);

  const canSave =
    form.title.trim().length > 0 &&
    form.issuing_organization.trim().length > 0 &&
    Boolean(form.issued_on);

  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          key="cert-composer"
          variants={barVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="overflow-hidden motion-reduce:transition-none"
        >
          <div className="rounded-lg border border-border bg-surface-sunken/40 p-4">
            <motion.div
              key={mode === "add" ? "add" : `edit-${editing?.id}`}
              variants={reduced ? crossfadeInstant : crossfade}
              initial="initial"
              animate="animate"
              exit="exit"
              className="space-y-4"
            >
              <p className="text-sm font-medium text-text-primary">
                {mode === "add" ? "Add certification" : "Edit certification"}
              </p>
              <div className="space-y-2">
                <Label htmlFor="cert-title">Title</Label>
                <Input
                  ref={titleRef}
                  id="cert-title"
                  value={form.title}
                  onChange={(e) =>
                    onFormChange((f) => ({ ...f, title: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cert-org">Issuing organization</Label>
                <Input
                  id="cert-org"
                  value={form.issuing_organization}
                  onChange={(e) =>
                    onFormChange((f) => ({ ...f, issuing_organization: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Issue date</Label>
                  <DatePicker
                    date={form.issued_on}
                    setDate={(date) => onFormChange((f) => ({ ...f, issued_on: date }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Expiry date (optional)</Label>
                  <DatePicker
                    date={form.expires_on}
                    setDate={(date) => onFormChange((f) => ({ ...f, expires_on: date }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>File (PDF or image, max 10 MB)</Label>
                <AttachmentUploader
                  entityName="certification"
                  maxFiles={1}
                  attachments={form.attachments}
                  setAttachments={(attachments) =>
                    onFormChange((f) => ({ ...f, attachments }))
                  }
                />
                {editing?.attachment_filename && form.attachments.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Current file: {editing.attachment_filename}. Upload a new file to replace it.
                  </p>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={onSave}
                  isLoading={isSaving}
                  disabled={!canSave}
                >
                  Save
                </Button>
                <Button type="button" variant="ghost" onClick={onCancel} disabled={isSaving}>
                  Cancel
                </Button>
              </div>
            </motion.div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `cd schedjuice-reimagined-fe && npx tsc --noEmit 2>&1 | grep certification-composer || true`  
Expected: no errors for the new file

---

## Task 2: Wire composer into `UserCertificationsSection`

**Files:**
- Modify: `src/components/users/user-certifications-section.tsx`

- [ ] **Step 1: Remove Dialog imports and state**

Delete:
- `Dialog`, `DialogContent`, `DialogFooter`, `DialogHeader`, `DialogTitle` imports
- `dialogOpen` state — replace with `composerOpen: boolean` and `composerMode: "add" | "edit"`

- [ ] **Step 2: Update open handlers**

```tsx
const [composerOpen, setComposerOpen] = useState(false);
const [composerMode, setComposerMode] = useState<"add" | "edit">("add");

const openCreate = () => {
  setEditing(null);
  setForm(emptyForm());
  setComposerMode("add");
  setComposerOpen(true);
};

const openEdit = (cert: UserCertification) => {
  setEditing(cert);
  setForm({
    title: cert.title,
    issuing_organization: cert.issuing_organization,
    issued_on: cert.issued_on ? new Date(cert.issued_on) : undefined,
    expires_on: cert.expires_on ? new Date(cert.expires_on) : undefined,
    attachments: [],
  });
  setComposerMode("edit");
  setComposerOpen(true);
};

const closeComposer = () => {
  setComposerOpen(false);
  setEditing(null);
  setForm(emptyForm());
};
```

- [ ] **Step 3: Update save mutation onSuccess**

Replace `setDialogOpen(false)` with `closeComposer()`.

- [ ] **Step 4: Render composer above list**

Layout order inside the section return:

```tsx
{/* header row with Add button — unchanged */}
<CertificationComposer
  open={composerOpen && canEdit}
  mode={composerMode}
  form={form}
  onFormChange={setForm}
  editing={editing}
  onSave={() => saveMutation.mutate()}
  onCancel={closeComposer}
  isSaving={saveMutation.isPending}
/>
{/* loading / empty / list — unchanged structure */}
```

Remove the entire `<Dialog>...</Dialog>` block at the bottom.

- [ ] **Step 5: Scroll composer into view on edit**

In `openEdit`, after `setComposerOpen(true)`:

```tsx
requestAnimationFrame(() => {
  document.getElementById("cert-composer-anchor")?.scrollIntoView({
    behavior: "smooth",
    block: "nearest",
  });
});
```

Add `id="cert-composer-anchor"` on the wrapper div immediately above `<CertificationComposer />`.

- [ ] **Step 6: Disable Add while composer open (optional polish)**

```tsx
<Button ... onClick={openCreate} disabled={composerOpen}>
```

---

## Task 3: Manual verification

- [ ] **Step 1: Run unit tests**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- user-form-utils.test.ts`  
Expected: all tests pass (unchanged payload keys)

- [ ] **Step 2: Smoke test in browser**

1. Open staff user → Certifications section
2. Click **Add** — composer expands at top with `revealBar` (no modal, no scrim)
3. Save — composer closes, cert appears in list
4. Click edit pencil — same composer pre-fills, scrolls into view
5. Cancel — composer closes with exit animation
6. Toggle **Enable public profile** off — certifications visibility toggle dims (settings card, unchanged)
7. Resize to mobile width — composer stays in page flow, no centered modal

---

## Task 4: Update changelog (optional)

**Files:**
- Modify: `src/content/changelog/entries.ts` (if a certifications entry exists)

- [ ] Add note: certification add/edit uses inline composer instead of dialog

---

## Self-review checklist

- [x] Spec §6.5 composer slot covered by Tasks 1–2
- [x] `revealBar` + `AnimatePresence` per DESIGN.md §12
- [x] Dialog removed from cert CRUD
- [x] No backend changes
- [x] No placeholder steps
