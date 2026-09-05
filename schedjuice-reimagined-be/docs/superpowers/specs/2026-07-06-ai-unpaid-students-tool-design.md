# AI Unpaid Students Tool — Design Spec

**Date:** 2026-07-06  
**Status:** Approved  
**Repo:** `schedjuice-reimagined-be`  
**Approach:** Single read tool reusing `app_finance/unpaid_helpers` (Approach 1)

## 1. Summary

Add **`get_unpaid_students`** so the Telegram/web AI assistant can answer unpaid-student
questions (e.g. *"How many unpaid students are left in CAE 35 WD?"*) using the same rules
as the web **Unpaid Students** report.

The tool supports:

- **Count-only** by default; **student names** when the model sets `include_names=true`
  (user asks "who" / "list them").
- **Single course** when `course_id` or `query` is provided; **org-wide course summary**
  when neither is provided.
- **Calendar month** default (org timezone), optional `year`/`month`, optional `month_type`
  (`FM` / `HM`) for org-wide summaries.

Individual student names are returned only for a **resolved single course**. Org-wide
responses stay at course-level counts.

---

## 2. Problem

SuConnect currently has no finance tools. When staff ask about unpaid students, the model
refuses because it cannot access payment status — even though `app_finance/unpaid_helpers.py`
and RBAC already power the web unpaid-students page and utility notifications.

---

## 3. Locked decisions

| Topic | Choice |
| --- | --- |
| Tool shape | One tool: `get_unpaid_students` |
| Response | Count by default; names via `include_names=true` |
| Scope | Course-scoped or org-wide (omit course params) |
| Month | Calendar month in org timezone; default current month |
| Month type filter | Optional `month_type` (`FM` / `HM`) for org-wide mode |
| Paid definition | Same as `unpaid_helpers.py`: any `UserPayment` row covering the month for the course removes the student from unpaid (status ignored) |
| Dropped students | Excluded (active enrollments only) |
| Org-wide names | Course-level summary only; no school-wide student name dump |
| RBAC | Existing `payment.view_unpaid` / `payment.view_unpaid_all` |

---

## 4. RBAC

Reuse `app_finance/payment_scoping.py` — do **not** use roster-only checks.

| Check | When | Result |
| --- | --- | --- |
| `check_unpaid_read(user)` | Every call | `permission_denied` if caller lacks `payment.view_unpaid` or `payment.view_unpaid_all` |
| `check_unpaid_course_access(user, course_id)` | Course-scoped mode | `permission_denied` if caller has only `payment.view_unpaid` and is not connected to the course |
| `filter_course_ids_for_unpaid(user, course_ids)` | Org-wide mode | Filter summary rows to allowed courses |

**Permission matrix:**

| Role (typical) | Permission | Course-scoped | Org-wide summary |
| --- | --- | --- | --- |
| Teacher | `payment.view_unpaid` | Connected courses only | Only connected courses in summary |
| Finance / Admin | `payment.view_unpaid_all` | Any course | Full school summary |
| Student / no unpaid perm | — | Denied | Denied |

Course resolution for lookup still uses `resolve_accessible_course` (search + disambiguation),
then applies unpaid-specific access on the resolved course.

---

## 5. Tool: `get_unpaid_students`

**Exposure:** `read`  
**Feature flag:** none  
**Registry:** `app_ai/tools/registry.py`

### 5.1 Parameters

| Field | Type | Required | Default | Notes |
| --- | --- | --- | --- | --- |
| `course_id` | integer | no | — | From prior `search_courses`. Mutually exclusive with `query`. |
| `query` | string | no | — | Course title/code (e.g. `"CAE 35 WD"`). Mutually exclusive with `course_id`. |
| `include_names` | boolean | no | `false` | When `true`, include student list (course-scoped only). |
| `year` | integer | no | current org year | Calendar year for report month. |
| `month` | integer (1–12) | no | current org month | Calendar month for report month. |
| `month_type` | `"FM"` \| `"HM"` | no | omitted | Org-wide only: filter courses by start-date month type. Ignored in course-scoped mode. |

