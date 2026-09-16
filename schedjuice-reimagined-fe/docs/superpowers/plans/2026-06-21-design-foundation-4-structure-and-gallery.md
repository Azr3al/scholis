# Design Foundation — Plan 4: Structure Primitives & Gallery Finalize Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the remaining structure primitives — `Tabs` (with the §16 "highlighter" indicator), `Separator`, `Avatar` — finish the `/components` gallery, reconcile `DESIGN.md`, and run the Phase 1 acceptance pass.

**Architecture:** `Tabs` uses Base UI's `Tabs.Indicator` driven by `--active-tab-width`/`--active-tab-left`, filled with `--tab-highlight` and `mix-blend-mode: var(--tab-highlight-blend-mode)` so the marker stays legible in both themes (DESIGN.md §16). `Avatar` composes `Avatar.Root/Image/Fallback` with an initials monogram fallback (§11 — never a lone user glyph). `Separator` wraps Base UI `Separator`. The gallery then renders all sections; finally we update `DESIGN.md`'s living references and run the §15 "done" checklist.

**Tech Stack:** Next.js 15, React 19, Tailwind v4, TypeScript, `@base-ui/react`, `cn()`.

**Spec:** `docs/superpowers/specs/2026-06-21-design-foundation-phase-1.md` (§10, §14 done, §15 reconciliations). **Design source:** `DESIGN.md` §9 (tables/layout), §10, §16.
**Depends on:** Plans 1–3 (tokens, shell, input + overlay primitives, barrel).

> **Testing approach:** Gallery + manual checks + `npx tsc --noEmit` (same as Plans 2–3). The Phase 1
> acceptance task (Task 6) runs `npm run test:unit` (Plan 1 unit tests) and walks the §15 done criteria.

> **Commit policy:** Follows `no-git-commits.mdc` — confirm before committing.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/components/primitives/tabs.tsx` (NEW) | `Tabs.*` with highlighter indicator |
| `src/components/primitives/separator.tsx` (NEW) | `Separator` |
| `src/components/primitives/avatar.tsx` (NEW) | `Avatar` (image + initials fallback) |
| `src/components/primitives/index.ts` (MODIFY) | Add structure exports |
| `src/app/(design)/components/_demos/structure-demo.tsx` (NEW) | Gallery section (tabs, separator, avatar, a §9 table) |
| `src/app/(design)/components/page.tsx` (MODIFY) | Render `<StructureDemo />` |
| `DESIGN.md` (MODIFY) | §15 `/design`→`/components`; §10 Avatar note; changelog |

**Verify:** `npm run dev` → `/components`. **Type-check:** `npx tsc --noEmit`. **Unit:** `npm run test:unit`.

---

## Task 1: Tabs

**Files:** Create `src/components/primitives/tabs.tsx`

Base UI: `Tabs.Root` (`defaultValue`/`value`) → `Tabs.List` → `Tabs.Tab` (`value`, `data-active`
when selected) + `Tabs.Indicator` (`--active-tab-width`/`--active-tab-left`) → `Tabs.Panel` (`value`).

- [ ] **Step 1: Implement Tabs (highlighter indicator)**

```tsx
// src/components/primitives/tabs.tsx
"use client";

import { type ComponentProps } from "react";
import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import { cn } from "@/lib/utils";

function List({ className, ...props }: ComponentProps<typeof BaseTabs.List>) {
  return <BaseTabs.List className={cn("relative z-0 flex gap-1", className)} {...props} />;
}

function Tab({ className, ...props }: ComponentProps<typeof BaseTabs.Tab>) {
  return (
    <BaseTabs.Tab
      className={cn(
        "relative z-10 flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium",
        "text-text-muted outline-none select-none transition-colors hover:text-text-primary",
        "data-[selected]:text-text-primary",
        "focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-[var(--ring)]",
        className,
      )}
      {...props}
    />
  );
}

