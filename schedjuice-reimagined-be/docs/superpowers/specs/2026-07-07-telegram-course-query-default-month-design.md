# Telegram / AI Course Query Default Month — Design Spec

**Date:** 2026-07-07  
**Status:** Approved  
**Repo:** `schedjuice-reimagined-be`  
**Approach:** Server-side year gate + org-local date context + prompt rules (Approach 3)

## 1. Summary

Fix Telegram (and web) AI course queries so that **by default** they return **active
courses overlapping the current calendar month** in the school's timezone.

When a user names a month without a year (e.g. *"Movers in June?"*), the query must use
the **current calendar year** — not a guessed historical year like 2024.

The overlap date filter is **unchanged**. The fix targets year-default behavior and LLM
tool-arg reliability via defense in depth: prompt/context guidance plus server-side
enforcement.

---

## 2. Problem

Admins ask natural-language questions like *"how many Starters classes in July?"* via
Telegram. The bot sometimes replies with empty results for the wrong year (e.g. July 2024)
even when courses exist in the current year (e.g. 19 Movers classes in June 2026).

**Root cause:** `query_courses` already defaults `year`/`month` to org-local today when
args are omitted. The failure mode is the LLM **explicitly passing a wrong `year`** (e.g.
`year: 2024`). Contributing factors:

- No org-local **today's date** in the AI system context
- Year-default rules exist for `get_unpaid_students` but not for `query_courses`
- No server-side guard when the LLM supplies an unrequested year

---

## 3. Locked decisions

| Topic | Decision |
| --- | --- |
| Month filter | **Overlap** — `start_date ≤ last_day` AND `end_date ≥ first_day` (no change) |
| Default month | Current org-local calendar month when user omits month |
| Default year | Current org-local calendar year when user omits year |
| Month without year | Always current calendar year (e.g. "June" → June 2026 if today is July 2026) |
| Explicit year | Honor only when user explicitly states a year (e.g. "2026", "in 2025") |
| Fix strategy | **Both** server-side enforcement and prompt/context improvements |
| Scope | All AI channels (Telegram + web) — shared `app_ai` stack |
| `course_status` default | `"active"` (unchanged) |

---

## 4. Date filtering (unchanged)

Keep existing logic in `app_ai/tools/query_courses.py`:

```python
first_day, last_day = month_bounds(year=year, month=month)
qs = qs.filter(start_date__lte=last_day, end_date__gte=first_day)
```

A course is included if it is **active at any point** during the target calendar month.
Courses spanning month boundaries (e.g. June 15 → July 15) appear in **both** June and
July queries.

Defaults when args omitted:

- `month` → `org_today(org).month`
- `year` → `org_today(org).year` (with enforcement in §5)
- `course_status` → `"active"`

---

## 5. Server-side year enforcement

### 5.1 New tool parameter

Add to `QUERY_COURSES_SCHEMA`:

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `user_stated_year` | `boolean` | `false` | Set `true` only when the user explicitly stated a calendar year in their message |

### 5.2 Resolution logic

In `run_query_courses`:

```python
today = org_today(org)
month = int(args.get("month") or today.month)

if args.get("user_stated_year"):
    year = int(args.get("year") or today.year)
else:
    year = today.year  # ignore any LLM-provided year
```

### 5.3 Behavior matrix

| User says | LLM args (examples) | Resolved year |
| --- | --- | --- |
| "Movers in June" | `{ "month": 6 }` | Current year |
| "Movers in June" (LLM wrongly adds year) | `{ "month": 6, "year": 2024 }` | **Current year** (2024 ignored) |
| "2026" (follow-up after June question) | `{ "month": 6, "year": 2026, "user_stated_year": true }` | 2026 |
| "how many Starters?" | `{}` | Current month + year |
| "Movers in June 2025" | `{ "month": 6, "year": 2025, "user_stated_year": true }` | 2025 |
| "last year's June" | `{ "month": 6, "year": 2025, "user_stated_year": true }` | 2025 |

