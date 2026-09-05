# Telegram Integration — Design Spec

**Date:** 2026-06-19
**Status:** Approved design, pending implementation plan
**Repo:** `schedjuice-reimagined-be`

## 1. Summary

Add a **teacher-facing** Telegram integration that mirrors the structure of the
existing Microsoft Teams integration (`app_microsoft`), but scoped to what the
Telegram Bot API can actually do. Per-organization bot. Each course can be
linked to a Telegram **group** (supergroup) whose membership is the course's
**teacher(s)**. The bot:

1. **Binds** a teacher's Schedjuice account to their Telegram account via a
   one-time-token Start deep link.
2. **Links** a course to a Telegram group via an "add bot as admin" deep link.
3. **Syncs teacher membership**: DMs the invite link when a teacher is assigned,
   auto-approves their join request, kicks them when unassigned.
4. **Posts announcements** to the course group.
5. **Sends DMs** to linked teachers.

Students are **out of scope** — they do not link Telegram accounts and are not
in these groups.

### Scope decisions (locked)

| Decision | Choice |
| --- | --- |
| Bot model | **Per-organization bot** (token stored on `Organization`) |
| Account binding | **Start deep link + one-time token** |
| Group membership | **Teacher-only** group per course |
| Roster gating | **Join-request** gating (bot approves assigned, linked teachers) |
| Group linking | Single `startgroup&admin=` deep-link flow for new **and** existing courses |
| Audience | Teachers (and admins/managers who manage groups) — **never students** |

### Telegram Bot API constraints that shaped this design

- A bot **cannot initiate** a chat; the user must press Start first. → binding
  deep link is what unlocks DMs.
- A bot **cannot add** a user to a group. It can only **remove** members and
  **approve/decline join requests**. → "sync" = invite link + join-request
  approval + kick.
- A bot **cannot create** a group, and a deep link **cannot pre-fill** a group
  name. → admin creates/names the group manually; we show the suggested name to
  copy.
- `t.me/<bot>?startgroup=<payload>` (no `admin=`) delivers `/start@bot <payload>`
  to the bot **and** fires `my_chat_member`. The `admin=` variant adds the bot as
  admin in one step but **does not** deliver the payload. → we use the `admin=`
  variant and identify the course via a pending-link record (see §5).

## 2. Architecture

New Django app `app_telegram/`, per-tenant (django-tenant-schemas), mirroring
`app_microsoft`:

| File | Role |
| --- | --- |
| `client.py` | `TelegramClient(tenant)` — Bot API HTTP wrapper built from the org's decrypted bot token. Methods: `get_me`, `set_webhook`, `delete_webhook`, `set_my_commands`, `send_message`, `get_chat`, `create_chat_invite_link`, `approve_chat_join_request`, `decline_chat_join_request`, `ban_chat_member`, `unban_chat_member`, `leave_chat`. |
| `flows.py` / `provisioning.py` | Idempotent service layer: link/unlink group, reconcile roster, evaluate status. Parallels `CreateTeamFlow` / `provisioning.py`. |
| `binding.py` | Issue/verify account-link tokens. |
| `webhook.py` | Parse + dispatch inbound updates by type. |
| `helpers.py` | Announcement + DM senders (django-q jobs live here or in `tasks.py`). |
| `crypto.py` | Fernet bot-token encryption (reuse pattern from `app_zoom/crypto.py`). |
| `models.py` | `TelegramLinkToken`, `TelegramPendingGroupLink`, `TelegramProcessedUpdate`. |
| `views.py` / `urls.py` | Config + recovery endpoints + webhook receiver under `api/v1/telegram/...`. |

Async via `@django_q_task` + `@tenant_async`; cron via management commands;
deletions via the `Task` queue — same patterns as the MS integration.

Because the bot is **per-org**, the webhook URL itself identifies the tenant; no
chat→tenant lookup table is needed for routing.

## 3. Data model

### `Organization` (new fields)

```python
is_telegram_on = models.BooleanField(default=False)
is_telegram_roster_sync_enabled = models.BooleanField(
    default=True,
    help_text="When off, no teacher membership sync; bot still posts announcements/DMs.",
)
telegram_bot_token_ct = models.TextField(
    null=True, blank=True,
    help_text="Fernet-encrypted bot token. Set/read via helper methods; raw token never stored.",
)
telegram_bot_username = models.CharField(max_length=64, null=True, blank=True)
telegram_bot_id = models.CharField(max_length=64, null=True, blank=True)
telegram_webhook_secret = models.CharField(max_length=128, null=True, blank=True)
telegram_routing_key = models.CharField(max_length=64, unique=True, null=True, blank=True)
```

