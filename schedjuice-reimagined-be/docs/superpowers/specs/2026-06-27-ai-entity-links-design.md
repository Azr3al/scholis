# AI Entity Links (Users & Courses) — Design Spec

**Date:** 2026-06-27  
**Status:** Implemented (2026-06-27)  
**Repo:** `schedjuice-reimagined-be` (Telegram v1; web API reuse later)

## 1. Summary

When the AI assistant mentions users or courses in a reply, render them as
clickable links to the Schedjuice web app instead of plain text with numeric IDs.

**v1 scope:** Telegram DM assistant only. Shared link-building and response
cleanup live in `app_ai/` so the in-app/web AI query API can adopt the same
logic later without rework.

### Locked decisions

| Topic | Choice |
| --- | --- |
| Channel | Telegram first; design for web API reuse (C) |
| Approach | Prompt + tool URLs + light ID cleanup (Approach 3) |
| User link text | Name only |
| User secondary info | Email in parentheses when present; nothing if absent |
| Course link text | Title only — no ID, code, or extra metadata |
| URL base | `https://{Organization.domain_url}` (tenant-scoped, not `FRONTEND_BASE_URL`) |
| User path | `/users/{id}` |
| Course path | `/courses/{id}` |
| Missing `domain_url` | Omit URLs from tool payloads; no invented links |
| Missing links in model output | Accepted v1 limitation — cleanup strips IDs but does not inject links |

---

## 2. Display rules

### Users

- Format: `[Name](profile_url)` followed by `(email)` when email is non-empty.
- No numeric user IDs in user-facing text.
- Role prefix allowed in prose (e.g. “Student Bruce …”) but only the **name** is
  the link anchor.

**Examples**

| Case | Markdown output |
| --- | --- |
| With email | `Student [Bruce](https://school.schedjuice.com/users/3812) (bruce@school.com)` |
| No email | `Staff [Alex](https://school.schedjuice.com/users/42)` |

### Courses

- Format: `[Title](url)` only.
- No course ID, code, subject, or status unless the user explicitly asks for
  those details.

**Example**

```
• [test course 3](https://school.schedjuice.com/courses/94)
• [Training Course](https://school.schedjuice.com/courses/82)
```

### Telegram rendering

1. Model outputs Markdown (including `[text](url)` links).
2. `cleanup_ai_response_text()` strips stray `(ID: …)` / `(Course ID: …)` suffixes.
3. `markdown_to_telegram_html()` converts links to `<a href="…">…</a>`.
4. Existing fallback unchanged: if Telegram rejects HTML entities, retry as plain text.

---

## 3. Architecture

### 3.1 `app_ai/links.py` (new)

Shared URL builder and payload enrichment.

```python
def build_frontend_url(org: Organization, path: str) -> str:
    """https://{org.domain_url}{path} — returns '' if domain_url missing."""

def user_profile_url(org: Organization, user_id: int) -> str
def course_url(org: Organization, course_id: int) -> str

def with_user_link(org: Organization, row: dict) -> dict:
    """Adds profile_url when domain_url is set."""

def with_course_link(org: Organization, row: dict) -> dict:
    """Adds url when domain_url is set."""
```

Tools receive `Organization` via connection schema context (same pattern as
`AIService._current_tenant()`). Enrichment helpers are called from compact-row
builders at tool execution time.

### 3.2 Tool payload changes

Add link fields wherever users or courses are returned to the model. Internal
`id` / `course_id` fields remain for follow-up tool calls.

| Location | Field added |
| --- | --- |
| `search_users._compact_row` | `profile_url` |
| `search_courses._compact_row` | `url` |
| `resolve._compact_user` | `profile_url` |
| `resolve_accessible_course` ambiguous candidates | `url` |
| `list_user_courses` user block | `profile_url` |
| `list_user_courses._compact_enrollment` | `url` |

Implementation note: tools run inside tenant schema; resolve org once per tool
call via a small helper (e.g. `get_current_org()`) in `app_ai/links.py` or
reuse `AIService._current_tenant()` pattern extracted to a shared function.

### 3.3 Prompt updates (`app_ai/prompts.py`)

Add a **Link formatting** section to `PLATFORM_BASE_TEMPLATE`:

- When mentioning a user, link the name: `[Name](profile_url)`. Append
  `(email)` only when email is present in tool data. Never show numeric user IDs.
