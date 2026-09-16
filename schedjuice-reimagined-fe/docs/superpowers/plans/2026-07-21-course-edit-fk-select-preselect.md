# Course Edit FK Select Preselect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On course edit, Category and Payment Plan selects show the existing course values when the API returns FK integers (not nested expand objects).

**Architecture:** Extract `buildCourseFormValues` into a pure helper that coerces `category` / `payment_plan` from relation fields or `*_id` fallbacks via `coerceEntityId`. Fix the course-edit load effect so query `data` always seeds `course` state, then `reset()` those coerced ids into RHF for EntitySelect.

**Tech Stack:** Next.js App Router, React Query, React Hook Form, Vitest, existing `coerceEntityId` / `EntitySelect`.

**Spec:** `schedjuice-reimagined-fe/docs/superpowers/specs/2026-07-21-course-edit-fk-select-preselect-design.md`  
**Canonical docs live in FE only — do not mirror to BE or root `docs/`.**

## Global Constraints

- Frontend-only; do not change BE expand/serializers.
- Do not touch EntitySelect / Select unless form values are proven correct and UI still shows “Select”.
- Prefer `coerceEntityId(relation) ?? coerceEntityId(*_id)` (not `relation ?? *_id` then coerce once) so a truthy-but-invalid relation does not block `*_id`.
- High-value tests only — no full course-edit page mount smoke.
- Keep payment-plan explicit save / non-autosave behavior unchanged.

## File Structure

- Create: `src/helpers/course-form-values.ts` — `CourseWithFkIds`, `buildCourseFormValues`
- Create: `src/helpers/course-form-values.test.ts` — FK-only / nested / missing cases
- Modify: `src/app/(internal)/courses/[id]/edit/page.tsx` — import helper; fix `setCourse` from query `data`; keep `reset(buildCourseFormValues(...))`

---

### Task 1: Extract `buildCourseFormValues` + unit tests (TDD)

**Files:**
- Create: `schedjuice-reimagined-fe/src/helpers/course-form-values.ts`
- Create: `schedjuice-reimagined-fe/src/helpers/course-form-values.test.ts`
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/courses/[id]/edit/page.tsx` (remove local helper; import from new module)

**Interfaces:**
- Consumes: `coerceEntityId` from `@/helpers/entity-ids`
- Produces:
  - `export type CourseWithFkIds = { category?: unknown; category_id?: unknown; payment_plan?: unknown; payment_plan_id?: unknown; [key: string]: unknown }`
  - `export function buildCourseFormValues(c: CourseWithFkIds): Record<string, unknown>`
  - Sets `category` and `payment_plan` to `number | null`
  - Other keys: if value is object with `id`, use that id; else copy value; skip `category` / `category_id` / `payment_plan` / `payment_plan_id` in the generic loop

- [x] **Step 1: Write the failing tests**

Create `src/helpers/course-form-values.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { buildCourseFormValues } from "./course-form-values";

