# People field stewardship — Design Spec

**Date:** 2026-08-17  
**Status:** Draft (pending user review)  
**Repos:** `schedjuice-reimagined-fe`, `schedjuice-reimagined-be`  
**Approach:** Code-defined field stewardship gate (not a tenant-editable matrix, not a new RBAC verb)

## 1. Summary

Stop using the school org chart as the write ACL for people identity. A **code-defined allowlist** lets a **student** (self) and a **course teacher** (on behalf of enrolled students) directly update name, contact, profile photo, and ID photo. School admins keep `user.update` for the whole person. Every allowlisted change is a **silent** old → new log on that person’s record. Founders see the rules as a read-only **People data** block on Roles → Policy Overview.

Students rarely use the app, so the practical writer is the class teacher. The primary find surface is **Course → Student Info → Profile**.

## 2. Context

### Current behavior

| Area | Today |
| --- | --- |
| Office writes | `user.update` on Founder / School Admin. `PUT/PATCH /users/{id}` |
| Teacher | `user.view` (connected) only. Cannot mutate identity. Course Student Info already allows ID/award **photo** upload for enrolled students |
| Student self | Hard 403: “Students cannot edit their own profile.” |
| Staff self | Full profile edit without `user.update` (permission check skipped for self) |
| FE edit gate | All-or-nothing `canEditUser` (office or staff-self). `RecordOverview` still renders name/phone autosave for everyone; API 403s teachers |
| Custom fields | `filled_by` user/admin/both — form policy, not live-record stewardship |
| DVR | Campaign “confirm your data”; not a change-request ticket |
| RBAC | Capability + breadth. Explicit non-goal in the matrix spec: resource-scoped grants, durable grant audit |

### Problem

At ~5,000 students the paper chain (student → class teacher → office → edit) is a queue, not quality control. `user.update` as “edit the whole person” forces every spelling fix through the office.

## 3. Goals

1. Students may PATCH their own allowlisted fields.
2. A teacher assigned to a course may PATCH those fields for students **enrolled as students** on a shared course (same connection rule as course student photos).
3. Direct writes (no approval). Last write wins. Silent audit (who, when, old → new).
4. `GET /users/{id}` tells the client what the viewer may write (`user_write_mode` + `writable_fields`).
5. Course Student Info gains a **Profile** tab (default) with searchable inline edit.
6. User record unlocks the same fields per `writable_fields`. Data sheet stays office-only.
7. Policy Overview shows a read-only **People data** school policy (not a new matrix tab).

## 4. Non-goals

- Tenant-editable field policy UI (no Roles editor tab, no Form Designer takeover).
- New RBAC code such as `user.update_connected_profile`.
- Approval / change-request workflow or admin inbox / notifications.
- Parent accounts.
- Homeroom-only restriction (any shared-course teacher, matching photos).
- Custom `filled_by=user` keys (stay on existing custom-field rules).
- Narrowing staff self-edit of non-allowlisted fields.
- Bulk rename, paste-rename, or teacher edits on the student data sheet.
- Identity edits on **Students** (membership CRUD). That page stays enroll/remove; names remain links.
- Award photos, cover image, signature, login `email`, `code`, DOB, gender, NRC/passport, emergency contact, roles, finance.
- Unifying legacy `User.id_photo` with `UserImage` (`id_image`). Both write paths must pass the gate; no backfill.
- Mobile-native client changes (web only). Mobile keeps today’s 403 for student self-edit until a later pass.
- School-wide chronological audit report.

## 5. Locked decisions

| Topic | Choice |
| --- | --- |
| Architecture | Code-defined stewardship gate beside `user.update` |
| Writers | Student self **and** any course teacher on a shared course (on behalf) |
| Connection | Photo rule: actor is course staff on a course where target is `assigned_as=STUDENT`. Not generic co-enrollment (classmates cannot edit each other). Not teacher→teacher |
| Fields | See allowlist below, including ID photo |
| Mode | Direct write; last write wins |
| Audit | Silent log only; look up on the person |
| Policy UI | Read-only People data block **above** the role picker on `/administration/roles` Policy tab |
| Course UX | New Student Info **Profile** tab (default). Photo Gallery unchanged. Students rail unchanged |
| User record | Per-field unlock via `writable_fields`; do **not** broaden `canEditUser` |
| Data sheet | Still `canEditUser` / office-only |
| Partial PATCH | Non-office actor sending any non-allowlisted key → **403 whole request** |

