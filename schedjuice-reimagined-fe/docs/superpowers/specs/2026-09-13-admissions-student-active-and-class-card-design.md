# Admissions student Active status and class-card course info — Design Spec

> On the Admissions People desk, a student is Active when they are attending at least one class. Officers can include alumni in search. Each class card shows course facts (latest unit, dates, schedule, main teacher) above the existing payment block.

**Status:** Design approved (decisions locked), ready for implementation plan.
**Authority:** [`schedjuice-reimagined-fe/DESIGN.md`](../../../schedjuice-reimagined-fe/DESIGN.md). Amends Admissions workspace (`2026-08-17-admissions-workspace-design.md` decisions 12, 14, People inactive filter, attending empty copy) and attending payment card (`2026-08-19-admissions-attending-payment-card-design.md` card layout only; payment fields stay).
**Date:** 2026-09-13
**Repos:** `schedjuice-reimagined-fe`, `schedjuice-reimagined-be`

---

## 1. Problem

Admissions People Status is `User.is_active` (account / login). Officers treat “active” as “this student is in a class.” Those diverge: a disabled account can still be enrolled, and an enabled account can have no classes.

The person panel lists class titles and the latest payment, but not the course facts officers need at the desk: latest daily-lesson unit, start–end dates, weekly schedule and time, main teacher name and contact.

Alumni (not currently attending, including never enrolled) are mixed into the default Students list whenever the account is enabled, and there is no way to look up former students as a distinct set.

---

## 2. Goals & non-goals

### Goals

