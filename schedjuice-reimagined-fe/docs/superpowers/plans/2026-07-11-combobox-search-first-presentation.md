# Combobox Search-First Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the open popup search band the unmistakable primary affordance in `EntityComboboxList` and `BackendSearchableCombobox`, while still showing full filtered results underneath.

**Architecture:** Extract a small shared `ComboboxSearchHeader` (hero `SearchField` + empty-query hint + chrome band). Both comboboxes swap their inline popup search markup for that header. Closed triggers, fetch/filter logic, and `AsyncContentPanel` height stay unchanged. Default search copy becomes `Search {label}…` / aria `Search {label}`; explicit `placeholder` still wins for the search field.

**Tech Stack:** Next.js App Router, React client components, Vitest + `renderToStaticMarkup`, existing `SearchField` / `Input` / Tailwind semantic tokens.

**Spec:** `docs/superpowers/specs/2026-07-11-combobox-search-first-presentation-design.md`

---

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `src/components/form/combobox-search-header.tsx` | Create | Shared popup search band + hint + placeholder helpers |
| `src/components/form/combobox-search-header.test.tsx` | Create | Static markup tests for placeholder, aria, hint show/hide |
| `src/components/form/entity-combobox-list.tsx` | Modify | Use `ComboboxSearchHeader` in popup |
| `src/components/form/backend-searchable-combobox.tsx` | Modify | Use `ComboboxSearchHeader` in popup; keep trigger empty copy as today |

---

### Task 1: ComboboxSearchHeader (TDD)

**Files:**
- Create: `src/components/form/combobox-search-header.tsx`
- Test: `src/components/form/combobox-search-header.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ComboboxSearchHeader,
  comboboxSearchAriaLabel,
  comboboxSearchPlaceholder,
} from "./combobox-search-header";

describe("comboboxSearchPlaceholder", () => {
  it("defaults to Search {label}…", () => {
    expect(comboboxSearchPlaceholder("Course")).toBe("Search Course…");
  });

  it("prefers explicit placeholder", () => {
    expect(comboboxSearchPlaceholder("Course", "Find a class")).toBe(
      "Find a class",
    );
  });
});

describe("comboboxSearchAriaLabel", () => {
  it("returns Search {label}", () => {
    expect(comboboxSearchAriaLabel("Course")).toBe("Search Course");
  });
});

describe("ComboboxSearchHeader", () => {
  it("renders default placeholder, aria-label, and empty-query hint", () => {
    const html = renderToStaticMarkup(
      createElement(ComboboxSearchHeader, {
        label: "Course",
        value: "",
        onChange: () => {},
      }),
    );
    expect(html).toContain('placeholder="Search Course…"');
    expect(html).toContain('aria-label="Search Course"');
    expect(html).toContain("Type to filter the list");
  });

  it("hides hint when query has non-whitespace text", () => {
    const html = renderToStaticMarkup(
      createElement(ComboboxSearchHeader, {
        label: "Course",
        value: "CAE",
        onChange: () => {},
      }),
    );
    expect(html).not.toContain("Type to filter the list");
  });

  it("keeps hint for whitespace-only query", () => {
    const html = renderToStaticMarkup(
      createElement(ComboboxSearchHeader, {
        label: "Course",
        value: "   ",
        onChange: () => {},
      }),
    );
    expect(html).toContain("Type to filter the list");
  });

  it("uses explicit placeholder when provided", () => {
    const html = renderToStaticMarkup(
      createElement(ComboboxSearchHeader, {
        label: "Course",
        placeholder: "Find a class",
        value: "",
        onChange: () => {},
      }),
    );
    expect(html).toContain('placeholder="Find a class"');
    expect(html).toContain('aria-label="Search Course"');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/components/form/combobox-search-header.test.tsx
```

Expected: FAIL (module or exports not found).

- [ ] **Step 3: Implement `ComboboxSearchHeader`**

Create `src/components/form/combobox-search-header.tsx`:

```tsx
"use client";

import * as React from "react";

import { SearchField } from "@/components/form/search-field";
import { cn } from "@/lib/utils";

export function comboboxSearchPlaceholder(
  label: string,
  placeholder?: string,
): string {
  return placeholder ?? `Search ${label}…`;
}

export function comboboxSearchAriaLabel(label: string): string {
  return `Search ${label}`;
}

export type ComboboxSearchHeaderProps = {
  label: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  isFetching?: boolean;
  autoFocus?: boolean;
  className?: string;
};

export function ComboboxSearchHeader({
  label,
  value,
  onChange,
  placeholder,
  isFetching = false,
  autoFocus = true,
  className,
}: ComboboxSearchHeaderProps) {
  const resolvedPlaceholder = comboboxSearchPlaceholder(label, placeholder);
  const showHint = value.trim().length === 0;

  return (
    <div className={cn("border-b border-border/60 p-3", className)}>
      <SearchField
        value={value}
        onChange={onChange}
        placeholder={resolvedPlaceholder}
        ariaLabel={comboboxSearchAriaLabel(label)}
        isFetching={isFetching}
        autoFocus={autoFocus}
        className="h-11"
      />
      {showHint ? (
        <p
          aria-hidden
          className="mt-1.5 px-0.5 text-xs text-text-muted"
        >
          Type to filter the list
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/components/form/combobox-search-header.test.tsx
```

Expected: PASS (all tests green).

- [ ] **Step 5: Commit**

