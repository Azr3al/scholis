# Payment Upload Compact Spacing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the student payment upload part form denser by tightening part gaps, removing empty error spacers (with a subtle expand/collapse for real errors), and adding an opt-in compact screenshot dropzone.

**Architecture:** Extend `upload-form-layout.ts` with denser class helpers; add upload-scoped `UploadFieldError` (CSS grid `0fr`/`1fr`); add `density` prop + pure class helpers on `FileDragAndDrop`; wire only `/finances/student-payments/upload`. Validation and OCR stay untouched.

**Tech Stack:** Next.js App Router, React, Tailwind, Vitest + Testing Library, existing `Field` / `FileDragAndDrop`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-21-payment-upload-compact-spacing-design.md` (FE mirror under `schedjuice-reimagined-fe/docs/superpowers/specs/`)
- FE only — no backend changes
- Scope: part fields + screenshot dropzone only; billing / months / discount unchanged
- No global `Field.Root` gap change; optional `gap-1.5` only via page `className`
- `FileDragAndDrop` default density must stay visually identical for other callers
- Prefer CSS expand/collapse over `motion/react`
- High-value tests only (no upload-page happy-path smoke)
- Do not create git commits unless the user explicitly asks
- Unit tests: `cd schedjuice-reimagined-fe && npm run test:unit -- <path>`

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/finances/upload-form-layout.ts` | Denser part section + screenshot stack class helpers |
| `src/lib/finances/upload-form-layout.test.ts` | Assert compact class strings |
| `src/components/finances/upload-field-error.tsx` | Collapsing inline error slot |
| `src/components/finances/upload-field-error.test.tsx` | Empty vs message + expand class / reduced-motion |
| `src/components/form/file-drag-and-drop.tsx` | `density` prop; use density class helpers |
| `src/components/form/file-drag-and-drop-density.ts` | Pure class helpers for default vs compact |
| `src/components/form/file-drag-and-drop-density.test.ts` | Assert compact ≠ default padding/gap classes |
| `src/app/(internal)/finances/student-payments/upload/page.tsx` | Apply helpers, `density="compact"`, `UploadFieldError`, drop empty spacers |

---

### Task 1: Compact upload layout helpers

**Files:**
- Modify: `schedjuice-reimagined-fe/src/lib/finances/upload-form-layout.ts`
- Create: `schedjuice-reimagined-fe/src/lib/finances/upload-form-layout.test.ts`

**Interfaces:**
- Consumes: existing `uploadPartFieldDataName`, `uploadFormActionsClassName` (unchanged)
- Produces:
  - `uploadPartSectionClassName(): string` → `"flex w-full min-w-0 flex-col gap-2"` (was `gap-4`)
  - `uploadPartScreenshotStackClassName(): string` → `"w-full space-y-2"`
  - `uploadPartFieldRootClassName(): string` → `"w-full gap-1.5"` (page-local Field denser label/control gap)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import {
  uploadPartFieldRootClassName,
  uploadPartScreenshotStackClassName,
  uploadPartSectionClassName,
} from "./upload-form-layout";

