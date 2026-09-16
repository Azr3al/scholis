# Wave PN — Shadcn / Radix / Lucide Package Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans.

**Goal:** After chrome migration waves **and** T4 + F3 leave zero consumers, remove shadcn/Radix/Lucide (and related dead deps) from the FE package.

**Depends on:** F3 merged **and** chrome program waves complete (or proven zero `ui/*` / Lucide consumers).  
**Branch:** `migrate/ui-pn-packages`  
**Do not run early** — fail closed if grep still finds consumers.

---

## Preflight (must be clean)

```bash
rg -n "from [\"']@/components/ui/" src --glob '!**/ui/**' 
# Investigate any remaining — migrate or delete before PN

rg -n "from [\"']lucide-react[\"']" src
rg -n "@radix-ui/" src package.json
rg -n "components/ui" src/app src/components --glob '!**/components/ui/**'
```

If chrome program still needs `ui/*` for unfinished pages — **stop** and finish chrome / remaining migrations first.

---

## Delete / uninstall candidates (confirm unused)

| Item | Action when unused |
| --- | --- |
| `src/components/ui/**` remaining shadcn modules | Delete file-by-file when zero imports |
| `components.json` | Delete |
| `lucide-react` | `npm uninstall` |
| `@radix-ui/*` packages only used by deleted ui | uninstall |
| `next-themes` if unused | uninstall |
| Other shadcn peer leftovers | uninstall after proof |

**Keep:** `@base-ui/react`, `iconoir-react`, `motion`, TanStack, Zod, RHF, Glide data grid, etc.

---

### Tasks

- [ ] **Task 1:** Preflight greps — paste results in PR.
- [ ] **Task 2:** Delete unused `src/components/ui/*` files in batches with commits.
- [ ] **Task 3:** Uninstall packages; update imports if any stray.
- [ ] **Task 4:** Full `tsc`, `npm run lint`, `npm run test:unit`, production build.
- [ ] **Task 5:** PR `chore(ui): remove shadcn Radix Lucide leftovers`

## Review brief

```
PN: preflight greps clean; packages removed; build/tests green; Base UI + Iconoir retained; DataSheet retained.
```
