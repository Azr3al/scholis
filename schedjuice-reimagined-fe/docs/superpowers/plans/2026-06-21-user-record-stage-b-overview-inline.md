# User Record P2b — Stage B: Overview Inline Editing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

> **Repo commit policy:** Follows `no-git-commits` — do NOT run commit steps until the user authorizes. Treat each "Commit" as "stage only" (`git add`) and pause. No feature branches; work on `dev`.

**Goal:** Make the Overview section editable in place: the builtin **Profile** scalars (name, communication email, phone) auto-save on blur with optimistic UI + "Saved ✓" + ~5s undo + inline validation; **Roles & team** edits explicitly with a confirm; **Connections** (Microsoft/Telegram) are embedded. Primary email stays locked.

**Architecture:** Reuse the existing, tested autosave core (`useAutosaveForm`, RHF-bound, optimistic cache write + rollback) for the Profile scalars. A new `InlineField` renders a display↔edit toggle bound to RHF + the autosave field handlers, with a small per-field undo layer. Roles reuse `EntityChooserCheckbox` behind an explicit save+confirm. The Overview section JSX moves out of `page.tsx` into `record-overview.tsx`. New chrome is wrapped in `.sj-root`; the still-read-only config groups (Personal/Medical via `FormConfigDetail`) stay until Stage C.

**Tech Stack:** React 19, react-hook-form + `@hookform/resolvers` (zod), `useAutosaveForm` (`src/hooks/use-autosave-form.ts`), `updateEntity`, Base UI primitives, `motion/react` + `src/lib/sj/motion.ts` (`savedTick`).

**Spec:** `docs/superpowers/specs/2026-06-21-user-record-inline-design.md` (Stage B = §10 stage 2).

**Predecessor:** Stage A (`2026-06-21-user-record-stage-a-shell-swap.md`) — record shell + `?section=` + identity strip already shipped; Overview currently renders read-only `AboutSection` + `FormConfigDetail`.

---

## Scope resolution (read first)

The spec listed Stage B Overview as "Profile + Personal + Roles + Connections". In the codebase, **Personal/address/emergency are config-group-driven** (rendered by `FormConfigDetail`, schema via `build-config-schema.ts`, gated by `field-policy.ts` + visibility). Those share the heavy machinery scheduled for **Stage C**. To keep stages coherent:

- **Stage B (this plan):** builtin **Profile** scalars (`name`, `communication_email`, `phone_number`; `email` locked) inline; **Roles & team** explicit+confirm; **Connections** embedded. Plus the reusable `InlineField` primitive + undo.
- **Stage C:** all config groups (Personal/Medical/Documents/Emergency), `InlineTextField` (multi-line, e.g. notes/medical), `InlineGroup` (cross-field), payroll/HR/check-in/Zoom, public profile, remove `/edit`.

---

## File Structure

**Create:**
- `src/components/record/inline/inline-field.tsx` — auto-save scalar row (display↔edit, Saved + undo, inline error)
- `src/components/record/inline/use-undo.ts` — tiny per-field undo controller (pure-ish; unit-tested logic split out)
- `src/components/record/inline/undo-core.ts` — pure undo state helpers
- `src/components/record/inline/undo-core.test.ts` — tests
- `src/components/record/sections/record-overview.tsx` — Overview section (inline Profile form + Roles + Connections + read-only config groups)
- `src/components/record/roles-editor.tsx` — explicit + confirm roles & team

**Modify:**
- `src/app/(internal)/users/[id]/page.tsx` — render `<RecordOverview .../>` for the `overview` section (replace the inline About/FormConfigDetail block)

**Reuse (unchanged):** `useAutosaveForm`, `updateEntity`, `EntityChooserCheckbox`, `UserConnectorsSection`, `FormConfigDetail`, `UserResignationDetails`, `getExcludedColumns`, `field-policy` (read-only checks), `src/lib/sj/motion.ts`.

---

