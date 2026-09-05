# Telegram AI Context, Reactions & Tenant AI Settings — Design Spec

**Date:** 2026-06-27  
**Status:** Implemented (2026-06-27)  
**Repos:** `schedjuice-reimagined-be`, `schedjuice-reimagined-fe`

## 1. Summary

Extend the existing Telegram DM assistant (free-text → `run_ai_query` → Gemini)
with:

1. **Conversation memory** — rolling window + Telegram Reply anchoring for
   follow-up questions.
2. **Acknowledgement reactions** — bot reacts to the user's message immediately
   with a randomly chosen “thinking” emoji, left permanently.
3. **Per-tenant AI settings on `Organization`** — school context, prompting,
   model, context turns, tool iterations, and budget limits consolidated on the
   org model (migrate from `AITenantBudget`).
4. **Dedicated AI settings page** — settings-only UI, separate from org profile
   edit.

**Scope:** Private DM assistant only. Group AI is deferred but data model keys
on `(chat_id, user_id)` for future use.

### Locked decisions

| Topic | Choice |
| --- | --- |
| Follow-up UX | Reply + rolling session (C), default N=5 turns |
| Ack reaction | Random from curated pool; leave permanently |
| AI settings page | Settings only (no usage dashboard in v1) |
| Config location | Approach 1 — all tenant AI config on `Organization` |
| Bot reply threading | Bot replies as Telegram reply to user's message |
| `is_ai_enabled` default | `True` for existing orgs (opt-out) |

---

## 2. Acknowledgement reaction emoji pool

When the bot receives a qualifying DM, it calls `setMessageReaction` **synchronously
in the webhook handler** (before enqueueing the async AI job). One emoji is
chosen uniformly at random from a fixed allowlist.

### Recommended pool (v1)

| Emoji | Vibe |
| --- | --- |
| 🤔 | Classic “thinking” |
| 👀 | “Looking into it” |
| 🧐 | “Examining closely” |
| 🔍 | “Searching / investigating” |
| 💭 | “Processing mentally” |

### Example in chat

```
You:  find staff named admin
Bot:  [reacts 👀 on your message]
      … (1–3s later)
      The staff member named "admin" is: …

You:  [Reply to bot answer] what courses do they teach?
Bot:  [reacts 🧐 on your reply message]
      …
      Admin teaches Grade 7 Math and …
```

Each new user message gets its own random pick — reactions are independent.

### Implementation notes

- Add `TelegramClient.set_message_reaction(chat_id, message_id, emoji)`.
- Constant `TELEGRAM_AI_ACK_REACTIONS` in `app_telegram/config.py` (or
  `binding.py`); use `random.choice`.
- Reaction failure is **non-fatal**: log warning, continue with AI query.
- Requires Bot API 7.0+ (`setMessageReaction`); already available on current
  Telegram infrastructure.

### Out of scope

- Removing or swapping reaction when reply arrives.
- Per-tenant emoji customization (could add `ai_telegram_ack_reactions` JSON on
  org later).

---

## 3. Organization AI fields

Add to `Organization` (public schema). Migrate existing `AITenantBudget` rows,
then stop reading `AITenantBudget` (table dropped or left unused after migration).

```python
# Master switch
is_ai_enabled = models.BooleanField(default=True)

# Model & loop limits (null/blank → Django settings fallback)
ai_default_model = models.CharField(max_length=128, null=True, blank=True)
ai_max_context_turns = models.PositiveSmallIntegerField(default=5)
ai_max_tool_iterations = models.PositiveSmallIntegerField(default=5)

# Prompting / context
ai_school_context = models.TextField(
    blank=True,
    default="",
    help_text="Brief factual context about the school (type, size, location, terminology).",
)
ai_assistant_instructions = models.TextField(
    blank=True,
    default="",
    help_text="Optional behavior rules (tone, what to prioritize, what to avoid).",
)

# Budget (migrated from AITenantBudget)
ai_monthly_usd_limit = models.DecimalField(
    max_digits=12, decimal_places=4, null=True, blank=True
)
ai_monthly_token_limit = models.PositiveBigIntegerField(null=True, blank=True)
ai_hard_enforce = models.BooleanField(default=False)
ai_alert_thresholds = models.JSONField(default=list)  # e.g. [0.5, 0.8, 1.0]
ai_budget_active = models.BooleanField(default=True)
```

### Platform-only settings (unchanged, global fallbacks)

- `GEMINI_API_KEY`
- `AI_DEFAULT_MODEL` — used when `ai_default_model` is null
- `AI_MAX_TOOL_ITERATIONS` — used when seeding default for new orgs
- `AI_BILLING_MARKUP`
- `AI_DEFAULT_MONTHLY_USD_LIMIT`, `AI_DEFAULT_MONTHLY_TOKEN_LIMIT`,
  `AI_DEFAULT_HARD_ENFORCE`, `AI_DEFAULT_ALERT_THRESHOLDS` — used when org
  budget fields are null

### System prompt assembly

Built server-side for every AI call (Telegram + web `AIQueryView`):

```
You are the Schedjuice assistant for {org.name}.

School context:
{ai_school_context or "No additional school context provided."}

Instructions:
{ai_assistant_instructions or "Be concise and accurate. Use available tools to look up live data. Do not invent records."}
```

Character limits enforced on PATCH (e.g. 2000 chars each for school context
and instructions).

### Quota module changes

`app_ai/quota.py`:

- `get_tenant_budget()` reads org fields instead of `AITenantBudget`.
- `assert_quota_allows()` unchanged semantics.
- Data migration copies `AITenantBudget` → org columns where a row exists.

---

## 4. Telegram conversation memory

### Model: `TelegramAIExchange` (tenant schema, `app_telegram`)

