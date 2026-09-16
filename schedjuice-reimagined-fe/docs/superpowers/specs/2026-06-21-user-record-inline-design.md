# User Record — Contextual Sidebar + Inline Editing (P2b) — Design Spec

> Redesign the user record (`/users/[id]`) into a single inline-editable workspace with a Linear-style contextual sidebar swap, replacing the read-only profile + separate edit page.

**Status:** Design approved (decisions locked), ready for implementation plan.
**Authority:** [`DESIGN.md`](../../../DESIGN.md) is the sole source of truth (palette, type, motion §12, banned list §14). The older "User Record Redesign" context doc is reference only; where it conflicts (Radix, terracotta, data-green-as-accent), DESIGN.md wins.
**Date:** 2026-06-21
**Predecessor:** P2a app shell — `2026-06-21-app-shell-sidebar-design.md` (the `.sj-root` Linear shell this builds on).
**Visual reference:** `/components/mockups/user-record` (clickable sketch built during brainstorming).

---

## 1. Context

Second strangler-fig migration after the app shell (P2a). Today the user record is split across two surfaces, both on shadcn/Radix:

- **`/users/[id]`** (`src/app/(internal)/users/[id]/page.tsx`, ~742 lines) — read-only profile: masthead + horizontal tabs (Courses, Schedule, About, Course history, Assessments, Logs, Payment Info).
- **`/users/[id]/edit`** (`src/app/(internal)/users/[id]/edit/page.tsx`) — a long form (react-hook-form + shadcn `Form`) with blur-autosave for scalars, explicit save for custom-field groups + public profile, plus connectors and a delete zone.

P2b replaces this with **one inline-editable record** in the `.sj-root` design world, and makes the left rail **swap contextually** on entry.

---

## 2. Goals & non-goals

### Goals
1. **Contextual sidebar swap:** entering `/users/[id]` collapses the global rail to its icon rail and reveals a record-scoped **section rail**; leaving restores global nav. Built as a reusable shell capability.
2. **Record redesign:** an identity strip + section IA in the new design language; **Overview** fully redesigned; read-only displays (courses, schedule, course history, assessments, payment-info display) reuse existing components inside the new shell.
3. **Inline editing everywhere:** every editable field edits in place via two commit modes (auto-save vs explicit). **Remove `/users/[id]/edit`.**
4. Preserve all current capabilities: roles & team, payroll/HR/check-in, Zoom, public profile, connectors, delete, destructive actions, per-role field visibility/redaction, field read-only policy.
5. Motion per `DESIGN.md` §12 using `src/lib/sj/motion.ts`.

### Non-goals (explicitly out)
- **Activity / user-log timeline** (and any institutional-memory backend: Fact/Opinion, `supersedes`, retractions). Logs stay on the existing surface; not in the record rail.
- **Hover-cards** for inline avatars and the **photo lightbox** (profile-photo editing is a simple inline action; no lightbox).
- Any **backend** change — existing DRF APIs and payloads only.
- Redesigning the non-Overview **display** components themselves (reused as-is; later passes).
- Nav IA changes outside the record; other routes' chrome (owned by P2a).

---

## 3. Locked decisions

| # | Decision | Choice |
| --- | --- | --- |
| 1 | Record rebuild scope | Overview fully redesigned; non-Overview **displays** reuse existing components |
| 2 | Edit page | **Removed**; all editing folded inline |
| 3 | Editors | **All editable fields rebuilt as new inline-edit surfaces** (incl. dynamic config groups, payroll/HR, connectors, public profile) |
| 4 | Swap model | Hybrid: global icon rail + record section rail (never lose global nav) |
| 5 | Swap integration | Reusable **context-rail slot** on the P2a shell (`useContextRail`) |
| 6 | Destructive actions | `⋯` overflow menu on the identity strip |
| 7 | Primitives/icons/motion | Base UI + `src/components/primitives/*`; Iconoir; `src/lib/sj/motion.ts` |

---

## 4. Section IA (the record rail)

| Section | Contents | Build |
| --- | --- | --- |
| **Overview** | Identity strip; summary metrics; **Profile** (name, communication email, phone; primary email locked); **Personal** (DOB, gender, blood type, address…); **Roles & team**; **Connections** (Microsoft/Telegram) | New inline |
| **Academic** | Courses, Schedule, Course history, Assessments (reuse displays); teacher **Public profile** editor (new inline) | Mixed |
| **Finance** | Payment info (reuse display); Payroll & rates (staff, tenant-flag) | Mixed |
| **Records** | Custom field groups (Documents/Medical/Emergency — access-gated), HR (contract/probation), Check-in times, Zoom ID | New inline |
| **`⋯` menu** | Re-send welcome email, Mark as resigned, Disable user, Delete user | Identity strip |