## Task 1: Undo core (TDD)

**Files:** Create `src/components/record/inline/undo-core.ts`, `undo-core.test.ts`

A field shows "Saved · Undo" for a window after an autosave; Undo restores the prior value and re-commits. The timing/window logic is pure and worth testing.

- [ ] **Step 1: Write failing tests**

`src/components/record/inline/undo-core.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { makeUndoEntry, isUndoVisible, UNDO_WINDOW_MS } from "./undo-core";

describe("undo-core", () => {
  it("builds an entry capturing the previous value + timestamp", () => {
    const e = makeUndoEntry("name", "Old", 1000);
    expect(e).toEqual({ field: "name", previousValue: "Old", at: 1000 });
  });
  it("is visible within the window", () => {
    const e = makeUndoEntry("name", "Old", 1000);
    expect(isUndoVisible(e, 1000 + UNDO_WINDOW_MS - 1)).toBe(true);
  });
  it("expires after the window", () => {
    const e = makeUndoEntry("name", "Old", 1000);
    expect(isUndoVisible(e, 1000 + UNDO_WINDOW_MS + 1)).toBe(false);
  });
  it("is not visible for null", () => {
    expect(isUndoVisible(null, 5000)).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm run test:unit -- --run src/components/record/inline/undo-core.test.ts`
Expected: FAIL ("Cannot find module './undo-core'").

- [ ] **Step 3: Implement**

`src/components/record/inline/undo-core.ts`:
```ts
export const UNDO_WINDOW_MS = 5000;

export type UndoEntry = {
  field: string;
  previousValue: unknown;
  at: number;
};

export function makeUndoEntry(
  field: string,
  previousValue: unknown,
  at: number = Date.now(),
): UndoEntry {
  return { field, previousValue, at };
}

export function isUndoVisible(entry: UndoEntry | null, now: number = Date.now()): boolean {
  if (!entry) return false;
  return now - entry.at < UNDO_WINDOW_MS;
}
```

- [ ] **Step 4: Run — expect PASS** (`npm run test:unit -- --run src/components/record/inline/undo-core.test.ts`)

- [ ] **Step 5: Commit**
```bash
git add src/components/record/inline/undo-core.ts src/components/record/inline/undo-core.test.ts
git commit -m "feat(record): undo-core helpers for inline editing (TDD)"
```

---

## Task 2: Undo controller hook

**Files:** Create `src/components/record/inline/use-undo.ts`

- [ ] **Step 1: Implement**

`src/components/record/inline/use-undo.ts`:
```ts
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { UNDO_WINDOW_MS, makeUndoEntry, type UndoEntry } from "./undo-core";

/** Tracks the most recent undoable field change and auto-clears after the window. */
export function useUndo() {
  const [entry, setEntry] = useState<UndoEntry | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setEntry(null);
  }, []);

  const offer = useCallback(
    (field: string, previousValue: unknown) => {
      if (timer.current) clearTimeout(timer.current);
      setEntry(makeUndoEntry(field, previousValue));
      timer.current = setTimeout(() => setEntry(null), UNDO_WINDOW_MS);
    },
    [],
  );

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return { entry, offer, clear };
}
```

- [ ] **Step 2: Build** — `npm run build` (or dev). Expected: compiles.

- [ ] **Step 3: Commit**
```bash
git add src/components/record/inline/use-undo.ts
git commit -m "feat(record): useUndo controller"
```

---

## Task 3: InlineField primitive

**Files:** Create `src/components/record/inline/inline-field.tsx`