### Allowlist (frozen for v1)

```
name
alternative_name
phone_number
communication_email
house_number
street
township
city
region
country
profile_image
id_photo          # User.id_photo (record header upload)
id_image          # UserImage.image_type=id_image (Photo Gallery / UserImage POST)
```

Treat `id_photo` and `id_image` as the same stewardship class (“ID photo”) in Policy Overview copy. Enforcement is per write path.

**Office-only (unchanged):** login `email`, `code`, `date_of_birth`, `gender`, `nrc_passport`, emergency contact fields, `cover_image`, `user_signature`, roles, `is_active`, finance, custom `filled_by=admin` keys, award images except the existing course-staff award upload (out of scope to change).

## 6. Architecture

```
PUT/PATCH /users/{id}          POST /users/{id}/user-images
User multipart image upload         (id_image / award_image)
        │                                    │
        ▼                                    ▼
   field stewardship gate  ←── STEWARD_FIELD_KEYS (code)
        │
        ├── full: user.update + existing check_user_write
        ├── steward: student self, field in allowlist
        ├── steward: course staff + enrolled student, field in allowlist
        ├── full: staff self (non-student-in-roles), today's behavior
        └── deny
                 │
                 ▼
          audit (see §7)
```

### 6.1 Gate

Module: `app_auth/field_stewardship.py` (name can vary; one module, imported by user write views and UserImage POST).

```
STEWARD_USER_KEYS = frozenset({ name, alternative_name, phone_number,
  communication_email, house_number, street, township, city, region, country,
  profile_image, id_photo })

STEWARD_IMAGE_TYPES = frozenset({ "id_image" })  # UserImage; award_image unchanged
```

**`user_write_mode(actor, target) -> "full" | "steward" | "none"`** (payload-independent; used on GET and PATCH)

1. If actor holds `user.update` **and** `check_user_write` would pass → `"full"`.
2. Else if actor is the target and `STUDENT` is **not** in actor.roles → `"full"` (today’s staff self-edit).
3. Else if actor is the target and `STUDENT` **is** in actor.roles → `"steward"` (student self; also teacher+student hybrids currently blocked on self).
4. Else if `course_staff_may_steward_student(actor, target)` → `"steward"`.
5. Else → `"none"`.

**`course_staff_may_steward_student(actor, target, course=None)`**

Mirror `course_staff_can_upload_student_image` / `user_is_course_staff`:

- Actor is not `User.is_student()` (exactly one role, student).
- Target is enrolled `assigned_as=STUDENT` on the course.
- Actor is course staff on that course (teacher roster row, course `created_by`, or admin-equivalent already used by photo upload).

When `course` is omitted (user record PATCH), true iff **some** such course exists.

Do **not** use `user_is_connected_to_user` (any co-enrollment). That would let classmates through if they ever gained a write.

**PATCH /users/{id}**

- Compute keys in `request.data` that are model/serializer user fields (ignore expand, `fields`, empty).
- `mode = user_write_mode(...)`.
- `"none"` → 403, existing permission error shape (`details`).
- `"steward"` and any key ∉ `STEWARD_USER_KEYS` (including `custom_data`, `roles`, login `email`) → 403, `details` names the disallowed keys. **No partial apply.**
- `"steward"` or `"full"` → existing serializer validation (`name` required / non-empty). Then persist. Then audit changed allowlisted keys.
- Remove the blanket student-self 403 in `UserDetailsView.put`. Student self is steward-only.

`check_permissions` today skips `user.update` for self. Extend that skip **or** replace with: allow the request into `put` when mode would be `steward` or `full`, so teachers without `user.update` are not rejected before the gate.

`check_user_write` must **not** run for `"steward"` (teachers fail it today). Run it only for `"full"` office path. Staff-self `"full"` keeps today’s `check_user_write` (connected-self passes `can_write_object`).