- Bot token is **encrypted** (Fernet, like `ZoomAccount.access_token_ct`) — not
  plaintext like the MS creds. A leaked bot token = full control of the org's bot.
- `telegram_webhook_secret` is sent to Telegram via `setWebhook(secret_token=...)`
  and validated against the `X-Telegram-Bot-Api-Secret-Token` header on each update.
- `telegram_routing_key` is an opaque random id embedded in the webhook URL for
  tenant lookup (public schema → switch into tenant schema).

### `User` (new fields)

```python
telegram_user_id = models.BigIntegerField(null=True, blank=True, db_index=True)
telegram_chat_id = models.BigIntegerField(null=True, blank=True)  # private chat for DMs
telegram_username = models.CharField(max_length=64, null=True, blank=True)  # hint only
telegram_linked_at = models.DateTimeField(null=True, blank=True)
```

Only populated for teachers/admins; students never link.

### `Course` (new fields)

```python
telegram_chat_id = models.BigIntegerField(null=True, blank=True)
telegram_chat_title = models.CharField(max_length=256, null=True, blank=True)
telegram_invite_link = models.CharField(max_length=512, null=True, blank=True)  # join-request link
telegram_linked_at = models.DateTimeField(null=True, blank=True)
```

Serializer exposes computed `telegram_status`: `tg_off` | `roster_disabled` |
`linked` | `not_linked` (parallel to `microsoft_status`).

### New models

```python
class TelegramLinkToken(BaseModel):
    user = models.ForeignKey("app_auth.User", on_delete=models.CASCADE)
    token = models.CharField(max_length=64, unique=True, db_index=True)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)

class TelegramPendingGroupLink(BaseModel):
    course = models.ForeignKey("app_course.Course", on_delete=models.CASCADE)
    initiated_by = models.ForeignKey("app_auth.User", on_delete=models.CASCADE)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)
    # at most one active (unconsumed, unexpired) row per initiated_by

class TelegramProcessedUpdate(BaseModel):
    update_id = models.BigIntegerField(db_index=True)  # dedupe per bot/tenant
```

### Lifecycle hooks

- `Course.delete()` → queue `Task(LEAVE_TELEGRAM_GROUP, {chat_id})` so the bot
  leaves the group (mirrors the MS `DELETE_COURSE` hook).
- `User.delete()` → no external call needed; binding rows cascade.

## 4. Account binding flow (teachers/admins)

1. Logged-in user clicks **Connect Telegram** → `POST /api/v1/telegram/link-token`.
   Backend creates a `TelegramLinkToken` (random, ~15 min TTL) and returns
   `https://t.me/<bot_username>?start=<token>`.
2. User taps → org bot opens → presses **Start** → Telegram sends `/start <token>`
   (private chat) to the webhook.
3. Handler verifies token (exists, unexpired, unconsumed), sets
   `user.telegram_user_id` / `telegram_chat_id` / `telegram_username` /
   `telegram_linked_at`, marks token consumed, bot replies "Linked to <school>".
4. DMs to this user are now unlocked.

- **Re-link:** a fresh token re-points the binding.
- **Unlink:** `POST /api/v1/telegram/unlink` clears the fields.
- **Uniqueness:** a `telegram_user_id` maps to one Schedjuice user per tenant;
  last-write-wins, nulling any previous owner's binding.

## 5. Course ↔ group linking flow (new & existing courses)

Admin/manager clicks **Connect Telegram group** on a course →
`POST /api/v1/courses/<id>/telegram-link`. Backend creates a
`TelegramPendingGroupLink` (one active per admin) and returns:

```
https://t.me/<bot_username>?startgroup&admin=restrict_members+invite_users+delete_messages+pin_messages
```

- **New course:** admin creates + names the group in Telegram (UI shows the
  suggested name = course title to copy; Telegram can't pre-fill it), then taps
  the link to add the bot **as admin** in one step.
- **Existing course:** admin taps the same link and picks the existing group.

On add, `my_chat_member` fires (`from` = the admin, `new_chat_member.status =
administrator`). Handler:

1. Finds the most recent unconsumed, unexpired `TelegramPendingGroupLink` for
   that admin's `telegram_user_id`.
2. Binds `course.telegram_chat_id` to the group; stores `telegram_chat_title`.
3. Creates a **join-request invite link** (`create_chat_invite_link(creates_join_request=True)`)
   and stores it in `course.telegram_invite_link`.
4. Bot posts a confirmation in the group naming the linked course.
5. If no pending link matches → bot replies asking the admin to start linking
   from Schedjuice first.

**Design note — why `admin=` variant:** roster sync requires the bot to be
admin. The plain `startgroup=<payload>` variant would deliver the course id
explicitly but adds the bot as a non-admin, forcing a second "promote me" step.
We instead identify the course via the pending-link record (keyed on the admin's
Telegram id). Ambiguity is mitigated by allowing only one active pending link per
admin and confirming the course title in the group.

**Unlink:** `POST /api/v1/courses/<id>/telegram-unlink` → bot leaves the group,
clears the course fields.

## 6. Teacher roster sync

Prereq: bot is admin and the group requires join approval (the invite link the
bot created is a join-request link). Gated by `is_telegram_on` **and**
`is_telegram_roster_sync_enabled`.

- **Teacher assigned to course (in Schedjuice):** async job DMs the teacher the
  course's `telegram_invite_link` (no-op if the teacher hasn't linked yet — the
  DM is sent once they link, or we surface a "not linked" status to the admin).
