# Account Nav, Inline Settings & Image Flicker — Design Spec

> Remove the shell account popover; route profile-photo clicks straight to the user record; fold account settings into the profile record rail as an inline section; reskin settings to DESIGN.md; stop avatar flicker on tab focus.

**Status:** Design approved (brainstorming 2026-06-28). Ready for implementation plan.
**Authority:** [`DESIGN.md`](../../../DESIGN.md) — palette, type, layout §9, primitives §10, banned list §14.
**Predecessors:**
- P2a app shell — `2026-06-21-app-shell-sidebar-design.md`
- P2b user record — `2026-06-21-user-record-inline-design.md`

---

## 1. Context

The app shell footer (`AccountMenu`) opens a popover with Profile, Settings, and Log out. Settings lives on a separate legacy route (`/users/[id]/settings`) using shadcn `Card` layouts. The user record shell already provides a contextual section rail (`RecordSectionRail`) for Overview, Academic, Finance, etc.

Separately, presigned `profile_image` URLs rotate on refetch. React Query’s default `refetchOnWindowFocus: true` causes user queries to refetch when the tab regains focus, swapping avatar URLs and flashing the `Avatar` fallback.

---

## 2. Goals & non-goals

### Goals

1. **Remove account popover** — clicking the shell footer navigates directly to `/users/{id}`.
2. **Inline settings section** — add `settings` to the profile record rail, visible only when `viewer.id === subject.id`.
3. **Settings sub-panes** — `?section=settings&pane=appearance|password` (reuse `pane` param; validated per active section, same as Academic).
4. **Log out in rail** — pinned at the bottom of the record rail on own profile; confirm dialog before logout.
5. **DESIGN.md settings UI** — primitives, `RecordSection` / panel headers, no shadcn Cards, no `AutoForm`.
6. **Redirect legacy route** — `/users/[id]/settings` → `/users/[id]?section=settings&pane=appearance` (map legacy `?appearance` / `?change-password` to `pane=`).
7. **Fix image flicker** — global `refetchOnWindowFocus: false`, preserve stable `profile_image` URL across refetches, harden `Avatar`.

### Non-goals

- Moving org settings (separate spec: `2026-06-28-org-record-settings-design.md`).
- Reskinning unrelated profile sections (Overview, Academic, etc.).
- Backend API changes.
- Adding theme/settings to the global shell (removed with the popover).

---

## 3. Locked decisions

| # | Decision | Choice |
| --- | --- | --- |
| 1 | Settings location | **Inline record section** on `/users/[id]?section=settings` |
| 2 | Sub-navigation | **Reuse `?pane=`** when `section=settings`; panes: `appearance`, `password` |
| 3 | Legacy `/settings` route | **Redirect** (not hard delete — bookmarks and changelog links) |
| 4 | Shell footer | **Whole row is a `Link`** to profile; remove chevron |
| 5 | Log out placement | **Rail footer** (desktop); **bottom of settings content** (mobile) |
| 6 | Settings visibility | `viewer.id === subject.id` only |
| 7 | Image flicker | **F1 + F3** — global focus refetch off + stable URL merge + Avatar hardening |
| 8 | Theme control | **`ThemeToggle` primitive** (Light / Dark / System segmented control) |

---

## 4. Navigation & routing

### 4.1 Shell account footer

Replace `Menu` in `account-menu.tsx` with a `Link` wrapping avatar + name/roles. Works collapsed (avatar only) and expanded. Remove `NavArrowUp` chevron. Retain `border-t` chrome styling.

Logout confirm dialog **moves out** of the shell footer into `RecordSectionRail` (and mobile settings).

### 4.2 Record rail (own profile)

Add to `RecordSectionId`: `"settings"`.

Visibility predicate in `record-sections.ts`:

```ts
visible: ({ subject, viewer }) => subject.id === viewer.id
```

Rail layout when viewing yourself:

```
← Users
[avatar] Name / role

Overview · Academic · Finance · Records · (Points · AI)

Account                    ← group label (text-xs uppercase text-text-muted)
  Settings

[flex-1 spacer]

Log out                    ← danger, Iconoir LogOut, rail footer
```

When viewing another user: no Account group, no Log out.

### 4.2.1 Active URL examples

| Intent | URL |
| --- | --- |
| Profile overview | `/users/42?section=overview` |
| Settings appearance | `/users/42?section=settings&pane=appearance` |
| Change password | `/users/42?section=settings&pane=password` |

### 4.3 Legacy redirect

`src/app/(internal)/users/[id]/settings/page.tsx` becomes a server/client redirect:

- `/users/5/settings` → `/users/5?section=settings&pane=appearance`
- `/users/5/settings?appearance` → `pane=appearance`
- `/users/5/settings?change-password` → `pane=password`

### 4.4 Inbound link updates

Update hrefs pointing at `/users/{id}/settings`:

- `src/components/calendar/calendar-timezone-notice.tsx`
- `src/content/changelog/entries.ts` (appearance settings entry)
- Any remaining references after grep

`profile-menu.tsx` is legacy nav — update if still mounted anywhere; otherwise leave or delete in a follow-up.

---

## 5. Settings content (DESIGN.md)

New `RecordSettings` section component rendered when `section === "settings"`.

### 5.1 Layout

- Wrapper: `div.sj-root.flex.flex-col.gap-8`
- Header: `OrgSectionPanel`-style — `font-serif text-2xl` title “Settings”, muted description
- Sub-nav: `SettingsPaneSwitcher` — same tab pattern as `AcademicPaneSwitcher` (primitives `Tabs`)
- Pane body crossfades via existing `crossfade` motion variant

### 5.2 Appearance pane

Sections using `RecordSection`:

| Block | Controls |
| --- | --- |
| Theme | `ThemeToggle` + `useUnifiedTheme().syncNextThemes` |
| Interface sounds | Primitive `Switch` + `Slider` (volume); reuse sound preference hooks |
| Default view mode | Two radio-style buttons or `Select` primitive — `viewMode.card` / `viewMode.table`; Save button triggers `updateEntity("users", id, { default_view_mode })` |

No PNG theme thumbnails. No nested Cards. No `AutoForm`.

### 5.3 Password pane

Single `RecordSection`: title “Change password”, description, primitive `Button` “Send reset email” calling `password-reset/request` (same mutation as today).

### 5.4 Files

| Action | Path |
| --- | --- |
| Create | `src/components/record/settings/settings-panes.ts` |
| Create | `src/components/record/settings/use-settings-pane.ts` |
| Create | `src/components/record/settings/settings-pane-switcher.tsx` |
| Create | `src/components/record/settings/appearance-pane.tsx` |
| Create | `src/components/record/settings/password-pane.tsx` |
| Create | `src/components/record/sections/record-settings.tsx` |
| Modify | `src/components/record/record-sections.ts` |
| Modify | `src/components/record/record-section-rail.tsx` |
| Modify | `src/app/(internal)/users/[id]/page.tsx` |
| Replace | `src/app/(internal)/users/[id]/settings/page.tsx` (redirect) |
| Delete after port | `src/components/settings/appearance-card.tsx`, `change-password-card.tsx`, `settings-sidebar.tsx` |

---

## 6. Image flicker fix

### 6.1 Global query defaults

In `src/lib/query.ts`, add `refetchOnWindowFocus: false` to default query options. Queries that need focus refresh (announcements, entity-chooser, utility notifications) already set `refetchOnWindowFocus: true` explicitly.

### 6.2 Stable profile image URLs

Create `src/lib/user/profile-image-url.ts`:

```ts
export function normalizeProfileImagePath(url: string | null | undefined): string | null
export function mergeAccountPreservingProfileImage(prev: accountType | undefined, next: accountType): accountType
```

`normalizeProfileImagePath` strips query string and compares pathname/host so rotated presigned URLs for the same S3 object are treated as equal.

Apply merge in:

- `useUser` `setUser` callers after fetch (if added later)
- User profile page `useEffect` that sets local `user` state from query
- `appearance-pane` mutation `onSuccess` when updating account cookie

### 6.3 User profile query

On `getUser${id}` query in `users/[id]/page.tsx`:

- `refetchOnWindowFocus: false`
- `staleTime: 5 * 60 * 1000`

### 6.4 Avatar primitive

In `src/components/primitives/avatar.tsx`:

- Track last successfully loaded normalized path in a ref
- When `src` changes but normalized path matches loaded path, keep rendering previous `src` (no fallback flash)
- Set fallback `delay={0}` when `src` is absent; keep `delay={400}` only for initial load with src

---

## 7. Mobile & edge cases

| Case | Behavior |
| --- | --- |
| Mobile section pills | Include “Settings” when own profile |
| Mobile logout | Danger button + confirm at bottom of `RecordSettings` (rail footer hidden on mobile) |
| Collapsed shell sidebar | Avatar link still navigates to profile |
| Invalid `pane` on settings | Default `appearance` |
| `section=settings` while viewing another user | Redirect to `?section=overview` |
| View-as on own profile | Settings still visible (`viewer.id === subject.id`) |

---

## 8. Acceptance criteria

1. Shell footer click → `/users/{id}` with no popover.
2. Own profile rail shows Account → Settings and bottom Log out with confirm.
3. Settings panes match DESIGN.md (primitives, no shadcn Cards).
4. `/users/{id}/settings` redirects correctly.
5. Tab focus does not flash avatars in shell or profile header.
6. `pnpm exec tsc --noEmit` and existing lint pass.

---

## 9. Changelog

| Date | Change |
| --- | --- |
| 2026-06-28 | Initial spec — brainstorming approved (Approach A + recommended sub-decisions) |
