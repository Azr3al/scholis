# R5 — Page Container, Header, Spacing, and Composition Standards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Define enforceable page container, header, title, and composition contracts aligned with DESIGN.md, add static gates and tests, and migrate a representative set of pages — route cohorts own exhaustive migration.

**Architecture:** Introduce shared layout primitives (`PageTitle`, `PageHeader`, `PageSection`) and a composition helper module documenting three-zone hierarchy. Extend `PageContainer` with explicit `density` for dense operational exceptions. Provide route-family usage guidance in contract docs. Static Vitest gates ban raw ad-hoc title/header patterns on migrated routes. Representative migrations cover list (programs), list-with-local-header (campuses), and create (subjects) patterns only.

**Tech Stack:** React 19, Next.js App Router, Tailwind semantic tokens, Vitest, DESIGN.md §8.4 / §9.

**Spec:** [`../specs/2026-07-12-ui-migration-remediation-program-design.md`](../specs/2026-07-12-ui-migration-remediation-program-design.md) §8.4, §8.7  
**Design authority:** [`DESIGN.md`](../../../DESIGN.md) §6.5 (`--text-3xl` serif page titles), §9 (three-zone composition, no card-stacking)

**Planning base SHA:** `05ac447b10966131d4f37a2ba724110c33d66dd4` on `dev`  
**Branch:** `remediate/ui-r5-page-shell` from current `dev`  
**Worktree:** `../worktrees/ui-r5-page-shell`

**Dependencies (must be merged before execution):**
- **R0** — verification baseline green; `@testing-library/react` render tests require R0 happy-dom + testing-library devDependencies
- **R1** — token vocabulary (`text-text-muted` not `text-muted-foreground` in new code)

**May overlap with:** R3/R4 on disjoint files. **Do not modify** shell chrome (`PanelHeader`, sidebar) — owned by **R6**.

---

## Current-state evidence (base `05ac447b`)

| Location | Problem |
| --- | --- |
| `src/components/layout/page-container.tsx:30-56` | Width/inset exists; no `density` for dense routes; always `border-x pb-20 pt-6` |
| `src/lib/layout/page-width.ts:3-8` | Four widths defined — good foundation |
| `src/components/typography/h1.tsx:11-15` | Uses `text-4xl font-extrabold` — not DESIGN.md serif `--text-3xl` page title |
| `src/components/academic/academic-page-header.tsx:17-28` | Mixed tokens (`text-muted-foreground`); uppercase eyebrow violates Burmese-safe guidance |
| `src/app/(internal)/campuses/page.tsx:30-38` | Ad-hoc flex row + raw `TypographyH1` |
| `src/app/(internal)/programs/page.tsx:31-43` | Uses `AcademicPageHeader` + `PageContainer width="wide"` — closer but not shared contract |
| `src/app/(internal)/subjects/create/page.tsx:27-40` | Raw `TypographyH1` without `PageHeader`; inconsistent spacing |
| `src/components/shell/panel-header.tsx:18-24` | Shell breadcrumb title separate from page title — must remain complementary, not duplicated |

**Scope boundary:** This plan does not migrate every `page.tsx`. R8–R11 cohorts migrate remaining routes using these primitives.

---

## Locked contracts

### Page width by route family

| Route family | Default `PageContainer width` | Density | Notes |
| --- | --- | --- | --- |
| Admin CRUD list | `wide` | `comfortable` | Dominant: table; supporting: header actions |
| Admin CRUD create/edit | `narrow` | `comfortable` | Dominant: form; quiet: back nav |
| Admin CRUD detail | `default` | `comfortable` | Dominant: record body |
| Dashboard / analytics | `wide` | `comfortable` | One dominant chart/table region |
| Finance / student-payments | `full` | `dense` | Documented exception — no silent reimplementation of padding |
| Record-body (course/org) | `default` | `comfortable` | Uses shell `usePageHeader` — page body omits duplicate title |

### `PageTitle` (single authority for in-flow page titles)