**Mode selection:**

- Provide exactly one of `course_id` or `query` → **course-scoped**.
- Omit both → **org-wide summary** (requires unpaid read permission; results filtered by RBAC).

**Validation:**

- Both `course_id` and `query` → `validation_error`.
- `month_type` present but not `FM`/`HM` → `validation_error`.
- `include_names=true` in org-wide mode → proceed with summary only; response includes
  `names_omitted_reason: "org_wide_summary"` so the model does not invent names.

### 5.2 Month → payment params

Build `issued_at__gte` / `issued_at__lte` the same way as utility notifications
(`_current_month_payment_params` in `utility_notification_helpers.py`):

- Resolve `year`/`month` default from org timezone (`org_today` pattern in `query_courses.py`).
- Convert to tenant day boundaries for first/last day of calendar month.
- Pass resulting dict to unpaid helper functions.

**Refactor (minimal):** Extract a shared helper, e.g.
`payment_filter_params_for_calendar_month(org, year, month) -> dict`, callable from the AI
tool and optionally from utility notifications later. Keeps AI tool and web report aligned.

---

## 6. Response shapes

### 6.1 Course-scoped, count only (`include_names=false`)

```json
{
  "mode": "course",
  "month": { "year": 2026, "month": 7, "label": "July 2026" },
  "course": { "id": 123, "title": "CAE-35 WD FM 7-8:30 PM", "url": "..." },
  "unpaid_count": 3
}
```

### 6.2 Course-scoped, with names (`include_names=true`)

```json
{
  "mode": "course",
  "month": { "year": 2026, "month": 7, "label": "July 2026" },
  "course": { "id": 123, "title": "...", "url": "..." },
  "unpaid_count": 3,
  "students": [
    {
      "name": "Alice",
      "profile_url": "...",
      "primary_email": "alice@school.com",
      "paid_until": { "year": 2026, "month_index": 5 },
      "payment_status": "behind"
    },
    {
      "name": "Bob",
      "profile_url": "...",
      "primary_email": null,
      "paid_until": null,
      "payment_status": "never_paid"
    }
  ]
}
```

Student rows use `compact_user_for_ai` plus `paid_until` / `payment_status` from
`paid_until_by_user_for_course` and `sort_unpaid_user_courses_by_paid_until` — same
ordering as the web report (never-paid first, then alphabetical).

### 6.3 Org-wide summary

```json
{
  "mode": "org_summary",
  "month": { "year": 2026, "month": 7, "label": "July 2026" },
  "month_type": "FM",
  "total_unpaid_students": 12,
  "courses_with_unpaid": 4,
  "groups": [
    {
      "category": { "id": 1, "name": "CAE", "sort_order": 0 },
      "courses": [
        { "course_id": 123, "title": "...", "url": "...", "unpaid_count": 3 }
      ]
    }
  ]
}
```

- Source: `unpaid_course_summary_rows(payment_params, course_month_type=month_type)`.
- Filter rows with `filter_course_ids_for_unpaid`.
- Group by category in the tool handler (mirror `query_courses` grouping) for readable
  Telegram replies.
- `total_unpaid_students`: sum of `unpaid_count` across returned courses.
- `courses_with_unpaid`: count of courses where `unpaid_count > 0`.
- Omit courses with `unpaid_count == 0` from `groups` (or include with zero — **include only
  courses with unpaid > 0** to keep responses short).

When `include_names=true` and mode is org-wide:

```json
{
  "mode": "org_summary",
  "names_omitted_reason": "org_wide_summary",
  "...": "..."
}
```

---

## 7. Error responses

Structured errors (consistent with other AI tools):

| `error` | When |
| --- | --- |
| `permission_denied` | Missing unpaid permission or course not allowed |
| `validation_error` | Both/neither course_id and query; invalid month_type |
| `ambiguous` | Multiple course matches — letter-keyed candidates (reuse `resolve_accessible_course`) |
| `not_found` | No course match |

No silent empty success when permission denied.

