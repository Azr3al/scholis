# AI Count Tools — Design Spec

**Date:** 2026-06-27  
**Status:** Approved  
**Repo:** `schedjuice-reimagined-be`

## 1. Summary

Add three purpose-built Gemini tools (Approach 2) so the Telegram/web AI assistant
can answer count questions while enforcing RBAC at execution time:

1. **`count_organization`** — school-wide staff, student, or course totals
2. **`count_teacher_courses`** — how many courses a teacher is assigned to
3. **`count_course_roster`** — students and/or staff in a specific course

Also fix **`search_users`** to apply `scope_users_for_user` so search and count
behavior stay RBAC-consistent.

No per-user tool filtering at the Gemini layer — same pattern as existing search
tools; permission checks run inside each tool handler.

---

## 2. Locked RBAC decisions

| Query type | Permission required | Denied response |
| --- | --- | --- |
| Org-wide staff count | `user.view_all` or `user.manage_all` | Structured `permission_denied` |
| Org-wide student count | `user.view_all` or `user.manage_all` | Structured `permission_denied` |
| Org-wide course count | `course.view_all` or `course.manage_all` | Structured `permission_denied` |
| Teacher course count | `user.view_all` **or** `course.view_all` (either read breadth) | Structured `permission_denied` |
| Course roster count | `user_can_access_course(caller, course)` | Structured `permission_denied` |

Non-admins must **not** receive scoped substitute totals for org-wide queries
(Choice **B** from brainstorming).

Course roster counts (Choice **B**) are available to any roster member or course
creator who passes `user_can_access_course`.

Teacher course counts (Choice **A**) require admin read breadth — co-enrolled
teachers cannot query each other's course loads.

---

## 3. Tool inventory

### 3.1 `count_organization`

**Use when:** User asks how many staff, students, or courses exist school-wide.

**Parameters:**

| Field | Type | Required | Default | Notes |
| --- | --- | --- | --- | --- |
| `entity` | `"staff"` \| `"students"` \| `"courses"` | yes | — | Which total to count |
| `course_status` | `"active"` \| `"planned"` \| `"ended"` \| `"paused"` \| `"all"` | no | `"active"` | Courses only; ignored for staff/students |
| `include_inactive_users` | boolean | no | `false` | Staff/students only; when false, `is_active=True` |

**Permission gates:**

- `entity=staff|students` → require user read breadth
- `entity=courses` → require course read breadth

**Count logic:**

- **Staff:** `User.objects.filter(is_active=True)` unless `include_inactive_users`,
  then `roles__contained_by=STAFF_ROLES_FOR_SHORTCUTS`
- **Students:** same active filter, `roles__contains=[UserRole.STUDENT]`
- **Courses:** `Course.objects.all()`, filter `status=course_status` unless `all`

**Success response:**

```json
{
  "count": 42,
  "entity": "students",
  "filters_applied": {
    "include_inactive_users": false,
    "course_status": null
  }
}
```

**Error responses:**

```json
{"error": "permission_denied", "message": "Organization-wide student counts require user.view_all."}
```

---

### 3.2 `count_teacher_courses`

**Use when:** User asks how many courses a specific teacher teaches.

**Parameters:**

| Field | Type | Required | Default | Notes |
| --- | --- | --- | --- | --- |
| `user_id` | integer | one of id/query | — | From prior `search_users` |
| `query` | string | one of id/query | — | Name, email, or code lookup |
| `course_status` | enum (same as above) | no | `"active"` | Filter by parent course status |

**Permission:** `user.view_all` **or** `course.view_all`.

**Resolution:**

1. If `user_id`: load active user; verify staff role
2. If `query`: search staff users via `apply_user_search_q_with_meta`, staff role filter
3. 0 matches → `not_found`; >1 → `ambiguous` with up to 5 `{id, name, email}` candidates

**Count logic:**

```python
UserCourse.objects.filter(
    user_id=teacher.id,
    assigned_as=UserCourse.AssignedAs.TEACHER,
    course__status=...,  # unless course_status=all
).count()
```

Admin read breadth → all assignments in tenant. No course scoping needed beyond
tenant schema.

**Success response:**

```json
{
  "count": 5,
  "user": {"id": 12, "name": "Sarah Chen", "email": "sarah@school.com"},
  "course_status": "active"
}
```

