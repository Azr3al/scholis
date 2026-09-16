# R4 — Form, Select, Combobox, DatePicker, and AutoForm Sizing Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish contextual form field widths, unified control sizing terminology across Select/Selector/Combobox/DatePicker, stable component identity for typing/focus, reserved error/save space, and consolidate duplicate DatePicker implementations — with representative consumer migrations only.

**Architecture:** Add pure sizing modules (`control-sizing.ts`, `field-measure.ts`) consumed by primitives and AutoForm field-map. Replace hardcoded `max-w-xl` on every AutoForm control with contextual `FieldMeasure`. Thread `ControlSize` through Select/Combobox/Selector with consistent class names. Merge the two DatePicker files into one module with explicit variants; keep backward-compatible re-exports. Gate stable identity with existing field-isolation tests plus new sizing contract tests.

**Tech Stack:** React 19, react-hook-form, Base UI primitives, Vitest, DESIGN.md §8.5 / §12 (no layout shift).

**Spec:** [`../specs/2026-07-12-ui-migration-remediation-program-design.md`](../specs/2026-07-12-ui-migration-remediation-program-design.md) §8.5  
**Design authority:** [`DESIGN.md`](../../../DESIGN.md) §12 (reserve space for async UI and save feedback)

**Planning base SHA:** `05ac447b10966131d4f37a2ba724110c33d66dd4` on `dev`  
**Branch:** `remediate/ui-r4-forms` from current `dev`  
**Worktree:** `../worktrees/ui-r4-forms`

**Dependencies (must be merged before execution):**
- **R0** — verification baseline green (`npm run test:unit`, `npm run typecheck`, `npm run test:browser`)
- **R1** — semantic tokens under `.sj-root` (no new `text-muted-foreground` in owned files)

**May overlap with:** R3 and R5 on disjoint files. **Serialize with R2** if modifying Popover z-index in DatePicker popover variant.

---

## Current-state evidence (base `05ac447b`)

| Location | Problem |
| --- | --- |
| `src/components/auto-form/field-map.tsx:57,89,122,155,195,240,279,328` | Every control wrapped in `className="w-full max-w-xl"` regardless of page context |
| `src/components/primitives/select.tsx:38-39,14-16` | `fullWidth` boolean only; default trigger `min-w-44`; no shared `ControlSize` vocabulary |
| `src/components/primitives/combobox.tsx:27-28` | Hardcoded `w-64` input group |
| `src/components/form/selectors/selector.tsx:67-79` | Duplicated `w-[180px]` vs `fullWidth` branching |
| `src/components/date/date-picker.tsx:24-101` | Popover calendar variant with `z-[300]` |
| `src/components/users/date-picker.tsx:21-57` | Duplicate native `<input type="date">` variant — separate import paths |
| `src/components/auto-form/auto-form-field.tsx:29-71` | Memoized per-field boundary exists (good) — must not regress during sizing refactor |
| `src/components/auto-form/auto-form.tsx:105-112` | Save tick slot reserved (good pattern to mirror on fields) |

**Behavior preservation rule:** Validation, autosave timing, enum option mapping, and onSubmit payloads unchanged. Visual width and reserved-space geometry only.

---

## Locked terminology

### `FieldMeasure` (form field container width)

| Measure | Class | Use |
| --- | --- | --- |
| `narrow` | `w-full max-w-md` | Create wizards, compact settings |
| `default` | `w-full max-w-xl` | Standard create/edit forms |
| `wide` | `w-full max-w-2xl` | Rich text / multi-control rows |
| `full` | `w-full max-w-none` | Dense operational panels, table toolbars |

AutoForm resolves measure from `fieldConfigItem.measure` → group-level default → form-level `measure` prop (new, default `default`).

### `ControlSize` (trigger/input height and width mode)

| Size | Height | Width mode |
| --- | --- | --- |
| `compact` | `h-8` | shrink-to-content (`min-w-0 w-auto`) |
| `default` | `h-10` | standard trigger (`min-w-44`) |
| `full` | `h-10` | fill container (`w-full min-w-0 max-w-full`) |

Table cells and toolbar filters use `compact` or `full` explicitly — never implicit magic.

---

## File structure

**Create:**
```
src/lib/ui/control-sizing.ts
src/lib/ui/field-measure.ts
src/lib/ui/__tests__/control-sizing.test.ts
src/lib/ui/__tests__/field-measure.test.ts
src/components/date/date-picker-types.ts
docs/ui-contracts/form-control-sizing.md
```

