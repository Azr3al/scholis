# Category Select and Date Picker Styling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every `categories` picker a scrollable `EntitySelect`, and every product date field use the themed popover `DatePicker`.

**Architecture:** Extend `EntitySelect` for empty/filter options, swap `entity="categories"` combobox call sites, flip `users/date-picker` to the popover export, and replace remaining `type="date"` inputs with `@/components/date/date-picker`.

**Tech Stack:** React, Base UI Select, React Query, existing `EntitySelect` / popover `DatePicker` / `Calendar`.

**Spec:** [2026-07-13-category-select-and-date-picker-styling-design.md](../specs/2026-07-13-category-select-and-date-picker-styling-design.md)

---

## File map

| File | Responsibility |
|------|----------------|
| `src/components/form/entity-select.tsx` | Scrollable entity select; add empty option / placeholder / hideLabel |
| `src/components/form/entity-select.test.tsx` | Unit coverage for empty option + value mapping |
| Category call sites (8 files) | Swap `EntityCombobox` → `EntitySelect` |
| `src/components/users/date-picker.tsx` | Re-export popover `DatePicker` |
| Date call sites (6+ files) | Replace `type="date"` with popover `DatePicker` |
| `src/components/date/__tests__/date-picker-consolidation.test.ts` | Keep shim assertions green |

---

### Task 1: Extend EntitySelect

**Files:**
- Modify: `src/components/form/entity-select.tsx`
- Create: `src/components/form/entity-select.test.tsx`

- [ ] **Step 1: Add props and empty-option behavior**

Extend props:

- `isRequired?: boolean` (default `false`)
- `emptyOption?: { value: string; label: string }`
- `placeholder?: string`
- `hideLabel?: boolean`
- `containerClassName?: string`

Behavior:

- Prepend `emptyOption` to `items` when provided.
- `value === 0` or no selection → `Select` value `undefined` (or empty option value).
- On empty option selected (`""` or emptyOption.value), call `onChange(0)`.
- When `hideLabel` or `label === ""`, omit visible label wrapper spacing used by parents with `Field.Label`.
- Keep missing-id fallback and loading disable.

- [ ] **Step 2: Add a focused unit test**

Assert items include empty option label when configured, and selecting empty maps to `onChange(0)` (test via exported helper if needed, or render with testing-library if already used in form tests).

- [ ] **Step 3: Run test**

```bash
cd schedjuice-reimagined-fe && npx vitest run src/components/form/entity-select.test.tsx
```

Expected: PASS

---

### Task 2: Swap category combobox call sites

**Files:**
- Modify:
  - `src/components/scheduling/manual-course-form.tsx`
  - `src/components/course/course-program-field-config.tsx`
  - `src/components/scheduling/intake/dates-step.tsx`
  - `src/components/scheduling/intake/course-preview-step.tsx`
  - `src/components/scheduling/existing-intake-add-form.tsx`
  - `src/components/scheduling/existing-intake-add-form-multi.tsx`
  - `src/components/attendance-god-view/attendance-god-view-filters.tsx`
  - `src/components/course-insights/course-insights-filters.tsx`

- [ ] **Step 1: Replace each `entity="categories"` EntityCombobox**

Pattern for required fields:

```tsx
<EntitySelect
  entity="categories"
  displayFunction={(e) => e.name}
  value={typeof field.value === "number" ? field.value : Number(field.value) || 0}
  onChange={(v) => field.onChange(v > 0 ? v : null)}
  label="Category"
  isRequired
  queryParams={{ fields: ["id", "name"], sorts: ["name"] }}
/>
```

Pattern for filters (“All”):

```tsx
<EntitySelect
  entity="categories"
  displayFunction={(c) => c.name}
  value={categoryId ? Number(categoryId) : 0}
  onChange={(v) => onCategoryIdChange(v > 0 ? String(v) : "")}
  label="Category"
  emptyOption={{ value: "", label: "All" }}
  placeholder="All"
  queryParams={{ fields: ["id", "name"], sorts: ["name"] }}
/>
```

When parent already renders `Field.Label`, pass `label=""` and `hideLabel` (or equivalent) to avoid double labels.

- [ ] **Step 2: Grep guard**

```bash
rg 'entity="categories"' schedjuice-reimagined-fe/src -g '*.tsx'
```

Expected: only `EntitySelect` usages (plus course edit page already on select).

---

### Task 3: Flip users DatePicker to popover

**Files:**
- Modify: `src/components/users/date-picker.tsx`
- Modify: `src/components/date/__tests__/date-picker-consolidation.test.ts` (only if comments/assertions need update)

- [ ] **Step 1: Re-export popover DatePicker**

```tsx
export {
  DatePicker,
  type DatePickerProps,
} from "@/components/date/date-picker";
```

Remove `NativeDatePicker as DatePicker` alias. Update file comment: prefer popover; native only via `variant="native"` on canonical module.

- [ ] **Step 2: Run consolidation test**

```bash
cd schedjuice-reimagined-fe && npx vitest run src/components/date/__tests__/date-picker-consolidation.test.ts
```

Expected: PASS

---

### Task 4: Replace remaining `type="date"` inputs

**Files:**
- Modify:
  - `src/components/scheduling/manual-course-form.tsx`
  - `src/components/scheduling/intake/dates-step.tsx`
  - `src/components/scheduling/intake/course-preview-step.tsx`
  - `src/components/auto-form/field-map.tsx`
  - `src/components/course/feed/feed-announcement-date-field.tsx`
  - `src/components/course/record/course-record-status-actions.tsx`
  - `src/components/grading-reports/create-result-sheet-dialog.tsx`

- [ ] **Step 1: Swap each input to popover DatePicker**

```tsx
import { DatePicker } from "@/components/date/date-picker";

<DatePicker
  date={field.value ? new Date(field.value) : undefined}
  setDate={(d) => field.onChange(d ?? null)}
  fromDate={/* former min if any */}
  toDate={/* former max if any */}
/>
```

Keep local-midnight semantics when constructing dates from strings elsewhere. Do not change `YearMonthSelector` call sites.

- [ ] **Step 2: Grep guard**

```bash
rg 'type="date"' schedjuice-reimagined-fe/src -g '*.tsx'
```

Expected: only `NativeDatePicker` implementation inside `date/date-picker.tsx` (and tests that assert absence elsewhere).

---

### Task 5: Verification

- [ ] **Step 1: Run targeted tests**

```bash
cd schedjuice-reimagined-fe && npx vitest run src/components/form/entity-select.test.tsx src/components/date/__tests__/date-picker-consolidation.test.ts
```

- [ ] **Step 2: Manual smoke (dev)**

1. Manual course form: Category opens scrollable select (no search header).
2. Same form: Start date opens themed popover calendar.
3. Course insights or attendance filters: Category “All” still clears filter.
4. User form employment date: themed popover after users re-export flip.

---

## Spec coverage

| Spec requirement | Task |
|------------------|------|
| Extend EntitySelect empty/placeholder/hideLabel | 1 |
| Swap all categories comboboxes | 2 |
| Flip users date-picker to popover | 3 |
| Replace type=date surfaces | 4 |
| Testing / success criteria | 5 |
| Non-goals (quiz-categories, YearMonth, people combobox) | Explicitly skipped |