```bash
git add src/components/form/combobox-search-header.tsx src/components/form/combobox-search-header.test.tsx
git commit -m "$(cat <<'EOF'
feat(form): add ComboboxSearchHeader for search-first popups

EOF
)"
```

---

### Task 2: Wire EntityComboboxList

**Files:**
- Modify: `src/components/form/entity-combobox-list.tsx`

- [ ] **Step 1: Replace the popup search band**

Remove the `SearchField` import if unused. Add:

```tsx
import { ComboboxSearchHeader } from "@/components/form/combobox-search-header";
```

Replace the existing header block:

```tsx
<div className="border-b border-border/60 p-2">
  <SearchField
    value={filter}
    onChange={(event) => setFilter(event.target.value)}
    placeholder={label}
    ariaLabel={`Filter ${label}`}
    isFetching={isLoading && (options?.length ?? 0) === 0}
  />
</div>
```

with:

```tsx
<ComboboxSearchHeader
  label={label}
  placeholder={placeholder}
  value={filter}
  onChange={(event) => setFilter(event.target.value)}
  isFetching={isLoading && (options?.length ?? 0) === 0}
/>
```

Do **not** change the closed trigger `selectedLabel` logic (`placeholder ?? \`Select ${label}\`` stays).

- [ ] **Step 2: Typecheck / smoke unit tests still relevant**

Run:

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/components/form/combobox-search-header.test.tsx
```

Expected: PASS.

Optional if the project has a fast typecheck script already used in-session; otherwise rely on IDE/tsc during PR.

- [ ] **Step 3: Manual check (Entity)**

Open any page with a Course `EntityCombobox` (e.g. student payments filters / submission tracker). Confirm:

1. Closed trigger unchanged.
2. Open popup: taller search, `Search Course…`, hint visible.
3. Typing hides hint and filters the list.
4. Selecting an option closes and updates the trigger.

- [ ] **Step 4: Commit**

```bash
git add src/components/form/entity-combobox-list.tsx
git commit -m "$(cat <<'EOF'
feat(form): use ComboboxSearchHeader in EntityComboboxList

EOF
)"
```

---

### Task 3: Wire BackendSearchableCombobox

**Files:**
- Modify: `src/components/form/backend-searchable-combobox.tsx`

- [ ] **Step 1: Replace the popup search band only**

Keep trigger empty-state copy as today:

```tsx
const resolvedPlaceholder = placeholder ?? label;
```

(used by the closed trigger / search-variant trigger — do not change to `Search {label}…`).

Remove popup `SearchField` usage. Import `ComboboxSearchHeader`. Replace:

```tsx
<div className="border-b border-border/60 p-2">
  <SearchField
    value={searchValue}
    onChange={(event) => {
      setSearchValue(event.target.value);
      setFetchError(null);
    }}
    placeholder={resolvedPlaceholder}
    ariaLabel={resolvedPlaceholder}
    isFetching={isLoading && options.length === 0}
  />
</div>
```

with:

```tsx
<ComboboxSearchHeader
  label={label}
  placeholder={placeholder}
  value={searchValue}
  onChange={(event) => {
    setSearchValue(event.target.value);
    setFetchError(null);
  }}
  isFetching={isLoading && options.length === 0}
/>
```

If `SearchField` is no longer imported elsewhere in the file, remove that import.

- [ ] **Step 2: Run header unit tests again**

Run:

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/components/form/combobox-search-header.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Manual check (Backend)**

Open a surface using `BackendSearchableCombobox` (e.g. shortcuts user-schedule or finances checkin-histories). Confirm:

1. Closed trigger empty text still shows `label` (or explicit `placeholder`), not `Search …`.
2. Open popup matches Entity header chrome (hero search + hint).
3. Typing debounces/fetches as before; hint hides while typing.
4. Selection still closes the popup.

- [ ] **Step 4: Commit**

```bash
git add src/components/form/backend-searchable-combobox.tsx
git commit -m "$(cat <<'EOF'
feat(form): use ComboboxSearchHeader in BackendSearchableCombobox

EOF
)"
```

---

### Task 4: Final verification pass

**Files:** none (verification only)

- [ ] **Step 1: Re-run unit tests**

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/components/form/combobox-search-header.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Spec checklist**

Confirm against the design spec:

| Spec item | Done via |
| --- | --- |
| Hero search row | `ComboboxSearchHeader` `p-3` + `h-11` |
| `Search {label}…` default | `comboboxSearchPlaceholder` |
| Explicit placeholder wins | helpers + tests |
| Empty-query hint | `showHint` + tests |
| Whitespace keeps hint | test |
| Autofocus on open | `autoFocus={true}` default |
| `aria-label` `Search {label}` | `comboboxSearchAriaLabel` |
| Shared by both comboboxes | Tasks 2–3 |
| Closed trigger unchanged | Tasks 2–3 notes |
| No list height / fetch changes | untouched |

- [ ] **Step 3: No extra commit unless fixes were needed**

If a fix was required during verification, commit it with a clear message (e.g. `fix(form): …`). Otherwise stop here.

---

## Self-review (plan vs spec)

1. **Spec coverage:** Open-state presentation, shared header, both consumers, copy/a11y, edge cases, verification — all mapped to Tasks 1–4. Non-goals (trigger morph, Command pickers, height change) intentionally omitted.
2. **Placeholders:** None; full component/test code and exact replace blocks included.
3. **Type consistency:** `ComboboxSearchHeaderProps` / helper names match across tasks; Entity passes `placeholder` prop through; Backend keeps separate trigger `resolvedPlaceholder` vs search header `placeholder`.
