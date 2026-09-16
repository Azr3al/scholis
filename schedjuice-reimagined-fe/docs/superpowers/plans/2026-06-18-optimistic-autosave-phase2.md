# Optimistic Autosave Phase 2 (users, courses, nav guard) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert `courses/[id]/edit` (Course Information) and `users/[id]/edit` (builtin sections) to optimistic autosave, reusing the Phase 1 engine, plus an in-flight navigation guard.

**Architecture:** Two small additions to `useAutosaveForm` — `validateFields` (validate without a resolver) and `shouldAutosaveField` (exclude fields from the dirty-diff flush) — then wire the two complex forms with bespoke `buildPayload`/`save` and a new `AutosaveUnloadGuard`. Excluded portions (course schedule dates, daily note, zoom, calendar; user custom-field sections) keep explicit save buttons.

**Tech Stack:** Next.js 15 / React 19, react-hook-form 7 + Zod 3, TanStack Query v4, Axios (`updateEntity` PUT), Vitest (node env, pure-function tests only).

---

## Testing Note (read first)

Same constraint as Phase 1: Vitest is `environment: "node"`, `include: ["src/**/*.test.ts"]`, no Testing Library. Pure functions are TDD'd; React glue is verified by `npm run lint` + `tsc --noEmit` (filtered to changed files) + manual checklist.

## Commit Policy Note

No-git-commits rule applies: **do not run `git commit` unless the user authorizes commits.** Complete code + verification per task; skip commits otherwise.

## File Structure

**Create:**
- `src/components/form/autosave-unload-guard.tsx` — `beforeunload` warning while autosave is saving/errored.

**Modify:**
- `src/hooks/use-autosave-form.ts` — add `validateFields` + `shouldAutosaveField` options (Task 1).
- `src/lib/autosave/autosave-core.ts` + `.test.ts` — add `invalidFieldsFromIssues` pure helper for the user validator (Task 2).
- `src/app/(internal)/courses/[id]/edit/page.tsx` — autosave Information cards; "Save schedule" button; `AutosaveUnloadGuard` (Task 4).
- `src/components/users/user-form.tsx` — edit-branch autosave for builtin sections; scoped "Save custom fields"; `AutosaveUnloadGuard` (Task 5).

---

## Task 1: Engine — add `validateFields` and `shouldAutosaveField` options

**Why:** `UserForm` validates against a composed Zod schema manually (no `zodResolver`), so the hook's default `form.trigger()` path can't validate it — it needs `validateFields`. And both complex forms must keep specific fields OUT of autosave (course `start_date`/`end_date`; user `custom_data.*`); without a filter the dirty-diff flush would silently persist them. `shouldAutosaveField` is the field-inclusion boundary the spec calls for.

### Step 1.1: Add the two options to the type and destructure

In `src/hooks/use-autosave-form.ts`, extend `UseAutosaveFormOptions` (after the `enabled` field, before the closing `}`):

```ts
  /** Default true. Create forms pass false to no-op. */
  enabled?: boolean;
  /**
   * Validate the given field names and return the subset that is invalid.
   * Default: `form.trigger(fields)` + read `getFieldState`. Forms without a
   * resolver (e.g. UserForm's composed schema) supply their own.
   */
  validateFields?: (fields: string[]) => Promise<string[]>;
  /**
   * Gate which fields autosave. Returns false for fields owned by an explicit
   * Save button (course start/end dates, user custom_data.*). Default: always true.
   */
  shouldAutosaveField?: (name: string) => boolean;
```

Update the destructure block (lines ~67-74):

```ts
  const {
    form,
    save,
    queryKey,
    units = [],
    enabled = true,
    buildPayload = (fields, values) => buildDiffPayload(values, fields),
    shouldAutosaveField = () => true,
    validateFields,
  } = options;
```

### Step 1.2: Add the default validator and rewrite `handleBlur`

Add a default validator just above `handleBlur`:

```ts
  const defaultValidate = useCallback(
    async (fields: string[]) => {
      await form.trigger(fields as never);
      return fields.filter((f) => form.getFieldState(f).invalid);
    },
    [form],
  );
  const runValidate = validateFields ?? defaultValidate;
```

Replace the body of `handleBlur` (lines ~143-170) with:

```ts
  const handleBlur = useCallback(
    async (name: string) => {
      if (!enabled || !shouldAutosaveField(name)) return;
      const group = fieldsForFlush(name, units).filter(shouldAutosaveField);
      if (group.length === 0) return;
      const activeField =
        typeof document !== "undefined"
          ? (document.activeElement as HTMLElement | null)?.getAttribute("name") ??
            null
          : null;

      const invalidFields = await runValidate(group);

      // Multi-field unit: only flush once focus leaves the whole unit and all valid.
      if (group.length > 1 && !isUnitReady(group, activeField, invalidFields)) {
        return;
      }

      const dirtyFields = flattenDirty(form.formState.dirtyFields);
      const candidates = collectDirtyValidFields({ dirtyFields, invalidFields }).filter(
        shouldAutosaveField,
      );
      const groupDirtyValid = group.filter(
        (f) => dirtyFields[f] && !invalidFields.includes(f),
      );
      const toFlush = Array.from(new Set([...groupDirtyValid, ...candidates]));
      await flush(toFlush);
    },
    [enabled, flush, form, units, runValidate, shouldAutosaveField],
  );
```

Note: `runValidate` is declared with `useCallback`/`??` so eslint's exhaustive-deps is satisfied; if lint complains that `runValidate` isn't memoized, wrap it: `const runValidate = useMemo(() => validateFields ?? defaultValidate, [validateFields, defaultValidate]);` (add `useMemo` to the React import).

### Step 1.3: Verify

- [ ] `npx tsc --noEmit 2>&1 | rg "use-autosave-form"` → no output (no new errors in this file).
- [ ] `npm run lint -- src/hooks/use-autosave-form.ts` → clean (no exhaustive-deps warnings).
- [ ] Existing Phase 1 callers compile unchanged (new options optional with defaults).

---

## Task 2: Engine — `invalidFieldsFromIssues` pure helper (TDD)

**Why:** `UserForm`'s `validateFields` will run the composed Zod schema and must map Zod issue paths back to the flat field names the hook tracks. Extract that mapping as a pure, tested function.

### Step 2.1: Write the test FIRST

Append to `src/lib/autosave/autosave-core.test.ts`:

```ts
import { invalidFieldsFromIssues } from "./autosave-core";

describe("invalidFieldsFromIssues", () => {
  it("returns intersection of issue top-level paths and candidate fields", () => {
    const issues = [{ path: ["email"] }, { path: ["age"] }, { path: ["unknown"] }];
    expect(invalidFieldsFromIssues(issues, ["email", "name", "age"])).toEqual([
      "email",
      "age",
    ]);
  });

  it("uses first path segment for nested issues", () => {
    const issues = [{ path: ["custom_data", "foo"] }];
    expect(invalidFieldsFromIssues(issues, ["custom_data"])).toEqual(["custom_data"]);
  });

  it("ignores empty paths and returns no duplicates", () => {
    const issues = [{ path: [] }, { path: ["email"] }, { path: ["email"] }];
    expect(invalidFieldsFromIssues(issues, ["email"])).toEqual(["email"]);
  });

  it("returns [] when nothing matches", () => {
    expect(invalidFieldsFromIssues([{ path: ["x"] }], ["email"])).toEqual([]);
  });
});
```

### Step 2.2: Implement

Append to `src/lib/autosave/autosave-core.ts`:

```ts
/**
 * Map Zod-style issue paths to the candidate field names that are invalid.
 * Uses the first path segment (top-level field). De-duplicated, order = `fields`.
 */
export function invalidFieldsFromIssues(
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey> }>,
  fields: ReadonlyArray<string>,
): string[] {
  const bad = new Set<string>();
  for (const issue of issues) {
    const head = issue.path[0];
    if (typeof head === "string") bad.add(head);
  }
  return fields.filter((f) => bad.has(f));
}
```

### Step 2.3: Verify

- [ ] `npm run test:unit -- src/lib/autosave/autosave-core.test.ts` → all pass (existing + 4 new).
- [ ] `npx tsc --noEmit 2>&1 | rg "autosave-core"` → no output.

---

## Task 3: `AutosaveUnloadGuard` component

**Why:** Decision from spec — warn on navigation only while a save is in-flight or errored (not on plain dirty, since autosave handles persistence). Mirrors existing `FormDirtyBeforeUnload`.

### Step 3.1: Create the component

Create `src/components/form/autosave-unload-guard.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import type { FormSaveStatus } from "@/lib/autosave/autosave-core";

/**
 * Warns before unload while autosave is mid-flight or has unsaved errors.
 * Unlike a dirty-guard, a clean "saved"/"idle" state never blocks navigation.
 */
export function AutosaveUnloadGuard({ status }: { status: FormSaveStatus }) {
  const blocking = status === "saving" || status === "error";
  useEffect(() => {
    if (!blocking) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [blocking]);
  return null;
}
```

