# Scholis

Online assessment that survives a bad connection.

A teacher writes a test, shares a link and a code, students take it — and it keeps
working when the school wifi drops. Objective questions mark themselves. The
teacher reviews written answers, then decides when students see their results.

Schools that already run an LMS can drive Scholis from it over an API instead:
provision the school, send a student straight into a paper, pull released marks
back out. See [Integration](#integration-api).

---

## Layout

Two deployables and six internal packages.

```
apps/
  web/     Next.js 15 + React 19. Authoring UI, take flow, offline client.
           No database dependency at all — it talks to the API over HTTP.
  api/     Hono on @hono/node-server. Every use case, all persistence, all
           marking. The only place answer keys and the database meet.
packages/
  config/     shared tsconfig, eslint and vitest presets
  contracts/  Zod shapes that cross the wire between web and api
  schema/     Zod domain types — the source of truth
  engine/     pure attempt state machine. no keys, no I/O.
  scoring/    pure scorer. SERVER ONLY.
  db/         Drizzle tables, migrations, test harness
```

```
apps/web  ──HTTP──▶  apps/api/http  →  apps/api/server  →  apps/api/data  →  packages/db
                                            ↓
                                  engine · scoring · schema
```

Internal packages export TypeScript source rather than a built `dist`; the
consumers compile them (`transpilePackages` in Next, esbuild in the API). That
removes build ordering and an entire class of stale-build bugs.

`packages/contracts` exists because web and api are separate deployables and web
cannot import from api. Without it the request and response shapes get
hand-declared on both sides and drift silently — the client keeps compiling while
the server has moved on. It also keeps database rows off the wire: services used
to return `TestRecord`, which _was_ `TestRow`, so columns like `org_id` were
being serialised to clients with no business seeing them.

---

## Getting started

```bash
pnpm install
cp .env.example .env
pnpm dev          # api on :3001, web on :3000
pnpm verify       # typecheck → lint → architecture → 475 tests
```

Requires Node 22+ and pnpm 9.15+. **No database or Docker needed** — integration
tests run PGlite, real Postgres compiled to WASM, in-process. Set
`TEST_DATABASE_URL` to run the identical suite against a real server, as CI does.

`pnpm dev` starts both apps. The web dev server rewrites `/api/*` to the API, so
the Better Auth session cookie stays first-party — see
[Why the proxy](#why-the-proxy).

## Commands

| Command          | Does                                                    |
| ---------------- | ------------------------------------------------------- |
| `pnpm verify`    | typecheck → lint → arch → test. Run before pushing.     |
| `pnpm test`      | 475 tests across every package                          |
| `pnpm test:e2e`  | Playwright, 16 specs against a running pair of services |
| `pnpm arch`      | dependency-cruiser — the layering rules                 |
| `pnpm typecheck` | `tsc` across every package                              |
| `pnpm lint`      | ESLint across every package                             |
| `pnpm format`    | prettier write                                          |
| `pnpm dev`       | web (:3000) and api (:3001)                             |
| `pnpm build`     | production builds for both apps                         |

E2E needs the services running first, and the offline specs need a production
build (`E2E_PRODUCTION=1`) because the service worker only registers in one.

---

## What exists

| Capability                                                                     | Where                               |
| ------------------------------------------------------------------------------ | ----------------------------------- |
| Authoring: tests, questions, sections, tags, reorder, publish                  | `apps/api/server/tests`             |
| Rich text with images, audio and KaTeX maths (ProseMirror)                     | `apps/web/components/editor`        |
| Taking: start, sync, submit, mark for review, navigate                         | `packages/engine`                   |
| Marking: single/multi choice with rubrics, partial credit, short answer, essay | `packages/scoring`                  |
| Offline: IndexedDB, mutation outbox, service worker                            | `apps/web/lib/take`, `public/sw.js` |
| Grading: mark written answers, release results with gating                     | `apps/api/server/grading`           |
| Teacher sign-in: Better Auth magic link                                        | `apps/api/lib/auth.ts`              |
| Accounts, teams, invitations                                                   | `apps/api/server/accounts`          |
| Uploads to a mounted volume                                                    | `apps/api/server/uploads`           |
| Integration API for an external platform                                       | `apps/api/server/integrations`      |
| Answer keys never reaching a student's browser                                 | enforced by guard + spec            |

Students never have an account. They arrive with a test code, or with a
one-time launch ticket minted by an integrating platform.

### Integration API

How another system (Schedjuice, say) drives Scholis without borrowing a
teacher's login.

Credentials are `sch_live_<keyId>.<secret>`, in two tiers:

- **Platform key** — provisions schools. Holds no scope that can read a paper.
- **Org key** — acts inside exactly one school. Can never mint a key.

That split is what makes revocation mean something. Secrets are stored as
SHA-256 rather than argon2 (there is nothing to brute-force in 32 random bytes,
and a slow hash on every request buys nothing), compared in constant time, and
prefixed so secret scanners catch a leak.

An org key resolves to the same `Actor` a teacher session does, so every service
is already scoped to one school and none of them had to change.

| Endpoint                             | Key      | Does                                                   |
| ------------------------------------ | -------- | ------------------------------------------------------ |
| `POST /api/integration/orgs`         | platform | Provision a school, idempotent on `externalRef`        |
| `POST /api/integration/launch`       | org      | Mint a one-time URL sending a named taker into a paper |
| `GET  /api/integration/scores`       | org      | Released results with per-section breakdown            |
| `GET  /api/integration/events`       | org      | Catch up from `since=<seq>`                            |
| `GET/POST /api/integration/webhooks` | org      | Manage signed push endpoints                           |
| `POST /api/integration/teacher-sso`  | org      | Mint a one-time sign-in link for an existing teacher   |
| `GET/POST /api/keys*`                | session  | Key dashboard — refuses a machine caller               |

Design decisions worth knowing:

- **Provisioning is idempotent and deliberately does not re-issue a key on
  retry.** Otherwise a caller with a flaky connection quietly accumulates live
  credentials it never recorded. `201` on a fresh school, `200` on a repeat, so
  a retry can tell which one it was.
- **A launch ticket carries identity inside it**, so a student editing the URL
  edits nothing that matters. `taker_ref` is what makes a mark routable back to
  a gradebook row. The ticket is redeemed only once the paper is confirmed open
  — a student hitting a closed paper does not lose their link.
- **Scores are released-only, enforced in the `WHERE` clause** rather than by a
  caller-side filter. Raw marks and maximums only: no grades, no percentages, no
  boundaries. Those belong to the caller.
- **Webhooks queue their delivery row in the same transaction as the event**, so
  a crash cannot lose one. HMAC-signed with the timestamp inside the signed
  material, exponential backoff, and `since=<seq>` to catch up on anything
  missed. Due times come from `ctx.now()`, not the database clock, matching this
  codebase's rule that all time comes from the context.

### Teacher SSO

A teacher who is already signed into the integrating platform should not have to
prove it again to Scholis. The platform mints a link with its org credential and
the teacher's browser follows it:

```
POST /api/integration/teacher-sso   { email, externalRef? }   <- org key, sso:write
  -> { url: "https://web/sso?ticket=...", expiresAt }
GET  /sso?ticket=...                  <- teacher's browser
POST /api/auth/sso/exchange         { ticket }  -> session cookie, then /teacher
```

The ticket is stateful and single-use, stored beside `launch_tokens` and for the
same reason: it is redeemed seconds after being minted, so a row costs nothing
and a replayed link must not produce a second staff session. It resolves to a
`user_id` when minted rather than carrying an email to be looked up later, so a
live ticket follows the teacher it was made for whatever happens to the address
in between. Five minutes to live.

It **cannot create an account.** A teacher with no Scholis user is refused and
has to be invited through the normal path — sign-in authenticates, it never
provisions, and `lib/auth.ts` enforces that on the database write itself rather
than trusting a plugin option. `externalRef` is the caller's own staff id,
recorded for audit and never used to authorise anything.

Refusals are deliberately indistinguishable. "No such teacher" and "a teacher at
another school" produce the same message, because email is globally unique here
and an org credential that could tell them apart could enumerate which addresses
hold accounts at other schools. Likewise a spent, an expired and a never-issued
ticket all fail identically at the exchange.

Matching is case-insensitive but not whitespace-tolerant. The service lower-cases
the address before looking it up — normalisation lives in the service rather than
the schema, because chaining `.toLowerCase()` onto `z.email()` silently does
nothing in zod 4 and once let one address become two accounts. But `z.email()`
gates the shape first, so `" ada@x.test "` is refused with a 400 before any of
that runs. An integrator importing addresses from a spreadsheet should trim them.
Both halves are asserted, so the trim in the service is not mistaken for a
promise the endpoint does not keep.

Both browser-side calls above go to the **web** origin and reach the API through
the rewrite in `next.config.ts`. That is load-bearing, not incidental. Web and
API sit on separate `*.up.railway.app` subdomains and `up.railway.app` is on the
Public Suffix List, so browsers treat them as different sites and a
`SameSite=Lax` cookie set by the API is never sent back from the web origin.
`lib/api.ts` and `lib/auth-client.ts` therefore use a relative base in the
browser; `NEXT_PUBLIC_API_URL` stays the API's public origin and is only used
server-side, where there is no origin to be relative to.

Getting this wrong fails in a way that looks like the ticket is broken when it
is not: the exchange returns `200`, Better Auth sets a perfectly valid
`better-auth.session_token`, and the browser stores it host-only against the API
origin. The redirect to `/teacher` then reads no session and the teacher is
bounced to sign-in having done everything right. `lib/api-origin.test.ts`
asserts the URL actually fetched rather than the constant, because the constant
is an implementation detail and the request is what broke.

The exchange is a Better Auth plugin rather than a Hono route, because Better
Auth owns the session cookie's name, prefix, `sameSite` and `secure` attributes;
minting one from a route would leave Scholis holding a second, silently drifting
definition of them. It uses `formCsrfMiddleware` and not `originCheckMiddleware`:
the latter only enforces when the request carries a cookie, and this is a
first-login POST that by definition carries none.

`sso:write` is a scope of its own rather than folded into `launch:write`. One
admits a student to a paper, the other opens a staff session, and a key used only
for sittings should not be able to sign a teacher in. Note that provisioning
grants it by default — `provisioning.test.ts` spells the scope list out so that
adding one is a deliberately taken decision rather than a silent widening.

Adding it to `ORG_SCOPES` only affected schools provisioned afterwards, which is
worth spelling out because it is the kind of gap that does not show up in a test
suite. `provisionOrg` writes the scope list as it stands the moment it runs, and
a retry deliberately amends nothing — it returns `key: null` and leaves the
existing credential alone. The scopes column is written on insert and never
again, so every school already connected kept its four-scope key and got "This
key cannot sign teachers in." from an otherwise perfectly valid credential.
Migration `0010_backfill_sso_scope.sql` grants the scope to live org keys,
skipping platform keys and revoked ones, and is idempotent. `sso-scope-backfill.test.ts`
seeds the key an existing school actually holds rather than a freshly provisioned
one, which is the assumption that hid the problem.

---

## Architecture guards

Boundaries are enforced by tooling, not discipline. `pnpm arch` and the ESLint
`pure` config run in CI on every push.

| Guard                             | Protects                                                      |
| --------------------------------- | ------------------------------------------------------------- |
| `no-scoring-in-client`            | Answer keys never reach a student's browser                   |
| `no-db-in-client`                 | `apps/web` holds no database dependency, transitively either  |
| `no-db-in-http`                   | Business logic stays in services, not HTTP handlers           |
| `no-service-to-service`           | Services orchestrate; they do not compose into a tangle       |
| `no-service-logic-in-data`        | A query module that scores something is a service in disguise |
| `no-io-in-core`                   | `engine`/`scoring` stay testable without infrastructure       |
| `engine-and-scoring-are-siblings` | The two pure cores never depend on each other                 |
| `schema-depends-on-nothing`       | The source of truth imports no sibling                        |
| `no-cycles`                       | Module init order never becomes load-bearing                  |
| `no-orphans`                      | Leftovers get deleted or wired up                             |

**Every guard has been observed rejecting a real violation.** If you change these
rules, re-prove them: write a file that should fail, confirm it does, then delete
it. A guard nobody has watched fail is not a guard.

`no-scoring-in-client` matters most. `@scholis/scoring` is the only code that
touches answer keys; if it reaches a client bundle, the product is worthless for
real exams. It covers `app/take`, `components/take` and `lib/take`, and is backed
by a spec that walks the serialised test payload and asserts no key-shaped
property exists at any depth.

Note that the guards match on **paths that exist**. When a directory moves, the
regex has to move with it — a rule pointed at a stale path passes forever while
protecting nothing.

### Why the proxy

Web and API sit on separate `*.up.railway.app` subdomains, and `up.railway.app`
is on the Public Suffix List, so browsers treat them as different sites: a
`SameSite=Lax` cookie set by the API would never be sent back from the web
origin. `next.config.ts` rewrites `/api/*` to the API instead, which makes the
cookie first-party. That is stricter than loosening `SameSite` — the cookie
settings themselves are untouched.

Next evaluates `rewrites()` at build time and writes the destination into
`routes-manifest.json`, so `API_PROXY_TARGET` must be present when the image is
built. Changing the target means a rebuild, not just a variable edit.

The corollary is `AUTH_URL`, and it is the one that bites. It is better-auth's
`baseURL`, so it decides where magic links point and whether the session cookie
carries `Secure` and the `__Secure-` prefix — and it also builds upload URLs as
`<AUTH_URL>/api/files/<key>`. All three have to reach the browser through the
proxy, so in production `AUTH_URL` is the **web** origin even though the API is
what reads it, and it equals `WEB_ORIGIN`. Point it at the API's own subdomain
instead and a teacher who clicks a magic link is handed a cookie scoped to that
subdomain, which the web origin never sends back: they land on `/teacher` signed
out with nothing in either service's logs to explain it. `http://localhost:3001`
is safe in development only because cookies for `localhost` ignore the port, so a
cookie set on `:3001` is sent to `:3000` too. Production gets no such mercy — the
two subdomains are different sites. Use `https` there, or the session cookie loses
`Secure`.

---

## Testing

| Target                         | Type                       | Bar                                     |
| ------------------------------ | -------------------------- | --------------------------------------- |
| `engine`, `scoring`            | pure unit                  | 100% branch, enforced by threshold      |
| `db`, `api/data`, `api/server` | integration, real database | Every use case, happy and failure paths |
| `web/lib`                      | unit                       | Offline cache, snapshots, grouping      |
| Browser journeys               | Playwright                 | 16 specs, authoring through release     |
| Architecture                   | static                     | The table above                         |

475 passing, 1 skipped (254 api, 80 engine, 52 web, 47 scoring, 33 schema, 9 db).

Integration tests default to PGlite for a fast local loop. CI additionally runs
the identical suite against a real Postgres server, because "same engine" and
"same build" are not the same claim and persistence is where that difference
would be expensive.

---

## Data

Drizzle ORM over Postgres: 25 tables, 6 enums, 10 migrations. Migrations run as a
`preDeployCommand` on the API service, never at web boot.

`0006` and `0007` were originally hand-written into the journal with no
snapshots, which made `db:generate` diff against `0005` and re-emit
`CREATE TABLE test_tags` — a failure on any database that had already run them.
`0008` is generated properly and restores the chain.

## Deployment

Railway: two app services (web, api) plus Postgres, joined over the private
network with `DATABASE_URL` as a reference variable. Each app has its own
`Dockerfile` and `railway.json`, both built with the repository root as context
because pnpm needs the workspace root and every manifest before it can resolve
anything.

The API image runs the esbuild bundle and takes configuration from the platform;
its `start` script runs `tsx` against TypeScript with `dotenv-cli`, all three of
which are development-only. Health is `/api/health` (touches nothing — if the
process can answer, it must not be restarted) and readiness is `/api/ready`
(checks Postgres, so a wrong `DATABASE_URL` fails the deploy rather than the
first student to open a paper).

`MAIL_PROVIDER` must be set explicitly in production. The `console` mailer prints
sign-in links to stdout, which is right in development and catastrophic in
production — every magic link would go to the server log and sign-in would look
broken with no error anywhere.

## Conventions worth keeping

- **All time comes from `ctx.now()`.** The engine never reads a clock; the caller
  supplies `now`. That is what keeps it testable without fake timers and lets the
  server replay an attempt to settle a dispute.
- **Services never call services.** Shared need is domain logic (`engine`,
  `scoring`), data access (`data/`), or a co-located private helper.
- **A domain error carries a public message and a code.** Status codes are a
  transport concern, mapped in exactly one place (`apps/api/lib/http.ts`). An
  unrecognised error is a bug, not a refusal — its message is never echoed,
  because it routinely contains SQL, table names or connection strings.
- **Sign-in authenticates, it never provisions.** Orgs and members come from the
  admin script; an unknown address is rejected rather than onboarded. The
  guarantee sits on the database write itself, not only on a plugin option.

## Open decisions

1. **Image and audio storage** — currently a Railway volume. The provider
   boundary is already fixed (`resolveStorageProvider`) so S3-compatible can be
   added as one case in one switch. The question that actually decides it is
   whether Scholis will ever run more than one API replica.
2. **Test code format** — `SCHOL-XXXXXX`, using an alphabet with no ambiguous
   characters so a teacher can read one aloud.
3. **Retakes** — `maxAttempts` exists and is enforced, but takers self-declare
   their name, so it is an honesty mechanism rather than a control.
4. **Teacher SSO scope by default** — `sso:write` is granted to every key minted
   at provisioning, on the reasoning that the platform provisioning a school is
   the platform that will send its teachers in. A school wanting narrower can
   mint one from the dashboard, which takes an explicit scope list. Whether that
   default is right for every future integrator is unproven.
5. **Social sign-in** — Google and Microsoft are still absent. Adding either is a
   `socialProviders` entry plus credentials; the `accounts` table that would
   store the linkage already exists, so it is not a migration. Neither is what
   an integrating platform needs, which is the case teacher SSO covers.
