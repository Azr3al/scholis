# AI Primary Email Only — Design Spec

**Date:** 2026-06-27  
**Status:** Approved (brainstorming)  
**Repo:** `schedjuice-reimagined-be`  
**Channel:** Telegram AI v1; shared `app_ai/` for future web API

## 1. Summary

When the AI assistant mentions a user’s email in a reply, show **primary email only**
(`User.email`). Never show **communication email** (`User.communication_email`), even when
the user searched by communication email or the model infers “two emails for one person.”

**Approach:** Centralized tool serialization + prompt clarification (Approach 2 from
brainstorming). No response post-processing.

### Problem (observed)

User asked about “Bruce” in Telegram. The bot showed `bruce.student@yopmail.com` in one
reply and `minphonemyat2726+2@gmail.com` in another for the same user — primary vs
communication email. Tool payloads already used `user.email`, but the ambiguous field name
`email` and prompt wording allowed the model to echo communication addresses from search
context or conversation history.

### Locked decisions

| Topic | Choice |
| --- | --- |
| Display | Primary email only (`User.email`) |
| Never display | `User.communication_email` |
| Tool field name | `primary_email` (replaces `email` in AI tool payloads) |
| Search | Still match communication email; display restriction only |
| Duplicate-user explanations | One person → show primary once; do not list both addresses |
| Scope | All `app_ai` user tool payloads; Telegram v1 consumer |

---

## 2. Display rules

### Users

- Format unchanged: `[Name](profile_url)` then `(primary_email)` when non-empty.
- `primary_email` comes **only** from tool payload `primary_email` — never from user query
  text, history, or invented addresses.
- Never show `communication_email` in prose, parentheses, or disambiguation lists.
- If the same user was matched via different search terms (name vs communication email),
  explain they are one person without enumerating both emails.

### Examples

| Case | Markdown output |
| --- | --- |
| With primary | `Student [Bruce](https://school.schedjuice.com/users/3812) (bruce@school.com)` |
| Search by comm email | Same — still show primary only |
| Same user twice | “That is the same person (one User ID).” + primary once — not both addresses |

---

## 3. Architecture

### 3.1 New helper — `compact_user_for_ai` (`app_ai/links.py`)

Single source of truth for user rows returned to the model:

```python
def compact_user_for_ai(user: User, *, org: Organization | None = None) -> dict[str, Any]:
    row = {
        "id": user.id,
        "name": user.name,
        "primary_email": (user.email or "").strip(),
    }
    return with_user_link(row, org=org)
```

- **Includes:** `id`, `name`, `primary_email`, optional `profile_url`
- **Never includes:** `communication_email`, legacy `email` key
- Optional extra fields (e.g. `roles`, `alternative_name`) added by caller on top of
  `compact_user_for_ai` result when needed — not part of the base helper.

`with_user_link` remains a generic URL enricher; it does not add email fields.

### 3.2 Tool migrations

Replace manual `{..., "email": user.email}` and `_compact_user` with `compact_user_for_ai`:

| File | Change |
| --- | --- |
| `app_ai/tools/resolve.py` | `_compact_user` → `compact_user_for_ai`; used for ambiguous candidates |
| `app_ai/tools/search_users.py` | `_compact_row` uses helper; may add `alternative_name`, `roles` |
| `app_ai/tools/list_user_courses.py` | `user` block uses helper + `roles` |
| `app_ai/tools/adjust_staff_points.py` | `subject` uses helper |
| `app_ai/tools/get_staff_point_balances.py` | `subject` uses helper |
| `app_ai/tools/count_teacher_courses.py` | `user` uses helper (also adds missing `profile_url`) |

`search_users` tool **description** text:

- Keep: match by communication email for lookup
- Add: communication email is never shown in replies

### 3.3 Prompt (`app_ai/prompts.py`)

Update **Link formatting** section:

- Reference `primary_email` from tool data (not `email`).
- Explicit: never show communication email; if user searched by it, still show primary.
- When clarifying duplicate matches: same User ID → do not list multiple email addresses.

### 3.4 Out of scope (v1)

- Response post-processing / regex stripping of communication emails
- Changing `app_auth.user_search` match fields
- Web `AIQueryView` integration (inherits when adopted)
- Renaming DB columns or frontend labels

---

## 4. Data flow

```
User message (Telegram)
  → AIService + tools
  → compact_user_for_ai(user)  # primary_email only, no communication_email
  → Model formats [Name](profile_url) (primary_email)
  → cleanup_ai_response_text (ID stripping only)
  → markdown_to_telegram_html
  → Telegram send
```

Search path when query matches `communication_email`:

```
query = "parent@gmail.com"
  → apply_user_search_q_with_meta (matches communication_email)
  → compact_user_for_ai → primary_email = user.email (e.g. bruce@school.com)
  → Model must display primary, not parent@gmail.com
```

---

## 5. Error handling

No new error paths. Existing tool errors (`not_found`, `ambiguous`, `permission_denied`)
unchanged. Ambiguous candidate lists use the same `compact_user_for_ai` shape.

---

## 6. Testing

### Unit (`app_ai/tests/test_links.py`)

- `compact_user_for_ai` sets `primary_email` from `user.email`
- Payload never contains `communication_email` or legacy `email` key
- `profile_url` still added when org has `domain_url`

### Tool integration (`app_ai/tests/test_tool_links.py` or new `test_primary_email.py`)

- Create user with distinct `email` and `communication_email`
- `run_search_users` with query matching communication email:
  - returns `primary_email` = primary only
  - does not expose communication email
- Same for `run_list_user_courses` after resolve by communication email query

### Regression

- Update `app_telegram/tests/test_ai_query.py` if assertions reference tool field names
  (display format in mocked reply text unchanged: `(bruce@school.com)`)

### Manual (Telegram)

1. Bruce with distinct primary + communication emails
2. “What classes is Bruce in?” → primary email in parentheses
3. “Other students named Bruce?” → same primary, not communication email
4. Search by communication email → still primary in reply

---

## 7. Related specs

- [AI Entity Links](2026-06-27-ai-entity-links-design.md) — link format; this spec narrows
  which email field to show.