Sections are visibility/role-aware (a section with no visible content for the viewer is omitted). Student vs staff records show different sections (e.g. payroll/HR only for staff; public profile only for teachers).

---

## 5. The contextual swap

### 5.1 Mechanism — reusable context-rail slot (extends P2a shell)
- Extend `src/components/shell/sidebar-context.tsx`: add `contextRail: ReactNode | null`, `setContextRail`, and `recordMode: boolean` (derived from `contextRail !== null`).
- New hook `useContextRail(node)` (in `src/components/shell/`): sets the rail on mount, clears on unmount.
- `src/components/shell/app-shell.tsx`: when `recordMode`, force the global `SidebarRail` into icon-only presentation and render the registered `contextRail` immediately to its right (desktop). The user can still click any global icon to navigate away (which unmounts the record layout → restores global nav).
- A new nested layout `src/app/(internal)/users/[id]/layout.tsx` builds the section rail and registers it via `useContextRail`.
- **Mobile (<768):** no second rail. The section list renders as an in-content segmented header / the existing mobile drawer hosts the record sections; global drawer nav unchanged.

### 5.2 Motion (`src/lib/sj/motion.ts`)
- Global rail collapse 240→56 with `transition.railMorph`; labels fade at `DURATION.fast`.
- Section rail wipes in with `transition.panelWipe`; its contents (`back`, identity block, section items) use `staggerList` / `staggerItem`.
- Section content swaps use `crossfade`.
- Respect `useReducedMotion()` (opacity-only fallback).

---

## 6. Inline editing model

### 6.1 Commit modes (by field type)

| Field type | Mode | Behavior |
| --- | --- | --- |
| Low-risk scalar (name, phone, DOB, gender, blood type) | **Auto-save on blur** | Optimistic; transient "Saved ✓" (`savedTick`); ~5s undo; inline validation |
| Tags/chips (allergies, labels) | **Auto-save** on add/remove | With undo |
| Multi-line free text (notes, medical notes) | **Explicit Save/Cancel** | Never autosave on keystroke; `Esc` cancels, `Enter` (single-line) saves |
| Grouped cross-field (HR dates, payroll) | **Explicit Save** (group) | Group-level validation before commit |
| Consequential/permissioned (Roles & team, side-effecting) | **Explicit Save + confirm** | Confirm step; never auto-save |
| Identity/login (primary email) | **Locked inline** | Read-only with a lock hint |

This mapping is the default; individual fields may move category if riskier/cheaper than their type implies.

### 6.2 Affordances
- Editable rows reveal a quiet edit hint on hover (desktop) / focus; the row is the click target.
- Validation surfaces **inline on the field**, never as a global toast.
- Explicit-save shows primary `Save` + ghost `Cancel`.

### 6.3 Reuse (don't reinvent)
- Persistence: `updateEntity("users", id, partial)` (`src/app/client-api/utils.ts`); cache key consistent with the record query.
- Autosave plumbing: `src/hooks/use-autosave-form.ts`, `src/components/form/autosave-context.tsx`, `autosave-unload-guard.tsx`, `field-save-indicator.tsx` — reuse/adapt rather than rewrite.
- Schemas: existing zod (`getUserSchema`, `build-config-schema.ts`).
- Dynamic groups: `src/lib/custom-fields/build-form-sections.ts`, `field-renderer.tsx`, and **must honor** `field-policy.ts` (admin-vs-self read-only rules) and `src/helpers/visibility.ts` (`getExcludedColumns` redaction).

---

## 7. Removing `/edit`
- Delete `src/app/(internal)/users/[id]/edit/**` (page, `user-edit-form-inner.tsx`, `loading.tsx`, `assign-courses` stays or moves — verify).
- Repoint all links to `/users/[id]/edit` (masthead "Edit profile", nav, deep links) to the record.
- Remove `/users/[id]/edit` from any route-permission references; verify middleware.
- Connectors (`user-connectors-section.tsx`), delete zone (`delete-zone.tsx`), resign dialog (`user-resign-dialog.tsx`) relocate into the record (Connections / `⋯` menu).
- Editors that were shadcn-form-based are re-implemented on `src/components/primitives/*`.