**UserImage POST (`id_image`)**

Allowed when existing global upload permission path passes, **or** existing `course_id` course-staff path passes, **or** new: actor is target (student self) and `image_type=id_image`. Award image rules unchanged. Steward `id_image` writes do not create `UserFieldChange` (the `UserImage` row is the audit).

**Profile / legacy ID photo** on the user record (multipart entity upload onto `profile_image` / `id_photo`) go through the same user PATCH/update path and the same gate.

### 6.2 Response shape (`GET /users/{id}`)

Add two read-only fields on the user serializer (detail GET, including `users/profile` when the subject is self):

| Field | Values |
| --- | --- |
| `user_write_mode` | `full` \| `steward` \| `none` |
| `writable_fields` | `string[]` — always present. When `steward`: the `STEWARD_USER_KEYS` list (including `id_photo`; FE maps ID photo UI to this). When `full` or `none`: `[]` (FE uses `canEditUser` for `full`, locks fields for `none`) |

Do **not** attach `writable_fields` to every list/search hit (N+1). Course Profile tab does not GET each student: if the viewer is course staff on **this** course, treat every enrolled student as `steward` for the allowlist. Backend still enforces per PATCH.

### 6.3 Policy Overview

On `/administration/roles`, Policy tab, **above** the role `<Select>`:

**People data** (same copy for every role; not synthesized from catalog codes):

> Students may update their own full name, alternative name, phone, communication email, address, profile photo, and ID photo.  
> A teacher assigned to a course may update those same fields for students enrolled in that course.  
> People with permission to edit users may update all people fields.  
> These changes are logged on the person’s record. Login email, student code, date of birth, and similar office fields stay office-only.

Do not add a matrix row. Do not put this inside “What this role can do” (that stays capability-synthesized). Export/PDF: include this block once at the top of the Policy Overview export.

## 7. Data model — `UserFieldChange`

New tenant-scoped model in `app_auth` (append-only; no update/delete API).

| Column | Type | Notes |
| --- | --- | --- |
| `user` | FK User, CASCADE | Record mutated |
| `actor` | FK User, SET_NULL, null | Who wrote |
| `field_key` | slugged string | e.g. `name`, `profile_image` |
| `old_value` | TextField, null | Stringified; images = storage key or `(replaced)` |
| `new_value` | TextField, null | Same |
| `source` | `self` \| `connected_teacher` \| `admin` | `admin` = `user.update` path; staff-self on allowlisted keys uses `self` |
| `created_at` | from BaseModel | |

Index `(user, -created_at)`.

**When to insert:** after a successful write, only for keys in `STEWARD_USER_KEYS` whose value actually changed. Office writes on those keys **are** logged (`source=admin`). Office writes on other keys are **not** logged in v1.

**ID `UserImage`:** do not dual-write `UserFieldChange`. History UI merges `UserFieldChange` + `UserImage` where `image_type=id_image`.

**Read:** `GET /users/{id}/field-changes` (paginated). Allowed if the viewer can `check_user_read` **and** (`user_write_mode` is `full` or `steward` **or** viewer is the subject). Unrelated connected **students** (classmates) get 403. Unrelated teachers (no shared course as staff) get 403.

No school-wide list endpoint in v1.

## 8. Frontend

### 8.1 `canEditUser`

**Do not** change its meaning (office or staff-self, full record). Finance, roles, certs, signature, data sheet, public profile keep it.

New: `writableUserFields(subject)` from the detail payload, or `canMutateUserField(subject, key)` for tests. Overview / builtin groups / header media:

- If `canEditUser` → today’s full edit (except login `email` stays locked).
- Else enable input iff `user_write_mode === "steward"` and key ∈ `writable_fields`.
- Cover image stays `canEditProfileMedia` (self or office), not stewardship.

### 8.2 User record

`RecordOverview`: name, communication email, phone already inline — honor `writable_fields`; stop looking editable-then-403.

`RecordRecords` / `InlineBuiltinGroup`: for allowlisted builtins (`alternative_name`, address cluster), use per-key writability instead of a single `canEdit` for those keys only. Other groups still `canEditUser`.

