# Org flags: auto-assign creator as MT + course roles toggle

**Status:** draft (awaiting user review)  
**Date:** 2026-07-21  
**Repos:** `schedjuice-reimagined-be`, `schedjuice-reimagined-fe`  
**Surfaces:** `Organization` feature toggles; course create / event sync; teacher roster & assign APIs; `AssignedAsRole` CRUD; org settings UI

## Context

Course create already sets `created_by` and optionally adds the creator to the roster via `assign_creator_as_teacher_if_applicable` (teacher + not admin → `UserCourse` as teacher, **no** MT role, **no** `UserEvent`s). New events later get `UserEvent` rows for **all** roster teachers via `ensure_teacher_userevents_for_events`.

Course roles (`AssignedAsRole`) use seniority `MAIN_TEACHER` | `ASSISTANT_TEACHER` | `OTHER`. Tenants can currently define multiple MT/AT catalog roles. Assignment paths (roster management, assign-events, AI/Telegram `execute_assign_staff`) accept an optional role from the client.

Some tenants want (1) teacher-only creators auto-promoted to MT on the course and all sessions, and (2) a simpler mode where course-role choice is disabled and every teacher assignment is forced to MT — with a hard rule that the catalog has at most one MT and one AT role.

The manual course create form already has “Weekly sessions (optional)” (WD/WE + From/To + custom schedule). No new create-form schedule UI is in scope.

## Goals

1. Add org flag `auto_assign_creator_as_main_teacher` (default `False`).
2. When that flag is on and `course.created_by` has **exactly one** tenant role and it is `teacher`, assign them as **MT** on the course and on **all** course events as events exist / appear.
3. Add org flag `is_course_role_enabled` (default `True`).
4. When that flag is off, all teacher assignment paths force the tenant’s MT role; if none exists, error.
5. At catalog level, enforce at most one `MAIN_TEACHER` and one `ASSISTANT_TEACHER` `AssignedAsRole` per tenant (forward-only).
6. Org settings: reusable help component with plain-language copy + collapsible pseudo-code examples for these two fields (expandable to other fields later).

## Non-goals

- Redesigning or replacing the existing weekly-sessions block on course create.
- Data migration / cleanup of tenants that already have duplicate MT or AT roles.
- Per-course limits (e.g. only one MT *person* per course).
- Extending the tenant cookie with these flags (use `organizations/public` / `useTenant()` as today).

## Decisions

| # | Decision |
| --- | --- |
| 1 | **Approach:** extend existing hooks (`assign_creator_as_teacher_if_applicable`, event userevent sync, shared force-MT resolver) — not a large new orchestration service, not FE-only defaults |
| 2 | **Creator eligibility:** strict — exactly one role, value `teacher` (admins / multi-role skipped) |
| 3 | **Event coverage:** option B — roster MT on create; backfill `UserEvent`s if events already exist; later events via existing “all roster teachers → new events” sync |
| 4 | **Force-MT scope:** all teacher assign paths (roster management, assign-events, `execute_assign_staff`, creator auto-assign) |
| 5 | **Roles disabled UX/API:** hide/ignore role choice; always force sole MT; API overwrites / ignores non-MT role ids |
| 6 | **Catalog uniqueness:** always (independent of `is_course_role_enabled`) — reject second MT or second AT on create/update |
| 7 | **Existing duplicates:** soft — do not migrate; only block *new* seconds |
| 8 | **Org settings copy:** new reusable `OrgSettingHelp` (name flexible) with summary + collapsible pseudo-code; wire these two keys first |
| 9 | **Flag pattern:** same as `is_payment_plan_mandatory` — model field + migration, public + owner serializers, FE Zod schema + profile section |

---

## Architecture

Two booleans on public-schema `Organization`:

| Flag | Default | Responsibility |
| --- | --- | --- |
| `auto_assign_creator_as_main_teacher` | `False` | Opt-in creator → MT on course + all events when eligible |
| `is_course_role_enabled` | `True` | When `False`, force MT on every teacher assignment |

Shared helpers (BE):

1. **Creator eligibility** — user has exactly one tenant role and it is `teacher`.
2. **Resolve MT role** — the `AssignedAsRole` with `seniority=MAIN_TEACHER`; if zero → clear validation error; if multiple (legacy) → prefer deterministic pick (e.g. lowest id) for *read/force* paths, while CRUD still blocks adding another.
3. **Force-MT on assign** — when `is_course_role_enabled` is False (or when auto-assign needs MT), set `assigned_as_role` to resolved MT.
4. **Catalog uniqueness** — on `AssignedAsRole` create/update, reject if another row already has the same MT/AT seniority.

---

## Data flow

### Course create (`CourseSerializer.create`)

1. Set `created_by` from request as today.
2. If `auto_assign_creator_as_main_teacher` **and** creator is eligible:
   - Resolve MT role (400 if missing).
   - Create/update `UserCourse` with `assigned_as=teacher` and `assigned_as_role=MT`.
   - If the course already has events, ensure `UserEvent` rows for this creator on those events (same outcome as staff assign-to-all-sessions).
   - Refresh member counts.
