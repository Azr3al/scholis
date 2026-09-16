# Handwritten bilingual empty states — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

> **Repo commit policy:** Follows `no-git-commits` — do NOT run commit steps until the user authorizes. Treat each "Stage" step as `git add` only and pause. No feature branches; work on `dev`.

**Goal:** Ship `HandHighlight`, `EmptyCopy`, and `EmptyState` primitives, document them in the design showcase, and migrate Phase 2 empty surfaces to inline bilingual handwriting copy with dual rough underlines and sans recovery actions.

**Architecture:** Slot-based `EmptyCopy` composes two `HandHighlight` wrappers (each stacks text + cached `<RoughUnderline />`). `EmptyState` is a layout shell only (no border card). Domain wrappers (`UserHubEmptyState`, etc.) compose primitives and pass copy slots — dynamic search/filter strings use the same slots with interpolated `enBefore`/`myBefore`. Pure `plainTextFromSlots` helper is unit-tested; rough.js rendering is verified visually.

**Tech Stack:** Next.js App Router, React 19, rough.js (`RoughUnderline`), Tailwind v4 (`font-hand`, `text-hand`, `text-brand`), Vitest (node env, `*.test.ts` only), primitives `Button` from `@/components/primitives/button`.

**Spec:** `docs/superpowers/specs/2026-06-22-handwritten-empty-states-design.md`

---

## File Structure

**Create:**

| File | Responsibility |
| --- | --- |
| `src/components/primitives/empty/empty-copy-slots.ts` | Shared slot type + `plainTextFromSlots` (testable) |
| `src/components/primitives/empty/empty-copy-slots.test.ts` | Unit tests for slot assembly |
| `src/components/primitives/empty/hand-highlight.tsx` | Client — one emphasized fragment + underline |
| `src/components/primitives/empty/empty-copy.tsx` | Client — bilingual line from slots |
| `src/components/primitives/empty/empty-state.tsx` | Layout shell (`py-10`, optional action) |
| `src/components/primitives/empty/empty-copy-presets.ts` | Static reviewed EN/MY slot presets |
| `src/components/primitives/empty/index.ts` | Barrel exports |
| `src/app/(design)/components/empty-states/page.tsx` | Design showcase (true + filtered examples) |

**Modify:**

| File | Change |
| --- | --- |
| `src/app/(design)/components/layout.tsx` | Nav link to Empty states showcase |
| `src/app/(design)/components/type/handwriting/page.tsx` | Bilingual empty demo + underline |
| `src/components/user-hub/empty-state.tsx` | Compose primitives; primitives `Button` |
| `src/components/academic-hub/empty-state.tsx` | Compose primitives; primitives `Button` + `Link` |
| `src/components/record/academic/record-course-list.tsx` | Replace inline empty block |
| `src/components/home/dashboard-card.tsx` | `CardEmpty` uses `EmptyCopy` |
| `src/app/(internal)/notifications/page.tsx` | Filtered + true empty copy |
| `src/app/(internal)/search/page.tsx` | No courses empty |
| `src/components/finances/student-payments-drawer.tsx` | No payments empty |
| `src/components/users/course-history/course-history.tsx` | No history empty |
| `DESIGN.md` | Optional §6 cross-reference (Task 12) |

---

## Task 1: Slot types + plain-text helper (TDD)

**Files:**

- Create: `src/components/primitives/empty/empty-copy-slots.ts`
- Create: `src/components/primitives/empty/empty-copy-slots.test.ts`

- [ ] **Step 1: Write failing tests**

