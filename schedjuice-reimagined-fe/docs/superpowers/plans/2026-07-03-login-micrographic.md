# Login page micrographic — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a static, geometry-heavy ornamental micrographic beneath the login form in `schedjuice-reimagined-fe`, with quiet timetable copy plus **Yangon** and truncated **tenant name**.

**Architecture:** Single client component `LoginMicrographic` renders two inline SVG variants (full panel on `md+`, compact strip on mobile). All strokes use `currentColor`; tenant name is React text overlaid on a reserved readout row. Wired once in `login-form.tsx` outside the Microsoft vs email conditional so both flows see it.

**Tech Stack:** Next.js App Router, React, Tailwind v4 semantic tokens (`text-muted-foreground`, `border-border`), shadcn `Card` login shell.

**Spec:** `docs/superpowers/specs/2026-07-03-login-micrographic-design.md`

---

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `src/components/auth/login-micrographic.tsx` | Create | Panel + compact inline SVG, tenant readout, responsive swap |
| `src/components/auth/login-form.tsx` | Modify | Import and render `<LoginMicrographic tenantName={tenant.name} />` |

---

### Task 1: `LoginMicrographic` component

**Files:**
- Create: `src/components/auth/login-micrographic.tsx`

- [ ] **Step 1: Create component file with types and truncate helper**

```tsx
"use client";

import { cn } from "@/lib/utils";

export type LoginMicrographicProps = {
  tenantName: string;
  className?: string;
};

function truncateTenant(name: string, max = 28): string {
  const trimmed = name.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}
```

- [ ] **Step 2: Add compact strip SVG (mobile)**

Append to the same file — `LoginMicrographicCompact` with `viewBox="0 0 320 28"`, hairline geometry, static labels `Mon · Yangon ·` prefix, tenant rendered after in a flex row:

```tsx
function LoginMicrographicCompact({
  tenantName,
  className,
}: {
  tenantName: string;
  className?: string;
}) {
  const tenant = truncateTenant(tenantName, 22);
  return (
    <div
      aria-hidden
      className={cn(
        "flex w-full max-w-[18rem] items-center gap-2 border border-border/40 px-2 py-1.5 text-muted-foreground/60 md:hidden",
        className,
      )}
    >
      <svg
        viewBox="0 0 120 20"
        className="h-5 w-[7.5rem] shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        aria-hidden
      >
        {/* status dots */}
        <circle cx="4" cy="10" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="10" cy="10" r="1.5" fill="currentColor" stroke="none" />
        <text x="14" y="11" fontSize="6" fontFamily="ui-monospace, monospace">
          ×
        </text>
        <circle cx="22" cy="10" r="1.5" stroke="currentColor" fill="none" />
        <circle cx="28" cy="10" r="1.5" stroke="currentColor" fill="none" />
        <line x1="36" y1="10" x2="40" y2="10" />
        {/* cross grid */}
        <line x1="46" y1="6" x2="46" y2="14" />
        <line x1="42" y1="10" x2="50" y2="10" />
        <text x="44" y="8" fontSize="5" fontFamily="ui-monospace, monospace">
          ×
        </text>
        {/* mini schematic */}
        <circle cx="58" cy="10" r="2" stroke="currentColor" fill="none" />
        <path d="M60 10 H66 V6 H72" />
        <circle cx="72" cy="6" r="2" stroke="currentColor" fill="none" />
      </svg>
      <p className="min-w-0 truncate font-mono text-[10px] leading-none">
        Mon · Yangon · {tenant}
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Add full panel SVG (desktop)**

Append `LoginMicrographicPanel` — `viewBox="0 0 384 72"`, clusters from spec:

```tsx
function LoginMicrographicPanel({
  tenantName,
  className,
}: {
  tenantName: string;
  className?: string;
}) {
  const tenant = truncateTenant(tenantName);
  return (
    <div
      aria-hidden
      className={cn(
        "hidden w-full max-w-[24rem] border border-border/40 px-3 py-2.5 text-muted-foreground/60 md:block",
        className,
      )}
    >
      <svg
        viewBox="0 0 384 56"
        className="h-14 w-full"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        aria-hidden
      >
        {/* header */}
        <text x="0" y="8" fontSize="7" fontFamily="ui-monospace, monospace">
          Mon · Wk 12
        </text>
        <text
          x="384"
          y="8"
          fontSize="7"
          textAnchor="end"
          fontFamily="ui-monospace, monospace"
        >
          3 sessions
        </text>
        {/* 4x4 status array */}
        {[0, 1, 2, 3].map((row) =>
          [0, 1, 2, 3].map((col) => {
            const x = col * 6;
            const y = 14 + row * 6;
            const filled =
              (row === 0 && col < 2) || (row === 1 && col === 1);
            const cross = row === 0 && col === 2;
            if (cross) {
              return (
                <text
                  key={`${row}-${col}`}
                  x={x + 1}
                  y={y + 4}
                  fontSize="6"
                  fontFamily="ui-monospace, monospace"
                >
                  ×
                </text>
              );
            }
            return (
              <circle
                key={`${row}-${col}`}
                cx={x + 2}
                cy={y + 2}
                r="1.5"
                fill={filled ? "currentColor" : "none"}
                stroke="currentColor"
              />
            );
          }),
        )}
        {/* dial arc + 88% */}
        <path d="M52 28 A10 10 0 0 1 72 28" />
        <text x="58" y="26" fontSize="7" fontFamily="ui-monospace, monospace">
          88%
        </text>
        {/* node schematic */}
        <circle cx="100" cy="22" r="3" stroke="currentColor" fill="none" />
        <path d="M103 22 H115 V32 H130" />
        <circle cx="130" cy="32" r="3" stroke="currentColor" fill="none" />
        <circle cx="115" cy="38" r="3" fill="currentColor" stroke="currentColor" />
        <path d="M115 35 V32" />
        {/* cross grid 3x3 */}
        {[0, 1, 2].map((r) =>
          [0, 1, 2].map((c) => (
            <g key={`cross-${r}-${c}`} transform={`translate(${150 + c * 8}, ${16 + r * 8})`}>
              <line x1="2" y1="0" x2="2" y2="4" />
              <line x1="0" y1="2" x2="4" y2="2" />
            </g>
          )),
        )}
        <text x="158" y="20" fontSize="5" fontFamily="ui-monospace, monospace">
          ×
        </text>
        {/* flow baseline */}
        <line x1="180" y1="44" x2="280" y2="44" />
        <circle cx="190" cy="44" r="2" fill="currentColor" stroke="none" />
        <circle cx="230" cy="44" r="2" fill="currentColor" stroke="none" />
        <circle cx="270" cy="44" r="2" fill="currentColor" stroke="none" />
        <path d="M230 44 V36 H250 V48 H270" />
        {/* timetable labels on schematic arms */}
        <text x="178" y="34" fontSize="7" fontFamily="ui-monospace, monospace">
          08:30
        </text>
        <text x="248" y="52" fontSize="7" fontFamily="ui-monospace, monospace">
          Room 214
        </text>
      </svg>
      <p className="mt-1 truncate font-mono text-[10px] leading-none">
        Ready · Yangon · {tenant}
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Export composed component**

```tsx
export function LoginMicrographic({
  tenantName,
  className,
}: LoginMicrographicProps) {
  return (
    <>
      <LoginMicrographicCompact tenantName={tenantName} className={className} />
      <LoginMicrographicPanel tenantName={tenantName} className={className} />
    </>
  );
}
```

- [ ] **Step 5: Verify import path**

Confirm `@/lib/utils` exports `cn` (used elsewhere in repo). If missing, use existing cn import pattern from another component (e.g. `@/lib/cn` or local `clsx` + `tailwind-merge`).

Run: `grep -r "from \"@/lib/utils\"" schedjuice-reimagined-fe/src/components | head -3`

---

### Task 2: Wire into login form

**Files:**
- Modify: `src/components/auth/login-form.tsx`

- [ ] **Step 1: Add import**

At top of `login-form.tsx`:

```tsx
import LoginMicrographic from "./login-micrographic";
```

Use named export if Step 4 uses `export function` — adjust import to:

```tsx
import { LoginMicrographic } from "./login-micrographic";
```

- [ ] **Step 2: Render below form content, both flows**

Inside `<Card>`, after the closing `<>` of the microsoft / email conditional blocks (~line 380), before the *Developed by Schedjuice* paragraph:

```tsx
<LoginMicrographic tenantName={tenant.name} className="mt-6" />
<p className="text-center text-[8px] font-mono ">
  Developed by Schedjuice in Yangon.
</p>
```

Ensure the graphic is **outside** the `{tenant.is_microsoft_on && ...}` / `{!tenant.is_microsoft_on && ...}` branches so Microsoft-only tenants also see it.

- [ ] **Step 3: Typecheck**

Run: `cd schedjuice-reimagined-fe && npx tsc --noEmit 2>&1 | head -20`

Expected: no errors in `login-micrographic.tsx` or `login-form.tsx`

---

### Task 3: Manual verification

- [ ] **Step 1: Start dev server**

Run: `cd schedjuice-reimagined-fe && npm run dev`

- [ ] **Step 2: Desktop checklist**

Open `/login` at `md+` width:

| Check | Pass |
| --- | --- |
| Panel visible below form | ☐ |
| Bottom readout shows `Ready · Yangon · {tenant}` | ☐ |
| No hex / SCREAMING_SNAKE labels | ☐ |
| Compact strip hidden | ☐ |

- [ ] **Step 3: Mobile checklist**

Resize to `< md`:

| Check | Pass |
| --- | --- |
| Compact strip visible | ☐ |
| Full panel hidden | ☐ |
| Text includes `Mon · Yangon ·` + tenant | ☐ |

- [ ] **Step 4: Long tenant name**

Use a tenant with a long `name` — readout truncates without overflow.

- [ ] **Step 5: Dark mode**

Toggle `.dark` on `<html>` — strokes remain visible on card background.

---

## Plan self-review (spec coverage)

| Spec requirement | Task |
| --- | --- |
| Geometry clusters (grid, dial, schematic, cross, flow) | Task 1 Step 3 |
| Quiet copy, no buzzwords | Task 1 Steps 2–3 |
| Yangon + tenant name | Task 1 readout rows |
| Static, no animation | No animation classes added |
| Desktop panel / mobile strip | Task 1 responsive classes |
| Both login flows | Task 2 placement outside conditional |
| aria-hidden decorative | Task 1 wrappers |
| Semantic currentColor | Inline SVG stroke="currentColor" |

No gaps found.

---

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-07-03-login-micrographic.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — implement in this session with checkpoints

Which approach do you want?
