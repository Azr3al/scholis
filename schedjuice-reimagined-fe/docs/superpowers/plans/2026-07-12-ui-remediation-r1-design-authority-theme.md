# R1 — Design Authority, Token Vocabulary, and Theme Convergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Converge split UI guidance and runtime onto `DESIGN.md` as the single design authority, introduce tracked legacy-token aliases and a static gate for new legacy usage, stage `.sj-content-reset` removal without deleting compatibility before consumers migrate, and document the cookie/`data-theme` path as canonical while keeping `next-themes` synchronized until proven unused.

**Architecture:** Documentation is corrected and retired `components.json` is deleted first so agents stop reading shadcn guidance. CSS adds explicit `.sj-root` semantic aliases mapping legacy shadcn class names to DESIGN.md tokens. A consumer inventory script tracks `.sj-content-reset` and legacy-token usage. Theme runtime keeps `applyTheme` + cookie/`data-theme` as source of truth; `use-unified-theme` remains the bridge to `next-themes`. No `.sj-content-reset` deletion in R1.

**Tech Stack:** Tailwind CSS v4 (`@theme` in `src/app/globals.css`), `src/lib/sj/theme.ts`, `next-themes` 0.2.1, Vitest.

**Spec:** [`../specs/2026-07-12-ui-migration-remediation-program-design.md`](../specs/2026-07-12-ui-migration-remediation-program-design.md) §8.1–8.2  
**Planning base SHA:** `05ac447b10966131d4f37a2ba724110c33d66dd4` on `dev`  
**Depends on:** R0 merged (clean lint, typecheck, unit, build, browser harness)  
**Blocks:** R2–R5 and all route cohorts  
**Branch:** `remediate/ui-r1-tokens` from R0 merge commit

---

## Current-state evidence

### Stale design authority

| Artifact | Problem | Evidence |
| --- | --- | --- |
| `docs/AGENT_UI_SYSTEM.md` | Describes shadcn, Radix, Lucide, `src/components/ui/` | Lines 14–27 |
| `README.md` | Points to stale `AGENT_UI_SYSTEM.md` as canonical | Line 3 |
| `components.json` | `iconLibrary: "lucide"`, shadcn schema, no `ui` alias | Full file |
| `AGENTS.md` | No pointer to `DESIGN.md` | Entire file |

### Dual token vocabulary (product code)

Legacy shadcn utilities (`text-muted-foreground`, `bg-card`, `bg-background`, …) appear across **200+** `src/**` files (grep count at planning SHA). DESIGN.md tokens (`text-text-muted`, `bg-surface`, …) are defined under `.sj-root` in `src/app/globals.css:706-1174`.

### `.sj-content-reset` boundary

Defined at `src/app/globals.css:1176-1271`. Consumers at planning SHA:

| File | Lines | Role |
| --- | --- | --- |
| `src/components/shell/app-shell.tsx` | 40, 52, 66 | Wraps banner, main content, chat |

### Dual theme runtime

| Path | Files | Role |
| --- | --- | --- |
| Cookie + `data-theme` + `applyTheme` | `src/lib/sj/theme.ts:39-55`, `src/app/layout.tsx:45`, `src/components/primitives/theme-toggle.tsx` | DESIGN.md canonical |
| `next-themes` `.dark` class | `src/components/theme-provider.tsx`, `src/components/shell/use-unified-theme.ts:22-77`, `src/components/nav/profile-menu.tsx:10` | Legacy bridge for `.sj-content-reset` |

Dark `.sj-content-reset` still keys off `.dark` at `src/app/globals.css:1225-1227` **and** `html[data-theme="dark"]`.

---

## Forbidden scope

Do **not** in R1:

- Delete `.sj-content-reset` or remove its CSS block
- Remove `next-themes` package or `ThemeProvider`
- Mass-replace legacy token classes across route files (that is R6–R14)
- Change overlay z-index (R2)
- Modify `src/components/primitives/**` overlay styling beyond token alias comments

Stop if:

- R0 verification gates fail on your branch
- Token alias change breaks `src/lib/sj/palette.test.ts` contrast tests
- Removing docs content without adding `DESIGN.md` pointer

---

## File structure