`src/components/primitives/empty/empty-copy-slots.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { plainTextFromSlots, type EmptyCopySlots } from "./empty-copy-slots";

describe("plainTextFromSlots", () => {
  it("joins slots with middle-dot separator", () => {
    const slots: EmptyCopySlots = {
      enBefore: "Nothing ",
      enHighlight: "here",
      enAfter: " yet",
      myBefore: "ဘာမှ ",
      myHighlight: "မရှိ",
      myAfter: " သေးပါ",
    };
    expect(plainTextFromSlots(slots)).toBe(
      "Nothing here yet · ဘာမှ မရှိ သေးပါ",
    );
  });

  it("omits empty optional slots", () => {
    const slots: EmptyCopySlots = {
      enHighlight: "users",
      enAfter: " found",
      myHighlight: "မရှိ",
      myAfter: "ပါ",
    };
    expect(plainTextFromSlots(slots)).toBe("users found · မရှိပါ");
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm run test:unit -- src/components/primitives/empty/empty-copy-slots.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement helper**

`src/components/primitives/empty/empty-copy-slots.ts`:

```ts
export type EmptyCopySlots = {
  enBefore?: string;
  enHighlight: string;
  enAfter?: string;
  myBefore?: string;
  myHighlight: string;
  myAfter?: string;
};

export function plainTextFromSlots(slots: EmptyCopySlots): string {
  const enBefore = slots.enBefore ?? "";
  const enAfter = slots.enAfter ?? "";
  const myBefore = slots.myBefore ?? "";
  const myAfter = slots.myAfter ?? "";
  return `${enBefore}${slots.enHighlight}${enAfter} · ${myBefore}${slots.myHighlight}${myAfter}`;
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm run test:unit -- src/components/primitives/empty/empty-copy-slots.test.ts`
Expected: 2 passed

- [ ] **Step 5: Stage**

```bash
git add src/components/primitives/empty/empty-copy-slots.ts src/components/primitives/empty/empty-copy-slots.test.ts
```

---

## Task 2: `HandHighlight`

**Files:**

- Create: `src/components/primitives/empty/hand-highlight.tsx`

- [ ] **Step 1: Implement client component**

`src/components/primitives/empty/hand-highlight.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";
import { RoughUnderline } from "@/components/primitives/decoration/rough-underline";
import { cn } from "@/lib/utils";

export function HandHighlight({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("inline-block align-bottom text-left", className)}>
      <span>{children}</span>
      <RoughUnderline className="text-brand" />
    </span>
  );
}
```

- [ ] **Step 2: Verify lint**

Run: `npm run lint -- --max-warnings=0 src/components/primitives/empty/hand-highlight.tsx`
Expected: no errors

- [ ] **Step 3: Stage**

```bash
git add src/components/primitives/empty/hand-highlight.tsx
```

---

## Task 3: `EmptyCopy`

**Files:**

- Create: `src/components/primitives/empty/empty-copy.tsx`

- [ ] **Step 1: Implement**

`src/components/primitives/empty/empty-copy.tsx`:

```tsx
"use client";

import { HandHighlight } from "./hand-highlight";
import { type EmptyCopySlots } from "./empty-copy-slots";
import { cn } from "@/lib/utils";

export type EmptyCopyProps = EmptyCopySlots & {
  className?: string;
};

export function EmptyCopy({
  enBefore,
  enHighlight,
  enAfter,
  myBefore,
  myHighlight,
  myAfter,
  className,
}: EmptyCopyProps) {
  return (
    <p className={cn("font-hand text-hand text-brand", className)}>
      {enBefore}
      <HandHighlight>{enHighlight}</HandHighlight>
      {enAfter}
      {" · "}
      {myBefore}
      <HandHighlight>{myHighlight}</HandHighlight>
      {myAfter}
    </p>
  );
}
```

- [ ] **Step 2: Verify lint**

Run: `npm run lint -- --max-warnings=0 src/components/primitives/empty/empty-copy.tsx`
Expected: no errors

- [ ] **Step 3: Stage**

```bash
git add src/components/primitives/empty/empty-copy.tsx
```

---

## Task 4: `EmptyState` + barrel + presets

**Files:**

- Create: `src/components/primitives/empty/empty-state.tsx`
- Create: `src/components/primitives/empty/empty-copy-presets.ts`
- Create: `src/components/primitives/empty/index.ts`

- [ ] **Step 1: `EmptyState` shell**

`src/components/primitives/empty/empty-state.tsx`:

```tsx
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type EmptyStateProps = {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ children, action, className }: EmptyStateProps) {
  return (
    <div className={cn("py-10 text-center space-y-3", className)}>
      {children}
      {action}
    </div>
  );
}
```

- [ ] **Step 2: Static presets**

`src/components/primitives/empty/empty-copy-presets.ts`:

```ts
import type { EmptyCopySlots } from "./empty-copy-slots";