1. Students tab Status is **Active** when the person has at least one attending student membership, else **Alumni**.
2. Default Students list is attending-only. **Include alumni** adds everyone else on the Students role filter (including never enrolled).
3. Staff tab keeps account **Active / Inactive** and **Include inactive**.
4. Class cards add course facts (unit, dates, schedule, MT, MT's contact, course status when not a normal running class) above the existing payment block.
5. Alumni with no attending class still see **ended** classes in the panel (same card shape). Never enrolled → empty copy.

### Non-goals

- Writing or redefining `User.is_active` (login / User Hub / Finance unchanged).
- Changing Finance `student_active_course_count` (that stays effective-status **active** only).
- User Hub Status copy or Include inactive.
- Assistant teachers, room, program, or click-through to `/users/:id` / `/courses/:id`.
- Showing ended classes on a person who still has attending classes.
- Status chips. Payment verify / upload. New Admissions routes or permissions.

---

## 3. Locked decisions

| # | Topic | Choice |
| --- | --- | --- |
| 1 | Approach | Admissions-only derived `is_attending`. Do not overload or write `User.is_active`. |
| 2 | Attending | Student `UserCourse` with `left_at` null on a course whose effective status is **active, paused, or planned**. Teacher memberships never count. |
| 3 | Alumni | Anyone on the Students tab who is not attending — including never enrolled. |
| 4 | Students toggle | **Include alumni** replaces Include inactive. Query `include_alumni`. Name search does **not** sneak alumni in (unlike User Hub’s `q` skipping `is_active`). |
| 5 | Staff toggle | **Include inactive** unchanged (`include_inactive` + `is_active` filter / `q` quirk). |
| 6 | Status copy | Students: **Active / Alumni** from `is_attending`. Staff: **Active / Inactive** from `is_active`. |
| 7 | Students tab count | Attending-only. Does not change when Include alumni is on. Staff count stays account-active-only. |
| 8 | URL | Students: `includeAlumni`. Staff: `includeInactive`. Independent; the other tab’s param is ignored for the current request. |
| 9 | Class set | If any attending classes → those only. Else ended student memberships (`left_at` null, effective status ended). Else empty. |
| 10 | Course fields | Unit (omit row if none), Dates (`CourseRange`), Schedule (Courses-desk weekday + clock), MT name, **MT's contact** (phone), Status only if not `active`. Then existing payment block. |
| 11 | MT | Current `MAIN_TEACHER`, not substitute, `left_at` null. Several → several name/contact pairs, order name then id. No MT → **MT** **—**, omit **MT's contact**. Blank phone → **MT's contact** **—**. |
| 12 | Empty panel | **No classes on record.** |
| 13 | Disabled + attending | Still listed on Students default as **Active**. Students search does not apply `is_active=true`. |
| 14 | Endpoint | Amend `POST .../people/search` and `GET .../people/:id/attending` in place. Still `admissions.view`. Frozen allowlists. |

---

## 4. User experience

### 4.1 People toolbar and table

Students default tab unchanged.

```
[ Staff n ] [ Students n ]
Search name, email, phone…    [ Include alumni ]  [ Incomplete ]
```

Staff shows **Include inactive** instead of **Include alumni**.

| Name | Email | Phone | Status |
|------|-------|-------|--------|

Students Status: **Active** or **Alumni**. Staff: **Active** or **Inactive**. Ink text, no chip. Name cell unchanged (legal name + muted alt).

Students tab count `n` is attending-only. Staff `n` is account-active-only.

### 4.2 Person header

Same identity (name, email, phone). Status follows the **current tab**: Students → Active / Alumni from `is_attending`; Staff → Active / Inactive from `is_active`.

### 4.3 Class card

One card per class in the set from decision 9. Title is the heading. Not a link.

```
FCE Reading and Writing
Unit          8 (3/8/2026)
Dates         Start {date} → End {date}
Schedule      Mon Wed  4:00 – 5:30
MT            Aye Aye
MT's contact  09…
Status        paused
Date          Jul 28th 2026
Amount        —
Receipt       —
Period        July 2026 – March 2027
Notes         …
Status        pending_payment
Uploaded by   Nan Yu Wady Soe
Screenshot    View screenshot
```

- **Unit:** `formatCurrentUnitDisplay` (same as Courses desk). Omit the row when `current_unit` is null.
- **Dates:** `CourseRange` (same as Courses desk).
- **Schedule:** same weekday + clock string as the Courses desk. If that string is empty → **—**.
- **Status** (course): only paused / planned / ended. Do not render when effective status is `active`. Distinct from payment **Status**.
- Payment block: unchanged from `2026-08-19` (including **No payment** when `latest_payment` is null).

Several MTs:

```
MT            Aye Aye
MT's contact  09…
MT            Bo Bo
MT's contact  —
```

### 4.4 Copy

| Surface | Copy |
| --- | --- |
| Students toggle | Include alumni |
| Students toggle `aria-label` | Include alumni |
| Staff toggle | Include inactive |
| Students Status | Active / Alumni |
| Staff Status | Active / Inactive |
| Empty classes | No classes on record. |
| Missing schedule / MT / contact | — (contact row omitted when there is no MT) |

---

## 5. Architecture

### 5.1 `is_attending`

Annotate people search with `Exists`:

- `UserCourse.user_id` = user
- `assigned_as=STUDENT`
- `left_at` is null
- course matches `effective_status_q(active, paused, planned)` (reuse `app_course.course_status`)

Do not use Finance `course_is_effectively_active` (that excludes paused and planned).

### 5.2 People search

`POST /api/v1/admissions/people/search`

Row:

```
id, name, alternative_name, email, phone_number, is_active, is_attending
```

Request:

- Students: `include_alumni=true` when the toggle is on. Never send `filter_params` `is_active=true` on this tab. Never send `include_inactive` for this tab’s filter behavior.
- Staff: existing `include_inactive` and `is_active=true` when `!q && !includeInactive`.

Backend:

- Always annotate `is_attending`.
- If the role filter is the Students tab (`roles` `contained_by` student) and `include_alumni` is not truthy → `filter(is_attending=True)`.
- If the role filter is Staff → do not apply the attending filter; keep today’s account-active behavior.
- Incomplete (`profile_completeness < 100`) unchanged.

Tab counts reuse this search (`size: 1`): Students without `include_alumni` (attending-only); Staff with the existing active-only params.

### 5.3 Attending

`GET /api/v1/admissions/people/:id/attending`

Still 404 if the user is missing (do not leak with 403). Person keys plus `is_attending`.

`classes`:

1. Memberships matching §5.1 (attending). If nonempty, that is the list.
2. Else student memberships with `left_at` null whose effective status is **ended**.
3. Else `[]`.

Each class:

```
course_id, title, status,
start_date, end_date,
weekday_pattern, first_event_time_from, first_event_time_to,
current_unit, current_unit_updated_at,
main_teachers: [{ id, name, phone_number }],
latest_payment: …unchanged from 2026-08-19
```

Reuse `annotate_current_unit`, first-event time annotation, `compute_effective_status`. Prefetch main teachers for the class set in one query (`MAIN_TEACHER`, `is_substitute=false`, `left_at` null). `phone_number` may be null.

Dropped memberships (`left_at` set) never appear.

### 5.4 Frontend units

| Unit | Does |
| --- | --- |
| `use-admissions-people-filters` | `includeAlumni` + existing `includeInactive`. |
| `use-admissions-people` | Students: `include_alumni`, no `is_active` filter. Staff: today’s inactive query. Request `is_attending`. |
| `use-admissions-people-tab-counts` | Students count without `is_active`; attending-only via backend default. Staff unchanged. |
| `admissions-people-toolbar` | Toggle label/aria by tab. |
| `admissions-people-page` | Status accessor by tab. |
| `use-admissions-attending` | New class fields + `is_attending`. |
| `person-attending-panel` | Course `dl` then payment. Reuse Courses-desk formatters (`CourseRange`, `formatCurrentUnitDisplay`, same clock/weekday helpers). |

Do not mount User Hub or Academic Hub. Do not widen Finance or `/users` / `/courses` APIs.

---

## 6. Error handling & empty states

| State | Behavior |
| --- | --- |
| Students, nobody attending, alumni off | **No people** / **No people match.** |
| Alumni on, still nobody | Same. |
| `classes: []` | **No classes on record.** |
| Attending 404 | **Person not found**; drop `?person=`. |
| Attending load error | **Could not load classes.** List identity may remain. |
| `current_unit` null | Unit row omitted. |
| No MT | **MT** **—**; omit **MT's contact**. |
| MT with no phone | **MT's contact** **—**. |
| Empty schedule string | Schedule **—**. |
| No payment | **No payment**. |
| Extra serializer fields | Ignored; frozen allowlist. |

No new permissions. Screenshot writes stay on Finance.

---

## 7. Testing

High-value only. No “renders People” smoke.

**Backend**

- Active / paused / planned student membership, `left_at` null → `is_attending` true; default Students search includes them.
- Ended-only or no memberships → `is_attending` false; hidden until `include_alumni`.
- `left_at` set → not attending, not in class list.
- Disabled account still enrolled → Students default includes them; no `is_active` filter on that tab.
- Staff include-inactive off still hides `is_active=false`; attending annotation does not change Staff membership of the list.
- Students `q` without `include_alumni` does not return alumni.
- Attending: planned included while attending; ended omitted while any attending class exists; alumni-only person gets ended classes.
- `current_unit` from latest daily lesson with `finished_unit`; `main_teachers` include phone; none → `[]`.
- Teacher without `admissions.view` → 403. Unknown person → 404.

**Frontend**

- Students toolbar: **Include alumni**, not Include inactive. Staff keeps Include inactive.
- Students Status Active vs Alumni from `is_attending`; Staff from `is_active`.
- Students list request sends `include_alumni` when on, does not send `is_active=true`.
- Card: unit omitted when null; label **MT's contact**; course Status row absent when `active`; **No classes on record.** when `classes` is empty.

---

## 8. Out of scope follow-ups

- Syncing account `is_active` from enrollment.
- Alumni as a third Staff label.
- Ended classes listed alongside attending classes for current students.
- Assistant teacher or room on the card.
- Click-through from Admissions to full user/course records.
