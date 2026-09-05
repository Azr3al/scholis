# AI Get Course Roster — Design Spec

**Date:** 2026-06-28  
**Status:** Approved  
**Repo:** `schedjuice-reimagined-be`

## 1. Summary

Add **`get_course_roster`**, a purpose-built read tool so the Telegram/web AI
assistant can answer “who teaches / who is enrolled on course X?” in one or two
tool calls instead of looping through workarounds until the iteration cap.

**Problem:** Requests like “Main Teacher and Assistant Teachers of PET 151” fail
with `tool_limit_exceeded` because no existing tool returns roster **names**:

| Existing tool | Gap |
| --- | --- |
| `search_courses` | Finds course; no staff/student names |
| `count_course_roster` | Counts only; no names; no MT/AT split |
| `list_user_courses` | User → courses (wrong direction) |
| `search_users` | Not tied to a course roster |

**Decision:** New tool (Approach 1). Do not expand `count_course_roster` or
`search_courses`.

---

## 2. Locked decisions (brainstorming)

| Topic | Choice |
| --- | --- |
| Scope | Full roster — teachers **and** students |
| RBAC | Same as `count_course_roster` — `user_can_access_course(actor, course)` |
| Students (default) | Active only — exclude `is_dropped_out=True` |
| Students (optional) | `include_dropped_students=true` when user asks for former/all |
| Teachers (default) | Main Teacher and Assistant Teacher only |
| Teachers (optional) | `include_other_staff=true` when user asks for other/non-MT/AT roles |
| Member payload | `compact_user_for_ai` — `id`, `name`, `primary_email`, `profile_url` (frontend profile page URL, not an image) |
| Course payload | `id`, `title`, `code`, `url` via `with_course_link` |

---

## 3. Tool contract

### 3.1 `get_course_roster`

**Use when:** User asks who teaches a course, who is enrolled, or for the roster
of a specific class (e.g. “Main Teacher and Assistant Teachers of PET 151”,
“students in PET 151”).

**Do not use when:** User only wants counts — keep using `count_course_roster`.

**Parameters:**

| Field | Type | Required | Default | Notes |
| --- | --- | --- | --- | --- |
| `course_id` | integer | one of id/query | — | From prior `search_courses` |
| `query` | string | one of id/query | — | Course title or code |
| `include_dropped_students` | boolean | no | `false` | Include withdrawn students with `is_dropped_out: true` |
| `include_other_staff` | boolean | no | `false` | Include `OTHER` seniority teachers in `other_staff` |

Exactly one of `course_id` or `query` is required (same validation as
`count_course_roster`).

**Success response:**

```json
{
  "course": {
    "id": 123,
    "title": "PET 151 Advanced",
    "code": "PET 151",
    "url": "https://school.example.com/courses/123"
  },
  "main_teachers": [
    {
      "id": 10,
      "name": "Tr. Su",
      "primary_email": "su@school.com",
      "profile_url": "https://school.example.com/users/10"
    }
  ],
  "assistant_teachers": [],
  "other_staff": [],
  "students": [
    {
      "id": 501,
      "name": "Student A",
      "primary_email": "a@school.com",
      "profile_url": "https://school.example.com/users/501",
      "is_dropped_out": false
    }
  ],
  "counts": {
    "main_teachers": 1,
    "assistant_teachers": 0,
    "other_staff": 0,
    "students": 18
  }
}
```

- `other_staff` is an empty array when `include_other_staff=false` (teachers
  with `OTHER` seniority are omitted from lists and counts).
- `students[].is_dropped_out` is always present; only `true` rows appear when
  `include_dropped_students=true` (plus active students).
- Empty teacher/student lists are valid — return `ok`, not an error.

**Error responses:** Same vocabulary as sibling tools:

```json
{"error": "permission_denied", "message": "You do not have access to this course."}
{"error": "not_found", "message": "..."}
{"error": "ambiguous", "query": "PET", "candidates": [{"key": "A", ...}]}
{"error": "validation_error", "message": "Provide exactly one of course_id or query."}
```