### 5.4 Response metadata

Add to tool result (for tests and debugging):

```python
"month": {
    "year": year,
    "month": month,
    "label": month_label,
    "year_source": "user_stated" | "default",
}
```

---

## 6. Prompt and context changes

### 6.1 Inject org-local date

In `app_ai/tenant_context.py` → `build_system_context()`, append after the platform
prompt (or in a dedicated block):

```
Today's date (school timezone): Tuesday, 7 July 2026
```

Computed via existing `org_today(org)` from `app_ai/tools/query_courses.py` (extract
to a shared helper if needed to avoid circular imports — e.g. `app_ai/org_datetime.py`).

### 6.2 `query_courses` prompt rules

Add a dedicated block to `app_ai/prompts.py` (parallel to the unpaid-students section):

- Default month/year = current calendar month in the school's timezone
- Omit `month` and `year` unless the user specifies a different period
- When the user names a month without a year, pass only `month` — do **not** pass `year`
- Set `user_stated_year: true` only when the user explicitly states a calendar year
- Never guess or assume historical years (e.g. do not default to 2024)
- When reporting results, use the `month.label` from the tool response

### 6.3 Tool schema descriptions

Update parameter descriptions in `QUERY_COURSES_SCHEMA`:

- `year` — "Calendar year. Ignored unless `user_stated_year` is true. Default: current year in org timezone."
- `month` — unchanged
- `user_stated_year` — "True only when the user explicitly stated a calendar year in their message."

Update `QUERY_COURSES_TOOL.description` to mention the year gate.

---

## 7. Files to change

| File | Change |
| --- | --- |
| `app_ai/tools/query_courses.py` | `user_stated_year` param, year resolution, `year_source` in response |
| `app_ai/tenant_context.py` | Inject org-local today's date |
| `app_ai/prompts.py` | Add `query_courses` year/month rules |
| `app_ai/tests/test_query_courses.py` | New year-default and enforcement tests |
| `app_ai/tests/test_tenant_context.py` (or new) | Assert today's date in system context |

Optional: extract `org_today()` to `app_ai/org_datetime.py` if import cycle arises.

---

## 8. Testing

### 8.1 `test_query_courses.py`

| Test | Setup | Args | Assert |
| --- | --- | --- | --- |
| Default month label | `org_today` → 2026-06-15 | `{}` | `month.label` = "June 2026", `year_source` = "default" |
| Month only | `org_today` → 2026-07-07 | `{ "month": 6 }` | year = 2026 |
| Wrong year ignored | `org_today` → 2026-07-07 | `{ "month": 6, "year": 2024 }` | year = 2026, `year_source` = "default" |
| User-stated year | `org_today` → 2026-07-07 | `{ "month": 6, "year": 2025, "user_stated_year": true }` | year = 2025, `year_source` = "user_stated" |
| Overlap boundary | Course Jun 15 – Jul 15 | `{ "month": 6 }` | Course included in June query |

### 8.2 Context test

Assert `build_system_context(org)` contains a line matching today's org-local date.

### 8.3 Out of scope for this spec

- End-to-end Telegram → Gemini → tool-arg integration test (future improvement)
- Changes to overlap filter semantics

---

## 9. Non-goals

- Parsing user messages server-side (regex/NLU) — LLM remains the interpreter
- Changing `course_status` default or RBAC
- Modifying `search_courses` (no date filter)
- Auto-searching adjacent years when results are empty

---

## 10. Rollout

No migration. Deploy backend change; existing Telegram/web AI sessions benefit on next
message. No feature flag required.

---

## 11. Success criteria

1. *"Movers in June?"* (no year) returns courses for June of the current year
2. *"how many Starters in July?"* defaults to current month/year when no period stated
3. Follow-up *"2026"* correctly queries the stated year
4. Tool ignores LLM-provided wrong years when `user_stated_year` is not set
5. All new and existing `test_query_courses` tests pass