```
docs/AGENT_UI_SYSTEM.md                 # Rewrite as DESIGN.md index
README.md                               # Point to DESIGN.md
AGENTS.md                               # Point to DESIGN.md + verification
components.json                         # Delete retired shadcn CLI configuration
src/app/globals.css                     # Token alias layer + sj-content-reset staging comment
src/lib/sj/legacy-token-aliases.ts      # Canonical alias map (tested)
src/lib/sj/legacy-token-aliases.test.ts
scripts/check-legacy-tokens.ts          # Static gate for new legacy classes
scripts/inventory-sj-content-reset.ts    # Consumer report
docs/UI_TOKEN_MIGRATION.md              # Tracked alias + consumer policy
docs/sj-content-reset-inventory.json    # Generated inventory (committed)
docs/superpowers/specs/ui-remediation-exceptions.md # Approved exception registry
```

---

### Task 1: Rewrite agent UI guide as DESIGN.md authority index

**Files:**
- Modify: `docs/AGENT_UI_SYSTEM.md` (full replace)
- Modify: `README.md:1-4`
- Modify: `AGENTS.md` (insert after line 5)
- Create: `docs/superpowers/specs/ui-remediation-exceptions.md`

- [ ] **Step 1: Replace `docs/AGENT_UI_SYSTEM.md`**

```markdown
# Agent UI system (Schedjuice frontend)

**Canonical visual authority:** [`DESIGN.md`](../DESIGN.md) at repository root.

This file is an **index and constraint summary** for agents. It does not define colors, typography, or components independently. When this file and `DESIGN.md` disagree, **`DESIGN.md` wins**.

**Last reviewed:** 2026-07-12 (remediation R1)

---

## Stack (current)

| Layer | Choice |
| --- | --- |
| Framework | Next.js 15 App Router |
| Styling | Tailwind CSS v4 — `src/app/globals.css` |
| Design tokens | DESIGN.md §5–§16; scoped to `.sj-root` |
| Components | `src/components/primitives/` (Base UI + Iconoir) |
| Icons | Iconoir (`iconoir-react`) |
| Tables / forms | `src/components/data-table/`, `src/components/auto-form/` |

**Removed (historical only):** shadcn/ui, Radix primitives, Lucide, `src/components/ui/`. Do not reinstall or reference them in new work.

---

## Token vocabulary

**Use under `.sj-root`:** semantic DESIGN.md utilities including `bg-surface`, `text-text-primary`, `text-text-muted`, `border-border`, and `bg-surface-elevated`.

**Legacy shadcn aliases** (`text-muted-foreground`, `bg-card`, `bg-background`, …) exist temporarily as CSS mappings inside `.sj-root` (see `docs/UI_TOKEN_MIGRATION.md`). Do not add new legacy classes in product code; `npm run check:legacy-tokens` enforces this.

**Banned:** raw palette utilities for product chrome (`bg-blue-500`, `text-gray-600`, …) unless chart/third-party embed exceptions documented in `DESIGN.md`.

---

## Theme

- **Canonical:** `html[data-theme]` (`light` | `dark` | `system`) + `theme` cookie + `localStorage` key `sj-theme` via `src/lib/sj/theme.ts`.
- **Bridge:** `next-themes` keeps `.dark` in sync for `.sj-content-reset` boundaries until Phase N (see `docs/UI_TOKEN_MIGRATION.md`).
- **Do not** add new `useTheme()` from `next-themes` in product code; use `ThemeToggle` / `applyTheme`.

---

## Migration boundary: `.sj-content-reset`

Un-migrated page bodies inside the shell still carry `.sj-content-reset` (`src/components/shell/app-shell.tsx`) to restore Geist + legacy shadcn tokens. **Do not remove** the class or CSS until the route is migrated and recorded in `docs/sj-content-reset-inventory.json`.

---

## Verification

See [`docs/VERIFICATION.md`](VERIFICATION.md) (from R0).
```

- [ ] **Step 2: Update README pointer**

Replace `README.md` lines 1-4 with:

```markdown
# Schedjuice Reimagined

**Design authority:** [`DESIGN.md`](./DESIGN.md)  
**Agent UI index:** [`docs/AGENT_UI_SYSTEM.md`](./docs/AGENT_UI_SYSTEM.md)
```

- [ ] **Step 3: Update AGENTS.md**

After line 5 (`This is the frontend...`), insert:

```markdown

**Design authority:** [`DESIGN.md`](./DESIGN.md) — read before substantive UI work. [`docs/AGENT_UI_SYSTEM.md`](./docs/AGENT_UI_SYSTEM.md) is the agent index; it points to `DESIGN.md` without contradictory guidance.
```

- [ ] **Step 4: Create the exception registry**

```markdown
# UI remediation exceptions

This registry contains narrow, evidence-backed exceptions to `DESIGN.md` and the UI remediation contracts. An exception is not permission to expand legacy usage.

Each entry must name the consumer, temporary dependency or violated contract, reason, containment, removal owner, and verification method. A worker must stop and obtain plan-owner approval before adding an unplanned exception.

No exceptions are approved at R1 foundation completion.
```

- [ ] **Step 5: Commit**

```bash
git add docs/AGENT_UI_SYSTEM.md README.md AGENTS.md docs/superpowers/specs/ui-remediation-exceptions.md
git commit -m "docs(r1): converge agent UI guidance on DESIGN.md authority"
```

---

### Task 2: Remove retired `components.json`

**Files:**
- Delete: `components.json`

- [ ] **Step 1: Confirm no maintained command consumes `components.json`**

```bash
rg "components\\.json|shadcn" package.json package-lock.json pnpm-lock.yaml README.md AGENTS.md docs/AGENT_UI_SYSTEM.md
```

Expected: no output. Task 1 already removed maintained documentation references, and no package script or lockfile invokes shadcn.

- [ ] **Step 2: Delete the stale configuration**

```bash
rm components.json
test ! -e components.json
```

Expected: `test` exits 0.

- [ ] **Step 3: Commit**

```bash
git add components.json
git commit -m "chore(r1): remove retired shadcn components configuration"
```

---

### Task 3: Legacy token alias map (test-first)

**Files:**
- Create: `src/lib/sj/legacy-token-aliases.test.ts`
- Create: `src/lib/sj/legacy-token-aliases.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/sj/legacy-token-aliases.test.ts
import { describe, expect, it } from "vitest";
import {
  LEGACY_TOKEN_ALIASES,
  LEGACY_TOKEN_CLASS_PATTERN,
  isLegacyTokenClass,
} from "./legacy-token-aliases";

describe("LEGACY_TOKEN_ALIASES", () => {
  it("maps muted-foreground to text-text-muted", () => {
    expect(LEGACY_TOKEN_ALIASES["text-muted-foreground"]).toBe("text-text-muted");
  });

  it("maps card surface tokens", () => {
    expect(LEGACY_TOKEN_ALIASES["bg-card"]).toBe("bg-surface-elevated");
    expect(LEGACY_TOKEN_ALIASES["bg-background"]).toBe("bg-surface");
  });

  it("maps destructive to danger", () => {
    expect(LEGACY_TOKEN_ALIASES["bg-destructive"]).toBe("bg-danger");
    expect(LEGACY_TOKEN_ALIASES["text-destructive"]).toBe("text-danger");
  });
});

describe("isLegacyTokenClass", () => {
  it("detects legacy token utilities", () => {
    expect(isLegacyTokenClass("text-muted-foreground")).toBe(true);
    expect(isLegacyTokenClass("bg-surface")).toBe(false);
  });

  it("exposes pattern for static gate", () => {
    expect(LEGACY_TOKEN_CLASS_PATTERN.test("foo text-muted-foreground bar")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm run test:unit -- src/lib/sj/legacy-token-aliases.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement alias map**

```typescript
// src/lib/sj/legacy-token-aliases.ts

/** Temporary shadcn → DESIGN.md mappings. Remove entries when grep count hits zero. */
export const LEGACY_TOKEN_ALIASES: Record<string, string> = {
  "text-foreground": "text-text-primary",
  "text-muted-foreground": "text-text-muted",
  "bg-background": "bg-surface",
  "bg-card": "bg-surface-elevated",
  "text-card-foreground": "text-text-primary",
  "bg-popover": "bg-surface-elevated",
  "text-popover-foreground": "text-text-primary",
  "bg-primary": "bg-accent",
  "text-primary-foreground": "text-accent-foreground",
  "bg-secondary": "bg-surface-hover",
  "text-secondary-foreground": "text-text-secondary",
  "bg-muted": "bg-surface-sunken",
  "bg-accent": "bg-accent",
  "text-accent-foreground": "text-accent-foreground",
  "bg-destructive": "bg-danger",
  "text-destructive": "text-danger",
  "border-border": "border-border",
  "ring-ring": "ring-[var(--ring)]",
};