Header: “Update profile photo” / “Update ID photo” when `profile_image` / `id_photo` are writable. Field history control on the overview (sheet).

### 8.3 Course Student Info — Profile tab

**Students page** (`/courses/:id/students`): no identity editors.

**Student Info** (`/courses/:id/student-info`):

| Tab | Role |
| --- | --- |
| **Profile** (new, **default**) | Searchable enrolled list; inline name, alternative name, phone, communication email; address + history in a row sheet |
| Photo Gallery | Unchanged (ID + award) |
| Academic Performance | Unchanged placeholder |

Redirect `/student-info` → `/student-info/profile` (today it goes to `photo-gallery`).

Staff only (`canViewStudentInfoSection` / `!isStudent`). Students never see the rail.

Inline save: `PATCH /users/{id}` with one key (same autosave pattern as `RecordOverview`). Course staff on this course may edit every enrolled student; do not N+1 detail GETs.

```
Student Info
[ Profile ]  Photo Gallery  Academic Performance

Search students…

Name            Alt name      Phone         Comm. email
──────────────  ────────────  ────────────  ────────────────
Aung Aung  ✎    Ko Aung  ✎    09-…     ✎    aung@…      ✎   [History]
```

No bulk edit. Photos stay on Photo Gallery (no second ID uploader on Profile).

History sheet: same component as user record (merged field changes + ID images).

### 8.4 Data sheet

No change. `canEditUser` remains office-only so the sheet is not a class-wide rename tool.

## 9. Error handling

| Status | Condition |
| --- | --- |
| 403 | `user_write_mode` none; steward payload includes a non-allowlisted key; classmate / unrelated teacher; history GET without access |
| 400 | Empty `name`; serializer validation (email format, etc.) |
| 200 | Unchanged values: persist nothing extra, **no** audit row |

FE: 403/400 on inline field uses existing field error UI, not toast-only.

## 10. Testing (high-value)

### Backend

- Teacher **not** on a shared course with the student → 403 on `name`; no `UserFieldChange`.
- Teacher **on** the course, student enrolled → 200; audit `source=connected_teacher`, old → new.
- Same teacher sends `name` + `code` → 403; `code` and `name` unchanged.
- Student self `name` → 200, `source=self`; student PATCH classmate → 403.
- Student self login `email` or `code` → 403.
- Office `user.update` still PATCHes `code` / login `email`.
- Office change of `name` writes `UserFieldChange` with `source=admin`.
- Identical `name` PATCH → 200, zero new audit rows.
- History GET: connected teacher 200; unrelated teacher 403; classmate 403.
- Student self `POST` `id_image` without `user_image.upload.id_image` → 200; award image without permission still 403.
- Staff self (no student role) still full-edits non-allowlisted profile fields (regression).

### Frontend (Vitest)

- Student Info Profile tab absent for student role; present for teacher.
- Overview name input enabled when `user_write_mode=steward` and `name` in `writable_fields`; login email stays locked.
- `canEditUser` still false for teacher viewing a student (data sheet / finance unchanged).
- Policy Overview renders the People data block without selecting a role’s codes.

## 11. Future work (post-v1)

- Tenant-editable field table (fourth Roles tab) if schools must loosen `name` themselves.
- Fold builtin stewardship into Form Designer `filled_by` (different meaning today).
- Emergency contact, DOB, preferred-vs-legal name split.
- Parent actors.
- Mobile student/teacher identity writes.
- School-wide audit report; notify on `name` / ID photo.
- Custom field keys in the same gate.
- Teacher identity edits on the Students membership table.

## Related specs

- `docs/superpowers/specs/2026-06-16-rbac-permission-matrix-design.md` — capability vs breadth; `user.update`
- `docs/superpowers/specs/2026-08-12-course-student-info-design.md` — course staff photo connection; Student Info vs Students split
- `docs/superpowers/specs/2026-08-06-user-image-design.md` — `UserImage` history
- `docs/superpowers/specs/2026-07-18-data-verification-request-upgrade-design.md` — DVR remains the completeness campaign, not this write path
