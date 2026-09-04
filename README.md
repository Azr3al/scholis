# Scholis

Online assessment that survives a bad connection.

A teacher writes a test, shares a link and a code, students take it — and it keeps
working when the school wifi drops. Objective questions mark themselves. The
teacher reviews written answers, then decides when students see their results.

- **What and why:** [DESIGN.md](./DESIGN.md)
- **How and when:** [IMPLEMENTATION.md](./IMPLEMENTATION.md)

---

## Current state — read this first

**Phases 0–2 of 8 are complete. There is no user interface yet.**

That is deliberate, not a gap. The plan builds the correctness-critical layers
first, in isolation, while they are cheap to get right — the marking engine, the
attempt state machine, the database, and every use case. Screens come in Phases
3–7, on top of a foundation that is already proven.

Running `pnpm dev` today shows a placeholder page. The working software is in the
test suite: **158 tests**, covering the full lifecycle from authoring a test to
releasing a student's result.

### What works today

| Capability                                                        | State                      |
| ----------------------------------------------------------------- | -------------------------- |
| Marking: single/multi choice, partial credit, short answer, essay | Done, 100% branch coverage |
| Attempt state machine: answer, mark for review, navigate, submit  | Done, 100% branch coverage |
| Offline sync protocol: idempotent, order-independent              | Done, server side          |
| Database schema + migration                                       | Done, 10 tables            |
| Authoring: create test, add questions, publish                    | Done, service layer        |
| Taking: start, sync answers, submit, auto-mark                    | Done, service layer        |
| Grading: mark essays, release results with gating                 | Done, service layer        |
| Answer keys never reaching the browser                            | Done, enforced + tested    |

### What does not exist yet

- Any screen a human can use (Phases 3–7)
- Sign-in (Phase 3)
- The offline client: IndexedDB, outbox, service worker (Phase 5)
- OAuth app-to-app, LTI 1.3, QTI import — deliberately deferred, see
  [IMPLEMENTATION.md §7](./IMPLEMENTATION.md)

### Progress

| Phase | Scope                                   | State        |
| ----- | --------------------------------------- | ------------ |
| 0     | Foundations, architecture guards, CI    | ✅ `b3ebe24` |
| 1     | Domain core — schema, engine, scoring   | ✅ `21753c3` |
| 2     | Persistence, query layer, services      | ✅ `1d5f6c5` |
| 3     | Vertical slice — auth, routes, rough UI | Next         |
| 4     | Authoring UI                            |              |
| 5     | Offline delivery                        |              |
| 6     | Grading & release UI                    |              |
| 7     | Results & export                        |              |
| 8     | Hardening                               |              |

Estimated remaining: ~22 working days. First demoable end-to-end flow lands at
the end of Phase 3.

---

## Getting started

```bash
pnpm install
cp .env.example .env
pnpm verify        # typecheck → lint → architecture → 158 tests
```

Requires Node 22+ and pnpm 9.15+. **No database or Docker needed** — integration
tests run PGlite, real Postgres compiled to WASM, in-process.

## Commands

| Command          | Does                                                |
| ---------------- | --------------------------------------------------- |
| `pnpm verify`    | typecheck → lint → arch → test. Run before pushing. |
| `pnpm test`      | 158 tests across every package                      |
| `pnpm arch`      | dependency-cruiser — the layering rules             |
| `pnpm typecheck` | `tsc` across every package                          |
| `pnpm lint`      | ESLint across every package                         |
| `pnpm format`    | prettier write                                      |
| `pnpm dev`       | Run the web app (placeholder page until Phase 3)    |

## Layout

```
packages/
  config/    shared tsconfig, eslint, vitest presets
  schema/    Zod domain types — the source of truth
  engine/    pure attempt state machine. no keys, no I/O.
  scoring/   pure scorer. SERVER ONLY.
  db/        Drizzle tables, migrations, test harness
apps/web/
  app/       (take) student flow · api/ route handlers
  server/    use cases — one file, one verb
  data/      query modules — the only place SQL lives
  lib/       http error mapping; offline client lands in Phase 5
```

```
app/api  →  server  →  data  →  db
              ↓
      engine · scoring · schema
```

Internal packages export TypeScript source rather than a built `dist`; Next
compiles them via `transpilePackages`. That removes build ordering and an entire
class of stale-build bugs.

## Architecture guards

Boundaries are enforced by tooling, not discipline. `pnpm arch` and the ESLint
`pure` config run in CI on every push.

| Guard                      | Enforced by        | Protects                                                      |
| -------------------------- | ------------------ | ------------------------------------------------------------- |
| `no-scoring-in-client`     | dependency-cruiser | Answer keys never reach a student's browser                   |
| `no-service-to-service`    | dependency-cruiser | Services orchestrate; they do not compose into a tangle       |
| `no-service-logic-in-data` | dependency-cruiser | A query module that scores something is a service in disguise |
| `no-db-in-routes`          | dependency-cruiser | Business logic stays in services, not HTTP handlers           |
| `no-cycles`                | dependency-cruiser | Module init order never becomes load-bearing                  |
| pure-core I/O ban          | ESLint             | `engine`/`scoring` stay testable without infrastructure       |

**Every guard has been observed rejecting a real violation.** If you change these
rules, re-prove them: write a file that should fail, confirm it does, then delete
it. A guard nobody has watched fail is not a guard.

`no-scoring-in-client` matters most. `@scholis/scoring` is the only code that
touches answer keys; if it reaches a client bundle, the product is worthless for
real exams. It is backed by a spec that walks the serialised test payload and
asserts no key-shaped property exists at any depth.

## Testing

| Target                   | Type                       | Bar                                     |
| ------------------------ | -------------------------- | --------------------------------------- |
| `engine`, `scoring`      | pure unit                  | 100% branch, enforced by threshold      |
| `db`, `data/`, `server/` | integration, real database | Every use case, happy and failure paths |
| Architecture             | static                     | The table above                         |

Integration tests default to PGlite for a fast local loop. CI additionally runs
the identical suite against a real Postgres server, because "same engine" and
"same build" are not the same claim and persistence is where that difference
would be expensive.

## Deployment

Railway, via `Dockerfile` and `railway.json`, health-checked at `/api/health`.
Two services in one project — web and Postgres — joined over the private network
with `DATABASE_URL` as a reference variable.

Account and project provisioning are handled outside this repo. Nothing has been
deployed yet.

## Open decisions

Tracked in [IMPLEMENTATION.md §9](./IMPLEMENTATION.md):

1. **Image storage** — Railway volume or S3-compatible. On hold. The boundary is
   already fixed so the provider can be chosen later without touching the core;
   the question that actually decides it is whether Scholis will ever run more
   than one web replica.
2. **Test code format** — currently `SCHOL-XXXXXX`, using an alphabet with no
   ambiguous characters so a teacher can read one aloud.
3. **Retakes** — `maxAttempts` exists and is enforced, but takers self-declare
   their name, so it is an honesty mechanism rather than a control.

Organisations are admin-provisioned. There is no self-service signup and none is
planned.
<<<<<<< HEAD
#   S c h o l i s  
 #   S c h o l i s .  
 
=======
>>>>>>> master
#   s c h o l i s  
 