const LEGACY_NAMES = Object.keys(LEGACY_TOKEN_ALIASES);

export const LEGACY_TOKEN_CLASS_PATTERN = new RegExp(
  `\\b(${LEGACY_NAMES.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
);

export function isLegacyTokenClass(className: string): boolean {
  return className in LEGACY_TOKEN_ALIASES;
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npm run test:unit -- src/lib/sj/legacy-token-aliases.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/sj/legacy-token-aliases.ts src/lib/sj/legacy-token-aliases.test.ts
git commit -m "feat(r1): add tracked legacy token alias map"
```

---

### Task 4: CSS alias layer inside `.sj-root`

**Files:**
- Modify: `src/app/globals.css` (insert after line 1174, before `.sj-content-reset` block at 1176)

- [ ] **Step 1: Add alias utilities**

Insert before the `/* === Content boundary` comment at line 1176:

```css
/* === Legacy shadcn token aliases (R1 migration bridge) ===========================
   Maps retired class names to DESIGN.md semantics inside .sj-root only.
   Source map: src/lib/sj/legacy-token-aliases.ts — do not drift manually. */
@layer utilities {
  .sj-root .text-foreground { color: var(--text-primary); }
  .sj-root .text-muted-foreground { color: var(--text-muted); }
  .sj-root .text-card-foreground { color: var(--text-primary); }
  .sj-root .text-popover-foreground { color: var(--text-primary); }
  .sj-root .text-primary-foreground { color: var(--accent-foreground); }
  .sj-root .text-secondary-foreground { color: var(--text-secondary); }
  .sj-root .text-accent-foreground { color: var(--accent-foreground); }
  .sj-root .text-destructive { color: var(--danger); }
  .sj-root .bg-background { background-color: var(--surface); }
  .sj-root .bg-card { background-color: var(--surface-elevated); }
  .sj-root .bg-popover { background-color: var(--surface-elevated); }
  .sj-root .bg-primary { background-color: var(--accent); }
  .sj-root .bg-secondary { background-color: var(--surface-hover); }
  .sj-root .bg-muted { background-color: var(--surface-sunken); }
  .sj-root .bg-accent { background-color: var(--accent); }
  .sj-root .bg-destructive { background-color: var(--danger); }
}
```

- [ ] **Step 2: Stage `.sj-content-reset` removal comment**

Replace the first line of the content boundary comment at line 1176-1180 with:

```css
/* === Content boundary (App shell) — STAGED REMOVAL (R1) =========================
   Consumers: src/components/shell/app-shell.tsx (lines 40, 52, 66).
   Inventory: docs/sj-content-reset-inventory.json (generated by scripts/inventory-sj-content-reset.ts).
   Removal gate: zero consumers + route cohort sign-off per docs/UI_TOKEN_MIGRATION.md.
   When the new shell wraps the app in .sj-root, un-migrated shadcn pages render
```

- [ ] **Step 3: Run palette contrast tests**

```bash
npm run test:unit -- src/lib/sj/palette.test.ts
```

Expected: PASS (no contrast regressions).

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(r1): add sj-root legacy token CSS aliases and stage content-reset removal"
```

---

### Task 5: Static gate — no new legacy token classes

**Files:**
- Create: `scripts/check-legacy-tokens.ts`
- Modify: `package.json` (add `check:legacy-tokens`)
- Modify: `scripts/verify-all.sh` (insert gate after lint)

- [ ] **Step 1: Write gate script**

```typescript
// scripts/check-legacy-tokens.ts
import fs from "node:fs";
import path from "node:path";
import { LEGACY_TOKEN_CLASS_PATTERN } from "../src/lib/sj/legacy-token-aliases";

const ROOT = path.join(__dirname, "..", "src");
const ALLOWLIST = new Set([
  "src/lib/sj/legacy-token-aliases.ts",
  "src/app/globals.css",
]);

const LEGACY_BASELINE_PATH = path.join(__dirname, "..", "docs/legacy-token-baseline.json");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      walk(full, out);
    } else if (/\.(tsx?|css)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function rel(p: string): string {
  return path.relative(path.join(__dirname, ".."), p).split(path.sep).join("/");
}

function countLegacy(filePath: string): number {
  const content = fs.readFileSync(filePath, "utf8");
  const matches = content.match(new RegExp(LEGACY_TOKEN_CLASS_PATTERN, "g"));
  return matches?.length ?? 0;
}

const files = walk(ROOT);
const counts: Record<string, number> = {};
let total = 0;

for (const file of files) {
  const r = rel(file);
  if (ALLOWLIST.has(r)) continue;
  const n = countLegacy(file);
  if (n > 0) {
    counts[r] = n;
    total += n;
  }
}

if (!fs.existsSync(LEGACY_BASELINE_PATH)) {
  fs.writeFileSync(LEGACY_BASELINE_PATH, JSON.stringify({ total, counts }, null, 2));
  console.log(`Wrote baseline: ${total} legacy token usages across ${Object.keys(counts).length} files`);
  process.exit(0);
}

const baseline = JSON.parse(fs.readFileSync(LEGACY_BASELINE_PATH, "utf8")) as {
  total: number;
  counts: Record<string, number>;
};

const regressions: string[] = [];

for (const [file, count] of Object.entries(counts)) {
  const base = baseline.counts[file] ?? 0;
  if (count > base) {
    regressions.push(`${file}: ${base} → ${count}`);
  }
}

if (total > baseline.total) {
  console.error(`Legacy token total increased: ${baseline.total} → ${total}`);
}

if (regressions.length > 0) {
  console.error("New legacy token usages detected:\n" + regressions.join("\n"));
  process.exit(1);
}

console.log(`Legacy token gate OK (${total} total, baseline ${baseline.total})`);
```

- [ ] **Step 2: Add npm script**

In `package.json`:

```json
"check:legacy-tokens": "npx tsx scripts/check-legacy-tokens.ts"
```

- [ ] **Step 3: Install the script runner**

```bash
npm install --save-dev tsx --legacy-peer-deps
```

- [ ] **Step 4: Generate baseline**

```bash
npm run check:legacy-tokens
```

Expected: writes `docs/legacy-token-baseline.json`.

- [ ] **Step 5: Insert into verify-all.sh after lint**

```bash
npm run check:legacy-tokens
```

- [ ] **Step 6: Commit**

```bash
git add scripts/check-legacy-tokens.ts docs/legacy-token-baseline.json package.json scripts/verify-all.sh
git commit -m "feat(r1): add static gate preventing new legacy token classes"
```

---

### Task 6: `.sj-content-reset` consumer inventory

**Files:**
- Create: `scripts/inventory-sj-content-reset.ts`
- Create: `docs/sj-content-reset-inventory.json`
- Create: `docs/UI_TOKEN_MIGRATION.md`

- [ ] **Step 1: Inventory script**

```typescript
// scripts/inventory-sj-content-reset.ts
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(__dirname, "..", "src");
const PATTERN = /sj-content-reset/g;

function walk(dir: string): Array<{ file: string; line: number; column: number }> {
  const hits: Array<{ file: string; line: number; column: number }> = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      hits.push(...walk(full));
    } else if (/\.(tsx?|css)$/.test(entry.name)) {
      const content = fs.readFileSync(full, "utf8");
      const lines = content.split("\n");
      lines.forEach((line, index) => {
        let match: RegExpExecArray | null;
        const re = new RegExp(PATTERN);
        while ((match = re.exec(line)) !== null) {
          hits.push({
            file: path.relative(path.join(__dirname, ".."), full).split(path.sep).join("/"),
            line: index + 1,
            column: match.index + 1,
          });
        }
      });
    }
  }
  return hits;
}