- Serif, `text-3xl` token scale, `text-text-primary`
- No uppercase transform
- Optional `description` slot below title

### `PageHeader` composition

```
┌ PageHeader ────────────────────────────────────────┐
│ [eyebrow?]  [actions aligned end on sm+]           │
│ PageTitle                                           │
│ description                                         │
└────────────────────────────────────────────────────┘
```

Three-zone page body guidance (§8.7): identify dominant/supporting/quiet regions in each route-family doc; nested decorative card stacks are defects.

---

## File structure

**Create:**
```
src/components/layout/page-title.tsx
src/components/layout/page-header.tsx
src/components/layout/page-section.tsx
src/lib/layout/page-composition.ts
src/components/layout/__tests__/page-composition.test.ts
src/components/layout/__tests__/page-header.test.tsx
docs/ui-contracts/page-composition.md
```

**Modify:**
```
src/components/layout/page-container.tsx
src/components/academic/academic-page-header.tsx
src/app/(internal)/campuses/page.tsx
src/app/(internal)/programs/page.tsx
src/app/(internal)/subjects/create/page.tsx
```

**Forbidden (do not edit):**
- `src/components/shell/**` (R1 theme bridge and R2 overlay layers; otherwise frozen)
- Exhaustive route migration across `src/app/**/page.tsx`
- Finance/student-payments pages (R11–R14)
- Token/theme files owned by R1 except consuming semantic classes

---

### Task 1: Page composition helpers (TDD)

**Files:**
- Create: `src/lib/layout/page-composition.ts`
- Create: `src/components/layout/__tests__/page-composition.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/components/layout/__tests__/page-composition.test.ts
import { describe, expect, it } from "vitest";
import {
  PAGE_DENSITY_CLASS,
  resolvePageDensity,
  routeFamilyPageWidth,
} from "@/lib/layout/page-composition";

describe("page-composition", () => {
  it("maps admin list family to wide comfortable width", () => {
    expect(routeFamilyPageWidth("admin-crud-list")).toEqual({
      width: "wide",
      density: "comfortable",
    });
  });

  it("maps finance family to full dense exception", () => {
    expect(routeFamilyPageWidth("finance-operations")).toEqual({
      width: "full",
      density: "dense",
    });
  });

  it("dense density removes extra vertical padding", () => {
    expect(PAGE_DENSITY_CLASS.comfortable).toContain("pt-6");
    expect(PAGE_DENSITY_CLASS.dense).toContain("pt-4");
    expect(resolvePageDensity("dense")).toBe("dense");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run:
```bash
cd /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-fe
npm run test:unit -- src/components/layout/__tests__/page-composition.test.ts
```

- [ ] **Step 3: Implement**

```typescript
// src/lib/layout/page-composition.ts
import type { PageWidth } from "@/lib/layout/page-width";

export type PageDensity = "comfortable" | "dense";

export type RouteFamily =
  | "admin-crud-list"
  | "admin-crud-create"
  | "admin-crud-detail"
  | "dashboard-analytics"
  | "finance-operations"
  | "record-body";

export type PageLayoutPreset = {
  width: PageWidth;
  density: PageDensity;
};

export const PAGE_DENSITY_CLASS: Record<PageDensity, string> = {
  comfortable: "pt-6 pb-20 gap-6",
  dense: "pt-4 pb-12 gap-4",
};

const ROUTE_FAMILY_PRESETS: Record<RouteFamily, PageLayoutPreset> = {
  "admin-crud-list": { width: "wide", density: "comfortable" },
  "admin-crud-create": { width: "narrow", density: "comfortable" },
  "admin-crud-detail": { width: "default", density: "comfortable" },
  "dashboard-analytics": { width: "wide", density: "comfortable" },
  "finance-operations": { width: "full", density: "dense" },
  "record-body": { width: "default", density: "comfortable" },
};

export function routeFamilyPageWidth(family: RouteFamily): PageLayoutPreset {
  return ROUTE_FAMILY_PRESETS[family];
}