3. Else if legacy path applies (flag off, creator is teacher and not admin): keep today’s roster-only behavior (no MT, no events).
4. Events created in the same or later flows are covered by userevent sync once the creator is on the roster.

### Event create / edit-events

`ensure_teacher_userevents_for_events` already creates `UserEvent` for all roster teachers × new events. Combined with the backfill in step 2 for any pre-existing events, the creator stays on **all** course events.

### Teacher assignment (when `is_course_role_enabled` is False)

Paths: `user-courses/management`, `courses/{id}/assign-events`, `execute_assign_staff`, and any creator auto-assign that assigns a role.

- Ignore client-supplied course role (or overwrite).
- Force resolved MT.
- If no MT role → **400** with a clear message that an MT course role is required.

### `AssignedAsRole` CRUD

On create/update: if seniority is `MAIN_TEACHER` or `ASSISTANT_TEACHER` and another role already has that seniority → **400**. Existing duplicate rows are left as-is until ops cleans them.

### Frontend

- Add both fields to org Zod schema + organization profile section.
- `OrgSettingHelp` under each toggle: short summary + collapsible “How it works” with pseudo-code.
- When `is_course_role_enabled` is false: hide course-role picker on member/assign UIs; assignments still succeed via BE force-MT.

---

## Org settings help component

Reusable component (e.g. `OrgSettingHelp`) for org settings fields:

- **Inputs:** setting key (or explicit title/summary/example props); initially a small copy map for the two new flags.
- **UI:** one-line / short paragraph summary; collapsible “How it works” with monospace / preformatted pseudo-code.
- **Expansion:** later fields add entries to the copy map without one-off markup.

### Copy (initial)

**`auto_assign_creator_as_main_teacher`**

- Summary: When on, a teacher-only creator becomes main teacher on the new course and all of its sessions.
- Pseudo-code:

```
if flag and creator.roles == [teacher]:
  assign creator as MT on course
  assign creator to every course event
```

**`is_course_role_enabled`**

- Summary: When off, every teacher assignment is forced to the tenant’s Main Teacher role (role picker hidden).
- Pseudo-code:

```
if not flag:
  role = tenant.sole_MT_role  # error if missing
  assign(user, course, role=role)
```

---

## Error handling

| Case | Behavior |
| --- | --- |
| Roles disabled and no `MAIN_TEACHER` role | 400 on teacher assign / creator auto-MT |
| Creating/updating a second MT or AT catalog role | 400; existing duplicates untouched |
| Auto-assign on but creator ineligible | Skip auto-assign; course create still succeeds |
| Client sends non-MT role while roles disabled | Overwrite to MT |
| Auto-assign on, eligible creator, but no MT role | 400 on course create (cannot fulfill auto-MT) |

---

## Testing (high-value)

Backend (`--keepdb`):

- Auto-assign eligible teacher → `UserCourse` with MT; after edit-events, `UserEvent` for creator on new events.
- Ineligible (admin, multi-role, non-teacher) → not auto-assigned when flag on.
- Flag off → legacy teacher-not-admin roster-only behavior unchanged.
- Roles disabled: assign with omitted / AT role → stored as MT; missing MT → 400.
- Catalog: second MT or AT role create/update → 400.

Frontend:

- Help component renders for both setting keys (summary + expandable pseudo-code).
- Role picker hidden when `is_course_role_enabled` is false.

Avoid happy-path-only smoke beyond what unlocks the edge cases above.

---

## Implementation sketch (for planning)

### Backend

1. `Organization`: two `BooleanField`s + migration(s); serializers / public payload; demo `ALLOWED_ORG_TOGGLE_KEYS` if applicable.
2. Helpers in `course_scoping` / small shared module: eligibility, resolve MT, force-MT.
3. Extend `assign_creator_as_teacher_if_applicable` (or replace call site) for flag + MT.
4. Wire force-MT into roster management, `TeacherAssignView`, `execute_assign_staff`.
5. Validate uniqueness on `AssignedAsRole` serializer/view.
6. Tests under `app_organization` / `app_course` following payment-plan-mandatory style (toggle org in public schema).

### Frontend

1. `organization.ts` schema + `organization-profile-sections.ts`.
2. `OrgSettingHelp` component + copy map; attach to the two new fields in org settings.
3. Gate role dropdowns on `tenant.is_course_role_enabled`.

---

## Open points resolved in brainstorming

- Create-form schedule UI: **already implemented**; out of scope.
- Event timing: roster on create + existing userevent sync for later events.
- Uniqueness: catalog only, always on, soft for legacy duplicates.
- Force-MT: all assignment paths; hide role UI when disabled.

## Self-review notes

- No TBD/TODO left for required behavior.
- Legacy multi-MT catalog: force-MT **resolve** uses deterministic pick; CRUD blocks growth — explicit above.
- Auto-assign with missing MT → 400 on create (stricter than “skip”) so the flag’s promise is not silently broken.
- Event coverage is explicit for both pre-existing events (backfill at assign) and future events (roster sync).
)