**Modify:**
```
src/components/auto-form/types.ts
src/components/auto-form/auto-form.tsx
src/components/auto-form/field-map.tsx
src/components/auto-form/auto-form-group.tsx
src/components/primitives/select.tsx
src/components/primitives/combobox.tsx
src/components/form/selectors/selector.tsx
src/components/date/date-picker.tsx
src/components/users/date-picker.tsx
src/components/form/date-range-filter.tsx
src/components/users/user-form-fields.tsx
src/app/(internal)/users/create/page.tsx
```

**Forbidden (do not edit):**
- Route cohort pages beyond representatives listed above (including `src/app/(internal)/subjects/create/page.tsx` — owned by **R5**)
- `src/components/finances/student-payments-grid.tsx` and R12-owned finance table files
- Overlay stack values in R2-owned files (except DatePicker popover z-index if R2 merged first)
- Backend / API code
- Deleting `src/components/users/date-picker.tsx` in this wave (re-export only)

---

### Task 1: Pure sizing helpers (TDD)

**Files:**
- Create: `src/lib/ui/__tests__/control-sizing.test.ts`
- Create: `src/lib/ui/__tests__/field-measure.test.ts`
- Create: `src/lib/ui/control-sizing.ts`
- Create: `src/lib/ui/field-measure.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/ui/__tests__/control-sizing.test.ts
import { describe, expect, it } from "vitest";
import { controlSizeClassName, selectTriggerSizeClassName } from "../control-sizing";

describe("controlSizeClassName", () => {
  it("returns compact height for table cells", () => {
    expect(controlSizeClassName("compact")).toContain("h-8");
  });

  it("returns full width mode for full size", () => {
    expect(controlSizeClassName("full")).toContain("w-full");
    expect(controlSizeClassName("full")).toContain("min-w-0");
  });
});

describe("selectTriggerSizeClassName", () => {
  it("maps full size to fullWidth trigger classes", () => {
    const cls = selectTriggerSizeClassName("full");
    expect(cls).toContain("w-full");
    expect(cls).not.toContain("min-w-44");
  });
});
```

```typescript
// src/lib/ui/__tests__/field-measure.test.ts
import { describe, expect, it } from "vitest";
import { fieldMeasureClassName, resolveFieldMeasure } from "../field-measure";

describe("fieldMeasureClassName", () => {
  it("returns max-w-xl for default measure", () => {
    expect(fieldMeasureClassName("default")).toBe("w-full max-w-xl");
  });

  it("returns unconstrained width for full measure", () => {
    expect(fieldMeasureClassName("full")).toBe("w-full max-w-none");
  });
});

describe("resolveFieldMeasure", () => {
  it("prefers field-level measure over form default", () => {
    expect(resolveFieldMeasure("wide", "narrow")).toBe("wide");
  });

  it("falls back to form default", () => {
    expect(resolveFieldMeasure(undefined, "narrow")).toBe("narrow");
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run:
```bash
cd /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-fe
npm run test:unit -- src/lib/ui/__tests__/control-sizing.test.ts src/lib/ui/__tests__/field-measure.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement helpers**

```typescript
// src/lib/ui/control-sizing.ts
export type ControlSize = "compact" | "default" | "full";

export function controlSizeClassName(size: ControlSize): string {
  if (size === "compact") {
    return "h-8 min-w-0 w-auto text-sm";
  }
  if (size === "full") {
    return "h-10 min-w-0 w-full max-w-full text-base";
  }
  return "h-10 min-w-44 w-auto text-base";
}

export function selectTriggerSizeClassName(size: ControlSize): string {
  const shared =
    "flex items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 text-text-primary select-none hover:bg-surface-hover data-[popup-open]:bg-surface-hover outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-surface";
  if (size === "compact") {
    return `${shared} h-8 min-w-0 w-full max-w-full text-sm`;
  }
  if (size === "full") {
    return `${shared} h-10 min-w-0 w-full max-w-full text-base`;
  }
  return `${shared} h-10 min-w-44 text-base`;
}

export function comboboxInputGroupClassName(size: ControlSize): string {
  const shared =
    "relative flex items-center rounded-md border border-border bg-surface focus-within:outline-2 focus-within:-outline-offset-1 focus-within:outline-[var(--ring)]";
  if (size === "compact") {
    return `${shared} h-8 w-full min-w-0`;
  }
  if (size === "full") {
    return `${shared} h-10 w-full min-w-0`;
  }
  return `${shared} h-10 w-64`;
}
```