describe("upload-form-layout compact spacing", () => {
  it("uses gap-2 for part sections instead of gap-4", () => {
    const cls = uploadPartSectionClassName();
    expect(cls).toContain("gap-2");
    expect(cls).not.toContain("gap-4");
  });

  it("uses space-y-2 for the screenshot stack", () => {
    expect(uploadPartScreenshotStackClassName()).toBe("w-full space-y-2");
  });

  it("exposes a denser Field.Root className for upload parts", () => {
    expect(uploadPartFieldRootClassName()).toBe("w-full gap-1.5");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/finances/upload-form-layout.test.ts`

Expected: FAIL — `uploadPartScreenshotStackClassName` / `uploadPartFieldRootClassName` missing and/or `gap-4` still present.

- [ ] **Step 3: Implement helpers**

Replace / add in `upload-form-layout.ts`:

```ts
export function uploadPartSectionClassName(): string {
  return "flex w-full min-w-0 flex-col gap-2";
}

export function uploadPartScreenshotStackClassName(): string {
  return "w-full space-y-2";
}

export function uploadPartFieldRootClassName(): string {
  return "w-full gap-1.5";
}
```

Keep `uploadPartFieldDataName` and `uploadFormActionsClassName` unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/finances/upload-form-layout.test.ts`

Expected: PASS

- [ ] **Step 5: Commit (only if user asked)**

---

### Task 2: `UploadFieldError` collapsing slot

**Files:**
- Create: `schedjuice-reimagined-fe/src/components/finances/upload-field-error.tsx`
- Create: `schedjuice-reimagined-fe/src/components/finances/upload-field-error.test.tsx`

**Interfaces:**
- Consumes: `cn` from `@/lib/utils`
- Produces: `UploadFieldError({ message?: string | null }): JSX.Element`
  - Empty / whitespace-only `message`: no `role="alert"`, outer grid `grid-rows-[0fr]`
  - Non-empty `message`: `role="alert"` with that text, outer grid `grid-rows-[1fr]`
  - Open transition ~180ms; close ~140ms; `motion-reduce:transition-none` / `motion-reduce:duration-0`
  - Keep last message visible while collapsing (do not unmount text on the same frame as close)

- [ ] **Step 1: Write the failing tests**

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { UploadFieldError } from "./upload-field-error";

afterEach(() => cleanup());

describe("UploadFieldError", () => {
  it("does not render an alert when message is empty", () => {
    const { container } = render(<UploadFieldError message="" />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(container.firstElementChild?.className).toContain("grid-rows-[0fr]");
  });

  it("renders an alert and expands when message is set", () => {
    const { container } = render(
      <UploadFieldError message="Amount is required." />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Amount is required.");
    expect(container.firstElementChild?.className).toContain("grid-rows-[1fr]");
    expect(container.firstElementChild?.className).toContain("duration-[180ms]");
  });

  it("keeps reduced-motion classes so OS preference can skip animation", () => {
    const { container } = render(
      <UploadFieldError message="Required" />,
    );
    const cls = container.firstElementChild?.className ?? "";
    expect(cls).toMatch(/motion-reduce:(transition-none|duration-0)/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/components/finances/upload-field-error.test.tsx`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `UploadFieldError`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type UploadFieldErrorProps = {
  message?: string | null;
};

export function UploadFieldError({ message }: UploadFieldErrorProps) {
  const trimmed = message?.trim() ?? "";
  const open = trimmed.length > 0;
  const [displayed, setDisplayed] = useState(trimmed);

  useEffect(() => {
    if (open) setDisplayed(trimmed);
  }, [open, trimmed]);

  return (
    <div
      className={cn(
        "grid w-full self-stretch transition-[grid-template-rows] ease-out motion-reduce:transition-none motion-reduce:duration-0",
        open
          ? "grid-rows-[1fr] duration-[180ms]"
          : "grid-rows-[0fr] duration-[140ms]",
      )}
      onTransitionEnd={(e) => {
        if (e.propertyName !== "grid-template-rows") return;
        if (!open) setDisplayed("");
      }}
    >
      <div className="min-h-0 overflow-hidden">
        {displayed ? (
          <p
            className={cn(
              "text-sm text-danger transition-opacity ease-out motion-reduce:transition-none",
              open
                ? "opacity-100 duration-[180ms]"
                : "opacity-0 duration-[140ms]",
            )}
            role="alert"
          >
            {displayed}
          </p>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/components/finances/upload-field-error.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit (only if user asked)**

---

### Task 3: Compact density for `FileDragAndDrop`

**Files:**
- Create: `schedjuice-reimagined-fe/src/components/form/file-drag-and-drop-density.ts`
- Create: `schedjuice-reimagined-fe/src/components/form/file-drag-and-drop-density.test.ts`
- Modify: `schedjuice-reimagined-fe/src/components/form/file-drag-and-drop.tsx`

**Interfaces:**
- Consumes: none beyond string returns
- Produces:
  - `export type FileDragAndDropDensity = "default" | "compact"`
  - `fileDropzoneRootClassName(density: FileDragAndDropDensity): string`
  - `fileDropzoneInnerClassName(density: FileDragAndDropDensity): string`
  - `fileDropzoneButtonWrapClassName(density: FileDragAndDropDensity): string`
  - `fileDropzoneIconWrapClassName(density: FileDragAndDropDensity): string`
  - `fileDropzoneIconClassName(density: FileDragAndDropDensity): string`
  - `FileDragAndDrop` prop `density?: FileDragAndDropDensity` default `"default"`

Class contracts:

| Helper | default | compact |
|---|---|---|
| root | includes `p-6 sm:p-8` | includes `p-3 sm:p-4`, not `p-6` / `sm:p-8` |
| inner | `gap-3` | `gap-2` |
| button wrap | `mt-4` | `mt-2` |
| icon wrap | `p-2` | `p-1.5` |
| icon | `h-6 w-6` | `h-5 w-5` |

Shared root chrome (both densities):  
`group relative flex w-full flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 hover:bg-muted/40 transition-colors text-center outline-none`

- [ ] **Step 1: Write the failing density tests**

```ts
import { describe, expect, it } from "vitest";
import {
  fileDropzoneButtonWrapClassName,
  fileDropzoneIconClassName,
  fileDropzoneIconWrapClassName,
  fileDropzoneInnerClassName,
  fileDropzoneRootClassName,
} from "./file-drag-and-drop-density";

describe("file-drag-and-drop-density", () => {
  it("keeps large padding for default density", () => {
    const cls = fileDropzoneRootClassName("default");
    expect(cls).toContain("p-6");
    expect(cls).toContain("sm:p-8");
  });

  it("uses tighter padding for compact density", () => {
    const cls = fileDropzoneRootClassName("compact");
    expect(cls).toContain("p-3");
    expect(cls).toContain("sm:p-4");
    expect(cls).not.toContain("p-6");
    expect(cls).not.toContain("sm:p-8");
  });

  it("tightens inner gap, button margin, and icon size for compact", () => {
    expect(fileDropzoneInnerClassName("compact")).toContain("gap-2");
    expect(fileDropzoneInnerClassName("default")).toContain("gap-3");
    expect(fileDropzoneButtonWrapClassName("compact")).toContain("mt-2");
    expect(fileDropzoneButtonWrapClassName("default")).toContain("mt-4");
    expect(fileDropzoneIconWrapClassName("compact")).toContain("p-1.5");
    expect(fileDropzoneIconClassName("compact")).toContain("h-5");
    expect(fileDropzoneIconClassName("default")).toContain("h-6");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/components/form/file-drag-and-drop-density.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement density helpers**

```ts
export type FileDragAndDropDensity = "default" | "compact";

const ROOT_BASE =
  "group relative flex w-full flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 hover:bg-muted/40 transition-colors text-center outline-none";

export function fileDropzoneRootClassName(
  density: FileDragAndDropDensity = "default",
): string {
  return density === "compact"
    ? `${ROOT_BASE} p-3 sm:p-4`
    : `${ROOT_BASE} p-6 sm:p-8`;
}

export function fileDropzoneInnerClassName(
  density: FileDragAndDropDensity = "default",
): string {
  return density === "compact"
    ? "pointer-events-none flex flex-col items-center gap-2"
    : "pointer-events-none flex flex-col items-center gap-3";
}

export function fileDropzoneButtonWrapClassName(
  density: FileDragAndDropDensity = "default",
): string {
  return density === "compact" ? "mt-2" : "mt-4";
}

export function fileDropzoneIconWrapClassName(
  density: FileDragAndDropDensity = "default",
): string {
  return density === "compact" ? "rounded-full p-1.5" : "rounded-full p-2";
}

export function fileDropzoneIconClassName(
  density: FileDragAndDropDensity = "default",
): string {
  return density === "compact" ? "h-5 w-5" : "h-6 w-6";
}
```

- [ ] **Step 4: Wire helpers into `FileDragAndDrop`**

In `file-drag-and-drop.tsx`:

1. Import the helpers + `FileDragAndDropDensity`.
2. Add `density?: FileDragAndDropDensity` to props; default `density = "default"`.
3. Replace hard-coded dropzone / inner / button / icon classes with the helpers, preserving drag-active color classes on the icon wrap / icon (`bg-primary/10` vs `bg-muted`, `text-primary` vs `text-muted-foreground`) via `cn(...)`.

Example for root:

```tsx
{...getRootProps({
  className: fileDropzoneRootClassName(density),
})}
```

Example for inner + icon:

```tsx
<div className={fileDropzoneInnerClassName(density)}>
  <div
    className={cn(
      fileDropzoneIconWrapClassName(density),
      isDragActive ? "bg-primary/10" : "bg-muted",
    )}
  >
    <UploadCloud
      className={cn(
        fileDropzoneIconClassName(density),
        isDragActive ? "text-primary" : "text-muted-foreground",
      )}
    />
  </div>
  {/* copy unchanged */}
</div>
<div className={fileDropzoneButtonWrapClassName(density)}>
  <Button ...>
```

Do not change accept rules, max files, carousel, or selection list behavior.

- [ ] **Step 5: Run density tests to verify they pass**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/components/form/file-drag-and-drop-density.test.ts`

Expected: PASS

- [ ] **Step 6: Commit (only if user asked)**

---

### Task 4: Wire compact spacing on the upload page

**Files:**
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/finances/student-payments/upload/page.tsx`

**Interfaces:**
- Consumes:
  - `uploadPartSectionClassName`, `uploadPartScreenshotStackClassName`, `uploadPartFieldRootClassName` from `@/lib/finances/upload-form-layout`
  - `UploadFieldError` from `@/components/finances/upload-field-error`
  - `FileDragAndDrop` `density="compact"`
- Produces: denser part UI only (no billing/month edits)

- [ ] **Step 1: Update imports**

Add:

```ts
import { UploadFieldError } from "@/components/finances/upload-field-error";
```

Extend layout import to include:

```ts
uploadPartFieldRootClassName,
uploadPartScreenshotStackClassName,
uploadPartSectionClassName,
```

- [ ] **Step 2: Tighten screenshot stack + compact dropzone + screenshot error**

Replace the screenshot block wrapper `className="w-full space-y-3"` with `className={uploadPartScreenshotStackClassName()}`.

On `FileDragAndDrop`, add `density="compact"`.

Replace screenshot error:

```tsx
<div className="min-h-5 w-full self-stretch">
  {partErrors.screenshot ? (
    <p className="text-sm text-danger" role="alert">
      {partErrors.screenshot}
    </p>
  ) : null}
</div>
```

with:

```tsx
<UploadFieldError message={partErrors.screenshot} />
```

- [ ] **Step 3: Apply denser Field roots + collapsing errors for validated fields**

For Payment method, Transaction ID, and Amount:

1. Change `Field.Root` `className="w-full"` → `className={uploadPartFieldRootClassName()}`.
2. Replace each `min-h-5` error wrapper with `<UploadFieldError message={partErrors.<field>} />`.

Example (payment method):

```tsx
<Field.Root
  className={uploadPartFieldRootClassName()}
  name={uploadPartFieldDataName(part.key, "paymentMethodId")}
  invalid={Boolean(partErrors.paymentMethodId)}
  data-field-name={uploadPartFieldDataName(part.key, "paymentMethodId")}
>
  <Field.Label>Payment method</Field.Label>
  <EntityCombobox /* unchanged props */ />
  <UploadFieldError message={partErrors.paymentMethodId} />
</Field.Root>
```

Same pattern for `transactionId` and `parsedAmount`.

- [ ] **Step 4: Drop empty spacers on optional fields**

For Date on screenshot, Description, and Remarks:

1. Use `className={uploadPartFieldRootClassName()}` on `Field.Root`.
2. **Remove** the empty `<div className="min-h-5" />` entirely (no `UploadFieldError` unless/until those fields gain errors).

Do **not** change billing period, payment plan radios, month chips, discount picker, form-level error, or sticky actions.

- [ ] **Step 5: Sanity-check related unit tests still pass**

Run:

```bash
cd schedjuice-reimagined-fe && npm run test:unit -- \
  src/lib/finances/upload-form-layout.test.ts \
  src/components/finances/upload-field-error.test.tsx \
  src/components/form/file-drag-and-drop-density.test.ts \
  src/lib/finances/upload-part-validation.test.ts
```

Expected: all PASS (validation suite unchanged).

- [ ] **Step 6: Manual QA checklist**

1. Clean form: shorter; no empty gaps under fields.
2. Submit invalid: error expands smoothly; scroll-to-field still works.
3. Fix field: error collapses.
4. OS reduced-motion: no animation.
5. Multipart: same density per part.
6. Another route using `FileDragAndDrop` without `density`: dropzone size unchanged.

- [ ] **Step 7: Commit (only if user asked)**

---

## Spec coverage (self-review)

| Spec requirement | Task |
|---|---|
| Part `gap-4` → denser | Task 1 + 4 |
| Screenshot `space-y-3` → `space-y-2` | Task 1 + 4 |
| Optional Field `gap-1.5` on page | Task 1 + 4 |
| Compact dropzone opt-in | Task 3 + 4 |
| Default dropzone unchanged | Task 3 (default classes) + Task 4 manual QA #6 |
| Collapsing errors + animation + reduced-motion | Task 2 + 4 |
| Drop empty spacers on Date/Description/Remarks | Task 4 |
| Billing/months out of scope | Task 4 explicitly skips |
| Layout helper unit tests | Task 1 |
| Field error unit tests | Task 2 |
| Dropzone density unit tests | Task 3 |
| No upload-page happy-path smoke | All tasks |

No placeholders left. Interfaces are consistent across tasks (`UploadFieldError`, density helpers, layout helpers).
