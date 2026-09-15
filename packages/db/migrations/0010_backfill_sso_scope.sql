-- Grant `sso:write` to org keys that were provisioned before teacher SSO existed.
--
-- `provisionOrg` writes whatever `ORG_SCOPES` holds at the moment it runs, and
-- it deliberately does not re-issue or amend a key when an integrator retries —
-- a repeat provisioning call returns `key: null` and touches nothing. So adding
-- `sso:write` to `ORG_SCOPES` only ever affected schools provisioned *after*
-- the deploy. Every school already connected kept the four-scope key it was
-- given, and `mintTeacherSsoTicket` refuses it with "This key cannot sign
-- teachers in." There is no code path that would ever have fixed that: the
-- scopes column is only written on insert.
--
-- Scoped tightly on purpose:
--   * `kind = 'org'` — a platform key must never hold a scope that acts inside
--     a school, which is the whole point of the two tiers.
--   * `org_id IS NOT NULL` — belt and braces on the same rule; a key with no
--     school cannot sign a teacher into one.
--   * `revoked_at IS NULL` — a revoked credential stays exactly as it was. It
--     is history, and widening a dead key's scopes would falsify the audit
--     trail without making anything work.
--   * `NOT (... @> ARRAY['sso:write'])` — idempotent, so re-running is a no-op
--     rather than a key holding the scope twice.
--
-- This grants existing integrators precisely what a school provisioned today
-- already gets, which is the parity `provisioning.test.ts` asserts.
UPDATE "api_clients"
SET "scopes" = "scopes" || ARRAY['sso:write']::text[]
WHERE "kind" = 'org'
  AND "org_id" IS NOT NULL
  AND "revoked_at" IS NULL
  AND NOT ("scopes" @> ARRAY['sso:write']::text[]);