- **Teacher requests to join:** `chat_join_request` update → look up course by
  `chat_id`, look up user by `telegram_user_id`. **Approve iff** the user is an
  active teacher of that course; otherwise decline.
- **Teacher unassigned:** assignment change → async job
  `ban_chat_member` then `unban_chat_member` (kick without permanent ban) using
  the teacher's `telegram_user_id`.
- **Reconcile:** `reconcile-telegram-rosters` management command compares
  assigned+linked teachers vs. known group members and removes stragglers.

## 7. Announcements & DMs

- **Announcements:** add `send_to_telegram = BooleanField(default=False)` to
  `Announcement` (parallel to `send_to_microsoft`) → async
  `send_announcement_to_telegram.delay()` → `client.send_message(course.telegram_chat_id, ...)`.
- **DMs:** `send_direct_message(user, text)` helper; no-ops if the user isn't
  linked. First wired trigger: **DM the invite link to a teacher when assigned to
  a course** (§6). Additional triggers wired incrementally later.

## 8. Webhook handling & security

- One view: `POST /api/v1/telegram/webhook/<routing_key>/`.
- Runs in public schema → look up `Organization` by `telegram_routing_key` →
  switch into the tenant schema to process.
- **Verify** `X-Telegram-Bot-Api-Secret-Token` header == `org.telegram_webhook_secret`;
  reject (401) otherwise.
- Dispatch by update type:
  - `message` with `/start <token>` → account binding (§4).
  - `my_chat_member` → bot added/removed/promoted → group linking (§5) /
    cleanup.
  - `chat_join_request` → teacher join gating (§6).
  - `chat_member` → track membership (requires it in `allowed_updates`).
- **Idempotency:** dedupe on `update_id` via `TelegramProcessedUpdate`.

## 9. Async jobs, management commands, config

- **django-q `@tenant_async` jobs:** `send_announcement_to_telegram`,
  `sync_course_telegram_roster`, `remove_telegram_member`, `send_telegram_dm`,
  `dm_invite_link_to_teacher`.
- **`Task` queue:** add `LEAVE_TELEGRAM_GROUP`.
- **Management commands (cron, per Telegram-enabled tenant):**
  `reconcile-telegram-rosters`, `telegram-set-webhooks` (idempotent re-register).
- **Config endpoint:** `POST /api/v1/telegram/config` — set/rotate bot token,
  enable `is_telegram_on`. On save: validate token via `getMe` (store
  `telegram_bot_username` / `telegram_bot_id`), generate `telegram_webhook_secret`
  + `telegram_routing_key`, call `setWebhook(..., secret_token=...,
  allowed_updates=[...])`.

## 10. API surface (mirrors MS recovery endpoints)

| Route | Purpose |
| --- | --- |
| `POST /api/v1/telegram/config` | Set/rotate bot token, enable, register webhook |
| `POST /api/v1/telegram/webhook/<routing_key>/` | Inbound Telegram updates |
| `POST /api/v1/telegram/link-token` | Issue account-binding deep link |
| `POST /api/v1/telegram/unlink` | Clear current user's binding |
| `POST /api/v1/courses/<id>/telegram-link` | Start group link (returns deep link) |
| `POST /api/v1/courses/<id>/telegram-unlink` | Bot leaves group, clear fields |

RBAC: new `telegram.configure` permission (parallel to `microsoft.configure`).

## 11. Out of scope (YAGNI for v1)

- Student linking / student-facing groups.
- Video meetings, attendance, payment assignments (not possible via Bot API).
- Two-way bot commands beyond `/start`.
- Telegram channels (we use supergroups), Mini Apps, Login Widget / OIDC.

## 12. Open items for the implementation plan

- Exact teacher-assignment signal/call sites that trigger the invite-link DM and
  the kick-on-unassign.
- Whether to pre-create the invite link at group-link time (chosen) vs. lazily.
- Migration ordering across `Organization` (public) and tenant tables.
- Settings: `TELEGRAM_TOKEN_ENCRYPTION_KEY` env var (Fernet).
