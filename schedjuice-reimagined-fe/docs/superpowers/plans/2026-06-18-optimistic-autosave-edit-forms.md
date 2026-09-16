# Optimistic Autosave for Edit Forms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace explicit/grouped save buttons on edit forms with automatic optimistic autosave-on-blur, driven by one reusable `useAutosaveForm` hook.

**Architecture:** A pure-function core (`src/lib/autosave/autosave-core.ts`) holds all testable logic (dirty-diff collection, atomic-unit resolution, status derivation, cache merge). A thin React hook (`src/hooks/use-autosave-form.ts`) wires react-hook-form + TanStack Query to that core. Shared UI components surface status. Forms opt in via the hook directly (completion sheet, users, courses) or via a thin `autosave` prop on `AutoForm`/`GenericForm` (Tier 1 entity edits).

**Tech Stack:** Next.js 15 / React 19, react-hook-form 7 + Zod 3, TanStack Query v4, Axios (`updateEntity` PUT), Vitest (node env, pure-function tests only).

---

## Testing Note (read first)

The repo's Vitest config (`vitest.config.mts`) uses `environment: "node"` and `include: ["src/**/*.test.ts"]`. There is **no** `@testing-library/react` / jsdom. Therefore:
- **All TDD in this plan targets pure functions in `.ts` files** (the `autosave-core` module). These run under `npm run test:unit`.
- **React glue (the hook + UI + form conversions) is NOT unit-tested** here. It is verified via `npm run lint` + `npm run build` (type-check) + an explicit **manual verification checklist** per task. Adding jsdom + Testing Library is a deliberate out-of-scope follow-up.

## Commit Policy Note

This repo follows a no-git-commits rule: **do not run the `git commit` steps below unless the user has explicitly authorized commits.** The commit steps are written per the planning standard; when executing without commit authorization, complete the code + verification steps and skip the commit, or batch into a single commit when the user asks.

## File Structure

**Create:**
- `src/lib/autosave/autosave-core.ts` — pure logic: types, `collectDirtyValidFields`, `buildDiffPayload`, `fieldsForFlush`, `isUnitReady`, `deriveFormStatus`, `mergeEntityDiff`.
- `src/lib/autosave/autosave-core.test.ts` — Vitest node tests for the core.
- `src/hooks/use-autosave-form.ts` — React hook wiring RHF + TanStack + core.
- `src/components/form/autosave-status.tsx` — form-level status summary + Retry all.
- `src/components/form/field-save-indicator.tsx` — per-field saving/error marker + Retry.

**Modify (Phase 1):**
- `src/components/ui/auto-form.tsx` — add optional `onFieldBlur` capture-phase hook-point (Task 7).
- `src/components/form/generic-form.tsx` — add `autosave` prop; swap Submit for `AutosaveStatus` when autosaving (Task 8).
- `src/components/custom-fields/completion/completion-group-form.tsx` — drop Save button, use the hook, per-group status (Task 6).
- The 3 GenericForm Tier 1 edit pages — add `autosave` prop (Task 9).
- The 4 AutoForm-direct Tier 1 edit pages — inline hook + `onFieldBlur` + status (Task 10).

**Modify (Phase 2 — separate plan):**
- `src/app/(internal)/courses/[id]/edit/page.tsx` — autosave Course Information scalars only.
- `src/components/users/user-form.tsx` (via `user-edit-form-inner.tsx`) — autosave builtin scalar sections (exclude custom-field section).
- `src/components/form/form-dirty-before-unload.tsx` — repurpose guard for in-flight/error autosave state.

---

### Task 1: Autosave core — dirty-diff collection

**Files:**
- Create: `src/lib/autosave/autosave-core.ts`
- Test: `src/lib/autosave/autosave-core.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { collectDirtyValidFields, buildDiffPayload } from "./autosave-core";

describe("collectDirtyValidFields", () => {
  it("returns dirty fields that are not invalid, sorted", () => {
    expect(
      collectDirtyValidFields({
        dirtyFields: { name: true, price: true, code: false },
        invalidFields: ["price"],
      }),
    ).toEqual(["name"]);
  });

  it("returns empty when nothing is dirty", () => {
    expect(
      collectDirtyValidFields({ dirtyFields: { name: false }, invalidFields: [] }),
    ).toEqual([]);
  });
});

describe("buildDiffPayload", () => {
  it("picks only the named fields", () => {
    expect(
      buildDiffPayload({ name: "A", price: 5, extra: "x" }, ["name", "price"]),
    ).toEqual({ name: "A", price: 5 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/autosave/autosave-core.test.ts`
Expected: FAIL — cannot find module `./autosave-core`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/autosave/autosave-core.ts`:

```ts
export type FieldSaveState = "saving" | "saved" | "error";
export type FormSaveStatus = "idle" | "saving" | "saved" | "error";

export type CollectInput = {
  dirtyFields: Record<string, boolean>;
  invalidFields: ReadonlyArray<string>;
};

/** Names of fields that are dirty AND not currently invalid, sorted for determinism. */
export function collectDirtyValidFields(input: CollectInput): string[] {
  const invalid = new Set(input.invalidFields);
  return Object.keys(input.dirtyFields)
    .filter((name) => input.dirtyFields[name] && !invalid.has(name))
    .sort();
}