### Step 3.2: Verify

- [ ] `npx tsc --noEmit 2>&1 | rg "autosave-unload-guard"` → no output.
- [ ] `npm run lint -- src/components/form/autosave-unload-guard.tsx` → clean.

---

## Task 4: Convert `courses/[id]/edit` Information tab to autosave

**File:** `src/app/(internal)/courses/[id]/edit/page.tsx`

Schedule card (`start_date`, `end_date`) is excluded → dedicated "Save schedule" button. All other Information cards (basics, details, other) autosave. Daily Note / Zoom / Teams / Calendar are untouched.

### Step 4.1: Imports

Add near the existing autosave-free imports:

```ts
import { useAutosaveForm } from "@/hooks/use-autosave-form";
import { AutosaveStatus } from "@/components/form/autosave-status";
import { AutosaveUnloadGuard } from "@/components/form/autosave-unload-guard";
import { buildDiffPayload } from "@/lib/autosave/autosave-core";
```

Remove the `FormDirtyBeforeUnload` import (replaced) **only if** it's no longer used elsewhere in the file (it's currently only used at line 515).

### Step 4.2: Add a stable `programFromCourse` + autosave hook

Insert after `onSubmit` (after line 257), before `courseEditSections`:

```ts
  const programFromCourse = useMemo<programType | undefined>(
    () =>
      course?.program && typeof course.program === "object"
        ? (course.program as programType)
        : undefined,
    [course],
  );

  const SCHEDULE_FIELDS = useMemo(() => new Set(["start_date", "end_date"]), []);

  const autosave = useAutosaveForm({
    form: adminForm,
    queryKey: [`getCourse${id}`],
    units: [["intake", "level", "section", "subject"]],
    enabled: Boolean(course),
    shouldAutosaveField: (name) => !SCHEDULE_FIELDS.has(name),
    validateFields: async (fields) => {
      await adminForm.trigger(fields as never);
      const invalid = new Set(
        fields.filter((f) => adminForm.getFieldState(f as never).invalid),
      );
      const programErrors = validateCourseProgramFields(
        adminForm.getValues(),
        programFromCourse,
      );
      for (const [key, message] of Object.entries(programErrors)) {
        if (fields.includes(key)) {
          adminForm.setError(key as never, { type: "manual", message });
          invalid.add(key);
        }
      }
      return [...invalid];
    },
    buildPayload: (fields, values) => {
      const diff = buildDiffPayload(values, fields);
      const sanitized = sanitizeCoursePayloadForProgram(diff, programFromCourse);
      const payload = cleanDatesForBackend(sanitized, ["start_date", "end_date"]);
      // sanitize re-adds `program`; only keep it when program itself changed.
      if (!fields.includes("program")) delete (payload as Record<string, unknown>).program;
      if (payload.exam_session_date) {
        const d = new Date(payload.exam_session_date as string);
        payload.exam_session_date = new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
      }
      return payload as Record<string, unknown>;
    },
    save: async (payload) => {
      try {
        const res = await updateEntity("courses", id, payload);
        void refetchCourse();
        return res;
      } catch (e) {
        setFormErrrors(e, adminForm);
        toast({ variant: "destructive" });
        throw e;
      }
    },
  });

  const saveSchedule = useCallback(() => {
    const { start_date, end_date } = adminForm.getValues();
    courseUpdateMutation.mutate(
      cleanDatesForBackend({ start_date, end_date }, ["start_date", "end_date"]),
    );
  }, [adminForm, courseUpdateMutation]);
```

Add `useCallback` to the React import (line 74 currently imports `useEffect, useMemo, useState`).

### Step 4.3: Replace the nav guard

Line 515: replace

```tsx
<FormDirtyBeforeUnload control={adminForm.control} />
```

with

```tsx
<AutosaveUnloadGuard status={autosave.status} />
```

### Step 4.4: Add blur capture to the Information `<form>`

The `edit-info` form (line ~603) uses `AutoFormObject` (no `onFieldBlur` prop), so attach capture directly. Change the opening `<form>` tag:

```tsx
<form
  className="space-y-6"
  onBlurCapture={(e) => {
    const name = (e.target as HTMLElement).getAttribute("name");
    if (name) autosave.bindField(name).onBlur();
  }}
  onSubmit={adminForm.handleSubmit((data) => {
    if (data.code === "") {
      delete data.code;
    }
    onSubmit(data as z.infer<typeof partiallyOmittedCourseSchema>);
  })}
>
```

(`onSubmit` stays for the no-longer-present submit path; harmless. `shouldAutosaveField` already filters out `start_date`/`end_date` blurs.)

### Step 4.5: Add "Save schedule" button to the Schedule card; replace "Save information" with status

In the `courseEditSections.map` (line ~615-634), append a footer to the `schedule` card only:

```tsx
<CardContent>
  <AutoFormObject
    schema={adminObjectFormSchema}
    form={adminForm}
    fieldConfig={courseFieldConfig}
    fieldOrder={section.keys}
  />
  {section.id === "schedule" ? (
    <div className="mt-4">
      <Button
        type="button"
        onClick={saveSchedule}
        isLoading={courseUpdateMutation.isLoading}
      >
        Save schedule
      </Button>
    </div>
  ) : null}
</CardContent>
```

Then replace the "Save information" submit button (lines ~652-657) with the form-level status:

```tsx
<AutosaveStatus status={autosave.status} onRetryAll={autosave.retryAll} />
```

### Step 4.6: Verify

- [ ] `npx tsc --noEmit 2>&1 | rg "courses/\[id\]/edit/page"` → no output.
- [ ] `npm run lint -- "src/app/(internal)/courses/[id]/edit/page.tsx"` → clean.
- [ ] Manual: edit `title`, blur → "Saving…"/"All changes saved"; cache (course header) updates optimistically. Edit `start_date` then blur → nothing autosaves; "Save schedule" persists it. Pick a program needing intake, clear intake, blur the unit → inline error, no save.

---

## Task 5: Convert `users/[id]/edit` builtin sections to autosave (`UserForm` edit branch)

**File:** `src/components/users/user-form.tsx` — gate ALL new wiring behind `mode === "edit"`. Create mode is untouched.

### Step 5.1: Imports

```ts
import { useAutosaveForm } from "@/hooks/use-autosave-form";
import { AutosaveStatus } from "@/components/form/autosave-status";
import { AutosaveUnloadGuard } from "@/components/form/autosave-unload-guard";
import { invalidFieldsFromIssues } from "@/lib/autosave/autosave-core";
import { fieldFormPath } from "@/lib/custom-fields/field-policy";
```

(`prepareUserFormPayload`, `setFormErrrors`, `updateEntity`, and `useCallback` are already imported in this file.)

### Step 5.2: Compute the autosave field boundary (config sections excluded)

Config groups can contain **builtin-source** fields (bare key names), so the exclusion set must be the resolved form paths of every config-section field — not a `custom_data.` prefix test. Add after `sections` (line ~188):

```ts
  const configFieldPaths = useMemo(() => {
    const paths = new Set<string>();
    for (const section of sections) {
      if (section.kind === "config") {
        for (const f of section.group.fields) paths.add(fieldFormPath(f));
      }
    }
    return paths;
  }, [sections]);
```

### Step 5.3: Autosave hook (edit only)

Add after `editMutation` (line ~252). The hook is always called (hooks rule) but `enabled` gates it to edit mode:

```ts
  const autosave = useAutosaveForm({
    form,
    queryKey: ["getUser", userId],
    enabled: mode === "edit",
    shouldAutosaveField: (name) => !configFieldPaths.has(name),
    validateFields: async (fields) => {
      const parsed = composedSchema.safeParse(form.getValues());
      if (parsed.success) return [];
      const fieldSet = new Set(fields);
      const relevant = parsed.error.issues.filter((i) =>
        fieldSet.has(String(i.path[0])),
      );
      for (const issue of relevant) {
        form.setError(issue.path.join(".") as never, { message: issue.message });
      }
      return invalidFieldsFromIssues(relevant, fields);
    },
    buildPayload: (fields, values) => {
      const normalized = prepareUserFormPayload(values, {
        mode: "edit",
        tenant,
        fields: configFields,
      });
      const out: Record<string, unknown> = {};
      for (const f of fields) out[f] = (normalized as Record<string, unknown>)[f];
      return out;
    },
    save: async (payload) => {
      try {
        const res = await updateEntity("users", userId!, payload);
        return res;
      } catch (e) {
        const applied = setFormErrrors(e, form);
        if (applied) scrollToFirstError();
        toast({ variant: "destructive" });
        throw e;
      }
    },
  });
```