---

## 4. RBAC

| Gate | Rule |
| --- | --- |
| Course roster lookup | `user_can_access_course(caller, course)` |
| Denied | Structured `permission_denied` — no partial roster |

Same as `count_course_roster`: roster members, course creator, and admins with
appropriate course access see the **full** roster including student names.

---

## 5. Implementation

### 5.1 New file

`app_ai/tools/get_course_roster.py`

### 5.2 Handler flow

1. Validate exactly one of `course_id` / `query`.
2. `resolve_accessible_course(user, course_id, query)` — reuse from
   `app_ai/tools/resolve.py`.
3. On non-`ok` status, return structured error (including `ambiguous` candidates).
4. Query `UserCourse` for the resolved course:
   - Teachers: `assigned_as=TEACHER`, `select_related("user", "assigned_as_role")`
   - Students: `assigned_as=STUDENT`; filter `is_dropped_out=False` unless
     `include_dropped_students`
5. Bucket teachers by `assigned_as_role.seniority`:
   - `MAIN_TEACHER` → `main_teachers`
   - `ASSISTANT_TEACHER` → `assistant_teachers`
   - `OTHER` → `other_staff` when `include_other_staff=true`; else skip
6. Sort each list by `user.name` (case-insensitive).
7. Map members with `compact_user_for_ai(user, org=org)`; append
   `is_dropped_out` on student rows only.
8. Build `counts` from the returned lists (after filtering).
9. Course row: `{id, title, code}` + `with_course_link`.

### 5.3 Registry

Add to `TOOL_REGISTRY` in `app_ai/tools/registry.py`:

- `exposure`: read (default on `Tool` base)
- No feature flag

### 5.4 Prompt guidance

Update `app_ai/prompts.py`:

- Use **`get_course_roster`** when the user asks **who** teaches or is enrolled
  on a specific course.
- Use **`count_course_roster`** only when the user wants **how many**, not names.
- Link formatting for roster members follows existing rules: `[Name](profile_url)`
  plus `(primary_email)` when present.

---

## 6. Testing

New file: `app_ai/tests/test_get_course_roster.py`

| Case | Actor | Expected |
| --- | --- | --- |
| Resolve by query “PET 151” | Admin | MT + AT in correct groups |
| Default students | Admin | Active only; no dropped |
| `include_dropped_students=true` | Admin | Dropped rows with `is_dropped_out: true` |
| Default staff | Admin | OTHER seniority excluded |
| `include_other_staff=true` | Admin | OTHER in `other_staff` |
| Own course roster | Teacher (on roster) | Full roster |
| Other course | Teacher (not on roster) | `permission_denied` |
| Ambiguous course query | Admin | `ambiguous` + letter keys |
| Member shape | Any success | `profile_url` present; uses `compact_user_for_ai` fields |
| Empty roster | Admin | `ok`, zero counts |

Use existing conventions: PostgreSQL, tenant schema, RBAC test helpers from
`sibling count/roster tests`.

---

## 7. Files touched

| File | Change |
| --- | --- |
| `app_ai/tools/get_course_roster.py` | Create |
| `app_ai/tools/registry.py` | Register tool |
| `app_ai/prompts.py` | Prompt guidance |
| `app_ai/tests/test_get_course_roster.py` | Create |

---

## 8. Out of scope (v1)

- Expanding `count_course_roster` or `search_courses` with name lists
- Student codes, alternative names on roster rows
- Pagination (defer unless a course exceeds ~200 members per bucket)
- Per-role student breakdown beyond active/dropped
- Frontend changes

---

## 9. Future extensions

- Truncation flag when roster exceeds a safe limit
- Optional `member_type` filter (teachers-only / students-only) if prompts show
  the model fetching full roster when only teachers were asked
- Align `count_course_roster` MT/AT count breakdown with roster seniority buckets