---

### 3.3 `count_course_roster`

**Use when:** User asks how many students or teachers are in a course.

**Parameters:**

| Field | Type | Required | Default | Notes |
| --- | --- | --- | --- | --- |
| `course_id` | integer | one of id/query | — | From prior `search_courses` |
| `query` | string | one of id/query | — | Title, code, subject fragment |
| `member_type` | `"students"` \| `"staff"` \| `"all"` | no | `"all"` | Which roster slice |

**Permission:** resolve course via `scope_courses_for_user(caller)`, then
`user_can_access_course(caller, course)`.

**Count logic (live query, not denormalized columns):**

- **Students:** `assigned_as=student`, `is_dropped_out=False`
- **Staff:** `assigned_as=teacher`

When `member_type=all`, return both counts in one response.

**Success response:**

```json
{
  "course": {"id": 99, "title": "Grade 7 Math", "code": "G7M-A"},
  "students": 28,
  "staff": 2,
  "member_type_requested": "all"
}
```

When `member_type=students`, omit `staff` key (and vice versa).

---

## 4. Shared infrastructure

### 4.1 `app_ai/tools/rbac.py`

Thin wrappers over existing RBAC helpers:

```python
def require_user_read_breadth(user) -> dict | None
def require_course_read_breadth(user) -> dict | None
def require_user_or_course_read_breadth(user) -> dict | None
```

Each returns `None` if allowed, or a `permission_denied` dict if not.

Uses `effective_permissions(user)` + `scoping.has_read_breadth(domain, held)`.

### 4.2 `app_ai/tools/resolve.py`

Shared lookup helpers:

- `resolve_staff_user(*, user_id, query, limit=5)` → `ok | not_found | ambiguous`
- `resolve_accessible_course(*, user, course_id, query, limit=5)` → same shape,
  queryset pre-scoped with `scope_courses_for_user`

### 4.3 Registry

Add three tools to `TOOL_REGISTRY` in `app_ai/tools/registry.py`. Total tools: 5.

### 4.4 Prompt update

Extend `PLATFORM_BASE_TEMPLATE` in `app_ai/prompts.py`:

> Use count tools for totals and roster sizes. Use search tools first to resolve
> names to IDs when the user refers to a specific person or course.

---

## 5. `search_users` RBAC fix

Current `run_search_users` queries all active users without scoping.

**Change:** start queryset with `scope_users_for_user(user)` before role/search
filters. Org-wide search remains available to users with `user.view_all`; teachers
see only co-enrolled users + self.

---

## 6. Error handling contract

All count tools return **`dict`** (not list) so Gemini receives a single structured
payload. Error shapes:

| Code | When |
| --- | --- |
| `permission_denied` | RBAC check failed |
| `not_found` | Lookup returned zero matches |
| `ambiguous` | Lookup returned multiple matches |
| `validation_error` | Bad args (handled by existing `validate_args`) |

Never return `count: 0` when the real issue is permission denied.

---

## 7. Testing

New file: `app_ai/tests/test_count_tools.py`

| Case | Actor | Expected |
| --- | --- | --- |
| Org student count | Admin | Positive integer |
| Org student count | Teacher | `permission_denied` |
| Org course count active | Admin | Matches filtered queryset |
| Org course count all statuses | Admin | Includes planned/ended |
| Teacher courses by user_id | Admin | Correct count |
| Teacher courses by query | Admin | Resolves + counts |
| Teacher courses | Teacher | `permission_denied` |
| Course roster on own course | Teacher (roster) | students + staff |
| Course roster other course | Teacher (not roster) | `permission_denied` |
| Ambiguous teacher query | Admin | `ambiguous` + candidates |
| search_users scoping | Teacher | Only co-enrolled users |

Use existing test conventions: PostgreSQL, `xschedjuice` schema, `RBAC_ENFORCE=log_only`.

---

## 8. Out of scope (v1)

- Splitting staff into main vs assistant teacher counts on roster tool
- Per-status teacher assignment counts beyond course status filter
- Group Telegram AI
- Usage dashboard changes
- Frontend changes (tools are backend-only)

---

## 9. Future extensions

- `count_course_roster` main vs assistant breakdown using `assigned_as_role`
- Additional count tools (attendance, payments) following same RBAC pattern
- Per-role tool visibility if registry grows large
