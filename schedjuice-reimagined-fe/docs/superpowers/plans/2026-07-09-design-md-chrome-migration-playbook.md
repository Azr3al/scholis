# DESIGN.md Chrome Migration — Shared Playbook

> Copied into / referenced by every wave plan. Agents must follow this exactly.
> **Spec:** [`../specs/2026-07-09-design-md-chrome-migration-program-design.md`](../specs/2026-07-09-design-md-chrome-migration-program-design.md)

## Depth (Approach B)

Reskin **page chrome only**: headers, actions, cards, badges, dialogs/sheets wrappers, skeletons, empty states, filters, toolbars.

**Do not modify internals of:**

- `@/components/ui/data-table`
- `@/components/ui/unmanaged-data-table` (any path)
- `@/components/ui/auto-form` and AutoForm field trees

Leaving `import { DataTable } from "@/components/ui/data-table"` / `AutoForm` in a page is **required**, not a failure.

## Import swaps (when a primitive exists)

| Legacy | Replacement |
| --- | --- |
| `@/components/ui/button` | `@/components/primitives` → `Button` (`variant`: `primary` / `secondary` / `ghost` / `danger`; default size `md`) |
| `@/components/ui/input` | `@/components/primitives` → `Input` |
| `@/components/ui/textarea` | `@/components/primitives` → `Textarea` |
| `@/components/ui/checkbox` | `@/components/primitives` → `Checkbox` |
| `@/components/ui/switch` | `@/components/primitives` → `Switch` |
| `@/components/ui/select` | `@/components/primitives` → `Select` (API differs — match existing primitive consumers) |
| `@/components/ui/dialog` | `@/components/primitives` → `Dialog` |
| `@/components/ui/alert-dialog` | `@/components/primitives` → `AlertDialog` |
| `@/components/ui/sheet` | `@/components/primitives` → `Sheet` |
| `@/components/ui/popover` | `@/components/primitives` → `Popover` |
| `@/components/ui/tooltip` | `@/components/primitives` → `Tooltip` |
| `@/components/ui/tabs` | `@/components/primitives` → `Tabs` |
| `@/components/ui/separator` | `@/components/primitives` → `Separator` |
| `@/components/ui/skeleton` | `@/components/primitives` → `Skeleton` |
| `@/components/ui/avatar` | `@/components/primitives` → `Avatar` |
| `@/components/ui/use-toast` / sonner wrappers | Prefer `@/components/primitives` → `useToast` when touching the file |

**No primitive yet (leave or note in PR):** `ui/card`, `ui/badge`, `ui/table` (non-DataTable), `ui/dropdown-menu`, `ui/command`, `ui/calendar`, `ui/form` — prefer hand-composed `div` + tokens over inventing primitives. If you must keep `ui/card` temporarily, do not expand its usage; prefer typography + `border-border` / `bg-surface` stacks per DESIGN.md §9 (no card-stacking).

## Icons

- Replace `lucide-react` icons in **touched** files with `iconoir-react` equivalents.
- Do not introduce new Lucide imports in migrated chrome.
- Exception: do not rewrite Lucide inside deferred `data-table` / `auto-form` packages.

## Tokens & motion

- Prefer semantic classes: `bg-surface`, `text-text-primary`, `text-text-secondary`, `text-text-muted`, `border-border`, `bg-accent`, `text-accent`, `bg-surface-hover`, `bg-surface-skeleton`.
- Avoid raw cool grays / hex in new chrome.
- New section mounts: `motion/react` + recipes from `@/lib/sj/motion.ts` (`crossfade`, `staggerList` / `staggerItem`, `popIn`) and `useReducedMotion()` fallbacks.
- Empty states: prefer `@/components/primitives/empty` (`EmptyState` / `EmptyCopy`) when replacing empty chrome.

## Link + button pattern

Use Next `Link` + `buttonVariants` from primitives (project rule), not `<Button asChild><Link>`.

```tsx
import Link from "next/link";
import { buttonVariants } from "@/components/primitives";
import { cn } from "@/lib/utils";

<Link href="/campuses/create" className={cn(buttonVariants({ variant: "primary", size: "md" }))}>
  Create a campus
</Link>
```

## Out of scope paths

- `src/app/(design)/**`
- `src/app/(internal)/debug/**`
- Demo-artifacts / demo-guide unless Wave 0 confirmed dead

## Grep gates (run on touched files before PR)

```bash
# From repo root — adjust path list to files you changed
rg -n "from [\"']lucide-react[\"']" <touched-files>
# Expect: no new Lucide in chrome files you migrated

rg -n "from [\"']@/components/ui/" <touched-files>
# Expect: only data-table / auto-form / explicitly deferred leftovers noted in PR
```

## Review agent (every wave PR)

Fail closed if any:

1. Touched files outside the wave inventory (unless required import-graph fix called out in PR).
2. Edits inside `ui/data-table`, `ui/auto-form`, or column/schema rewrites.
3. New Lucide or new banned shadcn usage in chrome.
4. Behavior/route changes (except Wave 0 deletions).
5. Missing motion on newly added section wrappers when the playbook requires it.

Max **2** fix rounds; then escalate to human.