```typescript
// src/lib/ui/field-measure.ts
export type FieldMeasure = "narrow" | "default" | "wide" | "full";

const MEASURE_CLASS: Record<FieldMeasure, string> = {
  narrow: "w-full max-w-md",
  default: "w-full max-w-xl",
  wide: "w-full max-w-2xl",
  full: "w-full max-w-none",
};

export function fieldMeasureClassName(measure: FieldMeasure): string {
  return MEASURE_CLASS[measure];
}

export function resolveFieldMeasure(
  fieldMeasure: FieldMeasure | undefined,
  formMeasure: FieldMeasure,
): FieldMeasure {
  return fieldMeasure ?? formMeasure;
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run:
```bash
npm run test:unit -- src/lib/ui/__tests__/control-sizing.test.ts src/lib/ui/__tests__/field-measure.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/ui/control-sizing.ts src/lib/ui/field-measure.ts src/lib/ui/__tests__/control-sizing.test.ts src/lib/ui/__tests__/field-measure.test.ts
git commit -m "feat(ui): add control sizing and field measure helpers"
```

---

### Task 2: AutoForm contextual widths

**Files:**
- Modify: `src/components/auto-form/types.ts:50-105`
- Modify: `src/components/auto-form/auto-form.tsx:20-42,115-124`
- Modify: `src/components/auto-form/field-map.tsx:37-428`
- Modify: `src/components/auto-form/auto-form-group.tsx:12-94`

- [ ] **Step 1: Write failing test for measure propagation**

```typescript
// src/components/auto-form/__tests__/field-measure.test.ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("AutoForm field measure contract", () => {
  it("field-map uses fieldMeasureClassName instead of hardcoded max-w-xl", () => {
    const src = readFileSync(resolve(__dirname, "../field-map.tsx"), "utf8");
    expect(src).not.toMatch(/Field\.Root className="w-full max-w-xl"/);
    expect(src).toMatch(/fieldMeasureClassName/);
  });

  it("AutoFormProps exposes measure", () => {
    const src = readFileSync(resolve(__dirname, "../types.ts"), "utf8");
    expect(src).toMatch(/measure\?: FieldMeasure/);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run:
```bash
npm run test:unit -- src/components/auto-form/__tests__/field-measure.test.ts
```

- [ ] **Step 3: Extend types**

In `src/components/auto-form/types.ts`, add import at top:

```typescript
import type { FieldMeasure } from "@/lib/ui/field-measure";
```

Add to `FieldConfigItem` (after `customLabel`):

```typescript
  /** Field container width within the form. Overrides form-level measure. */
  measure?: FieldMeasure;
```

Add to `AutoFormGroup` (after `collapsible`):

```typescript
  /** Default measure for fields in this group when field-level measure omitted. */
  measure?: FieldMeasure;
```

Add to `AutoFormProps` (after `className`):

```typescript
  /** Default field container width for all groups/fields. Default: "default". */
  measure?: FieldMeasure;
```

- [ ] **Step 4: Update `auto-form.tsx`**

Add prop default:

```typescript
  measure = "default",
```

Pass to group section (lines 116-123):

```typescript
            <AutoFormGroupSection
              key={group.id}
              group={group}
              shape={objectSchema.shape}
              fieldConfig={fieldConfig}
              formMeasure={measure}
              onFieldBlur={autosaveEnabled ? bindFieldBlur : undefined}
            />
```

- [ ] **Step 5: Update `auto-form-group.tsx`**

Add prop:

```typescript
  formMeasure?: FieldMeasure;
```

Pass to `AutoFormField`:

```typescript
                formMeasure={formMeasure}
                groupMeasure={group.measure}
```

- [ ] **Step 6: Update `auto-form-field.tsx`**

Extend props:

```typescript
import type { FieldMeasure } from "@/lib/ui/field-measure";
```

Add to `AutoFormFieldProps`:

```typescript
  formMeasure?: FieldMeasure;
  groupMeasure?: FieldMeasure;
```

Pass through to `renderMappedFieldControl`:

```typescript
            formMeasure,
            groupMeasure,
            fieldConfigItem,
```

- [ ] **Step 7: Refactor `field-map.tsx`**

Add imports:

```typescript
import { fieldMeasureClassName, resolveFieldMeasure } from "@/lib/ui/field-measure";
import type { FieldMeasure } from "@/lib/ui/field-measure";
```

Add helper after `OptionalLabelSuffix`:

```typescript
function fieldRootClassName(
  fieldConfigItem: FieldConfigItem,
  formMeasure: FieldMeasure,
  groupMeasure?: FieldMeasure,
  extra?: string,
): string {
  const measure = resolveFieldMeasure(
    fieldConfigItem.measure ?? groupMeasure,
    formMeasure,
  );
  return cn(fieldMeasureClassName(measure), extra);
}
```

Replace the `renderMappedFieldControl` parameter type and first destructuring
statement with:

```typescript
export function renderMappedFieldControl(args: {
  name: string;
  zodItem: z.ZodTypeAny;
  fieldConfigItem: FieldConfigItem;
  field: AutoFormInputComponentProps["field"];
  error?: string;
  isLoading?: boolean;
  formMeasure?: FieldMeasure;
  groupMeasure?: FieldMeasure;
}): ReactNode {
  const {
    name,
    zodItem,
    fieldConfigItem,
    field,
    error,
    isLoading,
    formMeasure = "default",
    groupMeasure,
  } = args;
```

Immediately before the `return` in `renderMappedFieldControl`, add:

```typescript
  const resolvedFieldClassName = fieldRootClassName(
    fieldConfigItem,
    formMeasure,
    groupMeasure,
  );
```

Pass the resolved class to `InputComponent`:

```typescript
          className={resolvedFieldClassName}
```

In each of these eight functions, add `className` to the destructured props:
`AutoFormTextControl`, `AutoFormNumberControl`, `AutoFormTextareaControl`,
`AutoFormCheckboxControl`, `AutoFormSwitchControl`, `AutoFormSelectControl`,
`AutoFormRadioControl`, and `AutoFormDateControl`.

For text, number, textarea, select, radio, and date controls, replace the
hardcoded `Field.Root` class with this exact opening tag:

```typescript
    <Field.Root className={className} name={name} invalid={Boolean(error)}>
```

For the checkbox control, use:

```typescript
    <Field.Root
      className={cn(className, "flex-row items-center gap-3")}
      name={name}
      invalid={Boolean(error)}
    >
```

For the switch control, use:

```typescript
    <Field.Root
      className={cn(
        className,
        "flex-row items-center justify-between gap-3",
      )}
      name={name}
      invalid={Boolean(error)}
    >
```

Retain this exact reserved error slot in all eight controls:

```typescript
      <div className="min-h-5">
        {error ? <Field.Error>{error}</Field.Error> : null}
      </div>
```

- [ ] **Step 8: Run tests**

Run:
```bash
npm run test:unit -- src/components/auto-form/__tests__/field-measure.test.ts src/components/auto-form/__tests__/field-isolation.test.tsx
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/components/auto-form/types.ts src/components/auto-form/auto-form.tsx src/components/auto-form/auto-form-group.tsx src/components/auto-form/auto-form-field.tsx src/components/auto-form/field-map.tsx src/components/auto-form/__tests__/field-measure.test.ts
git commit -m "feat(auto-form): contextual field measure replaces global max-w-xl"
```

---

### Task 3: Unified Select and Selector sizing

**Files:**
- Modify: `src/components/primitives/select.tsx:1-102`
- Modify: `src/lib/ui/select-layout.ts:8-16`
- Modify: `src/components/form/selectors/selector.tsx:1-89`

- [ ] **Step 1: Write failing test**

```typescript
// src/lib/ui/__tests__/select-layout.test.ts
import { describe, expect, it } from "vitest";
import { selectTriggerClassName } from "../select-layout";

describe("selectTriggerClassName", () => {
  it("accepts ControlSize instead of fullWidth boolean", () => {
    expect(selectTriggerClassName({ size: "full" })).toContain("w-full");
    expect(selectTriggerClassName({ size: "default" })).toContain("min-w-44");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run:
```bash
npm run test:unit -- src/lib/ui/__tests__/select-layout.test.ts
```

- [ ] **Step 3: Update `select-layout.ts`**

Replace file with:

```typescript
import type { ControlSize } from "@/lib/ui/control-sizing";
import { selectTriggerSizeClassName } from "@/lib/ui/control-sizing";

/** Floor for payment Status select cells so common labels fit on one line. */
export const PAYMENT_STATUS_SELECT_MIN_WIDTH_CLASS = "min-w-[13.5rem]";

export function selectValueClassName(): string {
  return "min-w-0 flex-1 truncate whitespace-nowrap data-[placeholder]:text-text-muted";
}

export function selectTriggerClassName(opts: {
  size?: ControlSize;
  /** @deprecated Use size="full" instead. */
  fullWidth?: boolean;
}): string {
  const size: ControlSize =
    opts.size ?? (opts.fullWidth ? "full" : "default");
  return selectTriggerSizeClassName(size);
}
```

- [ ] **Step 4: Update `select.tsx`**

Add import:

```typescript
import type { ControlSize } from "@/lib/ui/control-sizing";
```

Replace props:

```typescript
  size = "default",
  /** @deprecated Use size="full" */
  fullWidth = false,
```

Compute:

```typescript
  const resolvedSize: ControlSize = fullWidth ? "full" : size;
```

Replace trigger className:

```typescript
        className={cn(selectTriggerClassName({ size: resolvedSize }), className)}
```

- [ ] **Step 5: Update `selector.tsx`**

Replace width branching (lines 67-79) with:

```typescript
          <Select
            value={value || undefined}
            onValueChange={(v) => onChange(String(v ?? ""))}
            disabled={isDisabled}
            size={fullWidth ? "full" : "default"}
            className={className}
            placeholder={label}
            items={items}
          />
```

Remove `w-[180px]` from loading skeleton; use `fullWidth ? "w-full" : "w-[180px]"` only on skeleton wrapper (behavior unchanged visually).

- [ ] **Step 6: Run tests**

Run:
```bash
npm run test:unit -- src/lib/ui/__tests__/select-layout.test.ts src/lib/ui/__tests__/control-sizing.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/ui/select-layout.ts src/components/primitives/select.tsx src/components/form/selectors/selector.tsx src/lib/ui/__tests__/select-layout.test.ts
git commit -m "feat(select): unify ControlSize terminology across Select and Selector"
```

---

### Task 4: Combobox sizing

**Files:**
- Modify: `src/components/primitives/combobox.tsx:11-78`

- [ ] **Step 1: Add `size` prop with default `default`**

Add import:

```typescript
import type { ControlSize } from "@/lib/ui/control-sizing";
import { comboboxInputGroupClassName } from "@/lib/ui/control-sizing";
```

Extend props:

```typescript
  size?: ControlSize;
```

Default destructuring:

```typescript
  size = "default",
```

Replace InputGroup className (lines 25-30):

```typescript
      <BaseCombobox.InputGroup
        className={cn(comboboxInputGroupClassName(size), className)}
      >
```

- [ ] **Step 2: Run lint + unit**

Run:
```bash
npm run lint -- src/components/primitives/combobox.tsx
npm run test:unit -- src/lib/ui/__tests__/control-sizing.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/primitives/combobox.tsx
git commit -m "feat(combobox): add ControlSize prop replacing fixed w-64"
```

---

### Task 5: DatePicker consolidation

**Files:**
- Create: `src/components/date/date-picker-types.ts`
- Modify: `src/components/date/date-picker.tsx`
- Modify: `src/components/users/date-picker.tsx`
- Modify: `src/components/form/date-range-filter.tsx:1-40`
- Modify: `src/components/users/user-form-fields.tsx:1-20`

- [ ] **Step 1: Create shared types**

```typescript
// src/components/date/date-picker-types.ts
export type DatePickerVariant = "popover" | "native";

export type SharedDatePickerProps = {
  date?: Date;
  setDate: (date?: Date) => void;
  disabled?: boolean;
  fromDate?: Date | string;
  toDate?: Date | string;
  defaultMonth?: Date | string;
  showTriggerIcon?: boolean;
  variant?: DatePickerVariant;
  size?: import("@/lib/ui/control-sizing").ControlSize;
};
```

- [ ] **Step 2: Update popover `date-picker.tsx`**

Add at top:

```typescript
import type { ControlSize } from "@/lib/ui/control-sizing";
import { controlSizeClassName } from "@/lib/ui/control-sizing";
import type { SharedDatePickerProps } from "./date-picker-types";
```

Extend `DatePickerProps`:

```typescript
export type DatePickerProps = SharedDatePickerProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "value" | "onChange" | "type">;
```

Add `size = "full"` to destructuring; apply to trigger:

```typescript
          className={cn(
            buttonVariants({ variant: "secondary" }),
            controlSizeClassName(size),
            "justify-start text-left font-normal",
            !date && "text-text-muted",
            className,
          )}
```

Replace `text-muted-foreground` with `text-text-muted` (R1 token).

- [ ] **Step 3: Replace users date-picker with re-export**

Replace entire `src/components/users/date-picker.tsx` with:

```typescript
"use client";

/**
 * Native date input variant — re-exported from canonical date module.
 * Prefer importing from `@/components/date/date-picker` with variant="native".
 */
export {
  NativeDatePicker as DatePicker,
  type DatePickerProps,
} from "@/components/date/date-picker";
```

- [ ] **Step 4: Add NativeDatePicker to canonical module**

At bottom of `src/components/date/date-picker.tsx`, add native variant implementation (move body from former `users/date-picker.tsx`) and export:

```typescript
export const NativeDatePicker = forwardRef<HTMLInputElement, Omit<DatePickerProps, "variant" | "showTriggerIcon">>(
  function NativeDatePickerCmp(
    { date, setDate, disabled = false, fromDate, toDate, className, size = "full", defaultMonth: _defaultMonth, ...rest },
    ref,
  ) {
    const min = fromDate ? format(new Date(fromDate), "yyyy-MM-dd") : undefined;
    const max = toDate ? format(new Date(toDate), "yyyy-MM-dd") : undefined;
    return (
      <input
        ref={ref}
        type="date"
        disabled={disabled}
        min={min}
        max={max}
        className={cn(inputClassName, controlSizeClassName(size), "w-full", className)}
        value={date ? format(new Date(date), "yyyy-MM-dd") : ""}
        onChange={(e) => {
          const v = e.target.value;
          setDate(v ? new Date(`${v}T00:00:00`) : undefined);
        }}
        {...rest}
      />
    );
  },
);
NativeDatePicker.displayName = "NativeDatePicker";

export function DatePicker(props: DatePickerProps) {
  if (props.variant === "native") {
    const { variant: _v, showTriggerIcon: _s, ...nativeProps } = props;
    return <NativeDatePicker {...nativeProps} />;
  }
  return <DatePickerCmp {...props} />;
}
```

Add imports: `inputClassName` from primitives/input, `format` from date-fns.

Rename inner forwardRef component to `DatePickerCmp` (already named in current file).

- [ ] **Step 5: Write failing consolidation test**

```typescript
// src/components/date/__tests__/date-picker-consolidation.test.ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("DatePicker consolidation", () => {
  it("users/date-picker re-exports from canonical module", () => {
    const src = readFileSync(
      resolve(__dirname, "../../users/date-picker.tsx"),
      "utf8",
    );
    expect(src).toContain('@/components/date/date-picker');
    expect(src).not.toContain('type="date"');
  });
});
```

- [ ] **Step 6: Run test — expect PASS after implementation**

Run:
```bash
npm run test:unit -- src/components/date/__tests__/date-picker-consolidation.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add src/components/date/date-picker-types.ts src/components/date/date-picker.tsx src/components/users/date-picker.tsx src/components/date/__tests__/date-picker-consolidation.test.ts
git commit -m "refactor(date-picker): consolidate native and popover variants"
```

---

### Task 6: Representative consumer migrations

**Files:**
- Modify: `src/app/(internal)/users/create/page.tsx` (pass `measure` to GenericForm)
- Modify: `src/components/form/generic-form.tsx` (pass measure prop through)
- Modify: `src/components/form/date-range-filter.tsx:60-104,147-191`

- [ ] **Step 1: Narrow measure on users create**

In `users/create/page.tsx`, pass measure to GenericForm:

```typescript
      <GenericForm
        schema={userCreateUpdateSchema}
        entityName="user"
        apiUrl="users"
        redirectUrl="/users"
        groups={USER_CREATE_GROUPS}
        measure="narrow"
      />