---

## 8. Access control & data
- Per-section gating stays **server-enforced**; show an "HR & Admin only" indicator on gated sections (e.g. Medical). Drive visible/redacted state from existing `getExcludedColumns` + `field-policy`.
- Same TanStack Query hooks/keys for loading the user; inline saves update the cache optimistically and reconcile on success/error.
- Destructive mutations reuse existing endpoints (disable/enable, resign, welcome email, delete).

---

## 9. Components to build (under `src/components/record/`)

| Component | Purpose |
| --- | --- |
| `users/[id]/layout.tsx` (route) | Loads user; builds + registers the section rail via `useContextRail`; renders section routing |
| `record-section-rail.tsx` | Back affordance + identity block + section list (uses `staggerList`) |
| `identity-strip.tsx` | Avatar, name (Fraunces), email, role pill, `⋯` menu (Menu primitive) |
| `record-overview.tsx` | Summary metrics + Profile/Personal/Roles/Connections |
| `inline-field.tsx` | Auto-save scalar row (optimistic + Saved tick + undo) |
| `inline-text-field.tsx` | Explicit Save/Cancel multi-line |
| `inline-group.tsx` | Explicit group save (cross-field validation) |
| `roles-editor.tsx` | Explicit + confirm roles & team |
| `record-actions-menu.tsx` | Destructive `⋯` actions |
| Section wrappers | `record-academic.tsx`, `record-finance.tsx`, `record-records.tsx` — embed reused displays + inline editors |
| Shell additions | `sidebar-context.tsx` (contextRail), `use-context-rail.ts`, `app-shell.tsx` (render slot) |

---

## 10. Staged implementation (for the plan)
1. **Stage A — Swap + shell:** context-rail slot in shell; `users/[id]/layout.tsx`; section rail; identity strip + `⋯` menu; section routing; read-only displays reused. (No inline editing yet; `/edit` still present.)
2. **Stage B — Overview inline:** `inline-field` / `inline-text-field` / `roles-editor`; Profile + Personal + Roles + Connections; undo + inline validation.
3. **Stage C — Remaining editors + remove `/edit`:** dynamic config groups (field-policy + visibility), payroll/HR/check-in/Zoom, public profile; relocate connectors + delete; delete the `/edit` route and repoint links.

Each stage is independently shippable and reviewable.

---

## 11. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| **Config-driven groups inline** (the heaviest part) — must preserve field-policy + visibility + validation | Reuse `build-form-sections` / `field-renderer` / `field-policy` / `visibility`; Stage C isolates it; port existing tests |
| Autosave correctness (optimistic, undo, races) | Reuse `use-autosave-form` + autosave context; per-field in-flight + reconcile; keep unload guard |
| Removing `/edit` breaks deep links / permissions | Grep all `/edit` references; redirect old route to record; verify middleware + `loading.tsx` |
| Swap fights the P2a shell collapse state | Single source of truth: `recordMode` derived from `contextRail`; record layout owns set/clear on mount/unmount |
| Per-section access leaks sensitive data (Medical) | Server-enforced + `getExcludedColumns`; omit section when fully redacted; indicator when partially gated |
| Mobile has no room for a second rail | Section list folds into content header / existing drawer; no hover-only behavior |
| Scope creep into display redesigns | Displays reused as-is; redesign explicitly deferred |

---

## 12. Acceptance
- Entering/leaving `/users/[id]` swaps rails with the `motion.ts` feel (and reduced-motion fallback); global nav reachable throughout.
- Student vs staff vs teacher records show correct sections; gated sections respect visibility/field-policy (verified as a non-privileged viewer).
- Every field formerly editable on `/edit` is editable inline in its section; auto-save shows Saved + undo; explicit/confirm flows work; validation is inline.
- `/users/[id]/edit` is gone; no dead links; destructive actions work from `⋯`.
- `npm run lint`, `npm run build`, `npm run test:unit` pass (ported custom-field tests stay green).

---

## 13. Open items to finalize in implementation
1. Exact home for **Public profile** (Academic vs Overview) and **Zoom/check-in** (Records vs Finance) — defaults per §4; adjust if a section gets unbalanced.
2. Section routing approach: nested routes (`users/[id]/academic`) vs in-page section state — default to in-page state with the rail as the switch (simpler; no per-section URLs) unless deep-linkable sections are wanted.
3. Whether `assign-courses` (currently under `/edit`) becomes an Academic action or stays a sub-route.