export const EMPTY_COPY_PRESETS = {
  nothingHere: {
    enBefore: "Nothing ",
    enHighlight: "here",
    enAfter: " yet",
    myBefore: "ဘာမှ ",
    myHighlight: "မရှိ",
    myAfter: " သေးပါ",
  } satisfies EmptyCopySlots,

  notEnrolled: {
    enBefore: "Not enrolled ",
    enHighlight: "yet",
    enAfter: "",
    myBefore: "စာရင်းမသွင်းရ",
    myHighlight: "သေး",
    myAfter: "",
  } satisfies EmptyCopySlots,

  noUsers: {
    enBefore: "No ",
    enHighlight: "users",
    enAfter: " found",
    myBefore: "အသုံးပြုသူ ",
    myHighlight: "မရှိ",
    myAfter: "ပါ",
  } satisfies EmptyCopySlots,

  noMatchBase: {
    enBefore: "No ",
    enHighlight: "match",
    enAfter: "",
    myBefore: "",
    myHighlight: "မတွေ့",
    myAfter: "ပါ",
  } satisfies EmptyCopySlots,

  noPayments: {
    enBefore: "No ",
    enHighlight: "payments",
    enAfter: " for this student",
    myBefore: "ငွေပေးချေမှု ",
    myHighlight: "မရှိ",
    myAfter: "ပါ",
  } satisfies EmptyCopySlots,

  noHistory: {
    enBefore: "No course ",
    enHighlight: "history",
    enAfter: " found",
    myBefore: "သင်တန်းမှတ်တမ်း ",
    myHighlight: "မရှိ",
    myAfter: "ပါ",
  } satisfies EmptyCopySlots,

  nothingNew: {
    enBefore: "Nothing ",
    enHighlight: "new",
    enAfter: " right now",
    myBefore: "",
    myHighlight: "အသစ်",
    myAfter: "ဘာမှမရှိ",
  } satisfies EmptyCopySlots,

  noCoursesFound: {
    enBefore: "No ",
    enHighlight: "courses",
    enAfter: " found",
    myBefore: "အတန်း ",
    myHighlight: "မတွေ့",
    myAfter: "ပါ",
  } satisfies EmptyCopySlots,
} as const;
```

- [ ] **Step 3: Barrel**

`src/components/primitives/empty/index.ts`:

```ts
export { HandHighlight } from "./hand-highlight";
export { EmptyCopy, type EmptyCopyProps } from "./empty-copy";
export { EmptyState, type EmptyStateProps } from "./empty-state";
export { plainTextFromSlots, type EmptyCopySlots } from "./empty-copy-slots";
export { EMPTY_COPY_PRESETS } from "./empty-copy-presets";
```

- [ ] **Step 4: Stage**

```bash
git add src/components/primitives/empty/empty-state.tsx src/components/primitives/empty/empty-copy-presets.ts src/components/primitives/empty/index.ts
```

---

## Task 5: Design showcase page

**Files:**

- Create: `src/app/(design)/components/empty-states/page.tsx`
- Modify: `src/app/(design)/components/layout.tsx`

- [ ] **Step 1: Showcase page**

`src/app/(design)/components/empty-states/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/primitives/button";
import { EmptyCopy, EmptyState } from "@/components/primitives/empty";
import { EMPTY_COPY_PRESETS } from "@/components/primitives/empty/empty-copy-presets";

export const metadata: Metadata = {
  title: "Empty states — Schedjuice",
};

