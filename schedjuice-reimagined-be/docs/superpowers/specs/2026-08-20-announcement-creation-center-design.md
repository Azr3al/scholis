# Announcement Creation Center — Design Spec

**Date:** 2026-08-20  
**Status:** Approved (2026-08-20)  
**Surface:** BE `app_announcement` (unchanged API); admin web + mobile; student read paths unchanged  
**Related:** Existing `POST /api/v1/announcements`, [2026-08-20-parent-complaint-center-design.md](./2026-08-20-parent-complaint-center-design.md) (creation-center pattern)

## Summary

Consolidate **admin announcement creation** into a single **Announcement Creation Center** on web and mobile. Users with `announcement.manage` choose **org-wide** or **per-course** scope in one unified form. Remove all scattered mobile creation entry points (home FAB, course FAB, class top-tabs sheet). On web, replace Content nav **"Org-wide Announcements"** with **"Announcement Center"** — one admin hub with merged org-wide list + create. **Teachers/content managers without `announcement.manage`** keep the inline **course feed composer** for course-scoped announcements and daily lessons only. **Student read surfaces are unchanged.**

## Confirmed decisions

| Topic | Decision |
|-------|----------|
| Center access | **`announcement.manage` only** — scope picker: org-wide or per-course |
| Non-admin create | **Course feed composer stays** on web for MT/AT and `course.manage_content` users (course-scoped only) |
| Org-wide form | **One unified form** — Teams options (`send_to_microsoft`, category/month filters) when `tenant.is_microsoft_on` |
| Daily lessons | **Inline course feed only** — not in Creation Center |
| Mobile entry | **Dedicated full-screen route** — nav button only (no home/course FABs) |
| Web nav | Content → **"Announcement Center"** replaces "Org-wide Announcements" |
| Legacy routes | **Merge admin lists + redirect create URLs** (option B) |
| Backend | **No new endpoints v1** — reuse `POST announcements` |
| Student viewing | **Unchanged** — see Section 5 |
| Worktrees | Matching branch `feat/announcement-creation-center` across BE, FE, mobile at implementation |

---

## Section 1 — Access & scope model

### Who can create where

| Actor | Creation Center | Org-wide create | Per-course via center | Course feed composer |
|-------|-----------------|-----------------|----------------------|----------------------|
| User with `announcement.manage` | Yes (web nav + mobile nav button) | Yes | Yes — pick any visible course | Optional (same API); admins should use center |
| Teacher / content manager **without** `announcement.manage` | No | No | No | Yes — course announcements + daily lessons on assigned/editable courses |
| Everyone else | No | No | No | No |

### Scope picker (Creation Center only)

1. **Org-wide** — omit `course` (null). Push goes to all active users. Optional MS Teams broadcast when tenant Microsoft is on.
2. **Per course** — course selector → `course=<id>`, `post_type=announcement`. Same payload shape as course feed announcement posts.

### Backend rules (unchanged)

Canonical enforcement in `app_announcement/views.py` → `_require_announcement_write`:

- **Org-wide** (`course` null): requires `announcement.manage`
- **Course-scoped**: MT/AT teaching assignment on course **or** `course.manage_content` + `check_course_write`
- **Without `announcement.manage`**: cannot set non-empty `course_filters`, cannot escalate to org-wide on update

Center users always have `announcement.manage`, so org-wide and per-course from center are both allowed server-side. Course picker should list courses the admin can see (existing course search API).

### Post types in center

- **`announcement` only** — title required, no `finished_unit`
- **`daily_lesson`** remains exclusively in course feed composer (web)

---

## Section 2 — Web UX

### Navigation

| Before | After |
|--------|-------|
| Content → "Org-wide Announcements" → `/services/org-wide-announcements` | Content → **"Announcement Center"** → `/content/announcement-center` |

- **Permission gate:** `announcement.manage` (+ `tenant.is_microsoft_on` not required for nav visibility — Teams options are conditional in form)
- Add route-permissions entry for `/content/announcement-center` prefix → `announcement.manage`

### Hub page — `/content/announcement-center`

- **List:** org-wide announcements (`course IS NULL`), infinite scroll — merge behavior from `/announcements` and `/services/org-wide-announcements` (same filter, dedupe query keys to `["announcementList", null]` or new stable key)
- **Primary action:** "Create announcement" → `/content/announcement-center/create`
- Reuse `AnnouncementList` / card components where possible; retire duplicate list pages after redirects land

