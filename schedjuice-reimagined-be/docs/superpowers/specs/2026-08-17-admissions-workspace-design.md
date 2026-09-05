# Admissions workspace — Design Spec

> Turn the Admissions Workspaces card into a real desk: a context rail, people lookup (with attending-class verified payments), and course lookup. Officers get this with `admissions.view` only — not People CRUD or the Finance rail.

**Status:** Design approved (decisions locked), ready for implementation plan.
**Authority:** [`schedjuice-reimagined-fe/DESIGN.md`](../../../schedjuice-reimagined-fe/DESIGN.md). Amends Workspaces (`2026-08-17-workspaces-design.md`: Admissions is no longer coming soon; overlay trigger includes Admissions). Rail chrome follows record-rail headers (`2026-08-17-record-rail-header-design.md`). Tables and copy follow DESIGN.md (admin voice, Latin small-caps headers, 52px rows, tabular numbers, no `uppercase`, no exclamation marks).
**Date:** 2026-08-17
**Repos:** `schedjuice-reimagined-fe`, `schedjuice-reimagined-be`

---

## 1. Problem

Admissions officers need a front-desk lookup: find a person by name, email, or phone; see which classes they are in and whether those classes have a verified payment (with receipt, period, verifier, screenshot); find a course and see dates, time, and the most recent unit taught.

Today that work is scattered. User Hub is a directory with create/import and fat rows. Academic Hub is a card grid for teachers. Verified payments live in Finance. The Admissions Workspaces card is **Coming soon**, and the overlay itself only appears if Finance or Studio is enterable — so an admissions-only officer never sees Workspaces.

Giving officers `user.view_all` / `course.view_all` / `payment.view_all` also gives them People, Courses, and Finance. That is the wrong toolkit.

---

## 2. Goals & non-goals

### Goals

1. **Enterable Admissions workspace** with its own context rail (People, Courses).
2. **`admissions.view` desk bundle** — that capability alone searches people, searches courses, and reads verified attending-class payments (including screenshot URLs). No People create/edit, no Finance rail, no verify/record.
3. **People desk** — same search backend and knobs as User Hub; table of low-risk identity fields; master-detail person panel for attending classes and last verified payment.
4. **Courses desk** — same search backend as Academic Hub (subset of knobs); table of title, dates (`CourseRange`), time, most recent unit. Rows are not links.
5. **Workspaces overlay** — Admissions is enterable when `admissions.view`; the trigger shows if Finance **or** Studio **or** Admissions is enterable.

### Non-goals (explicitly deferred)

- HR workspace (stays Coming soon).
- People CRUD, imports, student registration, profile completeness as a column.
- Linking to `/users/:id` or `/courses/:id` from Admissions (those pages keep their existing permissions; 403 for admissions-only officers).
- Grid / card view, Academic Hub “My classes”, intake/subject/category chips.
- New Admissions **system role** (capability only; assignable on existing roles).
- Default grant to Finance, HR, Teacher, Student, or Consultant.
- School sidebar item for Admissions.
- Widening `POST /users/search`, `POST /courses/search`, or Finance views with `admissions.view`.
- Payment verify, upload, refund, or screenshot write from this desk.
- Burmese chrome copy in v1 — English only; Burmese-safe (no `text-transform: uppercase`, no exclamation marks).

---

## 3. Locked decisions

