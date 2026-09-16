# Course Feed Composer Defaults Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Default the course feed composer to daily lesson and add a visible "Finished unit" caption above the unit number field.

**Architecture:** Two small, isolated frontend changes — flip the `post_type` default string in the composer form/reset logic, and add a linked `<label>` caption in the daily lesson header component. No backend, API, or feed card changes.

**Tech Stack:** React, react-hook-form, Tailwind CSS, existing course feed components in `schedjuice-reimagined-fe`.

**Spec:** [2026-07-06-course-feed-composer-defaults-design.md](../specs/2026-07-06-course-feed-composer-defaults-design.md)

---

## File Map

| File | Responsibility |
| --- | --- |
| `schedjuice-reimagined-fe/src/components/course/feed/course-feed-composer.tsx` | Form defaults and reset logic for post type |
| `schedjuice-reimagined-fe/src/components/course/feed/daily-lesson-unit-header.tsx` | Visible unit field label + inline header input |

---

### Task 1: Default post type to daily lesson

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/course/feed/course-feed-composer.tsx`

- [ ] **Step 1: Update form defaultValues**

Change line ~161 from:
```tsx
post_type: initialPost?.post_type ?? "announcement",
```
to:
```tsx
post_type: initialPost?.post_type ?? "daily_lesson",
```

- [ ] **Step 2: Update resetComposer**

Change line ~216 from:
```tsx
post_type: "announcement",
```
to:
```tsx
post_type: "daily_lesson",
```

- [ ] **Step 3: Verify manually**

Run the frontend dev server and open a course Overview page. Expand the composer and confirm:
- Footer type chip shows "Daily lesson"
- Unit header (with or without caption from Task 2) is shown instead of title field
- Body placeholder reads "What did the class cover?"

- [ ] **Step 4: Commit**

```bash
git add schedjuice-reimagined-fe/src/components/course/feed/course-feed-composer.tsx
git commit -m "feat: default course feed composer to daily lesson"
```

---

### Task 2: Add visible unit field label

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/course/feed/daily-lesson-unit-header.tsx`

- [ ] **Step 1: Add useId import and caption label**

Replace the component body with:

```tsx
"use client";

import { useEffect, useId, useRef } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";

import { cn } from "@/lib/utils";

export function DailyLessonUnitHeader({
  registration,
  error,
  autoFocus,
  onEnter,
}: {
  registration: UseFormRegisterReturn;
  error?: string;
  autoFocus?: boolean;
  onEnter?: () => void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { ref: registerRef, ...registerRest } = registration;

  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
    }
  }, [autoFocus]);

  return (
    <div>
      <label
        htmlFor={inputId}
        className="mb-1 block text-xs text-muted-foreground"
      >
        Finished unit
      </label>
      <div className="flex flex-wrap items-baseline gap-x-2 text-lg font-medium text-foreground">
        <span>Unit</span>
        <input
          {...registerRest}
          id={inputId}
          ref={(el) => {
            inputRef.current = el;
            registerRef(el);
          }}
          type="number"
          min={1}
          inputMode="numeric"
          aria-label="Finished unit number"
          className={cn(
            "w-[3ch] bg-transparent border-0 outline-none focus:ring-0 p-0",
            "text-lg font-medium text-center tabular-nums",
            error && "underline decoration-destructive decoration-2",
          )}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Tab") {
              if (e.key === "Enter") e.preventDefault();
              onEnter?.();
            }
          }}
        />
        <span>complete</span>
      </div>
      {error ? (
        <p className="text-sm text-destructive mt-0.5">{error}</p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Verify manually**

With composer expanded in daily lesson mode, confirm:
- `"Finished unit"` caption appears above `Unit [ ] complete`
- Clicking the caption focuses the number input
- Tab/Enter still moves focus to the body editor
- Submitting without a unit shows validation error below the header

- [ ] **Step 3: Commit**

```bash
git add schedjuice-reimagined-fe/src/components/course/feed/daily-lesson-unit-header.tsx
git commit -m "feat: add visible finished unit label to daily lesson composer"
```

---

### Task 3: Final smoke check

- [ ] **Step 1: Run linter on changed files**

```bash
cd schedjuice-reimagined-fe && npm run lint -- --file src/components/course/feed/course-feed-composer.tsx --file src/components/course/feed/daily-lesson-unit-header.tsx
```

Expected: no new errors.

- [ ] **Step 2: Full manual checklist**

1. Create mode expand → Daily lesson default, caption visible, unit focused
2. Switch to Announcement → title field, no unit caption
3. Switch back to Daily lesson → unit header with caption returns
4. Post daily lesson → resets to Daily lesson
5. Cancel → resets to Daily lesson
6. Edit existing announcement → stays Announcement