function Indicator({ className, ...props }: ComponentProps<typeof BaseTabs.Indicator>) {
  return (
    <BaseTabs.Indicator
      className={cn(
        "absolute top-0 left-0 -z-10 h-full w-[var(--active-tab-width)] translate-x-[var(--active-tab-left)]",
        "rounded-md bg-[var(--tab-highlight)] [mix-blend-mode:var(--tab-highlight-blend-mode)]",
        "transition-[translate,width] duration-[var(--duration-normal)] ease-[var(--ease-out-soft)]",
        className,
      )}
      {...props}
    />
  );
}

function Panel({ className, ...props }: ComponentProps<typeof BaseTabs.Panel>) {
  return (
    <BaseTabs.Panel
      className={cn(
        "py-4 outline-none focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-[var(--ring)]",
        className,
      )}
      {...props}
    />
  );
}

export const Tabs = {
  Root: BaseTabs.Root,
  List,
  Tab,
  Indicator,
  Panel,
};
```

- [ ] **Step 2: Type-check + commit**

Run: `npx tsc --noEmit` — Expected: no new errors. (Confirm the selected-state attribute is
`data-selected` vs `data-active` in the installed version and adjust the class.)

```bash
git add src/components/primitives/tabs.tsx
git commit -m "feat(design): add Tabs primitive with highlighter indicator"
```

---

## Task 2: Separator

**Files:** Create `src/components/primitives/separator.tsx`

Base UI: `Separator` (`orientation`). For decorative dividers prefer `<RoughDivider />` (§14 #14);
this is the plain semantic separator for tight UI.

- [ ] **Step 1: Implement Separator**

```tsx
// src/components/primitives/separator.tsx
import { type ComponentProps } from "react";
import { Separator as BaseSeparator } from "@base-ui/react/separator";
import { cn } from "@/lib/utils";