### Create page — `/content/announcement-center/create`

**Unified form** replacing admin use of:

- `AnnouncementForm` at `/announcements/create`
- `OrgWideAnnouncementForm` at `/services/org-wide-announcements/create`

**Fields & behavior:**

| Field / control | Org-wide | Per course |
|-----------------|----------|------------|
| Scope toggle | Org-wide | Per course + course search/select |
| Title | Required | Required |
| Body | Rich text editor (`teamsSafe: true` when Microsoft on) | Same |
| File attachments | Yes | Yes |
| `send_to_microsoft` | Shown when `tenant.is_microsoft_on` | Shown when Microsoft on (single course) |
| Category filter | Shown for org-wide + Teams | N/A |
| Month type (ALL/FM/HM) | Shown for org-wide + Teams | N/A |
| Confirm dialog | Before org-wide Teams send (reuse org-wide form pattern) | Optional confirm when Teams send checked |

**Submit:** `POST announcements` via `makePostRequest` multipart (same as today). Invalidate `["announcementList", null]`, `["courseFeed", courseId]` when per-course.

**Cancel:** back to `/content/announcement-center`

### Keep unchanged (web)

| Surface | Purpose |
|---------|---------|
| `/courses/[id]` course feed + `CourseFeedComposer` | Read + create for non-`announcement.manage` users; daily lessons + course announcements |
| `/announcements/[id]` | Detail + inline edit (admin) — keep for v1 |
| Push/in-app deep links to announcement detail | Keep working |

### Redirects (legacy → center)

| Legacy URL | Redirect to |
|------------|-------------|
| `/announcements/create` | `/content/announcement-center/create` |
| `/services/org-wide-announcements/create` | `/content/announcement-center/create` |
| `/announcements` (list) | `/content/announcement-center` |
| `/services/org-wide-announcements` | `/content/announcement-center` |

Implement with Next.js `redirect()` in legacy page modules or middleware — prefer page-level redirects for clarity.

### Retire after migration

- `src/app/(internal)/announcements/create/page.tsx` (redirect stub ok)
- `src/app/(internal)/services/org-wide-announcements/create/page.tsx` (redirect stub ok)
- `OrgWideAnnouncementForm` — logic absorbed into shared center form; delete when unused
- Dead code: `announcement-tab.tsx` (already unused)

---

## Section 3 — Mobile UX

### Remove all current creation entry points

| File | Remove |
|------|--------|
| `components/home/home-dashboard.tsx` | FAB + `CreateAnnouncementSheet` on Announcements segment |
| `components/navigation/top-tabs.tsx` | FAB + sheet on Announcements tab |
| `app/(protected)/(tabs)/class/course/[id]/announcement/index.tsx` | FAB + `CreateAnnouncementSheet` |

**Keep read-only:** `AnnouncementsInfiniteList`, detail screens, home announcements panel.

### Add Creation Center screen

| Item | Detail |
|------|--------|
| Route | e.g. `app/(protected)/announcement-center/create.tsx` (exact path in plan) |
| Entry | **Nav button only** — visible when `announcement.manage`; hidden otherwise |
| Layout | Full-screen stack (not bottom sheet) |
| Form | Scope: Org-wide \| Per course; title; plain-text body → HTML (existing helpers); image attachments |
| Org-wide + Teams | When tenant Microsoft on: port org-wide Teams controls from web (`send_to_microsoft`, category, month type) as feasible on mobile |
| Per course | Course picker (search/list of courses admin can access) |
| Submit | `POST announcements` multipart via `buildAnnouncementCreateFormData` (extend for Teams fields) |
| Invalidate | `announcementsInfiniteQueryKey(null)`, `announcementsInfiniteQueryKey(courseId)`, home dashboard announcement queries |

### Nav integration

- Add nav item in app menu / sidebar config (mirror web label **"Announcement Center"** or shorter **"New announcement"** for button — finalize copy in plan)
- **Single entry point** — no duplicate FABs elsewhere

### Mobile i18n

- New keys in `lib/i18n/locales/en.ts`
- Burmese `my.ts`: same English placeholders per project rule

---

## Section 4 — Backend & API

### v1: no new endpoints

Reuse existing:

| Endpoint | Use |
|----------|-----|
| `POST /api/v1/announcements` | Create from center (org-wide or course) |
| `POST /api/v1/announcements/search` | Admin list + course picker search |
| `POST /api/v1/courses/:id/announcement-attachments` | Inline image staging (web rich editor; optional mobile) |
| `POST /api/v1/announcements/:id/resend-to-teams` | Unchanged |

### Optional v1.1 (only if course picker inadequate)

- No dedicated BE work expected — use existing `courses` search with admin visibility

### High-value tests (BE)

Existing suite covers RBAC; add/extend if missing:

- User with `announcement.manage` can POST course-scoped announcement **without** teaching assignment on that course
- User with `announcement.manage` can POST org-wide with `course_filters` when Microsoft on
- User without `announcement.manage` still POST course-scoped via teaching assignment (regression — course feed path)

### High-value tests (FE)

- Scope picker shows both options for `announcement.manage` user
- Org-wide submit omits `course`; per-course submit includes `course`
- Teams controls hidden when `!tenant.is_microsoft_on`
- Legacy create URLs redirect to center create
- Nav item hidden without permission

### High-value tests (mobile)

- Nav create button hidden without `announcement.manage`
- No FAB on home announcements, course list, top-tabs
- Create flow invalidates org-wide and course list queries
- Org-wide vs course payload shape matches BE contract

---

## Section 5 — Student consumption (unchanged)

Creation Center is **admin-only**. Student read paths are **not** moved or removed.

| Scope | Mobile | Web |
|-------|--------|-----|
| **Org-wide** | Home → **Announcements** tab (`HomeAnnouncementsPanel`, `course IS NULL`) | No dedicated student org-wide browse page today (`/announcements` is admin-gated) |
| **Per course** | Class → Course → **Announcements** list + detail | `/courses/[id]` **course feed** |

Removing mobile **create** FABs does **not** affect these read surfaces.

### Known follow-up (out of v1)

- Mobile push for org-wide announcements deep-links to `/(protected)/services/org-wide-announcements`, which **does not exist** on mobile — consider routing to Home → Announcements tab or announcement detail
- Web student org-wide browse page (parity with mobile Home tab) — separate feature

---

## Section 6 — Error handling & edge cases

| Case | Behavior |
|------|----------|
| User without `announcement.manage` opens center URL | 403 / redirect (web middleware); nav hidden (mobile) |
| Org-wide create without permission | BE 403 (unchanged) |
| Per-course create, invalid course id | BE 403/404 |
| Teams send with Microsoft off | Hide controls; do not send `send_to_microsoft` |
| Empty title on announcement | Client + BE validation (unchanged) |
| Teacher without `announcement.manage` | No center access; uses course feed composer on web only |

---

## Out of scope (v1)

- Moving **daily lesson** creation into Creation Center
- Removing **course feed composer** for non-admin teachers
- New backend orchestrator endpoint (`POST /announcement-center`)
- Student-facing org-wide page on web
- Consolidating **edit** flows into center (keep `/announcements/[id]`)
- Mobile bottom sheet create UX (replaced by full screen)
- Retiring `/announcements/[id]` detail routes

---

## Implementation touchpoints (reference)

| Layer | Files / areas |
|-------|----------------|
| BE | `app_announcement/views.py`, `serializers.py` — verify only; optional test additions in `app_announcement/tests/test_rbac_announcement.py` |
| FE hub | New `src/app/(internal)/content/announcement-center/` (page + create) |
| FE form | New shared `announcement-creation-center-form.tsx` (absorb `AnnouncementForm` + `OrgWideAnnouncementForm` logic) |
| FE nav | `src/config/nav-routes.tsx`, `src/config/route-permissions.ts` |
| FE redirects | Legacy `announcements/`, `services/org-wide-announcements/` pages |
| FE unchanged | `src/components/course/feed/course-feed-composer.tsx` |
| Mobile create | New route under `app/(protected)/`; nav config |
| Mobile remove | `home-dashboard.tsx`, `top-tabs.tsx`, `announcement/index.tsx` create UI |
| Mobile i18n | `lib/i18n/locales/en.ts`, `my.ts` |
| Cross-repo branch | `feat/announcement-creation-center` on BE, FE, mobile (worktrees at plan phase) |

---

## Open questions (resolved)

All product questions resolved in brainstorming session 2026-08-20. No TBDs remain for v1 planning.