const consumers = walk(ROOT);
const outPath = path.join(__dirname, "..", "docs/sj-content-reset-inventory.json");
fs.writeFileSync(
  outPath,
  JSON.stringify({ generatedAt: new Date().toISOString(), consumers }, null, 2),
);
console.log(`Wrote ${consumers.length} sj-content-reset references to ${outPath}`);
```

- [ ] **Step 2: Run inventory**

```bash
npx tsx scripts/inventory-sj-content-reset.ts
```

Expected at planning SHA: consumers include `src/components/shell/app-shell.tsx` lines 40, 52, 66 and `src/app/globals.css` definition block.

- [ ] **Step 3: Write migration policy doc**

```markdown
# UI token migration policy (R1)

## Authority

[`DESIGN.md`](../DESIGN.md) is the single visual authority.

## Legacy aliases

| Legacy class | DESIGN.md target | Owner |
| --- | --- | --- |
| `text-muted-foreground` | `text-text-muted` | R1 CSS bridge |
| `bg-background` | `bg-surface` | R1 CSS bridge |
| `bg-card` | `bg-surface-elevated` | R1 CSS bridge |
| `bg-destructive` / `text-destructive` | `bg-danger` / `text-danger` | R1 CSS bridge |

Full map: `src/lib/sj/legacy-token-aliases.ts`.