/** Build a flat payload picking the given field names from values. */
export function buildDiffPayload(
  values: Record<string, unknown>,
  fieldNames: ReadonlyArray<string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const name of fieldNames) {
    out[name] = values[name];
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/autosave/autosave-core.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit** (only if commits are authorized — see Commit Policy Note)

```bash
git add src/lib/autosave/autosave-core.ts src/lib/autosave/autosave-core.test.ts
git commit -m "feat(autosave): add dirty-diff collection core"
```

---

### Task 2: Autosave core — atomic unit resolution

**Files:**
- Modify: `src/lib/autosave/autosave-core.ts`
- Test: `src/lib/autosave/autosave-core.test.ts`

- [ ] **Step 1: Write the failing test** (append to the test file)

```ts
import { fieldsForFlush, isUnitReady } from "./autosave-core";

describe("fieldsForFlush", () => {
  it("returns the whole unit when the blurred field is in a unit", () => {
    expect(
      fieldsForFlush("start_date", [["start_date", "end_date"]]),
    ).toEqual(["start_date", "end_date"]);
  });

  it("returns just the field when it is in no unit", () => {
    expect(fieldsForFlush("name", [["start_date", "end_date"]])).toEqual([
      "name",
    ]);
  });

  it("defaults to the field alone when no units are given", () => {
    expect(fieldsForFlush("name")).toEqual(["name"]);
  });
});

describe("isUnitReady", () => {
  it("is not ready while focus is still inside the unit", () => {
    expect(isUnitReady(["start_date", "end_date"], "end_date", [])).toBe(false);
  });

  it("is not ready when a unit field is invalid", () => {
    expect(isUnitReady(["start_date", "end_date"], null, ["end_date"])).toBe(
      false,
    );
  });

  it("is ready when focus left the unit and all fields are valid", () => {
    expect(isUnitReady(["start_date", "end_date"], "name", [])).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/autosave/autosave-core.test.ts`
Expected: FAIL — `fieldsForFlush`/`isUnitReady` not exported.

- [ ] **Step 3: Write minimal implementation** (append to `autosave-core.ts`)

```ts
/** Fields that must flush together when `blurredField` blurs. */
export function fieldsForFlush(
  blurredField: string,
  units: ReadonlyArray<ReadonlyArray<string>> = [],
): string[] {
  const unit = units.find((u) => u.includes(blurredField));
  return unit ? [...unit] : [blurredField];
}

/**
 * Whether a unit may flush: focus has left the whole unit (activeField not in
 * the unit) AND none of the unit's fields are invalid.
 */
export function isUnitReady(
  unitFields: ReadonlyArray<string>,
  activeField: string | null,
  invalidFields: ReadonlyArray<string>,
): boolean {
  if (activeField && unitFields.includes(activeField)) return false;
  const invalid = new Set(invalidFields);
  return !unitFields.some((f) => invalid.has(f));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/autosave/autosave-core.test.ts`
Expected: PASS (all Task 1 + Task 2 tests).

- [ ] **Step 5: Commit** (only if authorized)

```bash
git add src/lib/autosave/autosave-core.ts src/lib/autosave/autosave-core.test.ts
git commit -m "feat(autosave): add atomic unit resolution"
```

---

### Task 3: Autosave core — status derivation + cache merge

**Files:**
- Modify: `src/lib/autosave/autosave-core.ts`
- Test: `src/lib/autosave/autosave-core.test.ts`

- [ ] **Step 1: Write the failing test** (append)

```ts
import { deriveFormStatus, mergeEntityDiff } from "./autosave-core";

describe("deriveFormStatus", () => {
  it("returns error if any field errored", () => {
    expect(deriveFormStatus({ a: "saved", b: "error" })).toBe("error");
  });
  it("returns saving if any saving and none errored", () => {
    expect(deriveFormStatus({ a: "saved", b: "saving" })).toBe("saving");
  });
  it("returns saved if any saved and none saving/errored", () => {
    expect(deriveFormStatus({ a: "saved" })).toBe("saved");
  });
  it("returns idle when empty", () => {
    expect(deriveFormStatus({})).toBe("idle");
  });
});

describe("mergeEntityDiff", () => {
  it("merges a diff into the nested entity immutably", () => {
    const cache = { data: { data: { id: 1, name: "Old", price: 5 } } };
    const next = mergeEntityDiff(cache, { name: "New" });
    expect(next.data.data).toEqual({ id: 1, name: "New", price: 5 });
    expect(next).not.toBe(cache);
    expect(cache.data.data.name).toBe("Old");
  });
  it("returns the cache untouched when shape is unexpected", () => {
    const cache = { nope: true } as unknown as { data?: { data?: Record<string, unknown> } };
    expect(mergeEntityDiff(cache, { name: "x" })).toBe(cache);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/autosave/autosave-core.test.ts`
Expected: FAIL — `deriveFormStatus`/`mergeEntityDiff` not exported.

- [ ] **Step 3: Write minimal implementation** (append to `autosave-core.ts`)

```ts
/** Roll a per-field status map up into a single form-level status. */
export function deriveFormStatus(
  fieldStatus: Record<string, FieldSaveState>,
): FormSaveStatus {
  const states = Object.values(fieldStatus);
  if (states.includes("error")) return "error";
  if (states.includes("saving")) return "saving";
  if (states.includes("saved")) return "saved";
  return "idle";
}

/**
 * Merge a partial diff into a cached entity object immutably.
 * Cache shape from fetchEntity is { data: { data: <entity> } }.
 */
export function mergeEntityDiff<
  T extends { data?: { data?: Record<string, unknown> } },
>(cache: T, diff: Record<string, unknown>): T {
  if (!cache?.data?.data) return cache;
  return {
    ...cache,
    data: {
      ...cache.data,
      data: { ...cache.data.data, ...diff },
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/autosave/autosave-core.test.ts`
Expected: PASS (all core tests).

- [ ] **Step 5: Commit** (only if authorized)

```bash
git add src/lib/autosave/autosave-core.ts src/lib/autosave/autosave-core.test.ts
git commit -m "feat(autosave): add status derivation and cache merge"
```

---

### Task 4: `useAutosaveForm` hook (React glue)

**Files:**
- Create: `src/hooks/use-autosave-form.ts`

> Not unit-tested (node-only Vitest, no Testing Library). Verify via lint + build + the manual checklist in Step 3.

- [ ] **Step 1: Write the hook**

Create `src/hooks/use-autosave-form.ts`:

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import {
  buildDiffPayload,
  collectDirtyValidFields,
  deriveFormStatus,
  fieldsForFlush,
  isUnitReady,
  mergeEntityDiff,
  type FieldSaveState,
  type FormSaveStatus,
} from "@/lib/autosave/autosave-core";

export type UseAutosaveFormOptions = {
  form: UseFormReturn<any>;
  /** Persist a partial diff. Typically (diff) => updateEntity(apiUrl, id, diff). */
  save: (diff: Record<string, unknown>) => Promise<unknown>;
  /** TanStack key for optimistic write + rollback. */
  queryKey: unknown[];
  /** Atomic field groups that must save together (cross-field validation, config drivers). */
  units?: string[][];
  /**
   * Transform the changed field names + current values into the request body.
   * Default builds a flat `{ field: value }` diff. Forms with nested payloads
   * (e.g. completion's custom_data) supply their own (e.g. collectGroupPayload).
   */
  buildPayload?: (
    changedFields: string[],
    values: Record<string, unknown>,
  ) => Record<string, unknown>;
  /** Default true. Create forms pass false to no-op. */
  enabled?: boolean;
};

export type UseAutosaveFormReturn = {
  status: FormSaveStatus;
  fieldStatus: Record<string, FieldSaveState>;
  retry: (field: string) => void;
  retryAll: () => void;
  bindField: (name: string) => { onBlur: () => void };
};

/** Flatten RHF dirtyFields into dotted-path booleans (e.g. "custom_data.foo": true). */
function flattenDirty(
  dirty: Record<string, unknown>,
  prefix = "",
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const k of Object.keys(dirty)) {
    const path = prefix ? `${prefix}.${k}` : k;
    const val = dirty[k];
    if (val && typeof val === "object" && !Array.isArray(val)) {
      Object.assign(out, flattenDirty(val as Record<string, unknown>, path));
    } else {
      out[path] = Boolean(val);
    }
  }
  return out;
}