### Step 5.4: Scoped "Save custom fields" handler

Replace the bottom edit `<div>` (lines ~560-577) so it sends only `custom_data` via the existing `editMutation` path (which redirects on success — matches the explicit-save intent). Build the custom-data payload from `prepareUserFormPayload`:

```ts
  const saveCustomFields = useCallback(() => {
    const normalized = prepareUserFormPayload(form.getValues(), {
      mode: "edit",
      tenant,
      fields: configFields,
    });
    editMutation.mutate({ custom_data: normalized.custom_data });
  }, [configFields, editMutation, form, tenant]);
```

> If no config sections exist (`configFieldPaths.size === 0`), hide the "Save custom fields" button.

### Step 5.5: Blur binding + status (edit branch only)

Add `onBlurCapture` to the `<form>` (line ~445). It runs in both modes but no-ops in create because `autosave.enabled` is false (hook ignores blurs when disabled):

```tsx
<form
  className="space-y-8 pb-8"
  onBlurCapture={(e) => {
    if (mode !== "edit") return;
    const name = (e.target as HTMLElement).getAttribute("name");
    if (name) autosave.bindField(name).onBlur();
  }}
  onSubmit={form.handleSubmit(onSubmit, () => scrollToFirstError())}
  onInvalidCapture={handleNativeFormInvalid}
>
```

Replace the nav guard (line 437):

```tsx
{mode === "edit" ? <AutosaveUnloadGuard status={autosave.status} /> : null}
```

Replace the edit footer (the `else` branch, lines ~560-577) — remove "Save profile" submit, add status + scoped custom-fields save + Cancel:

```tsx
) : (
  <div className="flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center">
    <AutosaveStatus status={autosave.status} onRetryAll={autosave.retryAll} />
    {configFieldPaths.size > 0 ? (
      <Button
        type="button"
        variant="outline"
        onClick={saveCustomFields}
        isLoading={editMutation.isLoading}
        className="sm:min-w-36"
      >
        Save custom fields
      </Button>
    ) : null}
    <Link
      href={cancelHref}
      className={cn(buttonVariants({ variant: "outline" }), "sm:min-w-36")}
    >
      Cancel
    </Link>
  </div>
)}
```

### Step 5.6: Verify

- [ ] `npx tsc --noEmit 2>&1 | rg "users/user-form"` → no output.
- [ ] `npm run lint -- src/components/users/user-form.tsx` → clean (watch exhaustive-deps on the new callbacks).
- [ ] Manual: edit a builtin field (e.g. first name), blur → autosaves; cache (`["getUser", id]`) merges. Edit a custom field, blur → does NOT autosave; "Save custom fields" persists it. Create flow (`/users/new` or create page) shows no autosave UI and submits normally.

---

## Task 6: Full verification pass

- [ ] `npm run test:unit -- src/lib/autosave/autosave-core.test.ts` → all pass.
- [ ] `npx tsc --noEmit 2>&1 | rg -e "use-autosave-form" -e "autosave-core" -e "autosave-unload-guard" -e "courses/\[id\]/edit/page" -e "users/user-form"` → no output (no new errors in changed files). Pre-existing unrelated errors (Phase 1 notes: `useUser.ts`, `lib/imports`, `lib/rbac`, some `.test.ts`) are out of scope.
- [ ] `npm run lint` on all five changed files → clean.
- [ ] Walk the Manual Verification Checklist from the spec (course autosave + Save schedule + program cross-field block; user builtin autosave + Save custom fields; forced-400 keep-value + Retry; beforeunload only while saving/errored).
- [ ] Confirm Phase 1 forms (completion sheet, Tier 1 edits) still build — the engine changes are additive with defaults.

## Assumptions to confirm during implementation (from spec Open Items)

1. Every non-`config` user section field autosaves sensibly (profile image, address composites). If any field is lossy under partial PUT, add it to a `shouldAutosaveField` exclusion alongside config paths and note it.
2. Course `buildPayload` matches `onSubmit` semantics for partial payloads (program re-add stripped unless changed; `exam_session_date` first-of-month).
3. `updateEntity` PUT accepts partial course/user payloads (holds for Phase 1 + completion).
4. Confirm `["getUser", userId]` is the live query key feeding `subjectUser` so optimistic merge/rollback targets the right cache (verified: `users/[id]/edit/page.tsx` uses `["getUser", id]`).

