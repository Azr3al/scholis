# Telegram Login (Web) — Design

**Date:** 2026-07-23  
**Status:** Approved for implementation  
**Supersedes:** Login Widget exclusion in `2026-06-19-telegram-integration-design.md` §278 (login is now in scope for web v1).

## Goal

Allow pre-linked users to sign in on web via the **Telegram Login Widget** and receive a **Schedjuice JWT** (access + refresh), shown **side-by-side with Microsoft** on MS-enabled orgs.

## Decisions

| Topic | Choice |
|-------|--------|
| Audience | All users (students included); web first; mobile later |
| MS-on login UI | Microsoft + Telegram only (password hidden) |
| Non-MS login UI | Password + Telegram when login enabled |
| First bind | Pre-link only (no claim-by-email) |
| Who can link | Self-service Connect Telegram for everyone after password/MS login |
| Mechanism | Telegram Login Widget |
| Org flag | `is_telegram_login_on` (separate from `is_telegram_on`) |
| Session | Password-style refresh + `remember` |
| Gates | Block inactive / awaiting activation; ignore password-change and student-password policy |
| MS-on orgs | Require `User.microsoft_id` before issuing JWT |
| Tokens | Schedjuice JWT only — no Azure AD token minting |

## Flow

1. User opens `/login`; FE shows Widget when `is_telegram_login_on` and bot username exist.
2. Widget callback delivers Telegram auth fields (`id`, `auth_date`, `hash`, …).
3. `POST /api/v1/telegram-login` verifies HMAC with org bot token.
4. Lookup `User` by `telegram_user_id == id`.
5. Soft gates + MS-on `microsoft_id` check.
6. `create_refresh_session` → same envelope as password `/login`.

## Backend

- **HMAC:** secret = SHA256(bot_token); reject stale `auth_date` (> 86400s).
- **Enforce** `is_telegram_login_on` server-side.
- **Errors:** stable `message` codes: `telegram_login_disabled`, `telegram_auth_invalid`, `telegram_auth_expired`, `telegram_not_linked`, `inactive_user`, `awaiting_activation`, `microsoft_link_required`.

## Ops

Each tenant bot must allowlist school domain(s) in BotFather for the Login Widget.

## Out of scope (v1)

- Mobile Telegram login
- First-time account claim via Telegram
- Azure AD / Graph user token after Telegram login
- MS login refresh-session parity fix
