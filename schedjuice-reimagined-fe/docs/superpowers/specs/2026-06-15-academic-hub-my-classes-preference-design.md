# Academic Hub — "My classes only" preference — design spec

> **Status:** Approved (implemented 2026-06-15)  
> **Scope:** `schedjuice-reimagined-fe` only (no backend changes)  
> **Builds on:** [2026-05-22-academic-hub-design](2026-05-22-academic-hub-design.md)

---

## 1. Problem

The Academic Hub "My classes only" toggle currently defaults **ON** for every user with the `teacher` role. Admin/manager/superadmin users who also teach land on a filtered view of only their classes, even though their primary job on this page is overseeing the full catalog.

The original Academic Hub spec planned a `localStorage` fallback for this preference when the URL is absent, but it was never implemented — only URL state via `nuqs` exists today, with a bootstrap effect that always sets `my=true` for teachers.

---

## 2. Goals

1. **Admin-first default** — users with admin, manager, or superadmin roles see all courses on first visit (`my=false`).
2. **Teacher-only default unchanged** — users who are teacher-only still default to `my=true`.
3. **Device-local persistence** — after a user manually toggles, save the preference in `localStorage` so it survives long periods and is device-specific.
4. **URL remains shareable** — explicit `?my=` in the URL overrides the saved preference for that visit.

## Non-goals

- Changing toggle visibility (still shown only when user has `teacher` role).
- Changing backend filter logic or `buildHubFilterParams`.
- Cross-device or account-level preference sync.
- Retroactively editing the 2026-05-22 Academic Hub spec.

---

## 3. Decisions log

| Topic | Decision |
| --- | --- |
| Who gets "show all" default | Any user with admin, manager, or superadmin role |
| Teacher-only default | ON (`my=true`) — unchanged |
| Precedence | URL explicit `my` → localStorage → role default |
| localStorage write trigger | Manual toggle only (not bootstrap/role-default effect) |
| Storage key | `academicHub:myClassesOnly:<userId>` |
| Storage value | `"true"` / `"false"` |
| Approach | Dedicated preference module + bootstrap effect in page (approach 1) |

---

## 4. Behavior

### Role defaults

Applied only when the URL has no `my` param **and** localStorage has no saved value for this user.

| User roles | Default `my` |
| --- | --- |
| admin, manager, or superadmin (with or without teacher) | `false` |
| teacher only (no admin/manager/superadmin) | `true` |
| neither | `false` |

Note: users without the teacher role never see the toggle; for them `my=false` is already implicit and has no UI effect.

### Precedence chain

1. **URL explicit** — `?my=1` or `?my=0` present → use URL value; do not read or overwrite localStorage.
2. **localStorage** — URL absent → read saved preference for `userId`; if set, apply it (writes to URL via `setMy`).
3. **Role default** — neither URL nor localStorage → apply table above.

### Persistence rules

- Write to localStorage **only** when the user manually toggles the switch.
- Do **not** write localStorage during the bootstrap/role-default effect — users who never touch the toggle always get the role default on clean URL visits.
- Shared links with `?my=` do not mutate the saved device preference.

### Unchanged

- Toggle visible when user has `teacher` role (regardless of other roles).
- `useHubFilters` remains URL-only via `nuqs`; `isMyExplicit` continues to distinguish "URL absent" from "URL explicitly false".
- Filter bar, toggle component, and search/aggregate param building are unchanged.

---

## 5. Architecture

### New module

`src/lib/academic-hub-my-preference.ts`

| Function | Responsibility |
| --- | --- |
| `getAcademicHubMyClassesOnly(userId: number): boolean \| null` | Read preference; `null` if absent, invalid, or SSR |
| `setAcademicHubMyClassesOnly(userId: number, value: boolean): void` | Persist preference on manual toggle |

Implementation notes:

- Guard `typeof window === "undefined"` → return `null` on read, no-op on write.
- try/catch on read; malformed value → `null`.
- Key: `` `academicHub:myClassesOnly:${userId}` ``

### Modified: `academic-hub-page.tsx`

Replace the current teacher-default `useEffect`:

```ts
function resolveMyDefault(isAdminOrManager: boolean, isTeacher: boolean): boolean {
  if (isAdminOrManager) return false;
  if (isTeacher) return true;
  return false;
}
```

Bootstrap effect (after user loaded):

1. If `isUserLoading` → wait.
2. If `isMyExplicit` → return (URL wins).
3. Read `getAcademicHubMyClassesOnly(user.id)` → if not `null`, `setMy(stored)`.
4. Else `setMy(resolveMyDefault(isAdminOrManager, isTeacher))`.

Wrap `setMy` passed to filter bar (if needed) or handle persistence in toggle `onChange` path:

```ts
const handleSetMy = (value: boolean) => {
  setMy(value);
  if (user?.id) setAcademicHubMyClassesOnly(user.id, value);
};
```

Wire `handleSetMy` through to `AcademicHubFilterBar` (add optional prop or lift from page).

### Unchanged files

- `use-hub-filters.ts`
- `my-only-toggle.tsx`
- `filter-params.ts`

---

## 6. Data flow

```
User opens /courses (no ?my=)
        │
        ▼
  isMyExplicit? ──yes──► use URL value
        │no
        ▼
  localStorage hit? ──yes──► setMy(stored) → URL updated
        │no
        ▼
  role default → setMy(false|true)

User toggles switch
        │
        ▼
  setMy(value) + localStorage.set(value)
        │
        ▼
  URL ?my=0|1 → course search refetches
```

---

## 7. Edge cases

| Case | Behavior |
| --- | --- |
| SSR / no `window` | Read returns `null`; role default applies after hydration |
| Invalid localStorage value | Treat as `null`; fall through to role default |
| User not loaded | Bootstrap waits; courses query already gated on `isUserLoading` |
| Different user on same device | User-scoped key prevents cross-user bleed |
| Admin + teacher | `isAdminOrManager` wins → default OFF |
| User never toggles | No localStorage entry; role default on every clean URL visit |
| Brief bootstrap flash | Acceptable — same as current teacher-default effect |

---

## 8. Testing

### Unit: `academic-hub-my-preference.ts`

- get/set round-trip
- missing key → `null`
- invalid value → `null`
- SSR guard (stub `window` undefined)

### Unit: `resolveMyDefault`

- admin/manager/superadmin → `false`
- teacher-only → `true`
- neither → `false`

### Regression

- Update any test asserting "all teachers default ON" to reflect role-split defaults.

No E2E required for this scope.

---

## 9. Acceptance checks

1. **Admin+teacher, first visit:** `/courses` with no `?my=` and no localStorage → shows all courses; toggle OFF.
2. **Admin+teacher, toggled ON:** toggle ON → localStorage saved → revisit clean URL → toggle ON, filtered view.
3. **Admin+teacher, shared link:** localStorage OFF, open `/courses?my=1` → filtered view; localStorage still OFF after.
4. **Teacher-only, first visit:** toggle ON, filtered view (unchanged behavior).
5. **Teacher-only, toggled OFF:** preference persists across revisits on same device.
6. **Different user, same browser:** each user's preference is independent.

---

## 10. Risks

| Risk | Mitigation |
| --- | --- |
| Bootstrap flash before preference applied | Same as current effect; acceptable for this scope |
| Stale preference after role change | Edge case; user can toggle; no auto-migration needed |
| localStorage blocked (private mode quota) | try/catch on write; URL state still works for session |