**Gate:** `npm run check:legacy-tokens` — total usage must not increase vs `docs/legacy-token-baseline.json`.

## `.sj-content-reset` staged removal

1. Route cohort migrates page to `.sj-root` tokens (no reset wrapper).
2. Remove `sj-content-reset` class from that route’s shell insertion point.
3. Regenerate `docs/sj-content-reset-inventory.json`.
4. When inventory lists only `globals.css` definition → schedule CSS deletion in Phase N plan (not R1).

**R1 forbids** deleting the CSS block or shell wrappers.

## Theme convergence

| Layer | Canonical (R1) | Retired when |
| --- | --- | --- |
| `html[data-theme]` + cookie | `applyTheme` in `src/lib/sj/theme.ts` | Never |
| `.dark` on `<html>` | `next-themes` via `use-unified-theme.ts` | Zero `.sj-content-reset` consumers + grep `from "next-themes"` only in bridge files |

New code must not import `useTheme` from `next-themes`.
```

Save as `docs/UI_TOKEN_MIGRATION.md`.

- [ ] **Step 4: Commit**

```bash
git add scripts/inventory-sj-content-reset.ts docs/sj-content-reset-inventory.json docs/UI_TOKEN_MIGRATION.md
git commit -m "docs(r1): inventory sj-content-reset consumers and token migration policy"
```

---

### Task 7: Theme runtime documentation and bridge hardening

**Files:**
- Modify: `src/components/shell/use-unified-theme.ts:22-28` (expand comment)
- Modify: `src/lib/sj/theme.ts` (add `readThemePreference`)
- Create: `src/lib/sj/theme.test.ts`

- [ ] **Step 1: Write failing theme test**

```typescript
// src/lib/sj/theme.test.ts
import { describe, expect, it } from "vitest";
import { normalizeTheme, isThemePreference } from "./theme";