- When mentioning a course, link the title: `[Title](url)`. Do not show course
  IDs, codes, or other metadata unless the user explicitly asks.
- Use `profile_url` and `url` from tool results exactly — never invent URLs.

### 3.4 Response cleanup (`app_ai/response_format.py`, new)

```python
_USER_ID_SUFFIX_RE = re.compile(r"\s*\(ID:\s*\d+\)", re.IGNORECASE)
_COURSE_ID_SUFFIX_RE = re.compile(r"\s*\(Course ID:\s*\d+\)", re.IGNORECASE)

def cleanup_ai_response_text(text: str) -> str:
    """Remove numeric ID suffixes the model may still emit."""
```

Channel-agnostic; safe to call from Telegram and future web API paths.

### 3.5 Telegram Markdown → HTML (`app_telegram/formatting.py`)

Extend `markdown_to_telegram_html` to support `[label](https://…)`:

- Match only `https://` URLs (Telegram requirement).
- Escape label text with existing `escape_telegram_html`.
- Process links before bold/italic/code so nested formatting stays stable.
- Do not double-escape URL characters in href (Telegram accepts encoded URLs).

### 3.6 Integration (`app_telegram/tasks.py`)

```python
from app_ai.response_format import cleanup_ai_response_text

reply_text = cleanup_ai_response_text(result.text or "I couldn't find an answer.")
_send_reply(client, chat_id, reply_text, format_markdown=True, **reply_kw)
```

No changes to `AIService`, `GeminiClient`, or the web `AIQueryView` in v1.

---

## 4. Data flow

```
User message (Telegram)
  → run_ai_query (async)
  → AIService.run → Gemini + tools
  → Tools enrich payloads with profile_url / url (app_ai/links.py)
  → Model returns Markdown reply with [Name](url) patterns
  → cleanup_ai_response_text (strip stray IDs)
  → markdown_to_telegram_html (links + bold/bullets)
  → TelegramClient.send_message (HTML)
```

Future web API path replaces only the last formatting step with client-side
Markdown rendering; everything above `cleanup_ai_response_text` is reused.

---

## 5. Error handling

| Case | Behavior |
| --- | --- |
| `domain_url` empty or missing | `profile_url` / `url` omitted from tool JSON; prompt instructs linking only when URL present |
| Model ignores link format | IDs stripped by cleanup; plain names shown (no link) — acceptable v1 |
| Broken Markdown link syntax | Telegram HTML parse fails → existing plain-text retry |
| Email empty on user record | Model omits `(email)` per prompt |
| Ambiguous user/course names | Model disambiguates in prose; each candidate in tool data has its own URL |

---

## 6. Testing

### Unit tests

| File | Coverage |
| --- | --- |
| `app_ai/tests/test_links.py` | URL building, empty domain, enrichment helpers |
| `app_ai/tests/test_response_format.py` | ID suffix stripping, unchanged text when no IDs |
| `app_telegram/tests/test_formatting.py` | `[text](url)` → `<a>`, link + bold, URL escaping |

### Integration

Extend `app_telegram/tests/test_ai_query.py` (or equivalent): mock `AIService.run`
to return Markdown with links; assert `send_message` text contains expected
`<a href="https://…">` after formatting.

### Manual test plan

1. Link Telegram as admin; ask “which courses is student Bruce taking?”
2. Confirm user name and each course title are tappable; URLs open tenant frontend.
3. Confirm no `(ID: …)` or `(Course ID: …)` in reply.
4. Confirm email appears beside user when on record.
5. Repeat with a user who has no email — name link only, no empty parens.

---

## 7. Out of scope (v1)

- Deterministic name-based link injection from a tool-result entity registry.
- In-app/web AI query link rendering (uses same `app_ai/` modules when built).
- Group Telegram AI replies.
- Deep links to course sub-pages (attendance, schedule, etc.).
- Per-tenant link format customization.

---

## 8. Future web API reuse

When the in-app assistant ships:

1. Reuse tool payloads + prompt (already output Markdown links).
2. Call `cleanup_ai_response_text(result.text)` in `AIQueryView` before returning
   `answer`.
3. Frontend renders Markdown natively (or add a structured `entities` field later
   if richer UI is needed).

Telegram-specific code is confined to `app_telegram/formatting.py` and
`app_telegram/tasks.py`.
