# Telegram AI pending reply — Design Spec

**Date:** 2026-06-27  
**Status:** Approved  
**Repo:** `schedjuice-reimagined-be`

## Summary

Immediate programmatic placeholder on AI invocation, then deliver the final answer using
chat-type-specific UX:

- **DM (`private`):** edit placeholder in place via `editMessageText`
- **Group (`group` / `supergroup`):** send final answer as a reply to the invoker's message

## Decisions

| Topic | Decision |
| --- | --- |
| Placeholder timing | Always — synchronously in webhook before django-q enqueue |
| Placeholder text | Random from fixed pool; no LLM |
| DM final delivery | Edit placeholder (`ack_message_id`) |
| Group final delivery | `sendMessage` with `reply_to_message_id` = invocation message |
| DM placeholder | Standalone bot message (no reply thread) — becomes the edited answer |
| Group placeholder | Reply threaded to invocation message |
| Reactions | Keep emoji reaction on user's message |
| History | `TelegramAIExchange.bot_message_id` = edited or final sent message id |

## Flow

### DM
1. Placeholder `sendMessage` → store `ack_message_id`.
2. Task edits placeholder with final answer.

### Group (future)
1. Placeholder `sendMessage` replying to invoker.
2. Task sends final answer as another reply to invoker (`ack_message_id` omitted).

## Files

- `app_telegram/config.py` — message pool
- `app_telegram/client.py` — `edit_message_text()`, optional `parse_mode` on `send_message`
- `app_telegram/binding.py` — chat-type branching for placeholder + `ack_message_id`
- `app_telegram/tasks.py` — edit vs reply delivery
