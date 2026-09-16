# Wave T4 — Delete Legacy Data Table Modules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans.

**Goal:** After T1–T3 leave zero runtime consumers, delete legacy table stack and prove the tree is clean.

**Depends on:** T1, T2, T3 merged.  
**Branch:** `migrate/ui-t4-delete-tables`

---

## Delete list (after import-graph proof)

| Path | Action |
| --- | --- |
| `src/components/ui/data-table.tsx` | Delete |
| `src/components/ui/unmanaged-data-table.tsx` | Delete |
| `src/components/ui/data-table-pagination.tsx` | Delete if unused |
| `src/components/ui/data-table-search.tsx` | Delete if unused |
| `src/components/ui/data-table-view-options.tsx` | Delete if unused |
| `src/components/ui/data-cards.tsx` | Delete if only used by legacy DataTable |
| Dead helpers only referenced by the above | Delete |

**Keep:** `src/components/ui/table.tsx` only if still used outside data-table; prefer migrating stragglers or deleting if solely a shadcn dependency of the deleted stack. `src/components/data-sheet/**` stays.

---

### Tasks

- [ ] **Task 1: Prove zero consumers**

```bash
rg -n "ui/data-table|UnManagedDataTable|data-table-pagination|data-table-search|data-table-view-options|ui/data-cards" src
```

Expected: only the files about to be deleted (or zero). If any page still matches — **stop**, finish that migration first.

- [ ] **Task 2: Delete modules**; remove from any barrel exports.

- [ ] **Step 3: Build / typecheck**

```bash
npx tsc --noEmit -p tsconfig.json
npm run test:unit -- src/components/data-table src/sdk
```

- [ ] **Task 4: Commit + PR** `chore(ui): remove legacy DataTable stack`

## Review brief

```
T4: rg shows zero legacy data-table imports; listed modules deleted; tsc green; DataSheet retained.
```