describe("normalizeTheme", () => {
  it("returns system for invalid values", () => {
    expect(normalizeTheme("bogus")).toBe("system");
  });

  it("returns system for JSON org-theme cookie payloads", () => {
    expect(normalizeTheme('{"primary":"#000"}')).toBe("system");
  });

  it("accepts light dark system", () => {
    expect(normalizeTheme("dark")).toBe("dark");
    expect(isThemePreference("light")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test**

```bash
npm run test:unit -- src/lib/sj/theme.test.ts
```

Expected: PASS (functions already exist).

- [ ] **Step 3: Document bridge in `use-unified-theme.ts`**

Replace comment at lines 22-28 with:

```typescript
/**
 * BRIDGE ONLY (Phase N removal): mirrors cookie/`data-theme`/`applyTheme` into
 * next-themes so `.sj-content-reset` dark tokens (`globals.css` lines 1225-1271)
 * stay aligned with `.sj-root`. Do not add new next-themes consumers.
 * Removal criteria: docs/UI_TOKEN_MIGRATION.md — zero sj-content-reset consumers.
 */
```

- [ ] **Step 4: Add explicit read helper to theme.ts (after line 19)**

```typescript
/** Reads the active preference from <html data-theme> when running in browser. */
export function readThemePreference(): ThemePreference {
  if (typeof document === "undefined") return "system";
  return normalizeTheme(document.documentElement.dataset.theme);
}
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/sj/theme.test.ts src/lib/sj/theme.ts src/components/shell/use-unified-theme.ts
git commit -m "docs(r1): document theme bridge and add readThemePreference helper"
```

---

### Task 8: Align `.sj-content-reset` dark with `data-theme` only (non-breaking)

**Files:**
- Modify: `src/app/globals.css:1225-1227`

- [ ] **Step 1: Update dark selector comment**

At lines 1225-1227, ensure both selectors remain (do not remove `.dark` yet):

```css
/* Dark page bodies: keep .dark (next-themes bridge) AND data-theme (canonical). */
.dark .sj-content-reset,
html[data-theme="dark"] .sj-content-reset {
```

Add after line 1227 inside the rule block a comment:

```css
  /* Bridge: delete .dark selector when next-themes removed (UI_TOKEN_MIGRATION.md). */
```

- [ ] **Step 2: Manual theme check**

1. Start `npm run dev`
2. Log in, toggle theme light → dark → system via shell `ThemeToggle`
3. Confirm main content (`#main-content.sj-content-reset`) readable in both themes

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "docs(r1): document dual dark selectors on sj-content-reset"
```

---

### Task 9: Verification gate

- [ ] **Step 1: Run full unit + typecheck + legacy gate**

```bash
npm run verify
```

Expected: all R0 gates pass plus `check:legacy-tokens` exit 0.

- [ ] **Step 2: Confirm no compatibility deleted**

```bash
rg "sj-content-reset" src/components/shell/app-shell.tsx
rg "next-themes" src/components/theme-provider.tsx
```

Expected: matches present (not removed).

- [ ] **Step 3: Confirm the branch is clean**

```bash
git status --short
```

Expected: no output. If files are listed, STOP and assign them to the exact preceding task that owns them before committing.

---

## Manual / browser checks (R1)

| Check | Steps | Pass criteria |
| --- | --- | --- |
| Doc authority | Open `docs/AGENT_UI_SYSTEM.md` | Points to `DESIGN.md`; no shadcn install instructions |
| Legacy alias render | On `/campuses`, inspect element using `text-muted-foreground` inside `.sj-root` | Computed color matches `--text-muted` |
| Theme toggle | Toggle light/dark/system | `html[data-theme]` updates; `.dark` present/absent in sync |
| Content reset | Inspect `#main-content` | Still has `sj-content-reset` class |
| Legacy gate | Introduce `text-muted-foreground` in a new file, run `npm run check:legacy-tokens` | Gate fails with file listed |

---

## R1 completion gate

1. `DESIGN.md` linked from `README.md`, `AGENTS.md`, `docs/AGENT_UI_SYSTEM.md`
2. Retired `components.json` is deleted and no maintained command references shadcn
3. Legacy CSS aliases active under `.sj-root`
4. `npm run check:legacy-tokens` in `verify` script
5. `docs/sj-content-reset-inventory.json` and `docs/UI_TOKEN_MIGRATION.md` committed
6. `.sj-content-reset` **not** deleted; shell wrappers unchanged
7. `next-themes` **not** removed; bridge documented
8. All R0 verification gates still pass

---

## Independent QA prompt (paste-ready)

```
You are an independent QA subagent. Do NOT patch code.

Repository: schedjuice-reimagined-fe
Branch: remediate/ui-r1-tokens
Depends on: R0 merged

Verify R1:

1. Documentation
   - README.md links DESIGN.md
   - docs/AGENT_UI_SYSTEM.md does NOT instruct shadcn/Lucide/components/ui
   - components.json is absent and no package script invokes shadcn

2. Token bridge
   - src/lib/sj/legacy-token-aliases.ts exists with tests passing
   - globals.css contains .sj-root legacy alias utilities before sj-content-reset block
   - npm run check:legacy-tokens exits 0

3. Staged removal (must NOT be deleted)
   - sj-content-reset CSS block still in globals.css (~lines 1181+)
   - app-shell.tsx still applies sj-content-reset on lines 40, 52, 66
   - docs/sj-content-reset-inventory.json lists those consumers

4. Theme
   - applyTheme in src/lib/sj/theme.ts unchanged as canonical path
   - next-themes ThemeProvider still mounted in layout.tsx
   - use-unified-theme.ts documents bridge removal criteria

5. Gates: npm run verify passes

Return PASS/FAIL with file/line evidence.
```

---

**Plan complete and saved to `docs/superpowers/plans/2026-07-12-ui-remediation-r1-design-authority-theme.md`.**