Auto-save scalar row: read display → click to edit → blur autosaves (via the parent's `bindField`) → shows "Saved · Undo". Locked variant renders read-only with a lock hint. Inline validation message from RHF errors.

- [ ] **Step 1: Implement**

`src/components/record/inline/inline-field.tsx`:
```tsx
"use client";
import { useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { AnimatePresence, motion } from "motion/react";
import { Check, EditPencil, Lock } from "iconoir-react";
import { savedTick } from "@/lib/sj/motion";
import type { FieldSaveState } from "@/lib/autosave/autosave-core";
import { isUndoVisible } from "./undo-core";
import { useUndo } from "./use-undo";
import { cn } from "@/lib/utils";

type Props = {
  form: UseFormReturn<any>;
  name: string;
  label: string;
  type?: "text" | "email" | "tel";
  status?: FieldSaveState;
  bindField: (name: string) => { onBlur: () => void };
  commitField: (name: string) => void;
  locked?: boolean;
  lockedHint?: string;
  placeholder?: string;
};

export function InlineField({
  form, name, label, type = "text", status, bindField, commitField,
  locked, lockedHint = "Managed elsewhere", placeholder,
}: Props) {
  const [editing, setEditing] = useState(false);
  const undo = useUndo();
  const value = form.watch(name) as string | undefined;
  const error = form.formState.errors[name]?.message as string | undefined;
  const fieldBind = bindField(name);

  if (locked) {
    return (
      <Row label={label}>
        <div className="flex flex-1 items-center justify-between px-2.5 py-1.5 text-sm text-text-secondary">
          <span className="truncate">{value || "—"}</span>
          <span className="flex shrink-0 items-center gap-1 text-xs text-text-muted">
            <Lock width={12} height={12} aria-hidden /> {lockedHint}
          </span>
        </div>
      </Row>
    );
  }

  function startEdit() {
    undo.clear();
    setEditing(true);
  }

  function finishEdit() {
    const prev = form.formState.defaultValues?.[name];
    fieldBind.onBlur(); // triggers autosave (validate + flush)
    setEditing(false);
    // Offer undo only if the value actually changed and is valid.
    if (!form.getFieldState(name).invalid && form.getValues(name) !== prev) {
      undo.offer(name, prev);
    }
  }

  function doUndo() {
    if (!undo.entry) return;
    form.setValue(name, undo.entry.previousValue, {
      shouldDirty: true,
      shouldValidate: true,
    });
    commitField(name);
    undo.clear();
  }

  return (
    <Row label={label}>
      {editing ? (
        <div className="flex-1">
          <input
            {...form.register(name)}
            type={type}
            autoFocus
            placeholder={placeholder}
            onBlur={finishEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setEditing(false);
            }}
            aria-invalid={Boolean(error)}
            className={cn(
              "w-full rounded-md border bg-surface px-2.5 py-1.5 text-sm text-text-primary outline-none",
              "focus-visible:outline-2 focus-visible:outline-[var(--ring)]",
              error ? "border-danger" : "border-border-strong",
            )}
          />
          {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={startEdit}
          className="group flex flex-1 items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm text-text-primary hover:bg-surface-hover"
        >
          <span className="truncate">{value || <span className="text-text-muted">{placeholder ?? "—"}</span>}</span>
          <span className="flex shrink-0 items-center gap-2 text-xs">
            <AnimatePresence>
              {isUndoVisible(undo.entry) ? (
                <motion.span
                  variants={savedTick}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="flex items-center gap-1.5"
                >
                  <span className="flex items-center gap-1 text-success">
                    <Check width={13} height={13} aria-hidden /> Saved
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); doUndo(); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); doUndo(); } }}
                    className="text-accent underline-offset-2 hover:underline"
                  >
                    Undo
                  </span>
                </motion.span>
              ) : status === "saving" ? (
                <span className="text-text-muted">Saving…</span>
              ) : status === "error" ? (
                <span className="text-danger">Retry</span>
              ) : null}
            </AnimatePresence>
            <EditPencil width={14} height={14} className="text-text-muted opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
          </span>
        </button>
      )}
    </Row>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <span className="w-36 shrink-0 text-sm text-text-muted">{label}</span>
      {children}
    </div>
  );
}
```

> Verify `FieldSaveState` is exported from `@/lib/autosave/autosave-core` (it is — re-exported via `use-autosave-form`). Verify the "error" branch wiring to `retry` is acceptable for Stage B (clicking the row re-edits; full retry UX can stay minimal).

- [ ] **Step 2: Build** — `npm run build`. Expected: compiles.

- [ ] **Step 3: Commit**
```bash
git add src/components/record/inline/inline-field.tsx
git commit -m "feat(record): InlineField auto-save scalar with undo + inline validation"
```

---

## Task 4: Roles & team editor (explicit + confirm)

**Files:** Create `src/components/record/roles-editor.tsx`

Reuse the existing role-selection UI (`EntityChooserCheckbox`) inside a local draft + explicit Save (with confirm) — never auto-save. Gate by `user.assign_roles`.

- [ ] **Step 1: Implement**

`src/components/record/roles-editor.tsx`:
```tsx
"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import EntityChooserCheckbox from "@/components/auth/entity-chooser-checkbox";
import { AlertDialog } from "@/components/primitives/alert-dialog";
import { Button } from "@/components/primitives/button";
import { updateEntity } from "@/app/client-api/utils";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/components/ui/use-toast";
import type { accountType, role } from "@/types/user";

export function RolesEditor({
  subject, recordQueryKey,
}: { subject: accountType; recordQueryKey: unknown[] }) {
  const { can } = usePermissions();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<role[]>((subject.roles ?? []) as role[]);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const canEdit = can("user.assign_roles");
  const dirty = JSON.stringify([...draft].sort()) !== JSON.stringify([...(subject.roles ?? [])].sort());

  const save = useMutation({
    mutationFn: () => updateEntity("users", String(subject.id), { roles: draft }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: recordQueryKey }); toast({ title: "Roles updated" }); setConfirmOpen(false); },
    onError: () => { toast({ variant: "destructive", title: "Could not update roles" }); setConfirmOpen(false); },
  });

  return (
    <div className="rounded-lg border border-border bg-surface-elevated p-4">
      <p className="mb-2 font-serif text-lg text-text-primary">Roles &amp; team</p>
      {/* Reuse the existing chooser; it manages student/staff exclusivity. */}
      <EntityChooserCheckbox
        value={draft}
        onChange={setDraft}
        disabled={!canEdit}
        // pass viewer/tenant per the component's API — verify props
      />
      {canEdit && dirty ? (
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={() => setConfirmOpen(true)}>Save roles</Button>
          <Button size="sm" variant="ghost" onClick={() => setDraft((subject.roles ?? []) as role[])}>Cancel</Button>
        </div>
      ) : null}

      <AlertDialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop />
          <AlertDialog.Popup>
            <AlertDialog.Title>Update roles &amp; team?</AlertDialog.Title>
            <AlertDialog.Description>
              This changes what this person can access and may trigger account provisioning.
            </AlertDialog.Description>
            <div className="mt-2 flex justify-end gap-2">
              <AlertDialog.Close render={<Button variant="ghost">Cancel</Button>} />
              <Button onClick={() => save.mutate()}>Confirm</Button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}
```

> **Verify `EntityChooserCheckbox` props** against `src/components/auth/entity-chooser-checkbox.tsx` (value/onChange/disabled + any required viewer/tenant/assignable-roles props). It currently lives inside a RHF `UserAccessFields`; adapt to a controlled `value/onChange` usage. If it can't be driven controlled cheaply, wrap a thin local adapter rather than rewriting its exclusivity logic.

- [ ] **Step 2: Build + dev verify** the chooser renders and Save→confirm hits the API.

- [ ] **Step 3: Commit**
```bash
git add src/components/record/roles-editor.tsx
git commit -m "feat(record): roles & team editor (explicit save + confirm)"
```

---

## Task 5: RecordOverview section (assemble inline Profile + Roles + Connections)

**Files:** Create `src/components/record/sections/record-overview.tsx`

- [ ] **Step 1: Implement**

`src/components/record/sections/record-overview.tsx`:
```tsx
"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAutosaveForm } from "@/hooks/use-autosave-form";
import { updateEntity } from "@/app/client-api/utils";
import { InlineField } from "@/components/record/inline/inline-field";
import { RolesEditor } from "@/components/record/roles-editor";
import { UserConnectorsSection } from "@/components/connectors/user-connectors-section";
import { UserResignationDetails } from "@/components/users/user-resignation-details";
import { FormConfigDetail } from "@/components/custom-fields/form-config-detail";
import { EMPTY_FORM_CONFIG, type FormConfig } from "@/types/form-config";
import { getExcludedColumns } from "@/helpers/visibility";
import { accountVisibilitySchema, type accountType } from "@/types/user";
import { useQueryClient } from "@tanstack/react-query";
import type { organizationType } from "@/types/organization";

const profileSchema = z.object({
  name: z.string().min(1, "Name is required"),
  communication_email: z.string().email("Enter a valid email").or(z.literal("")).optional(),
  phone_number: z.string().optional(),
});

export function RecordOverview({
  subject, viewer, tenant, recordQueryKey, detailConfig, definitionsLoading,
}: {
  subject: accountType;
  viewer: accountType;
  tenant: organizationType | null;
  recordQueryKey: unknown[];
  detailConfig: FormConfig | undefined;
  definitionsLoading: boolean;
}) {
  const qc = useQueryClient();
  const form = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: subject.name ?? "",
      communication_email: subject.communication_email ?? "",
      phone_number: subject.phone_number ?? "",
    },
    mode: "onChange",
  });

  const { bindField, commitField, fieldStatus } = useAutosaveForm({
    form,
    save: (diff) => updateEntity("users", String(subject.id), diff),
    queryKey: recordQueryKey,
  });

  const redactedKeys = getExcludedColumns(viewer, accountVisibilitySchema, "user");

  return (
    <div className="flex flex-col gap-6">
      <UserResignationDetails user={subject} />

      <div className="sj-root rounded-lg border border-border bg-surface-elevated px-4">
        <p className="pt-4 font-serif text-lg text-text-primary">Profile</p>
        <div className="divide-y divide-border">
          <InlineField form={form} name="name" label="Full name" status={fieldStatus["name"]} bindField={bindField} commitField={commitField} />
          <InlineField form={form} name="communication_email" label="Communication email" type="email" status={fieldStatus["communication_email"]} bindField={bindField} commitField={commitField} />
          <InlineField form={form} name="phone_number" label="Phone" type="tel" status={fieldStatus["phone_number"]} bindField={bindField} commitField={commitField} />
          <InlineField form={form} name="email" label="Primary email" locked status={undefined} bindField={bindField} commitField={commitField} />
        </div>
      </div>

      <div className="sj-root">
        <RolesEditor subject={subject} recordQueryKey={recordQueryKey} />
      </div>

      <UserConnectorsSection
        user={subject}
        viewerAccount={viewer}
        tenant={tenant}
        onUpdated={() => qc.invalidateQueries({ queryKey: recordQueryKey })}
      />

      {/* Config groups (Personal/Medical/…) stay read-only until Stage C. */}
      <FormConfigDetail
        config={detailConfig ?? EMPTY_FORM_CONFIG}
        source={subject as unknown as Record<string, unknown>}
        isLoading={definitionsLoading}
        redactedKeys={redactedKeys}
      />
    </div>
  );
}
```

> Notes: the locked Primary email `InlineField` reads `form.watch("email")` — add `email` to the form `defaultValues` (locked, never edited) or pass the value via a dedicated prop. Simplest: add `email: subject.email ?? ""` to defaultValues so the locked row shows it. Verify `FormConfig` type name/exports in `@/types/form-config`.

- [ ] **Step 2: Build** — `npm run build`. Expected: compiles.

- [ ] **Step 3: Commit**
```bash
git add src/components/record/sections/record-overview.tsx
git commit -m "feat(record): RecordOverview with inline Profile + roles + connections"
```

---

## Task 6: Wire RecordOverview into the page

**Files:** Modify `src/app/(internal)/users/[id]/page.tsx`

- [ ] **Step 1: Replace the inline overview block with the component**

In `page.tsx`, replace the `{section === "overview" && user && ( ...AboutSection + FormConfigDetail... )}` block with:
```tsx
                  {section === "overview" && user && (
                    <RecordOverview
                      subject={user}
                      viewer={account!}
                      tenant={tenant}
                      recordQueryKey={recordQueryKey}
                      detailConfig={detailConfig}
                      definitionsLoading={Boolean(tenant) && definitionsStatus === "loading"}
                    />
                  )}
```
Add `import { RecordOverview } from "@/components/record/sections/record-overview";`. Remove the now-unused `AboutSection` import if nothing else uses it (grep first). Keep `FormConfigDetail`/`getExcludedColumns`/`accountVisibilitySchema` imports only if still referenced elsewhere in the file — otherwise remove (they moved into RecordOverview).

- [ ] **Step 2: Build + dev verify**

Open `/users/<id>` (Overview): editing name/phone/comm-email auto-saves on blur with "Saved · Undo"; Undo within 5s reverts; invalid email shows an inline error and does not save; primary email is locked; Roles save→confirm works; Connections render for eligible viewers; config groups still show read-only.

- [ ] **Step 3: Commit**
```bash
git add "src/app/(internal)/users/[id]/page.tsx"
git commit -m "feat(record): use RecordOverview (inline editing) for the overview section"
```

---

## Task 7: Validation gate

- [ ] **Step 1: Behavior** — auto-save (optimistic, persists on reload), Saved + 5s undo, inline validation blocks save, locked email, roles explicit+confirm, connections, read-only config groups unchanged; reduced-motion fallback for the Saved tick.
- [ ] **Step 2: Regressions** — non-record routes unaffected; Stage A swap still works; query cache stays consistent after edits (no stale identity strip — it reads the same `recordQueryKey`).
- [ ] **Step 3: Gate** — `npm run lint`; typecheck my files (`npx tsc --noEmit` then grep `components/record`); `npm run test:unit -- --run` (undo-core + existing pass). Full `npm run build` remains blocked only by the pre-existing unrelated `bulk-add-members` type error.
- [ ] **Step 4: Commit** any fixes.

---

## Self-Review (plan author)

**Spec coverage (Stage B):** auto-save scalars + optimistic + Saved + undo + inline validation → Tasks 1–3, 5; locked primary email → Task 3/5; Roles explicit+confirm → Task 4; Connections → Task 5; motion (`savedTick`) → Task 3; reuse autosave core → Task 5. Personal/config groups correctly deferred to Stage C (scope resolution).

**Type consistency:** `InlineField` props (`form/name/label/type/status/bindField/commitField/locked`) defined Task 3, consumed Task 5. `useUndo`/`undo-core` (Tasks 1–2) used by `InlineField`. `useAutosaveForm` return (`bindField/commitField/fieldStatus`) matches `src/hooks/use-autosave-form.ts`. `recordQueryKey` threaded from the page (Stage A) → RecordOverview → RolesEditor/autosave (same key = consistent cache).

**Flagged to verify against source (concrete, not placeholders):** `EntityChooserCheckbox` controlled props (Task 4); `FieldSaveState` export path (Task 3); `FormConfig` type export (Task 5); add `email` to Overview form defaults for the locked row; remove `AboutSection`/now-unused imports from `page.tsx` after the swap (Task 6).

---

## Execution Handoff

Plan complete and saved. Stage C (config-group editors, payroll/HR/public-profile inline, remove `/edit`, resign/delete rebuild) follows after B. Two execution options:
1. **Subagent-Driven (recommended)** — fresh subagent per task, review between.
2. **Inline Execution** — execute here with checkpoints.