describe("buildCourseFormValues", () => {
  it("maps FK-only category_id and payment_plan_id to positive ids", () => {
    const out = buildCourseFormValues({
      title: "Algebra",
      category_id: 12,
      payment_plan_id: 34,
    });
    expect(out.category).toBe(12);
    expect(out.payment_plan).toBe(34);
    expect(out.title).toBe("Algebra");
    expect(out).not.toHaveProperty("category_id");
    expect(out).not.toHaveProperty("payment_plan_id");
  });

  it("maps integer category and payment_plan FKs", () => {
    const out = buildCourseFormValues({
      category: 7,
      payment_plan: 9,
    });
    expect(out.category).toBe(7);
    expect(out.payment_plan).toBe(9);
  });

  it("maps nested { id } objects", () => {
    const out = buildCourseFormValues({
      category: { id: 3, name: "IGCSE" },
      payment_plan: { id: 5, name: "Monthly" },
      program: { id: 11, name: "P" },
    });
    expect(out.category).toBe(3);
    expect(out.payment_plan).toBe(5);
    expect(out.program).toBe(11);
  });

  it("prefers *_id when relation is truthy but not a valid id", () => {
    const out = buildCourseFormValues({
      category: {},
      category_id: 42,
      payment_plan: { name: "no-id" },
      payment_plan_id: 99,
    });
    expect(out.category).toBe(42);
    expect(out.payment_plan).toBe(99);
  });

  it("returns null when category and payment_plan are missing or invalid", () => {
    const out = buildCourseFormValues({
      category: null,
      payment_plan: "nope",
      category_id: 0,
    });
    expect(out.category).toBeNull();
    expect(out.payment_plan).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd schedjuice-reimagined-fe && pnpm exec vitest run --config vitest.config.mts src/helpers/course-form-values.test.ts
```

Expected: FAIL (module / export not found).

- [ ] **Step 3: Implement the helper**

Create `src/helpers/course-form-values.ts`:

```ts
import { coerceEntityId } from "@/helpers/entity-ids";

export type CourseWithFkIds = {
  category?: unknown;
  category_id?: unknown;
  payment_plan?: unknown;
  payment_plan_id?: unknown;
  [key: string]: unknown;
};

/**
 * Flattens API course (nested FKs + raw ids) into a single RHF value map.
 * Uses one shape so we can `reset()` without FK fields racing with many `setValue` calls.
 */
export function buildCourseFormValues(
  c: CourseWithFkIds,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(c)) {
    if (
      key === "category" ||
      key === "category_id" ||
      key === "payment_plan" ||
      key === "payment_plan_id"
    ) {
      continue;
    }
    const val = c[key];
    if (val && typeof val === "object" && "id" in val) {
      out[key] = (val as { id: number }).id;
    } else {
      out[key] = val;
    }
  }
  out.category =
    coerceEntityId(c.category) ?? coerceEntityId(c.category_id) ?? null;
  out.payment_plan =
    coerceEntityId(c.payment_plan) ??
    coerceEntityId(c.payment_plan_id) ??
    null;
  return out;
}
```

- [ ] **Step 4: Wire the edit page to the helper**

In `src/app/(internal)/courses/[id]/edit/page.tsx`:

1. Add: `import { buildCourseFormValues, type CourseWithFkIds } from "@/helpers/course-form-values";`
2. Remove the local `CourseWithFkIds` type and local `buildCourseFormValues` function (lines ~92–125).
3. Keep `import { coerceEntityId } from "@/helpers/entity-ids";` — still used by EntitySelect field configs.
4. Leave the `adminForm.reset(buildCourseFormValues(c), …)` effect as-is for this task (load-effect fix is Task 2).

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
cd schedjuice-reimagined-fe && pnpm exec vitest run --config vitest.config.mts src/helpers/course-form-values.test.ts
```

Expected: all 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
cd schedjuice-reimagined-fe
git add \
  src/helpers/course-form-values.ts \
  src/helpers/course-form-values.test.ts \
  src/app/\(internal\)/courses/\[id\]/edit/page.tsx
git commit -m "$(cat <<'EOF'
fix(courses): extract course form FK coerce helper for edit preselect

EOF
)"
```

---

### Task 2: Fix course load → reset pipeline

**Files:**
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/courses/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `buildCourseFormValues` from `@/helpers/course-form-values`
- Produces: `course` state always updated from latest successful query `data`; form `reset` still driven by `[course]`

- [ ] **Step 1: Fix the `setCourse` effect**

Replace the effect that currently depends only on `isSuccess`:

```tsx
  useEffect(() => {
    if (isSuccess) {
      setCourse({
        ...data.data.data,
      });
    }
  }, [isSuccess]);
```

with:

```tsx
  useEffect(() => {
    if (!isSuccess || !data?.data?.data) {
      return;
    }
    setCourse({
      ...data.data.data,
    });
  }, [isSuccess, data]);
```

This ensures refetch (e.g. after save) and first paint both pass FK fields into `course`, which triggers the existing reset effect:

```tsx
  useEffect(() => {
    if (!course) {
      return;
    }
    const c = course as CourseWithFkIds;
    const formValues = buildCourseFormValues(c);
    adminForm.reset(
      formValues as Record<string, unknown> &
        z.infer<typeof partiallyOmittedCourseSchema>,
      { keepDefaultValues: false },
    );
  }, [course]);
```

Do **not** remove `CourseWithFkIds` cast — import the type from the helper if not already.

- [ ] **Step 2: Sanity-check EntitySelect wiring (no code change unless broken)**

Confirm Category / Payment Plan still pass:

```tsx
value={coerceEntityId(field.value) ?? 0}
```

If `buildCourseFormValues` set `category: 12`, RHF `field.value` must be `12` after reset. Do not change EntitySelect in this task.

- [ ] **Step 3: Manual acceptance**

1. Open `/courses/<id>/edit` for a course that has category + payment plan in the DB.
2. Confirm network GET includes numeric FKs (and/or nested objects).
3. Confirm both selects show the correct **names**, not “Select”.
4. Click Save payment plan without changing the plan — value must remain.
5. Reload — both still preselected.

- [ ] **Step 4: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/app/\(internal\)/courses/\[id\]/edit/page.tsx
git commit -m "$(cat <<'EOF'
fix(courses): sync edit form course state from query data for FK preselect

EOF
)"
```

---

### Task 3: Spec coverage gate (only if manual still fails)

**Files:**
- Modify only if needed: `schedjuice-reimagined-fe/src/components/form/entity-select.tsx`
- Test only if needed: extend `schedjuice-reimagined-fe/src/components/form/entity-select.test.tsx`

**When to run this task:** Skip entirely if Task 2 manual acceptance passes.

**If form values are correct in React DevTools / logging but UI still shows “Select”:**

- [ ] **Step 1: Log once** — temporarily confirm `field.value` and EntitySelect `value` prop are `> 0` while placeholder shows.
- [ ] **Step 2: Fix Select/EntitySelect minimally** — e.g. ensure controlled `value` string is always present in `items` before render (existing `buildEntitySelectItems` id-fallback should already do this). Prefer fixing item/value sync over BE expand.
- [ ] **Step 3: Add one focused unit test** for the regression (not a full page mount).
- [ ] **Step 4: Commit** with a message describing the EntitySelect fix.

If Task 2 passes, mark this task cancelled in the PR description (no commit).

---

## Spec coverage (self-review)

| Spec requirement | Task |
| --- | --- |
| Preselect from FK-only shapes | Task 1 tests + helper; Task 2 load/reset |
| Nested `{ id }` still works | Task 1 nested test |
| Missing → null | Task 1 invalid/missing test |
| Truthy invalid relation must not block `*_id` | Task 1 “prefers *_id” test + sequential coerce |
| Reliable setCourse from query data | Task 2 |
| No BE expand work | All tasks |
| EntitySelect only if still broken | Task 3 (optional) |
| High-value tests only | Task 1 unit tests; no page smoke |

## Placeholder / type consistency check

- Helper name `buildCourseFormValues` / type `CourseWithFkIds` consistent across Tasks 1–2.
- Coerce order `coerceEntityId(relation) ?? coerceEntityId(*_id)` matches Global Constraints.
- Vitest command uses existing `vitest.config.mts` / `pnpm exec vitest run`.