| # | Decision | Choice |
| --- | --- | --- |
| 1 | Approach | Dedicated workspace + sparse Admissions APIs (not skins of `/users` / `/courses`). |
| 2 | Capability | New `admissions.view`. Desk read bundle. Sensitive. Operational. |
| 3 | Default grant | Founder (`admin`) and School Admin (`manager`) only. Superadmin remains god-mode. |
| 4 | Overlay trigger | Finance **or** Studio **or** Admissions enterable. Zero enterable → no trigger. |
| 5 | Admissions card | Enterable when `admissions.view`. **Omitted** otherwise (Studio pattern, not Coming soon). |
| 6 | HR card | Unchanged: Coming soon whenever the overlay is shown. |
| 7 | Home | `/admissions` = People. |
| 8 | Rail | **People** → `/admissions`. **Courses** → `/admissions/courses`. Both visible whenever the workspace is enterable. |
| 9 | Shell | `useContextRail` sibling of Studio. Compact `WorkspaceLogo` + **Admissions**. Back **Home** → `/`. |
| 10 | People search | Same internals as User Hub (`q`, Staff/Students, include inactive, incomplete, page size 24, sort name). |
| 11 | People default tab | **Students** (User Hub defaults to Staff). |
| 12 | People columns | Name, Email, Phone, Status (Active / Inactive). Name prefers `alternative_name`. |
| 13 | Person panel | Master-detail on the People page. `?person=`. Not `/users/:id`. |
| 14 | Attending | Student enrollments (`assigned_as=STUDENT`) on courses with effective status **active, paused, or planned**. Ended excluded. Paused counts with Active, as Academic Hub does. |
| 15 | Payment row | Last **verified** payment for that user+course (`verified_at`, then id). Date, amount, receipt number (`PaymentReceipt.number`, never payment PK), period (covered-months receipt formatter), verified by (staff name, or **Automatic** when `verified_by` is null), screenshot (Finance lightbox, read-only). |
| 16 | Course search | Same internals as Academic Hub. Knobs: search, status (default Active; Active includes paused), program tabs if `program_count > 1`. |
| 17 | Course columns | Title, Dates (`CourseRange`, one cell), Time (`formatCourseSchedulePattern`), Most recent unit (course-data-sheet `current_unit` / `current_unit_updated_at`). |
| 18 | Course row | Not a link. No course panel. |
| 19 | DESIGN.md | Admin voice. One H1 via `usePageHeader` (serif, like Studio). `PageContainer width="full"`, comfortable (not Finance-dense). Tables: Latin small-caps headers, no header icons, 52px min rows, tabular numbers. Empty states: `EmptyCopy`, no exclamation marks. Person panel is a split region, not a card stack. Status is ink text, not a colored chip. Screenshot control is the thumbnail or the word **View**. Motion tokens + `prefers-reduced-motion`. |
| 20 | Existing hubs | `/users` and `/courses` unchanged. Do not mount `UserHubPage` or Academic Hub inside Admissions. |

---

## 4. User experience

### 4.1 Overlay

Amend Workspaces:

- `isAdmissionsWorkspaceEnterable` ⇔ `canAny(["admissions.view"])`.
- `buildVisibleWorkspaces` returns `[]` only when **none** of Finance, Studio, Admissions are enterable.
- Include Admissions as `enterable` with `homeHref: "/admissions"` when the capability holds; otherwise omit the card.
- HR remains `coming_soon` whenever any enterable workspace exists.

Admissions-only officer: overlay shows Admissions (link) and HR (Coming soon). Click Admissions → `/admissions`, overlay closes, rail mounts. Navigation guard unchanged.

### 4.2 Context rail

```
← Home
  [logo] Admissions

  People      →  /admissions
  Courses     →  /admissions/courses
```

`aria-label`: **Admissions sections**. Mobile: two-link picker like Studio. Find-a-page dock hides on `isAdmissionsRecordRoute` (`/admissions`, `/admissions/courses`). No School sidebar child.

Panel breadcrumb is Parent / Section only (People or Courses). Workspace name lives in the rail identity, not the breadcrumb.

### 4.3 People (`/admissions`)

H1 **People** via `usePageHeader` (no second in-flow title). Toolbar in shell chrome:

- Staff | Students (counts; default **Students**)
- Search placeholder: `Search name, email, phone…`
- Include inactive
- Incomplete
- Pagination (size 24)

No grid/list toggle. No Create / Import.

**Table**

| Name | Email | Phone | Status |
|------|-------|-------|--------|

Selecting a row sets `?person=<id>` and highlights it. The attending query is keyed by that id even if the row is off the current page. Esc or a clear control drops `person`. No `?person=`: panel copy **Select a person**.

Desktop: table dominant, panel beside. Small screens: panel below the table. Panel enter uses existing motion tokens.