export function useAutosaveForm(
  options: UseAutosaveFormOptions,
): UseAutosaveFormReturn {
  const {
    form,
    save,
    queryKey,
    units = [],
    enabled = true,
    buildPayload = (fields, values) => buildDiffPayload(values, fields),
  } = options;
  const queryClient = useQueryClient();
  const [fieldStatus, setFieldStatus] = useState<Record<string, FieldSaveState>>(
    {},
  );
  const inflight = useRef<Set<string>>(new Set());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const setStatus = useCallback(
    (fields: string[], state: FieldSaveState | undefined) => {
      if (!mounted.current) return;
      setFieldStatus((prev) => {
        const next = { ...prev };
        for (const f of fields) {
          if (state === undefined) delete next[f];
          else next[f] = state;
        }
        return next;
      });
    },
    [],
  );

  const flush = useCallback(
    async (fields: string[]) => {
      if (!enabled || fields.length === 0) return;
      const target = fields.filter((f) => !inflight.current.has(f));
      if (target.length === 0) return;

      const values = form.getValues();
      const payload = buildPayload(target, values);

      const prevCache = queryClient.getQueryData(queryKey);
      if (prevCache !== undefined) {
        queryClient.setQueryData(
          queryKey,
          mergeEntityDiff(
            prevCache as { data?: { data?: Record<string, unknown> } },
            payload,
          ),
        );
      }

      target.forEach((f) => inflight.current.add(f));
      setStatus(target, "saving");

      try {
        await save(payload);
        setStatus(target, "saved");
        // Clear dirty flags for saved fields (keeps typed value as the new baseline).
        target.forEach((f) => form.resetField(f, { defaultValue: values[f] }));
      } catch {
        // Roll back the cache; KEEP the user's typed value in form state.
        if (prevCache !== undefined) queryClient.setQueryData(queryKey, prevCache);
        setStatus(target, "error");
      } finally {
        target.forEach((f) => inflight.current.delete(f));
      }
    },
    [enabled, form, queryClient, queryKey, save, setStatus, buildPayload],
  );

  const handleBlur = useCallback(
    async (name: string) => {
      if (!enabled) return;
      const group = fieldsForFlush(name, units);
      const activeField =
        typeof document !== "undefined"
          ? (document.activeElement as HTMLElement | null)?.getAttribute("name") ??
            null
          : null;

      await form.trigger(group as never);
      const invalidFields = group.filter((f) => form.getFieldState(f).invalid);

      // Multi-field unit: only flush once focus leaves the whole unit and all valid.
      if (group.length > 1 && !isUnitReady(group, activeField, invalidFields)) {
        return;
      }

      const dirtyFields = flattenDirty(form.formState.dirtyFields);
      const candidates = collectDirtyValidFields({ dirtyFields, invalidFields });
      const groupDirtyValid = group.filter(
        (f) => dirtyFields[f] && !invalidFields.includes(f),
      );
      const toFlush = Array.from(new Set([...groupDirtyValid, ...candidates]));
      await flush(toFlush);
    },
    [enabled, flush, form, units],
  );

  const bindField = useCallback(
    (name: string) => ({ onBlur: () => void handleBlur(name) }),
    [handleBlur],
  );

  const retry = useCallback(
    (field: string) => {
      void flush(fieldsForFlush(field, units));
    },
    [flush, units],
  );

  const retryAll = useCallback(() => {
    const errored = Object.keys(fieldStatus).filter(
      (f) => fieldStatus[f] === "error",
    );
    void flush(errored);
  }, [fieldStatus, flush]);

  return { status: deriveFormStatus(fieldStatus), fieldStatus, retry, retryAll, bindField };
}
```

- [ ] **Step 2: Type-check + lint**

Run: `npm run lint`
Expected: no new errors in `src/hooks/use-autosave-form.ts`.
Run: `npm run build`
Expected: compiles (type-check passes).

- [ ] **Step 3: Manual verification checklist** (deferred until a form is wired in Task 7; record here)

- [ ] Editing a text field then blurring fires exactly one `save` with only that field.
- [ ] A field failing Zod validation does not fire a save and shows its inline error.
- [ ] A failed save keeps the typed value and sets the field to `error`.
- [ ] On failure, the TanStack cache reverts to its prior value (other views unaffected).
- [ ] Declaring a 2-field unit defers save until focus leaves both fields.

- [ ] **Step 4: Commit** (only if authorized)

```bash
git add src/hooks/use-autosave-form.ts
git commit -m "feat(autosave): add useAutosaveForm hook"
```

---

### Task 5: Status UI components

**Files:**
- Create: `src/components/form/autosave-status.tsx`
- Create: `src/components/form/field-save-indicator.tsx`

> Visual styling per design-taste-frontend: neutral palette, lucide icons at `size-3/3.5`, no glows, no AI-purple. Saved state on fields stays silent.

- [ ] **Step 1: Create `autosave-status.tsx`**

```tsx
"use client";

