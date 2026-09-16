# Wave F0 — AutoForm Foundation + GenericForm Successor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans.

**Goal:** Ship `src/components/auto-form/` with `saveMode`, logical **groups**, field-isolated rendering, group-aware skeletons; migrate `GenericForm` to host the new system; delete dead bits of legacy auto-form only when unused (full delete is F3).

**Depends on:** **Default after T4** (edit-kit frozen).  
**Branch:** `migrate/ui-f0-foundation`  
**Spec §6:** program design  
**Playbook:** [`2026-07-09-data-table-auto-form-playbook.md`](2026-07-09-data-table-auto-form-playbook.md)

---

## File structure (create)

```
src/components/auto-form/
  index.ts
  types.ts                 # saveMode, GroupConfig, FieldConfig
  auto-form.tsx            # root
  auto-form-group.tsx      # section: title + helper + field grid
  auto-form-field.tsx      # single field — isolated subscription
  auto-form-skeleton.tsx   # group-aware skeleton from same GroupConfig
  field-map.ts             # zod type → primitive Field control
  use-auto-form.ts         # RHF setup + edit-kit autosave when saveMode=edit
  __tests__/
    auto-form-skeleton.test.tsx
    field-isolation.test.tsx   # assert watch scope / or document Profiler gate
```

**Modify:**
- `src/components/form/generic-form.tsx` — switch internals to new auto-form; map `isEdit` → `saveMode`; map `autosave` → edit mode defaults
- `src/components/form/auto-form-fields-skeleton.tsx` — re-export new skeleton or thin deprecate wrapper that requires `groups`

**Do not delete yet:** `src/components/ui/auto-form.tsx` (still used by direct AutoForm pages until F1–F3).

---

### Task 1: Group config types + skeleton test

- [ ] Define:

```ts
export type AutoFormGroup = {
  id: string;
  title: string;
  description?: string;
  fields: string[]; // schema keys
  collapsible?: boolean; // progressive disclosure
};

export type AutoFormProps = {
  schema: ZodObjectOrWrapped;
  saveMode: "create" | "edit";
  groups: AutoFormGroup[];
  fieldConfig?: Record<string, FieldConfigItem>;
  // ... form, onSubmit, etc.
};
```

- [ ] Skeleton test: given two groups with 2 and 3 fields, skeleton renders two section titles and 5 field placeholders (not a flat `rows={5}` only).

- [ ] Commit.

---

### Task 2: Field isolation

- [ ] `AutoFormField` uses RHF `Controller` / `useWatch({ name })` for **that field only**.
- [ ] Root must **not** call `form.watch()` without args.
- [ ] Acceptance: document React Profiler check in PR — typing in field A does not re-render field B’s memoized boundary (use `React.memo` on `AutoFormField`).

- [ ] Commit.

---

### Task 3: Wire saveMode

- [ ] `create`: sticky footer Submit; no autosave.
- [ ] `edit`: `useAutosaveForm` / edit-kit; `FormSaveTick` in reserved header/footer slot; `shouldAutosaveField` for high-risk.
- [ ] Units support for atomic groups (reuse autosave-core `units`).

- [ ] Commit.

---

### Task 4: Migrate GenericForm

- [ ] Replace internal `<AutoForm from ui>` with new `@/components/auto-form`.
- [ ] If callers lack `groups`, provide a **temporary** default: one group “Details” with all schema keys — F1/F2 pages must supply real groups soon; do not invent a permanent ungrouped mode without a TODO comment pointing at F1/F2.
- [ ] Keep `autosave` prop mapping to `saveMode="edit"` behavior.
- [ ] Smoke: campuses create + campuses edit (already GenericForm).

- [ ] Commit + PR.

## Review brief

```
F0: new auto-form package; groups + saveMode; no root watch(); skeleton mirrors groups; GenericForm uses new package; no Lucide/ui inside auto-form/; edit-kit savedTick reserved space.
```