**Person panel header:** name, email, phone, Active/Inactive. No photo column, completeness %, NRC, DOB, roles column, or `/users/:id` link.

**Attending table**

| Class | Date | Amount | Receipt | Period | Verified by | Screenshot |
|-------|------|--------|---------|--------|-------------|------------|

One row per attending class. Last verified payment only; unverified ignored. No payment → class still listed, payment cells **—**. Period uses `formatPaymentReceiptBillingPeriod` (covered months, else billing dates). Screenshot: thumbnail opens Finance’s existing lightbox; no upload. Empty attending: **Not attending any active or planned classes.**

### 4.4 Courses (`/admissions/courses`)

H1 **Courses**. Toolbar: search (same placeholder spirit as Academic Hub: title, code, subject, level, section), status **Active / Planned / Ended** (default Active), program tabs only when the tenant has more than one program. No My classes, no secondary chips, no card grid.

**Table**

| Title | Dates | Time | Most recent unit |
|-------|-------|------|------------------|

Dates cell is `CourseRange` (Start {date} → End {date}), not two columns. No intake “differs” footnote. Time is the same weekday + clock the Academic Hub card shows (tenant timezone and `time_display_format`). Unit is `formatCurrentUnitDisplay` (e.g. `8 (3 Aug 2026)`) or **—**. Row is not a link. Page size matches Academic Hub search.

### 4.5 Copy

| Surface | Copy |
| --- | --- |
| Rail identity | Admissions |
| Rail `aria-label` | Admissions sections |
| People H1 | People |
| Courses H1 | Courses |
| Verified by empty | Automatic |
| Missing payment / unit / screenshot | — |
| Search/list errors | Could not load people. / Could not load courses. / Could not load classes. |
| Unknown `?person=` | Person not found |

Admin persona: English, efficient, no decoration, no exclamation marks.

---

## 5. Architecture

### 5.1 Permission

Add to the RBAC catalog:

```text
admissions.view
  label: View admissions
  sentence: use the admissions desk to look up people and courses, including verified class payments
  data_class: Operational
  sensitive: true
```

`DEFAULT_MATRIX`: `admin` and `manager`. Data migration grants those system roles on existing tenants. Do not add to `finance`, `hr`, `teacher`, `student`, `consultant`.

Route gate: `/admissions` prefix `anyOf: ["admissions.view"]`.

This capability does **not** satisfy `user.view`, `user.view_all`, `course.view`, `course.view_all`, `payment.view`, or `payment.view_all` on existing endpoints.

### 5.2 Frontend modules

| Piece | Role |
| --- | --- |
| `src/config/workspaces.ts` | Enterable Admissions; trigger includes it; omit card without capability |
| `src/config/admissions-record-nav.ts` | Two entries. `ADMISSIONS_CONTEXT_PARENT` is `{ label: "People", href: "/admissions" }` (icon-rail active workspace, same pattern as Studio Documents). |
| `src/components/admissions/record/*` | Rail, provider, mobile picker |
| `src/app/(internal)/admissions/` | Layout + People + Courses pages |
| `src/config/route-permissions.ts` | `/admissions` → `admissions.view` |

Reuse `buildHubUserFilterParams` and Academic Hub status/program filter builders on the client. Point them at Admissions URLs, not `/users/search` / `/courses/search`. Do not render User Hub create actions or Academic Hub cards.

### 5.3 Backend

Prefer a small `app_admissions` package with **no models**. Mount at `/api/v1/admissions/`. `required_permissions` all methods: `admissions.view`. Serializers are frozen allowlists; extra `fields` / `expand` are ignored (not merged onto User/Course/Payment serializers).

Internals (do not duplicate search ranking):