export default function EmptyStatesPage() {
  return (
    <div className="space-y-10">
      <div>
        <Link
          href="/components"
          className="text-sm text-text-secondary underline-offset-4 hover:text-accent hover:underline"
        >
          ← Components
        </Link>
        <h2 className="mt-3 font-serif text-3xl">Empty states</h2>
        <p className="mt-2 max-w-2xl text-text-secondary">
          Bilingual handwriting copy with dual rough underlines. Filtered states always include a
          sans recovery action.
        </p>
      </div>

      <section className="space-y-4">
        <h3 className="font-serif text-xl">True empty</h3>
        <div className="rounded-lg border border-border bg-surface-elevated">
          <EmptyState>
            <EmptyCopy {...EMPTY_COPY_PRESETS.notEnrolled} />
          </EmptyState>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="font-serif text-xl">Filtered empty (search)</h3>
        <div className="rounded-lg border border-border bg-surface-elevated">
          <EmptyState
            action={
              <Button variant="secondary" size="sm" type="button">
                Clear search
              </Button>
            }
          >
            <EmptyCopy
              enBefore="No "
              enHighlight="match"
              enAfter={` for "သီရိ"`}
              myBefore={`"သီရိ" အတွက် `}
              myHighlight="မတွေ့"
              myAfter="ပါ"
            />
          </EmptyState>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="font-serif text-xl">Long query (underline reflow)</h3>
        <div className="max-w-xs rounded-lg border border-border bg-surface-elevated">
          <EmptyState
            action={
              <button
                type="button"
                className="text-sm text-accent hover:underline"
              >
                Clear search
              </button>
            }
          >
            <EmptyCopy
              enBefore="No "
              enHighlight="match"
              enAfter={` for "Advanced English Composition Level 4"`}
              myBefore={`"Advanced English Composition Level 4" အတွက် `}
              myHighlight="မတွေ့"
              myAfter="ပါ"
            />
          </EmptyState>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Add nav link**

In `src/app/(design)/components/layout.tsx`, add to `SECTIONS`:

```ts
{ href: "/components/empty-states", label: "Empty states" },
```

- [ ] **Step 3: Manual check**

Run: `npm run dev` → open `/components/empty-states`
Verify: two underlines per line, Burmese in Sai K2, Latin in Architects Daughter, resize narrow column reflows underlines.

- [ ] **Step 4: Stage**

```bash
git add src/app/(design)/components/empty-states/page.tsx src/app/(design)/components/layout.tsx
```

---

## Task 6: Update handwriting type page demo

**Files:**

- Modify: `src/app/(design)/components/type/handwriting/page.tsx`

- [ ] **Step 1: Replace English-only empty demo**

Replace the empty-state demo block (lines ~86–89) with:

```tsx
        <div className="rounded-lg border border-border bg-surface-elevated p-5">
          <p className="text-xs text-text-muted">Empty state</p>
          <EmptyState className="py-6">
            <EmptyCopy {...EMPTY_COPY_PRESETS.nothingHere} />
          </EmptyState>
        </div>
```

Add imports at top:

```tsx
import { EmptyCopy, EmptyState } from "@/components/primitives/empty";
import { EMPTY_COPY_PRESETS } from "@/components/primitives/empty/empty-copy-presets";
```

- [ ] **Step 2: Stage**

```bash
git add src/app/(design)/components/type/handwriting/page.tsx
```

---

## Task 7: Migrate `UserHubEmptyState`

**Files:**

- Modify: `src/components/user-hub/empty-state.tsx`

- [ ] **Step 1: Rewrite component**

```tsx
"use client";

import { Button } from "@/components/primitives/button";
import { EmptyCopy, EmptyState } from "@/components/primitives/empty";
import { EMPTY_COPY_PRESETS } from "@/components/primitives/empty/empty-copy-presets";

type EmptyVariant =
  | { kind: "no-search-results"; q: string }
  | { kind: "no-users" };

interface Props {
  variant: EmptyVariant;
  onClearSearch?: () => void;
}

export function UserHubEmptyState({ variant, onClearSearch }: Props) {
  if (variant.kind === "no-search-results") {
    return (
      <EmptyState
        action={
          onClearSearch ? (
            <Button variant="secondary" size="sm" onClick={onClearSearch}>
              Clear search
            </Button>
          ) : undefined
        }
      >
        <EmptyCopy
          enBefore="No "
          enHighlight="match"
          enAfter={` for "${variant.q}"`}
          myBefore={`"${variant.q}" အတွက် `}
          myHighlight="မတွေ့"
          myAfter="ပါ"
        />
      </EmptyState>
    );
  }

  return (
    <EmptyState>
      <EmptyCopy {...EMPTY_COPY_PRESETS.noUsers} />
    </EmptyState>
  );
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint -- --max-warnings=0 src/components/user-hub/empty-state.tsx`

- [ ] **Step 3: Stage**

```bash
git add src/components/user-hub/empty-state.tsx
```

---

## Task 8: Migrate `AcademicHubEmptyState`

**Files:**

- Modify: `src/components/academic-hub/empty-state.tsx`

- [ ] **Step 1: Rewrite all three variants**

Replace file body (keep types). Use primitives `Button` + `buttonVariants` from `@/components/primitives/button` if `buttonVariants` exists there — check primitives button exports.

```tsx
"use client";

import Link from "next/link";
import { Button, buttonVariants } from "@/components/primitives/button";
import { EmptyCopy, EmptyState } from "@/components/primitives/empty";
import {
  HubStatusFilter,
  HubStatusAggregate,
} from "@/types/academic-hub";
import { cn } from "@/lib/utils";

// ... keep EmptyVariant type and STATUS_LABEL ...

export function AcademicHubEmptyState({
  variant,
  onBroadenStatus,
  onClearSearch,
}: Props) {
  if (variant.kind === "no-results-status") {
    const programLabel = variant.programName ?? "this program";
    const others = (
      [
        { status: "planned" as const, count: variant.counts.planned },
        { status: "ended" as const, count: variant.counts.ended },
      ] as const
    ).filter((c) => c.count > 0);

    return (
      <EmptyState
        action={
          others.length > 0 ? (
            <div className="flex flex-wrap justify-center gap-2">
              {others.map((c) => (
                <Button
                  key={c.status}
                  variant="secondary"
                  size="sm"
                  onClick={() => onBroadenStatus?.(c.status)}
                >
                  Show {STATUS_LABEL[c.status]} ({c.count})
                </Button>
              ))}
            </div>
          ) : undefined
        }
      >
        <EmptyCopy
          enBefore="No matching courses in "
          enHighlight={programLabel}
          enAfter=""
          myBefore={`${programLabel} အတွက် အတန်း`}
          myHighlight="မတွေ့"
          myAfter="ပါ"
        />
      </EmptyState>
    );
  }

  if (variant.kind === "no-search-results") {
    return (
      <EmptyState
        action={
          <Button variant="secondary" size="sm" onClick={onClearSearch}>
            Clear search
          </Button>
        }
      >
        <EmptyCopy
          enBefore="Nothing "
          enHighlight="matches"
          enAfter={` "${variant.q}"`}
          myBefore={`"${variant.q}" အတွက် `}
          myHighlight="မတွေ့"
          myAfter="ပါ"
        />
      </EmptyState>
    );
  }

  const programLabel = variant.programName ?? "This program";

  return (
    <EmptyState
      action={
        <Link
          href="/courses/create"
          className={cn(buttonVariants({ variant: "primary", size: "sm" }))}
        >
          + Add classes
        </Link>
      }
    >
      <EmptyCopy
        enBefore={`${programLabel} has no courses `}
        enHighlight="yet"
        enAfter=""
        myBefore="အတန်းများ "
        myHighlight="မရှိ"
        myAfter=" သေး"
      />
    </EmptyState>
  );
}
```

- [ ] **Step 2: Verify `buttonVariants` export**

Run: `grep -n "export.*buttonVariants" src/components/primitives/button.tsx`
If not exported from primitives, keep `Link` styled with `Button asChild` instead of `buttonVariants`.

- [ ] **Step 3: Lint + stage**

```bash
npm run lint -- --max-warnings=0 src/components/academic-hub/empty-state.tsx
git add src/components/academic-hub/empty-state.tsx
```

---

## Task 9: Migrate `record-course-list` empties

**Files:**

- Modify: `src/components/record/academic/record-course-list.tsx` (~lines 236–262)

- [ ] **Step 1: Import primitives**

```tsx
import { EmptyCopy, EmptyState } from "@/components/primitives/empty";
import { EMPTY_COPY_PRESETS } from "@/components/primitives/empty/empty-copy-presets";
```

- [ ] **Step 2: Replace empty block**

```tsx
      {rowData.length === 0 ? (
        subjectCourses.length === 0 ? (
          <EmptyState>
            <EmptyCopy {...EMPTY_COPY_PRESETS.notEnrolled} />
          </EmptyState>
        ) : scope === "your" && hasShared ? (
          <EmptyState
            action={
              <button
                type="button"
                onClick={() => setScopeOverride("all")}
                className="text-sm text-accent hover:underline"
              >
                Show all courses
              </button>
            }
          >
            <EmptyCopy
              enBefore="Not in "
              enHighlight="your"
              enAfter=" classes"
              myBefore="သင်၏ အတန်းများ"
              myHighlight="မပါ"
              myAfter=""
            />
          </EmptyState>
        ) : statusFilter === "active" ? (
          <EmptyState
            action={
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className="text-sm text-accent hover:underline"
              >
                Show all courses
              </button>
            }
          >
            <EmptyCopy
              enBefore="No "
              enHighlight="active"
              enAfter=" classes"
              myBefore=""
              myHighlight="တက်ရောက်နေ"
              myAfter="သော အတန်းမရှိ"
            />
          </EmptyState>
        ) : (
          <EmptyState>
            <EmptyCopy
              enBefore="No "
              enHighlight="courses"
              enAfter=" to show"
              myBefore="ပြရန် အတန်း "
              myHighlight="မရှိ"
              myAfter="ပါ"
            />
          </EmptyState>
        )
      ) : (
```

- [ ] **Step 3: Lint + stage**

```bash
npm run lint -- --max-warnings=0 src/components/record/academic/record-course-list.tsx
git add src/components/record/academic/record-course-list.tsx
```

---

## Task 10: Migrate remaining Phase 2 surfaces

**Files:**

- Modify: `src/components/home/dashboard-card.tsx`
- Modify: `src/app/(internal)/notifications/page.tsx`
- Modify: `src/app/(internal)/search/page.tsx`
- Modify: `src/components/finances/student-payments-drawer.tsx`
- Modify: `src/components/users/course-history/course-history.tsx`

- [ ] **Step 1: `dashboard-card.tsx` — `CardEmpty`**

```tsx
import { EmptyCopy } from "@/components/primitives/empty";
import { EMPTY_COPY_PRESETS } from "@/components/primitives/empty/empty-copy-presets";

function CardEmpty() {
  return (
    <EmptyCopy {...EMPTY_COPY_PRESETS.nothingHere} className="text-hand !text-[1.125rem]" />
  );
}
```

(`className` tweak keeps smaller scale inside dashboard card — optional; drop if `text-hand` reads too large.)

- [ ] **Step 2: `notifications/page.tsx`**

Replace empty block (~lines 130–137):

```tsx
        {filteredItems.length === 0 ? (
          <EmptyState>
            {severityFilter === "all" ? (
              <EmptyCopy {...EMPTY_COPY_PRESETS.nothingNew} />
            ) : (
              <EmptyCopy
                enBefore="No "
                enHighlight={severityFilter}
                enAfter=" notifications"
                myBefore={`${severityFilter} အကြောင်းကြား`}
                myHighlight="မရှိ"
                myAfter="ပါ"
              />
            )}
          </EmptyState>
        ) : (
```

Add imports for `EmptyCopy`, `EmptyState`, `EMPTY_COPY_PRESETS`.

- [ ] **Step 3: `search/page.tsx`**

Replace `No courses found` paragraph:

```tsx
        <EmptyState>
          <EmptyCopy {...EMPTY_COPY_PRESETS.noCoursesFound} />
        </EmptyState>
```

- [ ] **Step 4: `student-payments-drawer.tsx`**

Replace empty payments paragraph:

```tsx
            <EmptyState>
              <EmptyCopy {...EMPTY_COPY_PRESETS.noPayments} />
            </EmptyState>
```

- [ ] **Step 5: `course-history.tsx`**

Replace empty history paragraph:

```tsx
        {!isLoading && data?.data?.data?.length === 0 && (
          <EmptyState>
            <EmptyCopy {...EMPTY_COPY_PRESETS.noHistory} />
          </EmptyState>
        )}
```

- [ ] **Step 6: Lint touched files**

Run:

```bash
npm run lint -- --max-warnings=0 \
  src/components/home/dashboard-card.tsx \
  src/app/(internal)/notifications/page.tsx \
  src/app/(internal)/search/page.tsx \
  src/components/finances/student-payments-drawer.tsx \
  src/components/users/course-history/course-history.tsx
```

- [ ] **Step 7: Stage**

```bash
git add src/components/home/dashboard-card.tsx \
  src/app/(internal)/notifications/page.tsx \
  src/app/(internal)/search/page.tsx \
  src/components/finances/student-payments-drawer.tsx \
  src/components/users/course-history/course-history.tsx
```

---

## Task 11: Optional `DESIGN.md` cross-reference

**Files:**

- Modify: `DESIGN.md` (§6.3 or §4)

- [ ] **Step 1: Add bullet under handwriting accent (§6.3)**

After the "3–5 designated moments" sentence, add:

```markdown
- **Empty states** use `<EmptyCopy />` — inline EN · MY with dual `<HandHighlight />` underlines; filtered empties always pair with a sans recovery action (see `src/components/primitives/empty/`).
```

- [ ] **Step 2: Stage**

```bash
git add DESIGN.md
```

---

## Task 12: Verification

- [ ] **Step 1: Unit tests**

Run: `npm run test:unit -- src/components/primitives/empty/`
Expected: all pass

- [ ] **Step 2: Lint primitives package**

Run: `npm run lint -- --max-warnings=0 src/components/primitives/empty/`

- [ ] **Step 3: Manual smoke checklist**

| Route / surface | Check |
| --- | --- |
| `/components/empty-states` | True + filtered + narrow column |
| `/components/type/handwriting` | Empty demo bilingual + underlines |
| `/users` (empty search) | Handwriting + Clear search button |
| User record → Academic → Courses (empty student) | Not enrolled copy |
| `/notifications` (empty) | Nothing new copy |
| `/search` (no results) | No courses copy |

- [ ] **Step 4: Dark mode spot-check**

Toggle theme on `/components/empty-states` — underlines use `text-brand`, still visible on cream/dark surfaces.

---

## Spec coverage self-review

| Spec requirement | Task |
| --- | --- |
| `HandHighlight`, `EmptyCopy`, `EmptyState` | Tasks 2–4 |
| Slot-based + dynamic interpolation | Tasks 3, 7, 8 |
| Dual key-phrase underlines | Task 2 |
| Inline EN · MY | Task 3 |
| Filtered → sans recovery action | Tasks 5, 7, 8, 9 |
| No border card on empty zones | Task 4 (`EmptyState`) |
| Phase 1 showcase | Tasks 5–6 |
| Phase 2 migration list | Tasks 7–10 |
| Unit test (slot assembly) | Task 1 |
| Phase 3 deferred | Not in plan (explicit non-goal) |
| Optional DESIGN.md | Task 11 |
| Accessibility (decorative underline) | `RoughUnderline` already `aria-hidden` |

---

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-06-22-handwritten-empty-states.md`.

**Two execution options:**

1. **Subagent-driven (recommended)** — fresh subagent per task, review between tasks
2. **Inline execution** — implement tasks in this session with checkpoints

Which approach do you want?