import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FormSaveStatus } from "@/lib/autosave/autosave-core";

export function AutosaveStatus({
  status,
  onRetryAll,
  className,
}: {
  status: FormSaveStatus;
  onRetryAll?: () => void;
  className?: string;
}) {
  if (status === "idle") return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center gap-1.5 text-xs text-muted-foreground",
        className,
      )}
    >
      {status === "saving" && (
        <>
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          <span>Saving...</span>
        </>
      )}
      {status === "saved" && (
        <>
          <Check className="size-3.5 text-emerald-600" aria-hidden />
          <span>All changes saved</span>
        </>
      )}
      {status === "error" && (
        <>
          <AlertTriangle className="size-3.5 text-destructive" aria-hidden />
          <span className="text-destructive">Couldn't save changes</span>
          {onRetryAll && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-auto px-1.5 py-0.5 text-xs"
              onClick={onRetryAll}
            >
              Retry all
            </Button>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `field-save-indicator.tsx`**

```tsx
"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FieldSaveState } from "@/lib/autosave/autosave-core";

export function FieldSaveIndicator({
  state,
  onRetry,
  className,
}: {
  state?: FieldSaveState;
  onRetry?: () => void;
  className?: string;
}) {
  if (!state || state === "saved") return null;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", className)}>
      {state === "saving" && (
        <>
          <Loader2 className="size-3 animate-spin text-muted-foreground" aria-hidden />
          <span className="text-muted-foreground">Saving...</span>
        </>
      )}
      {state === "error" && (
        <>
          <AlertTriangle className="size-3 text-destructive" aria-hidden />
          <span className="text-destructive">Couldn't save</span>
          {onRetry && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-auto px-1 py-0 text-xs"
              onClick={onRetry}
            >
              Retry
            </Button>
          )}
        </>
      )}
    </span>
  );
}
```

- [ ] **Step 3: Type-check + lint**

Run: `npm run lint`
Expected: no new errors in the two files.

- [ ] **Step 4: Commit** (only if authorized)

```bash
git add src/components/form/autosave-status.tsx src/components/form/field-save-indicator.tsx
git commit -m "feat(autosave): add status UI components"
```

---

### Task 6: Pilot — convert the completion group form

**Files:**
- Modify: `src/components/custom-fields/completion/completion-group-form.tsx`

This is the proving ground (the screenshot). Each `CompletionGroupForm` is already one form + one mutation per group. We drop the `Save {group.name}` button, autosave on blur, and show a group-level status by the heading. Custom fields are nested under `custom_data`, so we supply a `buildPayload` that rebuilds the group payload via `collectGroupPayload`, and we map server errors inside `save` (rethrowing so the hook rolls back + flags the field).

- [ ] **Step 1: Replace the file contents**

```tsx
"use client";

import { updateEntity } from "@/app/client-api/utils";
import { GroupSection } from "@/components/custom-fields/group-section";
import { AutosaveStatus } from "@/components/form/autosave-status";
import { Form } from "@/components/ui/form";
import { useToast } from "@/components/ui/use-toast";
import { prepareUserFormPayload } from "@/components/users/user-form-utils";
import { setFormErrrors, scheduleScrollToFirstFormError } from "@/helpers/form";
import { useAutosaveForm } from "@/hooks/use-autosave-form";
import { collectGroupPayload } from "@/lib/custom-fields/completion";
import type { FormActor } from "@/lib/custom-fields/field-policy";
import { useTenant } from "@/hooks/useTenant";
import type { FormConfigGroup } from "@/types/form-config";
import { useForm } from "react-hook-form";

export function CompletionGroupForm({
  userId,
  group,
  actor,
  onSaved,
}: {
  userId: number;
  group: FormConfigGroup;
  actor: FormActor;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const { tenant } = useTenant();
  const form = useForm({ defaultValues: { custom_data: {} } });

  const autosave = useAutosaveForm({
    form,
    queryKey: ["getUser", userId],
    buildPayload: () => {
      const values = form.getValues();
      const normalized = prepareUserFormPayload(
        values as Record<string, unknown>,
        { mode: "edit", tenant, fields: group.fields },
      );
      return collectGroupPayload(group.fields, normalized);
    },
    save: async (payload) => {
      try {
        const res = await updateEntity("users", userId, payload);
        onSaved();
        return res;
      } catch (e) {
        const applied = setFormErrrors(e, form);
        if (applied) scheduleScrollToFirstFormError(form);
        toast({ variant: "destructive", description: "Could not save." });
        throw e; // let the hook roll back the cache and flag error
      }
    },
  });

  return (
    <Form {...form}>
      <div
        onBlurCapture={(e) => {
          const name = (e.target as HTMLElement).getAttribute("name");
          if (name) autosave.bindField(name).onBlur();
        }}
        className="space-y-4 border-t pt-4"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{group.name}</h3>
          <AutosaveStatus status={autosave.status} onRetryAll={autosave.retryAll} />
        </div>
        <GroupSection form={form} group={group} surface="edit" actor={actor} />
      </div>
    </Form>
  );
}
```

- [ ] **Step 2: Type-check + lint**

Run: `npm run lint`
Expected: no new errors. (Note: `Button` and `useMutation` imports are intentionally removed.)
Run: `npm run build`
Expected: compiles.

- [ ] **Step 3: Manual verification** (run `npm run dev`, open a user with profile-completion items)

- [ ] Each group section no longer shows a `Save {group.name}` button.
- [ ] Editing a field and clicking away saves it (Network: PUT `users/{id}` with that group's payload).
- [ ] The group heading shows `Saving...` then `All changes saved`.
- [ ] Forcing a 400 (e.g. clearing a required field server-side) keeps the typed value, shows `Couldn't save changes` with `Retry all`, and inline field error.
- [ ] `Retry all` re-sends and clears the error on success.

- [ ] **Step 4: Commit** (only if authorized)

```bash
git add src/components/custom-fields/completion/completion-group-form.tsx
git commit -m "feat(autosave): convert completion group form to autosave (pilot)"
```

---

### Task 7: Add `onFieldBlur` hook-point to AutoForm

**Files:**
- Modify: `src/components/ui/auto-form.tsx` (the `AutoForm` component, ~lines 1056-1133)

A single capture-phase blur handler reads the blurred input's `name` and forwards it. Minimal and reusable; field rendering is untouched.

- [ ] **Step 1: Add the prop to the type signature**

In the `AutoForm` props object type, after `formId?: string;` add:

```tsx
  /** Called with the field name when any field inside the form blurs (capture phase). */
  onFieldBlur?: (name: string) => void;
```

And add `onFieldBlur` to the destructured params (after `fieldsClassName`):

```tsx
  fieldsClassName,
  onFieldBlur,
```

- [ ] **Step 2: Attach capture-phase blur on the `<form>`**

Change the opening `<form>` tag to add `onBlurCapture`:

```tsx
      <form
        id={formId}
        onSubmit={(e) => {
          formInstance.handleSubmit(onSubmit, onInvalid)(e);
        }}
        onBlurCapture={(e) => {
          if (!onFieldBlur) return;
          const name = (e.target as HTMLElement).getAttribute("name");
          if (name) onFieldBlur(name);
        }}
        onInvalidCapture={handleNativeFormInvalid}
        className={cn("w-full", className)}
      >
```

- [ ] **Step 3: Type-check + lint**

Run: `npm run lint` then `npm run build`
Expected: compiles; no new errors. Existing AutoForm usages are unaffected (prop is optional).

- [ ] **Step 4: Commit** (only if authorized)

```bash
git add src/components/ui/auto-form.tsx
git commit -m "feat(autosave): add onFieldBlur hook-point to AutoForm"
```

---

### Task 8: Wire autosave into GenericForm

**Files:**
- Modify: `src/components/form/generic-form.tsx`

Add an `autosave` prop. When set (edit mode), GenericForm instantiates the hook, forwards blur to AutoForm, renders `AutosaveStatus` instead of the Submit button, and maps server errors inside `save`. The hook's `queryKey` must match GenericForm's existing query key exactly: `[`get${entityName}`, entityId, true]`.

- [ ] **Step 1: Add imports** (top of file)

```tsx
import { useAutosaveForm } from "@/hooks/use-autosave-form";
import { AutosaveStatus } from "@/components/form/autosave-status";
```

- [ ] **Step 2: Add `autosave` to props**

In `GenericFormProps` add:

```tsx
  /** Edit-mode only: replace the Submit button with optimistic autosave-on-blur. */
  autosave?: boolean;
```

And destructure it in the component params: add `autosave = false,` after `watchValues,`.

- [ ] **Step 3: Instantiate the hook (after `form` is resolved, before `createEnhancedFieldType`)**

```tsx
  const isAutosave = autosave && isEdit;
  const autosaveApi = useAutosaveForm({
    form,
    enabled: isAutosave,
    queryKey: [`get${entityName}`, entityId, true],
    save: async (payload) => {
      try {
        return await updateEntity(apiUrl, entityId!, payload);
      } catch (e) {
        const applied = setFormErrrors(e, form);
        if (applied) scheduleScrollToFirstFormError(form);
        throw e; // hook rolls back cache + flags error
      }
    },
  });
```

- [ ] **Step 4: Forward blur + swap the footer**

Pass `onFieldBlur` to `AutoForm` (add the prop on the `<AutoForm ...>` element):

```tsx
      onFieldBlur={isAutosave ? (name) => autosaveApi.bindField(name).onBlur() : undefined}
```

Replace the footer `<div className="space-x-3 mt-3"> ... </div>` block with:

```tsx
      {isAutosave ? (
        <div className="mt-3">
          <AutosaveStatus
            status={autosaveApi.status}
            onRetryAll={autosaveApi.retryAll}
          />
        </div>
      ) : (
        <div className="space-x-3 mt-3">
          <Button
            isLoading={
              createMutation.isLoading ||
              (isEdit && (isLoading || isLoadingProp)) ||
              updateMutation.isLoading ||
              isLoadingProp
            }
            type="submit"
          >
            Submit
          </Button>
          {onCancel && (
            <Button
              isLoading={
                createMutation.isLoading ||
                (isEdit && (isLoading || isLoadingProp)) ||
                updateMutation.isLoading ||
                isLoadingProp
              }
              type="button"
              onClick={onCancel}
              variant={"secondary"}
            >
              Cancel
            </Button>
          )}
        </div>
      )}
```

- [ ] **Step 5: Type-check + lint**

Run: `npm run lint` then `npm run build`
Expected: compiles; existing non-autosave GenericForm usages unchanged.

- [ ] **Step 6: Commit** (only if authorized)

```bash
git add src/components/form/generic-form.tsx
git commit -m "feat(autosave): add autosave mode to GenericForm"
```

---

### Task 9: Tier 1 — GenericForm-based edits (campuses, payment-plans, course-roles)

**Files:**
- Modify: `src/app/(internal)/campuses/[id]/edit/page.tsx`
- Modify: `src/app/(internal)/payment-plans/[id]/edit/page.tsx`
- Modify: `src/app/(internal)/course-roles/[id]/edit/page.tsx`

These already render `<GenericForm isEdit ... />`. After Task 8, enabling autosave is adding the `autosave` prop.

- [ ] **Step 1: campuses** — add `autosave` to the `GenericForm`:

```tsx
      <GenericForm
        isEdit={true}
        autosave
        entityId={id}
        entityName="Campus"
        apiUrl="campuses"
        schema={CampusCreateEditSchema}
      ></GenericForm>
```

- [ ] **Step 2: payment-plans** — add `autosave`:

```tsx
      <GenericForm
        isEdit={true}
        autosave
        entityId={id}
        entityName="Payment Plan"
        apiUrl="payment-plans"
        schema={paymentPlanCreateEditSchema}
        fieldConfig={{
          ...paymentPlanDescription,
        }}
      ></GenericForm>
```

- [ ] **Step 3: course-roles** — add `autosave`:

```tsx
      <GenericForm
        entityId={id}
        autosave
        watchValues={["seniority"]}
        schema={assignedAsRoleCreateSchema}
        entityName="course role"
        apiUrl="assigned-as-roles"
        redirectUrl={`/course-roles/${id}`}
        isEdit={true}
      />
```

- [ ] **Step 4: Verify**

Run: `npm run lint` then `npm run build`. Then `npm run dev` and for each page: edit a field, blur, confirm a PUT fires and the form-level status shows `Saving...` -> `All changes saved`; no Submit button remains.

- [ ] **Step 5: Commit** (only if authorized)

```bash
git add "src/app/(internal)/campuses/[id]/edit/page.tsx" "src/app/(internal)/payment-plans/[id]/edit/page.tsx" "src/app/(internal)/course-roles/[id]/edit/page.tsx"
git commit -m "feat(autosave): enable autosave on campuses, payment-plans, course-roles edit"
```

---

### Task 10: Tier 1 — AutoForm-direct edits (payment-methods, categories, payment-infos, departments)

**Files:**
- Modify: `src/app/(internal)/payment-methods/[id]/edit/page.tsx`
- Modify: `src/app/(internal)/categories/[id]/edit/page.tsx`
- Modify: `src/app/(internal)/payment-infos/[id]/edit/page.tsx`
- Modify: `src/app/(internal)/(department)/departments/[id]/edit/page.tsx`

These render `AutoForm` directly with a local `useForm` + update `useMutation`. Conversion pattern per page: add the hook, forward `onFieldBlur`, and replace the Submit `<Button>` with `<AutosaveStatus>`. The hook's `queryKey` must equal each page's existing `useQuery` key so optimistic writes hit the right cache entry.

- [ ] **Step 1: payment-methods — add imports**

```tsx
import { useAutosaveForm } from "@/hooks/use-autosave-form";
import { AutosaveStatus } from "@/components/form/autosave-status";
import { setFormErrrors, scheduleScrollToFirstFormError } from "@/helpers/form";
```

- [ ] **Step 2: payment-methods — add the hook** (after the `updatePaymentMethod` mutation)

```tsx
  const autosave = useAutosaveForm({
    form,
    queryKey: ["getPaymentMethod", id],
    save: async (payload) => {
      try {
        return await updateEntity("payment-methods", id, payload);
      } catch (e) {
        const applied = setFormErrrors(e, form);
        if (applied) scheduleScrollToFirstFormError(form);
        throw e;
      }
    },
  });
```

- [ ] **Step 3: payment-methods — forward blur + swap submit**

In the `<AutoForm ...>`, add `onFieldBlur={(name) => autosave.bindField(name).onBlur()}`, and replace the `<Button type="submit">...</Button>` child with:

```tsx
          <AutosaveStatus status={autosave.status} onRetryAll={autosave.retryAll} />
```

The result:

```tsx
        <AutoForm
          fieldConfig={{
            payment_bank: {
              inputProps: {
                required: true,
              },
            },
          }}
          formInstance={form}
          formSchema={paymentMethodCreateEditSchema}
          onSubmit={(data) => updatePaymentMethod.mutate(data)}
          onFieldBlur={(name) => autosave.bindField(name).onBlur()}
        >
          <AutosaveStatus status={autosave.status} onRetryAll={autosave.retryAll} />
        </AutoForm>
```

- [ ] **Step 4: categories — same pattern**

Add imports (as Step 1). Add the hook after the `updateCategory` mutation:

```tsx
  const autosave = useAutosaveForm({
    form,
    queryKey: ["getCategory", id],
    save: async (payload) => {
      try {
        return await updateEntity("categories", id, payload);
      } catch (e) {
        const applied = setFormErrrors(e, form);
        if (applied) scheduleScrollToFirstFormError(form);
        throw e;
      }
    },
  });
```

Update the `AutoForm` block:

```tsx
      <AutoForm
        formInstance={form}
        formSchema={categoryCreateUpdateSchema}
        onSubmit={(data) => updateCategory.mutate(data)}
        onFieldBlur={(name) => autosave.bindField(name).onBlur()}
      >
        <AutosaveStatus status={autosave.status} onRetryAll={autosave.retryAll} />
      </AutoForm>
```

- [ ] **Step 5: payment-infos — same pattern**

Add imports (as Step 1). Add the hook after the `updatePaymentInfo` mutation:

```tsx
  const autosave = useAutosaveForm({
    form,
    queryKey: ["getPaymentInfo", id],
    save: async (payload) => {
      try {
        return await updateEntity("payment-infos", id, payload);
      } catch (e) {
        const applied = setFormErrrors(e, form);
        if (applied) scheduleScrollToFirstFormError(form);
        throw e;
      }
    },
  });
```

Update the `AutoForm` block (note `is_default` is a toggle = instant control, saves on blur/change):

```tsx
            <AutoForm
              fieldConfig={fieldConfig}
              formInstance={form}
              formSchema={paymentInfoCreateEditSchema}
              onSubmit={(payload) => updatePaymentInfo.mutate(payload)}
              onFieldBlur={(name) => autosave.bindField(name).onBlur()}
            >
              <div className="flex justify-end border-t pt-4">
                <AutosaveStatus status={autosave.status} onRetryAll={autosave.retryAll} />
              </div>
            </AutoForm>
```

- [ ] **Step 6: departments — same pattern (Information tab only)**

Add imports (as Step 1). Add the hook after the `updateDepartment` mutation:

```tsx
  const autosave = useAutosaveForm({
    form,
    queryKey: ["getDepartment", id],
    save: async (payload) => {
      try {
        return await updateEntity("departments", String(id), payload);
      } catch (e) {
        const applied = setFormErrrors(e, form);
        if (applied) scheduleScrollToFirstFormError(form);
        throw e;
      }
    },
  });
```

Update only the Information-tab `AutoForm`:

```tsx
          <AutoForm
            formInstance={form}
            formSchema={departmentCreateSchema}
            onSubmit={(v) => updateDepartment.mutate(v)}
            onFieldBlur={(name) => autosave.bindField(name).onBlur()}
          >
            <AutosaveStatus status={autosave.status} onRetryAll={autosave.retryAll} />
          </AutoForm>
```

Leave the Members and Job-positions tabs untouched (they have their own mutations/dialogs).

- [ ] **Step 7: Verify all four**

Run: `npm run lint` then `npm run build`. Then `npm run dev`: for each page edit a field, blur, confirm PUT fires + status transitions; confirm the `DeleteZone` still works; confirm departments Members/Job tabs unaffected.

- [ ] **Step 8: Commit** (only if authorized)

```bash
git add "src/app/(internal)/payment-methods/[id]/edit/page.tsx" "src/app/(internal)/categories/[id]/edit/page.tsx" "src/app/(internal)/payment-infos/[id]/edit/page.tsx" "src/app/(internal)/(department)/departments/[id]/edit/page.tsx"
git commit -m "feat(autosave): enable autosave on AutoForm-direct tier-1 edits"
```

---

## Phase 2 — Complex forms + navigation guard (separate follow-up plan)

`users/[id]/edit` and `courses/[id]/edit` reuse the Phase 1 engine but each need bespoke payload transforms, field-inclusion boundaries, and cross-field validation handling. They are intentionally deferred to a dedicated plan so Phase 1 ships as a clean, low-risk increment. The boundaries and hooks below are decided and ready to seed that plan:

### Phase 2 / Task A: `courses/[id]/edit` — Course Information scalars only

- **File:** `src/app/(internal)/courses/[id]/edit/page.tsx`.
- **Form:** `adminForm` (schema `partiallyOmittedCourseSchema`), rendered as `AutoFormObject` cards inside the `edit-info` tab.
- **Include:** Information scalar fields from `courseEditSections`.
- **Exclude (keep current explicit save):** `start_date`, `end_date` (schedule-specific), the Daily Note TipTap editor + its "Save Daily Note" button, `CourseZoomMeetingEditSection`, `MicrosoftTeamCard`, and the entire `edit-schedule` Calendar tab.
- **Hook wiring:** `useAutosaveForm({ form: adminForm, queryKey: [`getCourse${id}`], save, buildPayload })` where:
  - `buildPayload(fields, values)` mirrors the existing `onSubmit`: run `validateCourseProgramFields` (block save + setError on cross-field failure), `sanitizeCoursePayloadForProgram`, `cleanDatesForBackend(..., ["start_date","end_date"])`, and the `exam_session_date` first-of-month normalization — but restricted to the changed `fields`.
  - `units: [["category","program","subject"]]` (program drives subject/field validity) — treat program-coupled fields as one atomic unit.
  - Attach blur via `onBlurCapture` on the `edit-info` `<form>` (it uses `AutoFormObject`, not `AutoForm`, so no `onFieldBlur` prop).
  - Replace the "Save information" button with `AutosaveStatus`; leave "Save Daily Note" and sub-editors as-is.
- **Risk:** `start_date`/`end_date` are visually inside the Information cards; confirm exact field placement and that excluding them from autosave still lets them be edited (they may need to stay on a small explicit save, or be moved to the schedule tab — resolve during Phase 2 brainstorming).

### Phase 2 / Task B: `users/[id]/edit` — builtin scalar sections only

- **Files:** `src/components/users/user-form.tsx` (edit branch), delegated from `user-edit-form-inner.tsx`.
- **Include:** non-`config` sections (builtin scalar fields rendered via `renderUserSectionFields`).
- **Exclude:** all `section.kind === "config"` sections (custom fields) — these stay on their existing explicit save (retain a single scoped "Save custom fields" button that sends only `custom_data` via `collectGroupPayload`), since custom fields are otherwise handled by the completion sheet (Task 6).
- **Hook wiring:** `useAutosaveForm({ form, queryKey: [`updateUser${userId}`-equivalent read key], save, buildPayload })` where `buildPayload` runs `prepareUserFormPayload(changedSubset, { mode: "edit", tenant, fields: configFields })` restricted to changed builtin fields. Validate per-field against `composedSchema` (pick the field's issue subset).
- **Note:** `user-form.tsx` is shared with create mode — gate all autosave wiring behind `mode === "edit"`; create flow stays exactly as-is.

### Phase 2 / Task C: Navigation guard repurpose

- **File:** `src/components/form/form-dirty-before-unload.tsx` (or a new sibling `autosave-unload-guard.tsx`).
- **Change:** for autosaved forms, warn on `beforeunload` only when the autosave `status` is `"saving"` or `"error"` (not on every dirty field). Wire into `users/[id]/edit` and `courses/[id]/edit` (the only autosaved forms that currently mount `FormDirtyBeforeUnload`). Non-autosaved forms keep the existing dirty guard unchanged.

---

## Self-Review

**Spec coverage (Phase 1):**
- Reusable engine + status UI → Tasks 1-5. ✅
- On-blur trigger + dirty-diff flush + explicit units → core (Tasks 1-3) + hook (Task 4). ✅
- Validation gating → hook `form.trigger` + invalid filtering (Task 4). ✅
- Optimistic write + keep-value-on-failure + cache rollback + instant-control behavior → hook `flush` (Task 4). ✅
- Status surfacing (form-level + per-field) → Task 5 components; form-level wired in Tasks 6-10. Per-field indicator component exists (Task 5); per-field wiring on AutoForm-rendered fields is form-level in Phase 1 (inline Zod/server errors cover per-field error display) — noted as a deliberate simplification. ⚠️ (documented)
- Backend partial PUT via `updateEntity` → all save closures (Tasks 6-10). ✅
- Pilot (completion) → Task 6. ✅
- Tier 1 (×7) → Tasks 9-10. ✅
- `users` + `courses` (field boundary) → Phase 2 (deferred, scoped). ✅ (intentional split)
- Navigation guard → Phase 2 Task C (the only forms with the guard are deferred). ✅ (intentional)

**Placeholder scan:** No TBD/TODO in Phase 1 tasks; every code step contains full code. Phase 2 is intentionally a scoped seed for a follow-up plan, not executable tasks. ✅

**Type consistency:** `useAutosaveForm` options (`form`, `save`, `queryKey`, `units`, `buildPayload`, `enabled`) and return (`status`, `fieldStatus`, `retry`, `retryAll`, `bindField`) are used consistently across Tasks 4, 6, 8, 9, 10. `AutosaveStatus` props (`status`, `onRetryAll`) and `FieldSaveIndicator` props (`state`, `onRetry`) match Task 5 definitions. Core function names (`collectDirtyValidFields`, `buildDiffPayload`, `fieldsForFlush`, `isUnitReady`, `deriveFormStatus`, `mergeEntityDiff`) are consistent between Tasks 1-3 and their use in Task 4. ✅


