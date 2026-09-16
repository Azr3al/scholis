# AI Query Courses Starting — Design Spec

**Date:** 2026-07-07  
**Status:** Approved  
**Repo:** `schedjuice-reimagined-be`  
**Approach:** Hybrid — two tools, shared implementation (Approach C from brainstorming)

## 1. Summary

Add **`query_courses_starting`** so admins can ask *"How many new classes start in July?"*
via Telegram or web AI. The tool returns courses whose **`start_date` falls within the
target calendar month**.

Existing **`query_courses`** keeps **overlap** semantics (courses running during the
month). Both tools share one implementation to avoid logic drift.

Fixes the mismatch where *"new classes in July"* was answered with *"27 classes active
in July"* — overlap + wrong framing.

---

## 2. Problem

| User intent | Current behavior (`query_courses`) | Expected |
| --- | --- | --- |
| "New classes in July" | Overlap filter + says "active" | `start_date` in July |
| "Classes active in July" | Overlap filter | Overlap filter (unchanged) |

**Overlap filter** (today):

```python
qs.filter(start_date__lte=last_day, end_date__gte=first_day)
```

A course Jun 15 – Jul 15 appears in **both** June and July overlap queries.

**Starting filter** (missing from AI tools; exists in analytics only):

```python
qs.filter(start_date__gte=first_day, start_date__lte=last_day)
```

Same course appears in **June starting** only.

---

## 3. Locked decisions

| Topic | Decision |
| --- | --- |
| Architecture | **Hybrid C** — `query_courses_starting` + shared runner; `query_courses` unchanged schema |
| Date semantics (new tool) | `start_date` within `[first_day, last_day]` |
| Date semantics (existing tool) | Overlap — unchanged |
| `course_status` default | `"active"` on both tools; overridable (`planned`, `ended`, `paused`, `all`) |
| Ambiguous queries | "Classes in July" with no new/active cue → **`query_courses`** (overlap) |
| Month / year defaults | Same as `query_courses` — org-local today; `user_stated_year` gate |
| Filters | Category (fuzzy), WD/WE, FM/HM (when enabled), `group_by_category`, `limit` — parity |
| RBAC | Admin-only: `course.view_all` via `require_course_read_breadth` |
| Response shape | Same as `query_courses` + `date_mode` field |
| Channels | Telegram + web (shared `app_ai` stack) |
| Out of scope | `effective_status_q`, frontend changes, analytics dashboard |

---

## 4. Architecture

### 4.1 Shared runner

Refactor `app_ai/tools/query_courses.py`:

```python
DATE_MODE_OVERLAP = "overlap"
DATE_MODE_STARTING = "starting"

def _apply_date_filter(qs, *, first_day: date, last_day: date, date_mode: str):
    if date_mode == DATE_MODE_STARTING:
        return qs.filter(start_date__gte=first_day, start_date__lte=last_day)
    return qs.filter(start_date__lte=last_day, end_date__gte=first_day)

def run_query_courses_filtered(
    args: dict[str, Any], user: User, *, date_mode: str
) -> dict[str, Any]:
    # Existing run_query_courses body; replace hard-coded overlap line with
    # _apply_date_filter(...). Include date_mode in response.
    ...

def run_query_courses(args, user):
    return run_query_courses_filtered(args, user, date_mode=DATE_MODE_OVERLAP)

def run_query_courses_starting(args, user):
    return run_query_courses_filtered(args, user, date_mode=DATE_MODE_STARTING)
```

### 4.2 Tool registrations

**`query_courses`** — update `description` only to clarify overlap / "running during month".
Schema unchanged.

**`query_courses_starting`** — new `Tool` in same file (or `query_courses_starting.py` that
imports shared runner):

```python
QUERY_COURSES_STARTING_TOOL = Tool(
    name="query_courses_starting",
    description=(
        "List or count school-wide courses whose start_date falls within the "
        "given calendar month (new/starting classes). Use when the user asks "
        "about new classes, classes starting or beginning in a month, or courses "
        "that start in a period. Same filters as query_courses. Admin only. "
        "Always include course names when answering counts."
    ),
    parameters=QUERY_COURSES_SCHEMA,
    run=run_query_courses_starting,
)
```

Register in `app_ai/tools/registry.py` adjacent to `QUERY_COURSES_TOOL`.

