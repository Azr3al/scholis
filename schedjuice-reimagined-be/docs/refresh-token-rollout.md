# Refresh token rollout

## Phase 1 (current)

- Backend exposes `refresh`, `session_id`, and `refresh_expires_at` on `/login` and `/ms-login`.
- Endpoints: `POST /api/v1/token/refresh`, `POST /api/v1/logout`, `POST /api/v1/logout-all`.
- Access token lifetime remains **8 hours** (`SIMPLE_JWT.ACCESS_TOKEN_LIFETIME`).
- Refresh sessions: **7 days** default, **90 days** when `remember: true`.
- Web and mobile clients persist refresh credentials and retry once after 401 via `/token/refresh`.

## Phase 2 (follow-up)

- After both clients are stable in production, shorten access token lifetime (e.g. 15–30 minutes).
- Monitor refresh endpoint error rate and replay revocations before shortening access TTL.

## Verification

1. Login (email and Microsoft) returns `refresh` + `session_id`.
2. Wait for access expiry or force-expire access JWT; API calls recover without re-login.
3. Logout revokes refresh session; subsequent refresh returns 401.
4. `logout-all` revokes all sessions for the user in the tenant.
5. Reusing an old refresh token after rotation revokes the session (replay protection).

## Client storage

| Client | Access | Refresh / session |
|--------|--------|-------------------|
| Web | `access` cookie | `refresh`, `session_id` cookies (client-readable) |
| Mobile | SecureStore `access` | SecureStore `refresh`, `session_id` |

Tenant header: web `X-Tenant`, mobile `Tenant` (schema cookie / SecureStore).