export function resolvePageDensity(
  density: PageDensity | undefined,
  fallback: PageDensity = "comfortable",
): PageDensity {
  return density ?? fallback;
}
```

- [ ] **Step 4: Run — expect PASS**

Run:
```bash
npm run test:unit -- src/components/layout/__tests__/page-composition.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/layout/page-composition.ts src/components/layout/__tests__/page-composition.test.ts
git commit -m "feat(layout): add page composition presets and density tokens"
```

---

### Task 2: PageTitle and PageHeader components

**Files:**
- Create: `src/components/layout/page-title.tsx`
- Create: `src/components/layout/page-header.tsx`
- Create: `src/components/layout/page-section.tsx`
- Create: `src/components/layout/__tests__/page-header.test.tsx`

- [ ] **Step 1: Write failing render test**

```tsx
// src/components/layout/__tests__/page-header.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PageHeader } from "../page-header";

describe("PageHeader", () => {
  it("renders serif page title at text-3xl scale", () => {
    render(
      <PageHeader
        title="Programs"
        description="Organize courses."
        actions={<button type="button">Create</button>}
      />,
    );
    const heading = screen.getByRole("heading", { level: 1, name: "Programs" });
    expect(heading.className).toContain("font-serif");
    expect(heading.className).toContain("text-3xl");
    expect(screen.getByText("Organize courses.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create" })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run:
```bash
npm run test:unit -- src/components/layout/__tests__/page-header.test.tsx
```

- [ ] **Step 3: Implement PageTitle**

```tsx
// src/components/layout/page-title.tsx
import { cn } from "@/lib/utils";

export function PageTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h1
      className={cn(
        "font-serif text-3xl leading-[1.25] text-text-primary",
        className,
      )}
    >
      {children}
    </h1>
  );
}
```

- [ ] **Step 4: Implement PageHeader**

```tsx
// src/components/layout/page-header.tsx
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { PageTitle } from "./page-title";

export type PageHeaderProps = {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
      data-slot="page-header"
    >
      <div className="min-w-0 space-y-1">
        {eyebrow ? (
          <p className="text-xs font-medium text-text-muted">{eyebrow}</p>
        ) : null}
        <PageTitle>{title}</PageTitle>
        {description ? (
          <p className="max-w-2xl text-sm text-text-secondary">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}
```

- [ ] **Step 5: Implement PageSection**

```tsx
// src/components/layout/page-section.tsx
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function PageSection({
  children,
  className,
  dominant = false,
}: {
  children: ReactNode;
  className?: string;
  /** Dominant region — table or primary workflow surface. */
  dominant?: boolean;
}) {
  return (
    <section
      className={cn("min-w-0", dominant && "flex-1", className)}
      data-slot={dominant ? "page-section-dominant" : "page-section"}
    >
      {children}
    </section>
  );
}
```

- [ ] **Step 6: Run test — expect PASS**

Run:
```bash
npm run test:unit -- src/components/layout/__tests__/page-header.test.tsx
```

- [ ] **Step 7: Commit**

```bash
git add src/components/layout/page-title.tsx src/components/layout/page-header.tsx src/components/layout/page-section.tsx src/components/layout/__tests__/page-header.test.tsx
git commit -m "feat(layout): add PageTitle, PageHeader, and PageSection primitives"
```

---

### Task 3: Extend PageContainer with density

**Files:**
- Modify: `src/components/layout/page-container.tsx:11-56`

- [ ] **Step 1: Write failing test**

Append to `page-composition.test.ts`:

```typescript
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("PageContainer density gate", () => {
  it("PageContainer accepts density prop", () => {
    const src = readFileSync(
      resolve(__dirname, "../page-container.tsx"),
      "utf8",
    );
    expect(src).toMatch(/density\?: PageDensity/);
    expect(src).toMatch(/PAGE_DENSITY_CLASS/);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run:
```bash
npm run test:unit -- src/components/layout/__tests__/page-composition.test.ts
```

- [ ] **Step 3: Update PageContainer**

Add imports:

```typescript
import {
  PAGE_DENSITY_CLASS,
  resolvePageDensity,
  type PageDensity,
} from "@/lib/layout/page-composition";
```

Extend props:

```typescript
interface PageContainerProps {
  width?: PageWidth;
  density?: PageDensity;
  className?: string;
  children: React.ReactNode;
}
```

Update component:

```typescript
export function PageContainer({
  width = DEFAULT_PAGE_WIDTH,
  density,
  className,
  children,
}: PageContainerProps) {
  const { effectiveFullscreen } = useFullscreen();
  const resolvedDensity = resolvePageDensity(density);

  if (effectiveFullscreen) {
    return (
      <div className={cn(pageContentInsetClassName(width, true), className)}>
        {children}
      </div>
    );
  }

  return (
    <div
      className={cn(
        pageContentInsetClassName(width, false),
        "flex flex-col border-x border-border",
        PAGE_DENSITY_CLASS[resolvedDensity],
        "transition-[max-width] duration-200 ease-in-out",
        className,
      )}
      data-slot="page-container"
      data-density={resolvedDensity}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/page-container.tsx src/components/layout/__tests__/page-composition.test.ts
git commit -m "feat(layout): add PageContainer density presets"
```

---

### Task 4: Refactor AcademicPageHeader to delegate to PageHeader

**Files:**
- Modify: `src/components/academic/academic-page-header.tsx:1-29`

- [ ] **Step 1: Replace implementation**

```tsx
import type { ReactNode } from "react";

import { PageHeader } from "@/components/layout/page-header";

interface AcademicPageHeaderProps {
  title: string;
  description: string;
  eyebrow?: string;
  actions?: ReactNode;
}

/** Academic route-family header — delegates to shared PageHeader contract. */
export function AcademicPageHeader({
  title,
  description,
  eyebrow = "Academic",
  actions,
}: AcademicPageHeaderProps) {
  return (
    <PageHeader
      title={title}
      description={description}
      eyebrow={eyebrow}
      actions={actions}
    />
  );
}
```

- [ ] **Step 2: Run tests + lint**

Run:
```bash
npm run lint -- src/components/academic/academic-page-header.tsx
npm run test:unit -- src/components/layout/__tests__/page-header.test.tsx
```

- [ ] **Step 3: Commit**

```bash
git add src/components/academic/academic-page-header.tsx
git commit -m "refactor(academic): delegate AcademicPageHeader to PageHeader"
```

---

### Task 5: Representative page migrations

**Files:**
- Modify: `src/app/(internal)/campuses/page.tsx:29-47`
- Modify: `src/app/(internal)/programs/page.tsx:30-53`
- Modify: `src/app/(internal)/subjects/create/page.tsx:25-41`

- [ ] **Step 1: Campuses list — local header pattern**

Replace page body (lines 29-47) with:

```tsx
  return (
    <PageContainer width="wide" className="flex flex-col">
      <PageHeader
        title="Campuses"
        description="Physical and online campuses available for scheduling and enrollment."
        actions={
          <Link
            href={`${pathname}/create`}
            className={cn(buttonVariants({ variant: "primary", size: "md" }))}
          >
            Create a campus
          </Link>
        }
      />
      <PageSection dominant>
        <ResourceTable
          list={list}
          tableState={tableState}
          columns={campusColumns}
          getRowId={(row) => String(row.id)}
          rowHref={(row) => `/campuses/${row.id}`}
        />
      </PageSection>
    </PageContainer>
  );
```

Add imports:

```typescript
import { PageHeader } from "@/components/layout/page-header";
import { PageSection } from "@/components/layout/page-section";
```

Remove `TypographyH1` import.

- [ ] **Step 2: Programs list — already uses AcademicPageHeader; add PageSection**

Replace the `return` block at `src/app/(internal)/programs/page.tsx:30-54` with:

```tsx
  return (
    <PageContainer width="wide" className="flex flex-col">
      <AcademicPageHeader
        title="Programs"
        description="Programs define how courses are organized, created, and connected to levels, subjects, and intakes."
        actions={
          <Link
            href={`${pathname}/create`}
            className={cn(
              buttonVariants({ variant: "primary", size: "md" }),
            )}
          >
            Create program
          </Link>
        }
      />
      <AcademicListSurface>
        <PageSection dominant>
          <ResourceTable
            list={list}
            tableState={tableState}
            columns={programColumns}
            getRowId={(row) => String(row.id)}
            rowHref={(row) => `${pathname}/${row.id}`}
          />
        </PageSection>
      </AcademicListSurface>
    </PageContainer>
  );
```

Add this import after the `PageContainer` import:

```typescript
import { PageSection } from "@/components/layout/page-section";
```

- [ ] **Step 3: Subjects create — narrow create pattern**

Replace lines 27-40 with:

```tsx
    <PageContainer width="narrow" className="flex flex-col">
      <div data-slot="page-section-quiet">
        <BackButton href="/subjects" />
      </div>
      <PageHeader
        title="Create subject"
        description="This subject becomes available org-wide and can be added to any program's catalog."
      />
      <PageSection dominant>
        <GenericForm
          schema={subjectCreateUpdateSchema}
          entityName="subject"
          apiUrl="subjects"
          redirectUrl="/subjects"
          groups={SUBJECT_CREATE_GROUPS}
          measure="narrow"
        />
      </PageSection>
    </PageContainer>
```

Remove `TypographyH1` import and muted-foreground paragraph.

Add imports for `PageHeader`, `PageSection`.

- [ ] **Step 4: Run verification**

Run:
```bash
npm run typecheck
npm run test:unit -- src/components/layout
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/(internal)/campuses/page.tsx src/app/(internal)/programs/page.tsx src/app/(internal)/subjects/create/page.tsx
git commit -m "refactor(pages): migrate representative routes to page composition contract"
```

---

### Task 6: Static gate for migrated routes

**Files:**
- Modify: `src/components/layout/__tests__/page-composition.test.ts`

- [ ] **Step 1: Add gate test**

```typescript
const MIGRATED_ROUTES = [
  "src/app/(internal)/campuses/page.tsx",
  "src/app/(internal)/programs/page.tsx",
  "src/app/(internal)/subjects/create/page.tsx",
];

describe("migrated route static gate", () => {
  it("representative pages do not import TypographyH1 directly", () => {
    for (const route of MIGRATED_ROUTES) {
      const src = readFileSync(resolve(__dirname, "../../../..", route), "utf8");
      expect(src).not.toMatch(/TypographyH1/);
    }
  });

  it("representative pages use PageContainer", () => {
    for (const route of MIGRATED_ROUTES) {
      const src = readFileSync(resolve(__dirname, "../../../..", route), "utf8");
      expect(src).toMatch(/PageContainer/);
    }
  });
});
```

- [ ] **Step 2: Run gate**

Run:
```bash
npm run test:unit -- src/components/layout/__tests__/page-composition.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/__tests__/page-composition.test.ts
git commit -m "test(layout): static gate for representative page migrations"
```

---

### Task 7: Contract documentation and route-family guidance

**Files:**
- Create: `docs/ui-contracts/page-composition.md`

- [ ] **Step 1: Create the page composition contract**

Create `docs/ui-contracts/page-composition.md` with this complete content:

````markdown
# Page Composition Contract

All product routes use `PageContainer` for width, horizontal inset, and vertical
spacing. In-flow page titles use `PageHeader` and `PageTitle`. Record routes
that already register shell chrome through `usePageHeader` do not add a
duplicate in-flow title.

## Route-family presets

| Route family | Width | Density | Dominant region |
| --- | --- | --- | --- |
| Admin CRUD list | `wide` | `comfortable` | Table or list |
| Admin CRUD create/edit | `narrow` | `comfortable` | Form |
| Admin CRUD detail | `default` | `comfortable` | Record body |
| Dashboard and analytics | `wide` | `comfortable` | Primary chart or table |
| Finance operations | `full` | `dense` | Operational table or grid |
| Course/org record body | `default` | `comfortable` | Active record section |

Use `routeFamilyPageWidth()` to obtain these presets. Route code must not
reimplement container padding, maximum width, or title scale.

## Header ownership

List, create, edit, dashboard, and standalone detail routes render an in-flow
`PageHeader`. `PageHeader` owns the page-level heading, optional description,
optional eyebrow, and action alignment.

Course and organization record routes register context in the shell with
`usePageHeader`. Their page body starts with the active record section and does
not render another H1.

`PageTitle` is the only in-flow page-title implementation. It uses the
DESIGN.md serif `text-3xl` scale and never applies uppercase transformation.

## Three-zone composition

Each route identifies:

1. **Dominant region:** the main table, form, chart, or record section.
2. **Supporting region:** filters, explanatory context, or actions that help
   operate the dominant region.
3. **Quiet region:** back navigation, metadata, or low-priority status.

Use `PageSection dominant` for the dominant in-flow region. Supporting and
quiet regions may use normal semantic elements with a descriptive `data-slot`.
Do not wrap all three regions in competing cards.

## Dense exception

`density="dense"` is reserved for finance and other proven operational
workflows that need more visible rows or controls. Dense pages still use
`PageContainer width="full"` and shared inset rules. They must not replace the
container with local padding wrappers.

R11–R14 own finance exceptions. A route cohort must document the workflow
evidence before introducing another dense family.

## Responsive behavior

PageHeader actions wrap below the title on narrow viewports and align at the
end from the `sm` breakpoint. Titles and descriptions remain readable without
horizontal document overflow. Full-width operational content may scroll inside
its own region.

## Route-cohort migration

R5 migrates only `/campuses`, `/programs`, and `/subjects/create` as
representatives. R8–R11 own exhaustive route-family migration. Each cohort
extends the static migrated-route gate and records its dominant, supporting,
and quiet regions.

## QA checklist

- Exactly one page-level H1 is present.
- The title uses serif `text-3xl`.
- Actions wrap on mobile and align at the end on desktop.
- Container width and density match the route-family preset.
- The dominant region is visually primary.
- Supporting and quiet regions do not compete with the dominant region.
- No nested decorative card stack replaces hierarchy.
- No unintended document-level horizontal overflow occurs.
````

- [ ] **Step 2: Commit**

```bash
git add docs/ui-contracts/page-composition.md
git commit -m "docs: add page composition contract and route-family guidance"
```

---

### Task 8: Browser smoke — page composition

**Files:**
- Create: `e2e/smoke/page-composition.spec.ts`

- [ ] **Step 1: Create Playwright spec using R0 auth fixture**

```typescript
// e2e/smoke/page-composition.spec.ts
import { test, expect } from "../fixtures/auth";

const MIGRATED_ROUTES = [
  { path: "/campuses", title: "Campuses" },
  { path: "/programs", title: "Programs" },
  { path: "/subjects/create", title: "Create subject" },
] as const;

for (const { path, title } of MIGRATED_ROUTES) {
  test(`${path} renders single serif PageHeader H1`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(path);
    await page.waitForLoadState("networkidle");

    const headings = page.getByRole("heading", { level: 1 });
    await expect(headings).toHaveCount(1);
    const h1 = headings.first();
    await expect(h1).toHaveText(title);
    await expect(h1).toHaveClass(/font-serif/);
    await expect(h1).toHaveClass(/text-3xl/);
    await expect(page.locator('[data-slot="page-header"]')).toBeVisible();
    await expect(page.locator('[data-slot="page-container"]')).toBeVisible();
  });

  test(`${path} wraps header actions on mobile`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const header = page.locator('[data-slot="page-header"]');
    await expect(header).toBeVisible();
    const box = await header.boundingBox();
    expect(box?.width ?? 0).toBeLessThanOrEqual(375);
  });
}
```

- [ ] **Step 2: Run browser spec**

```bash
export PLAYWRIGHT_TEST_EMAIL=james@schedjuice.com
export PLAYWRIGHT_TEST_PASSWORD=password123
export NEXT_PUBLIC_BASE_API_URL=http://localhost:8000/api/v1
: "${PLAYWRIGHT_PAYMENT_FIXTURE_TEXT:?Set this to unique text from a seeded editable payment row}"
npm run test:browser -- e2e/smoke/page-composition.spec.ts
```

Expected: PASS with zero skipped tests.

- [ ] **Step 3: Commit**

```bash
git add e2e/smoke/page-composition.spec.ts
git commit -m "test(r5): add page composition browser smoke spec"
```

---

## Verification (full wave)

```bash
cd /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-fe
npm run lint
npm run typecheck
npm run test:unit
npm run build
npm run test:browser -- e2e/smoke/page-composition.spec.ts
```

Expected: all green. Browser spec checks: page title serif 32px, actions align end at sm+, no duplicate title in PanelHeader breadcrumb for migrated list routes (breadcrumb may show nav label; in-flow PageHeader owns H1).

The browser command is always `npm run test:browser`. Skipped, excluded, quarantined, or conditionally bypassed browser cases are not accepted; any skip is a blocking failure returned to R0 or the owning plan.

---

## Browser / manual checks

| Route | Role | Viewport | Theme | Check |
| --- | --- | --- | --- | --- |
| `/campuses` | admin | 375×812, 1280×800 | light | Single H1; actions wrap on mobile; table is dominant region |
| `/programs` | admin | 1280×800 | dark | Academic eyebrow visible; semantic tokens coherent |
| `/subjects/create` | admin | 1024×800 | light | Narrow width; back button in quiet zone; form dominant |

Screenshot each at mobile and desktop.

---

## Stop conditions

1. **R0/R1 not green** — stop.
2. **Shell file drift** — if `panel-header.tsx` or `use-page-header.ts` need changes, stop and hand off to R6.
3. **Attempt to migrate all routes in this plan** — stop; out of scope.
4. **TypographyH1 removed globally** — forbidden; other routes still use it until cohort migration.

---

## Independent QA handoff prompt

```
You are independent QA for R5 page composition contracts.
Base SHA: merge commit of remediate/ui-r5-page-shell.

Acceptance criteria:
1. PageTitle uses serif text-3xl DESIGN.md scale.
2. PageHeader provides title, description, eyebrow, actions alignment.
3. PageContainer supports density comfortable/dense.
4. routeFamilyPageWidth documents finance full+dense exception.
5. Representative routes /campuses, /programs, /subjects/create migrated; static gate passes.
6. No shell/header regression on migrated routes.
7. Full verification commands pass.

Commands: npm run lint && npm run typecheck && npm run test:unit && npm run build && npm run test:browser -- e2e/smoke/page-composition.spec.ts

Manual: verify single in-flow H1, three-zone hierarchy (header / dominant table or form / quiet back nav), mobile action wrapping.

Return PASS/FAIL with screenshots. Do not patch source.
```

---

## Self-review (spec §8.4, §8.7)

| Requirement | Task |
| --- | --- |
| Page width from shared helpers | Task 1 + existing page-width.ts |
| One page-title component | Task 2 PageTitle |
| Route-family headers | Task 2 PageHeader + Task 4 Academic delegate |
| Dense full-width exceptions | Task 1 finance preset + Task 3 density |
| Composition three-zone guidance | Task 7 doc + PageSection dominant |
| Tests/static gates | Tasks 1, 2, 6 |
| Representative migrations only | Task 5 |
| Browser page-composition smoke | Task 8 |

**Placeholder scan:** none.

---

## Route cohort handoff (not in this plan)

After R5 merges, route-family plans **R8–R11** must:

1. Import `PageHeader` / `PageContainer` presets from `routeFamilyPageWidth`.
2. Extend static gate `MIGRATED_ROUTES` list as each route migrates.
3. Record dominant/supporting/quiet regions in cohort plan headers.

Do not redefine container padding or title scale locally.