```python
class TelegramAIExchange(BaseModel):
    user = models.ForeignKey("app_auth.User", on_delete=models.CASCADE)
    chat_id = models.BigIntegerField(db_index=True)
    user_message_id = models.BigIntegerField()
    bot_message_id = models.BigIntegerField(null=True, blank=True)
    user_text = models.TextField()
    bot_text = models.TextField(blank=True, default="")
```

Indexes: `(user_id, chat_id, -created_at)`.

Store after successful bot reply; `bot_message_id` from `sendMessage` response.

### Context assembly (`app_telegram/context.py`)

Input: inbound Telegram `message` dict, `user`, `org`.

1. Read `N = org.ai_max_context_turns`.
2. **Rolling window:** last N exchanges for `(user.id, chat_id)`.
3. **Reply anchor:** if `message.reply_to_message` present:
   - Resolve `reply_to_message.message_id` against stored
     `user_message_id` or `bot_message_id`.
   - Walk parent chain (reply-to-reply) collecting exchanges in order.
   - Merge with rolling window, dedupe by `user_message_id`, cap at N.
4. If reply target not found in DB, fall back to rolling window only.
5. Output: `list[dict]` with `{role: "user"|"model", text: str}` oldest-first,
   plus current user text as final user turn.

### Inbound flow (`binding.py`)

```
receive DM text
  → validate link + ai.telegram_use + is_ai_enabled
  → set_message_reaction (random ack emoji)     # sync
  → build_context_history(message, user, org)
  → run_ai_query.delay(..., prompt, history, reply_to_message_id)
```

### Task flow (`tasks.py`)

```
run_ai_query
  → resolve org AI settings (model, iterations, system prompt)
  → AIService.run(prompt, user, history=..., system_context=..., ...)
  → send_message(chat_id, text, reply_to_message_id=user_message_id)
  → persist TelegramAIExchange
```

On error paths, still persist exchange with empty/partial `bot_text` optional
(skip persist on total failure before any reply — keep existing error messages).

---

## 5. AIService / Gemini changes

Extend `AIService.run()` and `GeminiClient.generate_with_tools()`:

| New param | Source |
| --- | --- |
| `system_context: str` | Org prompt assembly |
| `history: list[{role, text}]` | Telegram context builder (empty for stateless web query v1) |
| `model: str \| None` | `org.ai_default_model` or settings fallback |
| `max_iterations: int \| None` | `org.ai_max_tool_iterations` |

Gemini `GenerateContentConfig.system_instruction` for system context; `contents`
list includes history turns before the current user message.

Web `AIQueryView` passes org system context but no history (future: session
cookie or explicit history param).

---

## 6. AI settings API & frontend page

### Backend

New view `OrganizationAISettingsView` in `app_organization/views.py`:

- `GET /api/v1/organizations/{id}/ai-settings/` — read AI fields + read-only
  `name` for page header.
- `PATCH /api/v1/organizations/{id}/ai-settings/` — partial update with validation.

**Not** added to `OrganizationSerializer` or org profile edit schema — enforced
separation.

Access: same authorization as org profile edit (tenant owner/admin).

Serializer validates:

- `ai_max_context_turns`: 1–20
- `ai_max_tool_iterations`: 1–10
- `ai_school_context` / `ai_assistant_instructions`: max length
- `ai_alert_thresholds`: list of floats 0–1, sorted

### Frontend

- Route: `/organizations/ai-settings`
- Link from `/organizations/profile` hub (next to Theme / Edit)
- Zod schema: `organizationAiSettingsSchema` in `src/types/organization.ts`
- Form sections:
  1. **General** — enabled, model, context turns, tool iterations
  2. **School context** — textarea with helper copy
  3. **Assistant behavior** — textarea
  4. **Budget & limits** — USD/token limits, hard enforce, thresholds, budget active
- Auto-save pattern matching org profile edit (if applicable) or explicit Save
- Exclude from `ORGANIZATION_PROFILE_EDIT_SECTIONS`

---

## 7. Error handling

| Case | Behavior |
| --- | --- |
| Reaction API fails | Log warning; proceed with AI |
| `is_ai_enabled` false | Reply: “AI assistant is disabled for your school.” |
| Quota exceeded | Existing quota message; ack emoji stays |
| Reply to unknown message | Rolling window only |
| Unlinked user / no RBAC | Existing binding messages |
| Telegram disabled | Existing behavior (no AI path if not linked) |

---

## 8. Testing

**Backend**

- `set_message_reaction` called before `run_ai_query.delay`
- Reaction emoji ∈ allowlist
- Context builder: N-turn window, reply-chain merge, dedupe, unknown reply fallback
- Org system prompt injected into Gemini call
- Quota reads org fields post-migration
- AI settings GET/PATCH authorization + validation

**Frontend**

- AI settings page renders sections; PATCH round-trip
- Not visible in org profile edit sections

---

## 9. Future (explicitly out of scope)

- Group chat AI
- Usage dashboard on AI settings page
- Admin “clear conversation history”
- Per-tenant custom reaction emoji list
- Web app multi-turn history

---

## 10. Files touched (implementation preview)

| Area | Files |
| --- | --- |
| Org model | `app_organization/models.py`, migration, data migration from `AITenantBudget` |
| Quota | `app_ai/quota.py` |
| AI service | `app_ai/service.py`, `app_ai/client.py` |
| Telegram | `app_telegram/client.py`, `binding.py`, `tasks.py`, `context.py`, `models.py` |
| API | `app_organization/views.py`, `serializers.py`, `urls.py` |
| FE | `organizations/ai-settings/page.tsx`, types, nav link, client API |
| Tests | `app_telegram/tests/test_ai_query.py`, new context/reaction tests, org AI settings tests |