- People: `apply_user_search_q_with_meta` + the same role / active / incomplete filters as User Hub.
- Courses: `apply_course_search_q_with_meta` + Academic Hub status/program filters (Active includes paused).
- Unit: same daily-lesson subquery as the course data sheet (`finished_unit` on the latest `daily_lesson` with a unit).
- Payments: latest `UserPayment` **part** for that user+course with `status=VERIFIED` (a multi-course group contributes only the part for this class). Receipt from `PaymentReceipt.number`. `amount` is that part’s `actual_amount` in the existing money JSON shape. Screenshot URL from the same part-or-shared-file rule Finance already uses (`getPaymentScreenshotUrl` / serializer `screenshot`).
- People inactive filter: same quirk as User Hub (`include_inactive` and nonempty `q` both skip the active-only filter). Do not “fix” it here.

### 5.4 API

**`POST /api/v1/admissions/people/search`**

Query/body: same as User Hub list (`page`, `size`, `sorts`, `q`, `include_inactive`, `filter_params`).

Each row:

```
id, name, alternative_name, email, phone_number, is_active
```

**`GET /api/v1/admissions/people/tab-counts`**

Staff and Students counts with the same role filters as User Hub tab counts (active-only).

**`GET /api/v1/admissions/people/:id/attending`**

404 if the user is not in this tenant (do not leak with 403). Body:

```
id, name, alternative_name, email, phone_number, is_active
classes: [
  {
    course_id,
    title,
    last_verified_payment: null | {
      verified_at,
      amount,
      receipt_number,          // PaymentReceipt.number
      covered_months,
      verified_by: null | { id, name },
      screenshot               // URL or null
    }
  }
]
```

**`POST /api/v1/admissions/courses/search`**

Same `q` / status / program / page contract as Academic Hub search.

Each row:

```
id, title, start_date, end_date, status,
weekday_pattern, time_pattern, first_event_time_from, first_event_time_to,
current_unit, current_unit_updated_at
```

Screenshot **writes** stay on Finance endpoints (still `payment.verify` / record). Admissions only **reads** the URL already stored on the payment.

---

## 6. Error handling & empty states

| State | Behavior |
| --- | --- |
| No `admissions.view` | Card omitted; `/admissions` and APIs 403. |
| Admissions-only officer | Overlay shows; `/users` and `/finances` still 403. |
| People search error | **Could not load people.** Panel unchanged if a person is already selected. |
| No people / no match | `EmptyCopy`: **No people** / **No people match.** |
| `?person=` unknown | **Person not found**; drop the query param. |
| Attending error | Identity from the list row may remain; classes area **Could not load classes.** |
| No attending classes | **Not attending any active or planned classes.** |
| Course search error | **Could not load courses.** |
| No courses / no match | `EmptyCopy`: **No courses** / **No courses match.** |
| Extra serializer fields requested | Ignored; frozen allowlist only. |

---

## 7. Testing

High-value only. No “renders People” smoke. No logo screenshots.

**Backend**

- Teacher with `user.view` / `course.view` / `payment.view` (no `admissions.view`) → 403 on all Admissions endpoints.
- Caller with only `admissions.view` → 200 on search and attending.
- People search JSON includes `phone_number` and omits NRC / `profile_completeness`.
- Include-inactive off hides inactive users.
- Attending: planned included, ended excluded, unverified ignored, latest verified wins.
- `verified_by` null is serialized as `null` (UI Automatic).
- `receipt_number` is the receipt entity number, not payment PK.
- Course search: `current_unit` from the latest daily lesson with `finished_unit`; default Active omits ended.

**Frontend**

- `buildVisibleWorkspaces` → `[]` when none of Finance/Studio/Admissions are enterable.
- Admissions-only: Admissions enterable `homeHref: "/admissions"`; HR coming soon; Finance/Studio omitted.
- Without `admissions.view`, Admissions card omitted even if Finance is enterable.
- Overlay click Admissions → `/admissions` and close.
- People page has no Create control.
- Selecting a row calls `admissions/people/:id/attending`, not `users/:id`.
- Course row is not a link.

---

## 8. Out of scope follow-ups

- HR home and rail.
- Click-through to full user/course records from this desk.
- Default `admissions.view` on Finance or Teacher.
- Generic workspace-rail abstraction beyond `useContextRail`.
- Find-a-page indexing of Admissions (not required for v1; rail is the catalog).