export function Separator({
  className,
  orientation = "horizontal",
  ...props
}: ComponentProps<typeof BaseSeparator>) {
  return (
    <BaseSeparator
      orientation={orientation}
      className={cn(
        "bg-border",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
      {...props}
    />
  );
}
```

- [ ] **Step 2: Type-check + commit**

Run: `npx tsc --noEmit` — Expected: no new errors.

```bash
git add src/components/primitives/separator.tsx
git commit -m "feat(design): add Separator primitive"
```

---

## Task 3: Avatar

**Files:** Create `src/components/primitives/avatar.tsx`

Base UI: `Avatar.Root`/`Avatar.Image` (`src`, `onLoadingStatusChange`)/`Avatar.Fallback` (`delay`).
Fallback is an initials monogram (§11 — never a lone user glyph). Bilingual-safe: initials derive
from the first grapheme of each of the first two words (works for Burmese names).

- [ ] **Step 1: Implement Avatar**

```tsx
// src/components/primitives/avatar.tsx
"use client";

import { type ComponentProps } from "react";
import { Avatar as BaseAvatar } from "@base-ui/react/avatar";
import { cn } from "@/lib/utils";

function initialsFrom(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (words.length === 0) return "?";
  return words.map((w) => Array.from(w)[0] ?? "").join("");
}

export function Avatar({
  src,
  name,
  className,
  ...props
}: ComponentProps<typeof BaseAvatar.Root> & { src?: string | null; name: string }) {
  return (
    <BaseAvatar.Root
      className={cn(
        "inline-flex size-10 items-center justify-center overflow-hidden rounded-full",
        "bg-brand/15 align-middle text-sm font-medium text-brand select-none",
        className,
      )}
      {...props}
    >
      {src ? (
        <BaseAvatar.Image src={src} className="size-full object-cover" />
      ) : null}
      <BaseAvatar.Fallback delay={src ? 400 : 0} className="flex size-full items-center justify-center">
        {initialsFrom(name)}
      </BaseAvatar.Fallback>
    </BaseAvatar.Root>
  );
}
```

- [ ] **Step 2: Type-check + commit**

Run: `npx tsc --noEmit` — Expected: no new errors.

```bash
git add src/components/primitives/avatar.tsx
git commit -m "feat(design): add Avatar primitive with initials fallback"
```

---

## Task 4: Barrel export + structure gallery demo

**Files:**
- Modify: `src/components/primitives/index.ts`
- Create: `src/app/(design)/components/_demos/structure-demo.tsx`
- Modify: `src/app/(design)/components/page.tsx`

- [ ] **Step 1: Add structure exports to the barrel**

Append to `src/components/primitives/index.ts`:

```ts
export { Tabs } from "./tabs";
export { Separator } from "./separator";
export { Avatar } from "./avatar";
```

- [ ] **Step 2: Build the structure demo (includes a §9 typography-first table)**

```tsx
// src/app/(design)/components/_demos/structure-demo.tsx
"use client";

import { Avatar, Separator, Tabs } from "@/components/primitives";
import { RoughDivider } from "@/components/primitives/decoration/rough-divider";

const roster = [
  { name: "သီရိ ကျော်", course: "English — L3", paid: "123,450" },
  { name: "Min Thant", course: "Physics — Foundation", paid: "98,000" },
  { name: "ဇေယျာ နိုင်", course: "သင်္ချာ — Grade 9", paid: "150,000" },
];

export function StructureDemo() {
  return (
    <section className="space-y-8">
      <h2 className="font-serif text-2xl">Structure</h2>

      <div>
        <Tabs.Root defaultValue="overview" className="max-w-md">
          <Tabs.List>
            <Tabs.Tab value="overview">Overview</Tabs.Tab>
            <Tabs.Tab value="roster">Roster</Tabs.Tab>
            <Tabs.Tab value="finance">Finance</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="overview">Workspace stats and activity.</Tabs.Panel>
          <Tabs.Panel value="roster">Members and attendance.</Tabs.Panel>
          <Tabs.Panel value="finance">Invoices and payments.</Tabs.Panel>
        </Tabs.Root>
      </div>

      <div className="flex items-center gap-3">
        <Avatar name="Thiri Kyaw" />
        <Avatar name="သီရိ ကျော်" />
        <Separator orientation="vertical" className="h-8" />
        <span className="text-text-secondary">Avatars fall back to initials.</span>
      </div>

      <RoughDivider />

      {/* §9: typography-first table — small-caps Latin headers, 52px rows, tabular numbers */}
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-border-strong">
            <th className="pb-2 text-xs font-semibold tracking-wider text-text-muted uppercase">Student</th>
            <th className="pb-2 text-xs font-semibold tracking-wider text-text-muted uppercase">Course</th>
            <th className="pb-2 text-right text-xs font-semibold tracking-wider text-text-muted uppercase">
              Paid (MMK)
            </th>
          </tr>
        </thead>
        <tbody>
          {roster.map((r) => (
            <tr key={r.name} className="h-[52px] border-b border-border">
              <td>{r.name}</td>
              <td className="text-text-secondary">{r.course}</td>
              <td className="text-right font-mono tabular-nums">{r.paid}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

- [ ] **Step 3: Render it from the gallery index**

In `src/app/(design)/components/page.tsx`, add the import and render `<StructureDemo />` after
`<OverlaysDemo />`:

```tsx
import { StructureDemo } from "./_demos/structure-demo";
```

```tsx
      <OverlaysDemo />
      <StructureDemo />
```

- [ ] **Step 4: Verify (tabs keyboard nav, table rhythm, theme)**

Run `npm run dev`; visit `/components`. Expected: Tabs switch with arrow keys and the highlighter
slides (and stays legible in dark via `screen` blend); avatars show initials for both Latin and
Burmese names; the table headers are small-caps **Latin only**, rows are ≥52px, numbers are
tabular and right-aligned.

- [ ] **Step 5: Commit**

```bash
git add src/components/primitives/index.ts "src/app/(design)/components/_demos/structure-demo.tsx" "src/app/(design)/components/page.tsx"
git commit -m "feat(design): demo structure primitives + typography-first table"
```

---

## Task 5: Reconcile DESIGN.md

**Files:** Modify: `DESIGN.md`

Per spec §15, fold the transitional decisions back into the canonical doc.

- [ ] **Step 1: Repoint the §15 living references from `/design` to `/components`**

In `DESIGN.md` §15, replace the showcase line:

```markdown
- **Design showcase:** `/design` — [type](../src/app/(design)/design/type/page.tsx), [color](../src/app/(design)/design/color/page.tsx), [components](../src/app/(design)/design/components/page.tsx), [bilingual stress test](../src/app/(design)/design/bilingual/page.tsx)
```

with the superadmin `/components` library:

```markdown
- **Component library (superadmin):** `/components` — [gallery](../src/app/(design)/components/page.tsx), [type](../src/app/(design)/components/type/page.tsx), [color](../src/app/(design)/components/color/page.tsx), [bilingual stress test](../src/app/(design)/components/bilingual/page.tsx)
```

- [ ] **Step 2: Update the §10 Avatar guidance**

In the Radix→Base UI table, change the Avatar row from:

```markdown
| `@radix-ui/react-avatar` | Compose (`<img>` + fallback; no Base UI Avatar) |
```

to:

```markdown
| `@radix-ui/react-avatar` | `Avatar` (Base UI now ships `Avatar.Root/Image/Fallback`) |
```

- [ ] **Step 3: Add a changelog entry (§17)**

Add at the top of the §17 changelog list:

```markdown
- **June 2026 — Foundation (Phase 1):** Built the isolated `.sj-root` design world — scoped cream/data-green tokens (light+dark), bilingual font stack, `data-theme` infra (coexisting with `next-themes`), paper/rough decoration, ~21 Base UI primitives, and the superadmin `/components` library. Existing app untouched; Radix/shadcn removal deferred to the cleanup phase.
```

- [ ] **Step 4: Commit**

```bash
git add DESIGN.md
git commit -m "docs(design): reconcile DESIGN.md with Phase 1 foundation (/components, Avatar, changelog)"
```

---

## Task 6: Phase 1 acceptance pass

**Files:** none (verification) — optionally `DESIGN.md` if values change.

- [ ] **Step 1: Run the automated checks**

```bash
npm run test:unit
npx tsc --noEmit
npm run build
```

Expected: unit tests pass (contrast, palette AA, theme helpers); no type errors; production build
succeeds.

- [ ] **Step 2: Walk the §15 "done" checklist in the browser (superadmin)**

For each of `/components`, `/components/type`, `/components/color`, `/components/bilingual`:
- renders correctly in **light and dark** (toggle), no flash of wrong theme on reload;
- every primitive is reachable by keyboard with a visible focus ring;
- the bilingual page shows **no broken Burmese** rendering;
- contrast looks AA in both themes (spot-check against `/components/color`).

- [ ] **Step 3: The screenshot test**

Capture `/components` and confirm it is **immediately** identifiable as Schedjuice (cream, paper
grain, data-green, serif headers, hand accent) vs. a generic shadcn dashboard. Save captures for the
PR per `AGENTS.md` (e.g. `/opt/cursor/artifacts/screenshots/`).

- [ ] **Step 4: Confirm the existing app is unchanged**

Load a few existing routes (e.g. `/login`, `/home`, a finance table). Expected: identical to before
Phase 1 — no token/theme bleed from `.sj-root`.

- [ ] **Step 5 (if any token values were adjusted for AA): back-fill DESIGN.md**

If the warm-ramp or dark values were tuned during implementation, update `DESIGN.md` §5/§16 and
`src/lib/sj/palette.ts` together, and re-run `npm run test:unit`.

---

## Done criteria for Plan 4 (and Phase 1)

- All ~21 primitives exist under `src/components/primitives/`, exported from the barrel, and demoed
  across the `/components` gallery.
- `npm run test:unit`, `npx tsc --noEmit`, and `npm run build` all pass.
- The four `/components` pages meet the §15 "done" bar in both themes; the screenshot test is
  unambiguous; the existing app is visually and behaviorally unchanged.
- `DESIGN.md` reconciled (§15 `/components`, §10 Avatar, §17 changelog).
- **Phase 1 is complete.** Next: Phase 2 (pilot migration of one real surface) gets its own spec.