```

Adjust schema, entityName, apiUrl, redirectUrl, and groups identifiers to match the existing page imports — only add `measure="narrow"`.

- [ ] **Step 2: GenericForm forwards measure**

Add this import to `src/components/form/generic-form.tsx`:

```typescript
import type { FieldMeasure } from "@/lib/ui/field-measure";
```

Add this property after `fieldConfig` in `GenericFormProps`:

```typescript
  measure?: FieldMeasure;
```

Add `measure` after `fieldConfig` in the `GenericForm` props destructuring:

```typescript
  measure,
```

Pass it to `AutoForm` immediately after `groups={groups}`:

```typescript
      measure={measure}
```

- [ ] **Step 3: Date range filter uses the popover variant at full width**

Keep the existing import from `@/components/date/date-picker`. Add
`size="full"` to all four `<DatePicker>` calls at current lines 65, 87, 152,
and 174, immediately before each `date` prop:

```typescript
              <DatePicker
                size="full"
                date={
```

The four existing `date` and `setDate` expressions remain unchanged.

- [ ] **Step 4: Verify the users compatibility import without changing it**

Run:
```bash
rg 'from "@/components/users/date-picker"' src/components/users/user-form-fields.tsx
```

Expected: one matching import. This proves the compatibility re-export remains
usable; `user-form-fields.tsx` is not modified in this task.

- [ ] **Step 5: Run verification**

Run:
```bash
npm run typecheck
npm run test:unit -- src/components/auto-form src/components/date src/lib/ui
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/(internal)/users/create/page.tsx src/components/form/generic-form.tsx src/components/form/date-range-filter.tsx
git commit -m "refactor(forms): apply field measure on representative create pages"
```

---

### Task 7: Contract documentation

**Files:**
- Create: `docs/ui-contracts/form-control-sizing.md`

- [ ] **Step 1: Create the form/control sizing contract**

Create `docs/ui-contracts/form-control-sizing.md` with this complete content:

````markdown
# Form and Control Sizing Contract

Form fields use `FieldMeasure` for available line length. Individual controls
use `ControlSize` for trigger height and width behavior. These concepts are
independent: a full-width control fills its current field measure.

## FieldMeasure

| Measure | Class | Use |
| --- | --- | --- |
| `narrow` | `w-full max-w-md` | Create wizards and compact settings |
| `default` | `w-full max-w-xl` | Standard create and edit forms |
| `wide` | `w-full max-w-2xl` | Rich text and multi-control groups |
| `full` | `w-full max-w-none` | Dense operational panels and toolbars |

AutoForm resolves measure in this order:

1. `fieldConfigItem.measure`
2. `AutoFormGroup.measure`
3. `AutoForm.measure`
4. `default`

Consumers select a measure at the form or group boundary. Controls must not
add unrelated `max-w-*` classes.

## ControlSize

| Size | Height | Width behavior |
| --- | --- | --- |
| `compact` | `h-8` | `min-w-0 w-auto`; opt-in for table cells |
| `default` | `h-10` | `min-w-44 w-auto`; standalone trigger |
| `full` | `h-10` | `min-w-0 w-full max-w-full`; fills field measure |

`Select`, `Selector`, and `Combobox` use this terminology. New boolean width
props are prohibited. The deprecated `Select.fullWidth` adapter exists only
for staged consumer migration and maps to `size="full"`.

## DatePicker

Import from `@/components/date/date-picker`.

```tsx
<DatePicker
  variant="popover"
  size="full"
  date={selectedDate}
  setDate={setSelectedDate}
/>
```

Use `variant="native"` when a native date input is required. The
`@/components/users/date-picker` module is a compatibility re-export and must
not contain an independent implementation.

## Reserved feedback space

Every field reserves `min-h-5` for validation errors. Edit AutoForm reserves
its existing save-status row before status text appears. Async controls reserve
their trigger dimensions during loading. Loading, validation, saving, and saved
states must not change surrounding layout.

## Stable component identity

`AutoFormField` remains a module-level memoized component. It subscribes to one
field through `Controller` and `useFormState({ control, name })`. Do not define
field component types inside render functions and do not call whole-form
`watch()` from the AutoForm root. Typing in one field must not remount or
unfocus another field.

## Compact usage restrictions

Compact controls are opt-in for toolbars and table cells. Standard form fields
use `default` or `full`. Route code must not recreate these modes with local
height or width utility combinations.
````

- [ ] **Step 2: Commit**

```bash
git add docs/ui-contracts/form-control-sizing.md
git commit -m "docs: add form control sizing contract"
```

---

### Task 8: Browser smoke — form control sizing

**Files:**
- Create: `e2e/smoke/form-control-sizing.spec.ts`

- [ ] **Step 1: Create Playwright spec using R0 auth fixture**

```typescript
// e2e/smoke/form-control-sizing.spec.ts
import { test, expect } from "../fixtures/auth";

test.describe("form control sizing", () => {
  test.use({ viewport: { width: 1024, height: 800 } });

  test("/users/create fields respect narrow measure and keep focus stable", async ({ page }) => {
    await page.goto("/users/create");
    await page.waitForLoadState("networkidle");

    const firstField = page.locator('[data-field-name]').first();
    const secondField = page.locator('[data-field-name]').nth(1);
    await expect(firstField).toBeVisible();
    await expect(secondField).toBeVisible();

    const fieldRoot = firstField.locator("xpath=ancestor::*[contains(@class,'max-w-')]").first();
    const maxWidthClass = await fieldRoot.getAttribute("class");
    expect(maxWidthClass ?? "").toMatch(/max-w-md/);

    await firstField.locator("input, textarea, [role='combobox']").first().click();
    await firstField.locator("input, textarea, [role='combobox']").first().fill("Ada");
    await secondField.locator("input, textarea, [role='combobox']").first().click();
    await secondField.locator("input, textarea, [role='combobox']").first().fill("Lovelace");

    const activeFieldName = await page.evaluate(() =>
      document.activeElement?.closest("[data-field-name]")?.getAttribute("data-field-name") ?? null,
    );
    expect(activeFieldName).toBeTruthy();
  });

  test("date range filter select fills toolbar slot on recent transactions", async ({ page }) => {
    await page.goto("/finances/recent-transactions");
    await page.waitForLoadState("networkidle");

    const dateTrigger = page.locator('[data-field-name]').filter({ has: page.locator("button, input") }).first();
    await expect(dateTrigger).toBeVisible();
    const box = await dateTrigger.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(120);
  });
});
```

- [ ] **Step 2: Run browser spec**

```bash
export PLAYWRIGHT_TEST_EMAIL=james@schedjuice.com
export PLAYWRIGHT_TEST_PASSWORD=password123
export NEXT_PUBLIC_BASE_API_URL=http://localhost:8000/api/v1
: "${PLAYWRIGHT_PAYMENT_FIXTURE_TEXT:?Set this to unique text from a seeded editable payment row}"
npm run test:browser -- e2e/smoke/form-control-sizing.spec.ts
```

Expected: PASS with zero skipped tests.

- [ ] **Step 3: Commit**

```bash
git add e2e/smoke/form-control-sizing.spec.ts
git commit -m "test(r4): add form control sizing browser smoke spec"
```

---

## Verification (full wave)

```bash
cd /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-fe
npm run lint
npm run typecheck
npm run test:unit
npm run build
npm run test:browser -- e2e/smoke/form-control-sizing.spec.ts
```

Expected: all green. Browser spec asserts: `/users/create` fields respect narrow measure; typing in field A does not remount field B; Select full size fills container; DatePicker native re-export works. `/subjects/create` measure is verified manually after R5 merges (or confirm GenericForm measure forwarding via `/users/create`).

The browser command is always `npm run test:browser`. Skipped, excluded, quarantined, or conditionally bypassed browser cases are not accepted; any skip is a blocking failure returned to R0 or the owning plan.

---

## Browser / manual checks

| Route | Role | Viewport | Theme | Check |
| --- | --- | --- | --- | --- |
| `/users/create` | admin | 1024×800 | light | Fields max-width ≈ md not xl; error text does not shift layout; focus stable while typing |
| `/finances/recent-transactions` | finance | 1280×800 | light | Date range filter combobox/popover width fills toolbar slot |
| `/subjects/create` | admin | 1024×800 | light | Manual check only after R5 merges — confirm narrow measure via PageHeader + GenericForm wiring |

---

## Stop conditions

1. **R0/R1 not green** — stop.
2. **field-isolation tests fail** — stop; identity regression.
3. **Owned file drift** on `field-map.tsx` / `select.tsx` from parallel R2/R12 work — stop and serialize.
4. **Any autosave or validation behavior change** — stop.

---

## Independent QA handoff prompt

```
You are independent QA for R4 form/control sizing contracts.
Base SHA: merge commit of remediate/ui-r4-forms.

Acceptance criteria:
1. FieldMeasure and ControlSize helpers exist with unit tests.
2. AutoForm no longer hardcodes max-w-xl on every field; measure prop works.
3. Select, Selector, Combobox share ControlSize terminology.
4. DatePicker consolidated: users/date-picker re-exports canonical module; both variants work.
5. Error and save feedback space reserved (min-h-5 on fields; auto-form save tick unchanged).
6. field-isolation tests pass — no whole-form watch, memoized AutoFormField intact.
7. Representative route `/users/create` verified; `/subjects/create` deferred to R5.

Commands: npm run lint && npm run typecheck && npm run test:unit && npm run build && npm run test:browser -- e2e/smoke/form-control-sizing.spec.ts

Manual: type in first/second fields on /users/create; confirm no focus loss. After R5 merges, compare /subjects/create field width to /users/create.

Return PASS/FAIL with evidence. Do not patch failures.
```

---

## Self-review (spec §8.5)

| Requirement | Task |
| --- | --- |
| Contextual AutoForm width | Task 2 |
| Compact opt-in for toolbars/cells | Task 1 ControlSize |
| Shared sizing terminology | Tasks 1, 3, 4 |
| Error/save space reserved | Task 2 field-map min-h-5 |
| Stable component identity | Task 2 + existing field-isolation tests |
| DatePicker consolidation | Task 5 |
| Representative consumers | Task 6 (`/users/create`) |
| Browser form-control smoke | Task 8 |

**Placeholder scan:** none.