No `date_mode` parameter exposed to the LLM — tool choice encodes semantics.

---

## 5. Date semantics reference

| Course dates | `query_courses` July | `query_courses_starting` July |
| --- | --- | --- |
| Jun 1 – Dec 31 | Included (overlap) | Excluded |
| Jul 1 – Dec 31 | Included | Included |
| Jun 15 – Jul 15 | Included | Excluded |
| Aug 1 – Aug 31 | Excluded | Excluded |

Month bounds: existing `month_bounds(year, month)` in org calendar (no timezone shift on
date fields — same as today).

---

## 6. Response shape

Identical to `query_courses` success payload, plus:

```python
{
  "count": 5,
  "date_mode": "starting",  # or "overlap" on query_courses
  "month": {
    "year": 2026,
    "month": 7,
    "label": "July 2026",
    "year_source": "default"  # or "user_stated"
  },
  "filters_applied": {
    "date_mode": "starting",
    "course_status": "active",
    "category": {"id": 3, "name": "KET"} | None,
    "course_type": "WD" | None,
    "month_type": "FM" | None,
  },
  "group_by_category": True,
  "groups": [
    {
      "category": {"id": 3, "name": "KET", "sort_order": 1},
      "count": 2,
      "courses": [
        {"course_id": 1, "title": "KET 118 WE", "student_count": 30, "url": "https://..."}
      ]
    }
  ],
  "truncated": False
}
```

Error codes unchanged: `permission_denied`, `not_found`, `ambiguous`, `feature_disabled`,
`validation_error`.

---

## 7. Prompt rules (`app_ai/prompts.py`)

### 7.1 Update `query_courses` guidance

Clarify overlap semantics: courses that **overlap / run during** the calendar month.

### 7.2 Add `query_courses_starting` block

- Use when user says **new**, **starting**, **begin**, **launch** + month/period
- Use `query_courses` when user says **active**, **running during**, **in session**
- Ambiguous ("classes in July" only) → `query_courses`
- Same month/year/`user_stated_year` rules as `query_courses`
- When reporting counts, list linked course titles grouped by category
- Phrase answers using `date_mode` and `month.label` — e.g. *"5 classes starting in
  July 2026"* not *"active in July"*

---

## 8. Testing

File: `app_ai/tests/test_query_courses_starting.py` (mirror `test_query_courses.py` setup).

| Test case | Assertion |
| --- | --- |
| Course `start_date` Jul 1 | In July starting query |
| Course `start_date` Jun 30 | Not in July starting query |
| Spanning Jun 15 – Jul 15 | In June starting only; in both June and July overlap |
| Default `course_status` | `planned` course with July start excluded |
| `course_status: "all"` | Includes planned July starters |
| Category fuzzy resolve | Same as overlap tool |
| FM/HM filter | Filters on `start_date.day` within starting set |
| Non-admin | `permission_denied` |
| Response | `date_mode == "starting"` |

Extend `test_query_courses.py` (optional): assert `date_mode == "overlap"` on existing
responses.

Registry test: `query_courses_starting` present in `TOOL_REGISTRY`.

---

## 9. Files to change

| File | Change |
| --- | --- |
| `app_ai/tools/query_courses.py` | Shared runner, `_apply_date_filter`, `date_mode` in response, new tool |
| `app_ai/tools/registry.py` | Register `QUERY_COURSES_STARTING_TOOL` |
| `app_ai/prompts.py` | Overlap clarification + starting-tool routing rules |
| `app_ai/tests/test_query_courses_starting.py` | New tests |
| `app_ai/tests/test_query_courses.py` | Optional `date_mode` assertion |
| `app_ai/tests/test_tool_registry.py` | Registry entry |

---

## 10. Non-goals

- Merging both semantics into one tool with a `date_filter` LLM parameter
- Changing overlap behavior of `query_courses`
- Replacing stored `Course.status` with `effective_status_q()`
- Student-facing or non-admin scoped results

---

## 11. Success criteria

1. *"How many new KET classes start in July?"* → count + names of courses with
   `start_date` in July 2026 (current year default), default `active` status
2. *"How many classes active in July?"* → unchanged overlap behavior via `query_courses`
3. Spanning-boundary course not double-counted in July starting query
4. Telegram and web both route correctly via shared prompts + registry