---

## 8. Prompt updates

Add to `PLATFORM_BASE_TEMPLATE` in `app_ai/prompts.py`:

```
Unpaid students (requires payment.view_unpaid):
- Use get_unpaid_students for how many students owe payment for a course or which
  courses have unpaid students this month.
- Default month is the current calendar month in the school's timezone. Pass year/month
  only when the user specifies a different month.
- Use include_names=true when the user asks who is unpaid or wants a list of names.
  Org-wide queries return course summaries only — for names, resolve a specific course first.
- Pass query for course codes like "CAE 35 WD". On ambiguous, present A/B/C options.
- When unpaid_count is 0, say all enrolled students have payment on file for that month.
- Do not claim unpaid counts without calling get_unpaid_students.
```

Remove or soften the implicit refusal on payment status in scope text if present; finance
lookups are allowed via this tool when RBAC permits.

---

## 9. Implementation notes

### 9.1 File map

| File | Change |
| --- | --- |
| `app_ai/tools/get_unpaid_students.py` | New tool handler |
| `app_ai/tools/unpaid_rbac.py` | `require_unpaid_read`, course access wrapper (thin) |
| `app_ai/tools/registry.py` | Register tool |
| `app_finance/unpaid_helpers.py` | Optional: `payment_filter_params_for_calendar_month` |
| `app_ai/prompts.py` | Unpaid tool guidance |
| `app_ai/tests/test_get_unpaid_students.py` | Integration tests |

### 9.2 Handler flow

```
run_get_unpaid_students(args, user):
  require_unpaid_read → permission_denied
  payment_params = build from year/month + org tz
  month meta = { year, month, label }

  if course_id or query:
    resolve_accessible_course → ambiguous | not_found
    check_unpaid_course_access(user, course.id)
    qs = unpaid_student_user_courses_queryset(...)
    count = qs.count()
    if include_names:
      build student list with paid_until / payment_status
    return course response

  else:  # org-wide
    rows = unpaid_course_summary_rows(payment_params, month_type)
    filter by filter_course_ids_for_unpaid
    group by category, compute totals
    if include_names: set names_omitted_reason
    return org_summary response
```

### 9.3 Non-goals (v1)

- No write actions (recording payments).
- No per-student payment history beyond `paid_until`.
- No billing-cycle model beyond calendar month.
- No frontend changes (tool is backend + prompt only).

---

## 10. Testing

Add `app_ai/tests/test_get_unpaid_students.py` following `test_get_course_roster.py` patterns:

| Case | Assert |
| --- | --- |
| Teacher with `payment.view_unpaid`, connected course, no payment row | `unpaid_count == 1` |
| Same, payment row covering month | `unpaid_count == 0` |
| Teacher, unconnected course | `permission_denied` |
| Admin with `payment.view_unpaid_all`, org-wide | Summary includes multiple courses |
| Teacher org-wide | Summary only connected courses |
| `include_names=true`, course-scoped | Students array with `never_paid` / `behind` |
| `include_names=true`, org-wide | `names_omitted_reason` set |
| Ambiguous course query | `ambiguous` with candidates |
| `month_type=FM` | Only FM-start courses in summary |
| Past `year`/`month` | Correct month bounds in response |

Reuse unpaid helper fixtures from `app_finance/tests/test_unpaid_helpers.py` where possible.

---

## 11. Example conversations

**Count (screenshot case):**

> User: May I know how many unpaid students are left in CAE 35 WD?  
> Tool: `get_unpaid_students(query="CAE 35 WD")`  
> Reply: "There are 3 unpaid students in CAE-35 WD FM 7-8:30 PM for July 2026."

**Names:**

> User: Who hasn't paid for CAE 35 this month?  
> Tool: `get_unpaid_students(query="CAE 35", include_names=true)`  
> Reply: Lists linked names with never_paid/behind badges in prose.

**Org-wide:**

> User: Which FM courses still have unpaid students?  
> Tool: `get_unpaid_students(month_type="FM")`  
> Reply: Grouped category list with counts.
