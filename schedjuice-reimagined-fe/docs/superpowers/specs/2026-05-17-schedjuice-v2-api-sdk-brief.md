# Schedjuice v2 — API SDK Brief

> **Audience:** the AI agent building the new API SDK for Schedjuice v2.
> **Mode:** SDK-first. No application features built on top of this SDK until the foundation defined here is in place and reviewed.
> **Greenfield rule:** this SDK ships into a clean FE repo. No legacy `src/lib/api.ts`, `src/helpers/*-api.ts`, or `src/app/client-api/` files exist; you are building from scratch. The patterns documented in §2 (Anti-positioning) describe the problems of the predecessor SDK — they are constraints to design against, not code to migrate. You do not have read access to the legacy FE repo; everything you need is in this brief and the backend repo (`schedjuice-reimagined-be`).

---

## 1. What you're building

A typed, isomorphic, two-layer SDK for the Schedjuice REST backend (`schedjuice-reimagined-be`, Django + DRF, mounted at `/api/v1/`). The SDK is the **only** way the application talks to the backend. After this phase, no component, hook, or page imports `axios` directly.

The SDK has two layers:

1. **Imperative client** — `sdk.courses.list({ where })`, `sdk.courses.get(id)`, `sdk.users.me()`. Pure functions. No React. Runs in RSCs, route handlers, Node scripts, tests, and the browser.
2. **Thin hooks layer** — `useCoursesList({ where })`, `useCourse(id)`, `useUpdateCourse()`. Tanstack-query wrappers over the imperative client. Hides query keys, default options, `enabled` logic, abort plumbing.

The SDK runs **isomorphically**: pages do `await sdk.courses.list(...)` on the server, dehydrate the query into `HydrationBoundary`, and the matching `useCoursesList` hook on the client picks up the cache without a re-fetch. This is how we kill the first-paint waterfall before it can exist.

You are not building application features in this phase. But every design choice must survive contact with a finance table that filters 8 ways, a quiz attempt list of 500 rows, a chat thread, and a tenant-scoped reporting endpoint that returns a custom `summary` field.

**Backend access.** You have write access to both this repo and the backend repo (`schedjuice-reimagined-be`). When a needed backend change is discovered — a missing batch endpoint, a serializer field that should exist, a wrong response shape — make the change directly in the backend rather than working around it on the FE side. Read the relevant Django serializer / view first; follow existing patterns in the surrounding app. Backend changes ship in the same commit (or adjacent commits) as the FE code that depends on them.

---

## 2. Anti-positioning — why this SDK exists

The predecessor SDK (in the legacy repo you do not have access to) had six structural problems documented during a teardown. This brief is designed against each of them — they are constraints, not code you need to inspect:

1. **There is no SDK boundary.** `axiosClient` is imported directly in ~50 components, hooks, and pages. Every consumer reinvents URL composition, response unwrapping, and error handling. A backend rename means grepping the whole tree.
2. **The backend envelope (`{ data, isError, message, summary }`) leaks four levels deep.** Consumers write `data?.data.data.name`. Three different unwrap shapes exist on the same endpoint family.
3. **Types are essentially `any`.** Helpers return `Promise<AxiosResponse<any>>`. Hand-typed entity definitions exist in `src/types/*.ts` but are only ever used as **call-site casts**, never enforced at the SDK boundary.
4. **N+1 was endemic.** Lists ran one `useQuery` per row. Inline cells fired one mutation per cell. Six-step serial waterfalls (each query gated on `enabled: Boolean(prevQuery.data)`) blocked first paint. The new SDK makes these shapes impossible by construction.
5. **Query keys are stringly-typed and template-literal-built.** `[\`get${entityName}\`, entityId, isEdit]`. Invalidations don't match the keys the lists actually use, so creates don't invalidate the tables that show them.
6. **DRY at the helper, WET at the consumer.** Six generic helpers exist, but custom routes (~30–40% of the backend) bypass them entirely into raw `axiosClient.get(...)`. The base64-array-encoder is reimplemented inline in two more files. The `enabled: Boolean(courseId)` pattern is repeated dozens of times.

The new SDK eliminates each of these by construction. If a primitive in this spec doesn't visibly kill at least one of the six, it doesn't belong in the foundation.

---

## 3. Architectural principles

These principles are not negotiable. Every design decision in §§4–13 follows from them.

1. **The SDK is the boundary.** Outside `src/sdk/**`, nothing imports axios, raw fetch, or hand-builds an API URL. Period.
2. **Generic CRUD lives once.** The `list / get / create / update / delete / search` verbs are implemented exactly one time, in `core/`. Resources consume them via a small `defineResource` factory.
3. **Resources are thin.** A vanilla CRUD resource is ~10 lines. Resources only grow when they have custom routes or domain helpers; those live in the same file (or folder for resources with many).
4. **Types come from the serializer.** No codegen. The agent reads the matching Django serializer, hand-writes the TypeScript type in `_types/`, and cites the serializer in a docblock. Drift is prevented by discipline + verification tests, not by a toolchain.
5. **Everything is typed.** No `any`. Filter params are a typed builder, not a `{ field_name, operator, value }` literal. The envelope is unwrapped at the SDK boundary; consumers see typed payloads.
6. **Isomorphic by default.** The imperative client runs on both the server (Next.js RSCs, route handlers) and the client (browser). Auth and tenant resolution have one server path and one client path; consumers never know which is running.
7. **No waterfalls, no N+1.** The patterns that produce them are banned by the spec (see §13). Where the backend can't currently batch, the agent adds the batch endpoint to the backend, then wraps it in the SDK.
8. **Query keys are factory-generated.** Stringly-typed keys and template-literal keys are banned. Invalidations resolve through the factory, not by guessing.

---

## 4. File layout

```
src/sdk/
  core/
    fetcher.ts          # isomorphic fetch (axios under the hood); server reads Next.js cookies(),
                        # client reads cookies-next; both add Authorization + X-Tenant
    envelope.ts         # unwrap { data, isError, message, summary } -> typed payload OR throw ApiError
    error.ts            # ApiError class; field-level errors, network errors, 401 / 403 / 404 / 5xx mapping
    auth.ts             # cookie read (dual-path via next/headers + cookies-next) and write
                        # (client-only via cookies-next). Used by fetcher (read) and resources/auth.ts (write).
    tenant.ts           # X-Tenant header resolution from the `schema` cookie; same dual-path shape
                        # as auth. NOTE: this is HEADER plumbing; the tenant OBJECT lives in resources/tenants.ts.
    host.ts             # forward the request's Host / Origin header on the server (via next/headers headers())
                        # so unauthenticated tenant-resolution requests work. Client path is a no-op
                        # (browser sets Origin automatically).
    types.ts            # Page<T>, ListResult<T, S>, FilterParams, WhereClause<T>, SortClause<T>, OperatorEnum
    define-resource.ts  # the generic CRUD factory that resources consume
    query-key-factory.ts# createQueryKeys utility; produces typed key trees
    query-client.ts     # configured QueryClient; stale-time tiers; retry policy; abort plumbing
    hydration.ts        # dehydrate / hydrate helpers for RSC pages
    invariants.ts       # dev-only: detect .map(useQuery), template-literal keys, raw axios imports
  _types/
    auth.ts             # cites app_auth/views.py::LoginView, ::MSLoginView
    tenants.ts          # cites app_org/serializers.py::OrganizationSerializer (or wherever the
                        # Organization serializer actually lives — confirm against the backend)
    users.ts            # hand-typed; cites app_auth/serializers.py::UserSerializer
    courses.ts          # cites app_course/serializers.py::CourseSerializer
    attachments.ts      # cites app_attachment/serializers.py::AttachmentSerializer
    common.ts           # shared enums (UserRole, PaymentStatus, etc.)
  resources/
    auth.ts             # login, loginMicrosoft (reads MSAL config from current tenant), logout;
                        # wraps MSAL; writes cookies via core/auth.ts
    tenants.ts          # CRUD via defineResource (backend path: "organizations") + current()
                        # custom route for the unauthenticated /organizations/public endpoint
    users.ts            # imperative client + custom routes (me, available-for-timeslot); single file
    courses/
      index.ts          # base resource via defineResource + custom routes (zoom, students,
                        # payment-assignment-month-status); folder because the route surface is wide
      students.ts       # nested-resource client for courses/<id>/students
      zoom.ts           # nested-resource client for courses/<id>/zoom-meeting/*
    attachments.ts      # imperative client + the batch primitive listForEntities
  hooks/
    auth.ts             # useLogin, useLoginMicrosoft, useLogout
    tenants.ts          # useTenantCurrent, useTenant (by id), useTenantsList, useUpdateTenant
    users.ts            # useUserMe, useUserById, useUpdateUser
    courses.ts          # useCoursesList, useCourse, useCreateCourse, useUpdateCourse,
                        # useCourseStudents (nested), etc.
    attachments.ts      # useAttachmentsForEntity, useAttachmentsForEntities (batch)
  keys/
    auth.ts             # queryKeys.auth (minimal; auth is mostly mutations)
    tenants.ts          # queryKeys.tenants
    users.ts            # queryKeys.users
    courses.ts          # queryKeys.courses
    attachments.ts      # queryKeys.attachments
    index.ts            # export const queryKeys = { auth, tenants, users, courses, attachments }
  index.ts              # export const sdk = { auth, tenants, users, courses, attachments };
                        # export { queryKeys, ApiError, ... }
  README.md             # SDK usage guide: how to add a resource, read cache from RSC, etc.
```

The file layout is **shallow on purpose**. The agent does NOT create `client.ts / hooks.ts / keys.ts / index.ts` per resource. Vanilla resources are a single file in `resources/`. Folders only appear when a resource has more than two custom routes (Courses qualifies; Users and Attachments don't).

---

## 5. Type sourcing rule

**No codegen.** Types are hand-written, sourced from the backend serializer, and cited in a docblock.

For every type in `_types/<resource>.ts`:

```ts
/**
 * @source app_course/serializers.py::CourseSerializer
 * @endpoint GET /api/v1/courses, GET /api/v1/courses/<id>
 *
 * Notes:
 * - `category` and `subject` are FK ids; expand=["category","subject"] returns nested objects.
 * - `student_count` and `main_teacher_count` are read-only annotations; not on create/update payloads.
 */
export type Course = {
  id: number;
  title: string;
  // ...
};

/** @source app_course/serializers.py::CourseSerializer (write-only fields filtered) */
export type CourseCreate = Pick<Course, "title" | "category" | "subject" | "start_date" | "end_date">;
```

**The rule:** before adding or changing any type in `_types/`, the agent opens the matching `app_<x>/serializers.py` (and the view if it returns a custom shape), reads it, and writes the type to match. The docblock cites the serializer file + class. Diverging from the serializer without updating the docblock is a banned-list violation (see §16).

Custom-shape endpoints (admin reports, search summaries, bulk-action responses) also live in `_types/` next to the resource, with a docblock citing the view file + class.

If the backend doesn't expose a clean type for something (e.g., `users/available-for-timeslot` returns a hand-shaped dict instead of a serialized model), the agent writes the type from the view code and notes the source in the docblock.

---

## 6. The resource pattern

### 6.1 Generic CRUD core

```ts
// src/sdk/core/define-resource.ts
export type ResourceConfig = {
  path: string;          // "courses", "users", "attachments"
  searchable?: boolean;  // does the backend expose path/search ?
};

export function defineResource<TRead, TCreate = Partial<TRead>, TUpdate = Partial<TRead>>(
  config: ResourceConfig,
) {
  return {
    list:   (q?: ListQuery<TRead>)              => coreList<TRead>(config.path, q),
    get:    (id: number | string, opts?: GetOptions<TRead>) => coreGet<TRead>(config.path, id, opts),
    search: config.searchable
              ? (q: ListQuery<TRead>, where: WhereClause<TRead>) =>
                  coreSearch<TRead>(config.path, q, where)
              : undefined,
    create: (data: TCreate) => coreCreate<TRead>(config.path, data),
    update: (id: number | string, data: TUpdate) => coreUpdate<TRead>(config.path, id, data),
    remove: (id: number | string) => coreRemove(config.path, id),
  };
}
```

`coreList`, `coreSearch`, etc. live in `core/` and call `fetcher` + `envelope.unwrap`. CRUD is written exactly once.

### 6.2 Vanilla resource — single file

```ts
// src/sdk/resources/campuses.ts (illustration; campuses is NOT in foundation scope)
import { defineResource } from "@/sdk/core/define-resource";
import type { Campus, CampusCreate } from "@/sdk/_types/campuses";

export const campuses = defineResource<Campus, CampusCreate>({
  path: "campuses",
  searchable: true,
});
```

That's the whole resource. Consumer gets `sdk.campuses.list({ where })`, `sdk.campuses.get(id)`, etc., fully typed.

### 6.3 Resource with custom routes

```ts
// src/sdk/resources/users.ts
import { fetcher } from "@/sdk/core/fetcher";
import { defineResource } from "@/sdk/core/define-resource";
import type { User, UserCreate, UserAvailability } from "@/sdk/_types/users";

const base = defineResource<User, UserCreate>({ path: "users", searchable: true });

export const users = {
  ...base,
  /** GET users/me — currently authenticated account. */
  me: () => fetcher.get<User>("users/me"),
  /** GET users/available-for-timeslot — staff free in a month/weekday/timeslot grid (tenant timezone). */
  availableForTimeslot: (params: {
    yearMonth: string; timeFrom: string; timeTo: string; weekdays: string;
  }) => fetcher.get<UserAvailability>("users/available-for-timeslot", { params }),
};
```

### 6.4 Resource with many custom routes — folder

```ts
// src/sdk/resources/courses/index.ts
import { fetcher } from "@/sdk/core/fetcher";
import { defineResource } from "@/sdk/core/define-resource";
import type { Course, CourseCreate, PaymentAssignmentMonthStatus } from "@/sdk/_types/courses";
import { students } from "./students";
import { zoom } from "./zoom";

const base = defineResource<Course, CourseCreate>({ path: "courses", searchable: true });

export const courses = {
  ...base,
  students,
  zoom,
  /** GET courses/<id>/payment-assignment-month-status?year=&month= */
  paymentAssignmentMonthStatus: (courseId: number, year: number, month: number) =>
    fetcher.get<PaymentAssignmentMonthStatus>(
      `courses/${courseId}/payment-assignment-month-status`,
      { params: { year, month } },
    ),
};
```

```ts
// src/sdk/resources/courses/students.ts
import { fetcher } from "@/sdk/core/fetcher";
import type { CourseStudent } from "@/sdk/_types/courses";

export const students = {
  list:   (courseId: number)                       => fetcher.get<CourseStudent[]>(`courses/${courseId}/students`),
  add:    (courseId: number, userId: number)      => fetcher.post(`courses/${courseId}/students`, { user_id: userId }),
  remove: (courseId: number, userId: number)      => fetcher.delete(`courses/${courseId}/students/${userId}`),
};
```

### 6.5 Domain helpers live with the resource

```ts
// src/sdk/resources/courses/index.ts (continued)
export const courseFilters = {
  /** Courses where the given user is a member (student, teacher, or staff). */
  forUser: (user: User): WhereClause<Course> => ({
    user_courses__user_id: { eq: user.id },
  }),
};
```

Filters like "courses this user is enrolled in" tend to get reinvented at every call site. The resource module is their single home; every consumer reads `courseFilters.forUser(user)` instead of hand-building the filter literal.

---

## 7. Query keys & invalidation

### 7.1 Centralized factory

```ts
// src/sdk/keys/courses.ts
import { createQueryKeys } from "@/sdk/core/query-key-factory";

export const coursesKeys = createQueryKeys("courses", {
  list:   (q?: ListQuery<Course>)                => ["list", q ?? null] as const,
  detail: (id: number | string)                  => ["detail", id] as const,
  search: (q: ListQuery<Course>, w: WhereClause<Course>) => ["search", q, w] as const,
  students:                  (id: number)        => ["students", id] as const,
  paymentAssignmentMonth: (id: number, y: number, m: number) =>
                                                    ["payment-assignment-month", id, y, m] as const,
});

// Usage:
queryKeys.courses.list({ where: { id: 5 } });       // ["courses", "list", { where: { id: 5 } }]
queryKeys.courses.list._key;                         // ["courses", "list"]  — for prefix invalidation
queryKeys.courses._key;                              // ["courses"]          — nuke everything for the resource
```

Every hook uses the factory. Every `invalidateQueries` call uses the factory. Stringly-typed keys (`["searchcourses", uid, ...]`) are banned by lint (see §16).

### 7.2 Invalidation pattern

Mutations call `invalidateQueries` explicitly inside `onSuccess`, using the factory:

```ts
// src/sdk/hooks/courses.ts
export function useUpdateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; data: CourseUpdate }) =>
      sdk.courses.update(args.id, args.data),
    onSuccess: (_data, args) => {
      qc.invalidateQueries({ queryKey: queryKeys.courses.detail(args.id) });
      qc.invalidateQueries({ queryKey: queryKeys.courses.list._key });
      qc.invalidateQueries({ queryKey: queryKeys.courses.search._key });
    },
  });
}
```

No tag-based magic. No auto-invalidation. The invalidations are written next to the mutation that needs them, in a place where they can be reviewed.

---

## 8. The fetcher, envelope, and error model

### 8.1 Fetcher

`core/fetcher.ts` wraps axios with:

- Server vs client cookie/header resolution (see §9).
- Base URL from `process.env.NEXT_PUBLIC_BASE_API_URL` (see `.env.example` at the repo root for the full env-var inventory).
- `AbortSignal` accepted by every method.
- **Automatic envelope unwrap.** Every `fetcher.get / post / put / delete` call runs the response through `envelope.unwrap` (§8.2) before returning. Consumers of `fetcher` — including `coreList`, `coreGet`, and the custom-route methods on resources (`users.me`, `courses.paymentAssignmentMonthStatus`, etc.) — receive the typed payload, never the raw `{ data, isError, ... }` shape. If `isError === true`, the fetcher throws `ApiError`.
- 401 → throws `ApiError` with `code === "unauthorized"`; the hooks layer is responsible for routing to `/login` (not the fetcher).
- No `retry`. Retries are configured on the QueryClient (queries: 1; mutations: 0).

### 8.2 Envelope

The backend wraps every response as:

```jsonc
// list / search
{ "data": [...], "summary"?: {...} }

// detail
{ "data": {...} }

// error
{ "isError": true, "message": "...", "errors"?: {...} }
```

`core/envelope.ts` unwraps once at the SDK boundary. Consumers receive:

- `T` for detail endpoints.
- `ListResult<T>` for list endpoints: `{ items: T[]; page: number; size: number; total: number; hasMore: boolean }`. `page` is 1-indexed (matches the backend); `total` is the unpaginated row count; `hasMore` is derived from `page * size < total`.
- `ListResult<T, S>` for endpoints with a summary (admin reports, etc.): adds `summary: S`.

**Confirm the exact pagination field names against the backend's paginator class** before writing `envelope.ts` (open the relevant `app_*/pagination.py` or check the DRF settings). If the backend uses different names (e.g., `count` / `next` / `previous` for DRF's default `PageNumberPagination`), map them to the field names above inside `envelope.ts`. The **public shape is non-negotiable** — consumers see `{ items, page, size, total, hasMore }` regardless of backend internals.

If `isError === true`, the envelope throws `ApiError`. The fetcher never returns the raw envelope to consumers.

### 8.3 Error model

```ts
// src/sdk/core/error.ts
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;        // "validation_error" | "unauthorized" | "not_found" | "network" | "unknown"
  readonly fieldErrors?: Record<string, string[]>;  // for 400 validation responses
  readonly cause?: unknown;
}
```

The hooks layer treats `ApiError.code === "unauthorized"` specially: it triggers the auth redirect once per session, not on every 401. Form mutations consume `fieldErrors` to wire `react-hook-form` field errors.

---

## 9. Auth & tenant — isomorphic

Auth and tenant headers must work on both the server and the client without consumer code knowing the difference.

### 9.1 Token

- **Server (RSC / route handler):** `cookies().get("access")?.value` from `next/headers`.
- **Client (browser):** `getCookie("access")` from `cookies-next`.

`core/auth.ts` exposes four functions:

- `getAccessToken(): string | undefined` — isomorphic; used by the fetcher to attach `Authorization` headers. Dual-path (server / client).
- `getAccount(): { id: number; ... } | undefined` — isomorphic; read from the `account` cookie. Dual-path.
- `setAuthCookies({ access, account, schema })` — **client-only** in foundation. Uses `cookies-next` to write all three with a 2-hour TTL. (Server-side cookie writes require a route handler or server action context; since foundation keeps all mutations client-side per §15, no server write path is needed yet. Phase 2 may add one when auth moves to a server action.)
- `clearAuthCookies()` — **client-only**, same reason as above.

Calling `setAuthCookies` or `clearAuthCookies` from an RSC throws a clear error pointing at the §15 non-goal.

### 9.2 Tenant (`X-Tenant`)

Same dual-path shape in `core/tenant.ts`. Server reads from `cookies().get("schema")`; client reads from `cookies-next`. The fetcher attaches `X-Tenant: <schema>` to every request.

### 9.3 Token refresh — out of scope for foundation

The backend issues 2-hour tokens; the SDK reads them as-is and does not implement refresh-before-expiry in foundation. **Token refresh is a follow-up workstream** (see §15 — non-goals). Do not design the SDK in a way that would prevent adding refresh later: the fetcher should already support an interceptor-style hook for it.

---

## 10. Hooks layer

The hooks layer is thin: tanstack-query wrappers over the imperative client. Every hook:

- Uses a key from the factory in §7.
- Plumbs `AbortSignal` through to the imperative client.
- Defaults `staleTime` from the tier in §10.1; per-call overrides require a brief comment explaining why.
- Returns the **typed payload** (post-envelope-unwrap), not the raw response.

### 10.1 Stale-time tiers

Defined as constants in `core/query-client.ts`. Hooks pick a tier by name, not by raw ms:

```ts
export const STALE = {
  /** Reference data the user rarely changes; tenant config, custom field definitions, payment methods. */
  REFERENCE: 60 * 60 * 1000,        // 1 hour
  /** User / tenant identity; the current account, the current tenant. */
  IDENTITY: 5 * 60 * 1000,          // 5 minutes
  /** Lists, search results, dashboards. */
  SEARCH: 30 * 1000,                // 30 seconds
  /** Real-time-ish data; chat, attendance, notifications. */
  LIVE: 0,
};
```

Per-call override:

```ts
useQuery({ ..., staleTime: STALE.LIVE,
  // chat lists are stale immediately; WS will revalidate
});
```

### 10.2 Retry policy

- Queries: `retry: 1` with exponential backoff. Network errors get one retry; ApiErrors (4xx) never retry.
- Mutations: `retry: 0`. We do not silently re-fire writes.

### 10.3 Default options

`core/query-client.ts` ships one configured `QueryClient` for the client and one for the server (the server one has `staleTime: Infinity` so dehydrated cache isn't immediately refetched on hydration). Beyond stale time and retry, no other defaults are set globally; per-resource behavior lives in the resource's hooks file.

### 10.4 Abort signals

Every hook accepts `signal: AbortSignal` from tanstack and forwards it to the imperative client. Imperative client forwards it to the fetcher. Tests verify cancellation works through the whole stack.

---

## 11. Filter & query builder

Today consumers write `{ field_name: "course_id", operator: operatorEnum.exact, value: String(id) }`. The new SDK exposes a typed builder:

```ts
sdk.courses.search(
  { sort: ["-created_at"], expand: ["category"] },
  {
    title: { icontains: "math" },
    category: { eq: 7 },
    user_courses__user_id: { eq: user.id },     // Django __ lookups still allowed
    OR: [{ is_active: true }, { is_archived: false }],
  },
);
```

The builder compiles to the backend's `{ filter_params: [...] }` shape inside `coreSearch`. Consumers never write the raw shape.

- Common operators get sugar: `id: 5` is shorthand for `{ eq: 5 }`.
- Django lookups (`course__user_courses__user_id`) are accepted as string keys with a literal-string type so typos surface.
- `expand`, `sort`, `fields`, `page`, `size` are part of `ListQuery<T>`; type-narrowed to the resource's actual field names where possible.
- The backend expects `sorts` / `expand` / `fields` as base64-encoded JSON arrays in the query string (`base64(JSON.stringify([...]))`). This encoding is performed inside `coreList` / `coreSearch` — never by consumers, never re-implemented elsewhere.

---

## 12. RSC + dehydration

The brief's biggest performance win. Pages do their data fetching on the server, dehydrate the cache, and the client hooks pick up the cache without a network round-trip.

### 12.1 Pattern

```tsx
// app/(internal)/courses/[id]/page.tsx (RSC)
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createServerQueryClient } from "@/sdk/core/query-client";
import { sdk } from "@/sdk";
import { queryKeys } from "@/sdk/keys";
import CourseDetailsClient from "./course-details-client";

export default async function CoursePage({ params }: { params: { id: string } }) {
  const qc = createServerQueryClient();
  const id = Number(params.id);

  // Parallel server prefetch — no waterfall.
  await Promise.all([
    qc.prefetchQuery({ queryKey: queryKeys.courses.detail(id),  queryFn: () => sdk.courses.get(id) }),
    qc.prefetchQuery({ queryKey: queryKeys.courses.students(id), queryFn: () => sdk.courses.students.list(id) }),
  ]);

  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <CourseDetailsClient id={id} />
    </HydrationBoundary>
  );
}
```

```tsx
// app/(internal)/courses/[id]/course-details-client.tsx ("use client")
import { useCourse, useCourseStudents } from "@/sdk/hooks/courses";

export default function CourseDetailsClient({ id }: { id: number }) {
  const { data: course } = useCourse(id);              // hydrated from server, no network
  const { data: students } = useCourseStudents(id);    // hydrated from server, no network
  // ...
}
```

### 12.2 What this kills

The naïve client-side shape — chained hooks each gated on `enabled: Boolean(prevQuery.data)`, producing a six-step serial waterfall on first paint — becomes one `Promise.all([...])` on the server. First paint is the *server* finishing, not six client round-trips.

---

## 13. Forbidden patterns (the N+1 ban)

These are banned by the spec and enforced by lint (see §16).

1. **`.map(useQuery)` / `.map(useMutation)`.** Replaced by either:
   - A batch primitive on the resource (`sdk.attachments.listForEntities([{ table, id }])`).
   - `useQueries` from tanstack — the only legal way to fan out parallel fetches.
2. **`enabled` chains — gating one query on another query's data.** Banned shape: `useFoo({ enabled: Boolean(barQuery.data) })`. Replaced by either:
   - Server prefetch (RSC + `HydrationBoundary`) — the default for first-paint data.
   - Parallel fetch via `useQueries` or `Promise.all` in the imperative client.
   - (`enabled: !!id` where `id` comes from a route param, form state, or other non-query input is **fine** — that's input-gating, not chaining. The ban is specifically `enabled` reading from another `useQuery`'s `.data`.)
3. **Per-row mutations from a list.** If a user can change N rows in a row, the SDK exposes a bulk endpoint. Where one doesn't exist, the agent adds the bulk endpoint to the backend, then wraps it in the SDK.
4. **`refetchOnMount: false` to mask missing `staleTime`.** Set the right tier (§10.1) and let `refetchOnMount` keep its default. Overrides require a comment.
5. **`retry: > 0` on mutations.** Mutations do not retry. Period.
6. **Stringly-typed `invalidateQueries({ queryKey: ["searchfoo"] })`.** Must go through `queryKeys.<resource>.<bucket>._key`.

When the agent encounters an N+1 risk in foundation-resource code (e.g., a list view that would naively fetch a related entity per row), it writes the batch primitive in the relevant resource (adding the backend endpoint if one doesn't exist) — never reimplements the N+1 in new code.

---

## 14. Foundation deliverables

The agent ships the following before any application code is built on top of the SDK. Everything here must be reviewed and approved before phase 2 (the FE's application surfaces — pages, dashboards, forms — start landing).

### 14.1 Core layer (`src/sdk/core/*`)
Every file in §4 implemented, typed, and tested. Specifically:

- `fetcher.ts` with isomorphic auth + tenant header attachment, abort plumbing, base URL handling.
- `envelope.ts` unwrapping all three envelope shapes (detail / list / error) into typed payloads.
- `error.ts` with the `ApiError` class and the four canonical codes.
- `define-resource.ts` returning the six CRUD verbs typed to the resource's `TRead / TCreate / TUpdate`.
- `query-key-factory.ts` producing keys with `._key` accessors for prefix invalidation.
- `query-client.ts` with the four `STALE` tiers, the retry policy, and a server-variant for SSR.
- `hydration.ts` exporting `createServerQueryClient`, `dehydrate`, `HydrationBoundary` re-export.
- `invariants.ts` dev-only assertions: detect `.map(useQuery)`, template-literal keys, raw axios imports outside `src/sdk/`.

### 14.2 Five foundation namespaces

**Auth** — `src/sdk/resources/auth.ts`, `src/sdk/hooks/auth.ts`, `src/sdk/keys/auth.ts`, `src/sdk/_types/auth.ts`.
- Login flow: `login({ email, password })`, `loginMicrosoft()`, `logout()`.
- Cookie side effects happen **inside the SDK boundary**, never in calling code. Login / logout are mutations and run client-side (per §15), so cookie writes use `cookies-next` via `core/auth.ts`'s `setAuthCookies` / `clearAuthCookies` helpers (§9.1). Reads stay dual-path.
- `loginMicrosoft()` wraps `@azure/msal-browser` (`PublicClientApplication`, `loginPopup`). **MSAL config is per-tenant, not env-based.** It reads `authority` and `app_id` from `sdk.tenants.current()` (the unauthenticated tenant-resolution endpoint, see Tenants below) and uses them to initialize `PublicClientApplication`. After `loginPopup` resolves, it posts the resulting access token to `POST /api/v1/ms-login`. MSAL initialization happens inside the SDK; consumers never touch MSAL types or pass config in.
- Successful login writes `access`, `account`, and `schema` cookies (2-hour TTL, matching the backend token lifetime). Logout clears them all.
- Types in `_types/auth.ts` cite `app_auth/views.py::LoginView` and `app_auth/views.py::MSLoginView`.
- Hooks: `useLogin()`, `useLoginMicrosoft()`, `useLogout()`. Each clears the React Query cache (`queryClient.clear()`) on success — `useLogout` so the next visitor on a shared device doesn't see the previous account's data; `useLogin` / `useLoginMicrosoft` to handle re-login (token expiry, account-switch) without leaking the old user's cache into the new user's session.
- Auth is exported alongside other namespaces: `sdk.auth.login(...)`, `sdk.auth.logout()`. It is NOT a CRUD resource (no `defineResource`), but it lives in the same folder for consistency.

**Tenants** — `src/sdk/resources/tenants.ts`, `src/sdk/hooks/tenants.ts`, `src/sdk/keys/tenants.ts`, `src/sdk/_types/tenants.ts`.
- Backend resource path is `organizations`. The FE-facing name is `tenants` because that's how the rest of the codebase (cookies, headers, UI copy) refers to it. The translation lives in one place: `defineResource<Tenant>({ path: "organizations", ... })`.
- Full CRUD via `defineResource`.
- Custom routes:
  - `current()` — hits the **unauthenticated** `GET /api/v1/organizations/public` and returns the tenant matching the request's Host. This is the entry point that resolves `authority` / `app_id` for MSAL login, plus branding (`domain_url`, `is_microsoft_on`, etc.). On the server, `core/host.ts` forwards the incoming request's Host header as `Origin`; on the client, the browser sets `Origin` automatically. Wrapped in React's `cache()` so RSCs that read it more than once in a single request don't double-fetch.
- Hooks: `useTenantCurrent()` (used by login pages, branding, the public-tenant flow), `useTenant(id)`, `useTenantsList(...)`, `useUpdateTenant()`.
- Stale-time tier: `STALE.IDENTITY` for `current()` (rare changes within a session); `STALE.REFERENCE` for individual tenant detail/list (admin views).
- The Tenant type cites the Organization serializer in the backend; if the type currently lives partly in a custom view response (some legacy fields), document each in the docblock.

**Users** — `src/sdk/resources/users.ts`, `src/sdk/hooks/users.ts`, `src/sdk/keys/users.ts`, `src/sdk/_types/users.ts`.
- CRUD via `defineResource`.
- Custom: `me()`, `availableForTimeslot({ yearMonth, timeFrom, timeTo, weekdays })`.
- Hooks: `useUserMe`, `useUserById`, `useUpdateUser`, `useUserAvailability`.
- `useUserMe` is the single source of truth for the currently-authenticated account; every consumer that needs the current user reads from this hook (or, on the server, awaits `sdk.users.me()` and dehydrates). No parallel current-user hook may exist outside the SDK.

**Courses** — `src/sdk/resources/courses/{index,students,zoom}.ts`, hooks, keys, types.
- Full CRUD + search via `defineResource`.
- Custom routes: `paymentAssignmentMonthStatus`, `meetingAttendanceDashboard`, `generateJoinCode`, `availableUsers`.
- Nested: `courses.students.{list, add, remove}`, `courses.zoom.{schedule, update, refresh, validate}`.
- Domain helpers: `courseFilters.forUser(user)`.
- Hooks cover all of the above.

**Attachments** — `src/sdk/resources/attachments.ts`, hooks, keys, types.
- Existing `attachments/search` with `foreign_key` filter is the batch primitive — wrap it as `sdk.attachments.listForEntities([{ table, id }])`. Confirm the existing search supports an `IN`-style foreign-key filter; if it only supports single-FK, add the multi-FK variant to the backend (one extra `__in` lookup) and ship it in the same commit.
- Two hooks, two intents:
   - `useAttachmentsForEntity(table, id)` — for a **single-entity** detail page. Fine to use directly.
   - `useAttachmentsForEntities(entities)` — for a **list**. Returns a `Map<string, Attachment[]>` keyed by `${table}:${id}` for O(1) row lookup.
- **Lint rule:** `useAttachmentsForEntity` is flagged when it appears inside an array `.map(...)` callback or inside a JSX list (`{items.map(item => <Row>...</Row>)}` body that calls the singular hook). That's the N+1 shape. The fix is always to lift the call up: parent calls `useAttachmentsForEntities`, rows read from the returned `Map`.
- File upload (chunked tus, image editing) is **out of scope** for foundation. The resource leaves room for a future `upload()` method.

### 14.3 Verification

- **Unit tests (vitest)** for every `core/*` module. Envelope unwrapping (all three shapes), error mapping, key factory output, filter-param builder, auth/tenant resolution (mocked).
- **Integration tests** (vitest with a mocked fetcher) for each reference resource: CRUD, search, custom routes, batch primitive.
- **One end-to-end RSC example** at `src/app/(dev)/sdk-rsc-example/page.tsx` (reachable at `/sdk-rsc-example`; route group `(dev)` keeps it grouped with other dev-only pages without affecting the URL, and is removed before phase 2 ships). The page does parallel `Promise.all` prefetch of a Course + its students + attachments, dehydrates, hydrates, and the client component shows `useCourse(id) / useCourseStudents(id) / useAttachmentsForEntity("courses", id)` with **zero client-side network requests on first paint**. This page is the SDK's litmus test for §12.
- **Lint rule** (eslint plugin or a custom `pnpm sdk:check` script) enforcing the patterns in §13 and §16.

### 14.4 SDK README (usage guide)

`src/sdk/README.md` containing the recipes a future engineer (or agent) needs to add the remaining ~21 resources without consulting this brief:

- **"How to add a new resource" recipe.** End-to-end walkthrough using one of the foundation resources as the worked example: open `app_<x>/serializers.py`, write the type in `_types/<resource>.ts` with a `@source` docblock, define the resource via `defineResource` (single file) or a folder with custom-routes files, add hooks in `hooks/<resource>.ts`, add keys in `keys/<resource>.ts`, write tests.
- **"How to read the cache from an RSC" recipe.** The pattern from §12, distilled: `createServerQueryClient` → `Promise.all` prefetches → `dehydrate` → `HydrationBoundary` → client hook reads from cache.
- **"What to do when you hit a missing batch endpoint" recipe.** Add the view + url to the matching backend app (read existing views in `app_<x>/views.py` for the style; follow the codebase's `IsAuthenticated` + `*SearchView` pattern), write the SDK type with a serializer-citation docblock, expose via `defineResource` or a custom method on the resource.
- **"How to invalidate after a mutation" recipe.** Shows the key-factory pattern from §7.2, with three worked examples: invalidate a single detail, invalidate all lists for a resource, invalidate across resources after a relationship change.
- **STALE-tier guidance table.** One row per `STALE` tier from §10.1 ("REFERENCE / IDENTITY / SEARCH / LIVE"), each with a one-sentence "use this when…" and two example endpoints.
- **Error-handling recipe.** How `ApiError.code` is consumed; the 401-once-per-session redirect rule; how `ApiError.fieldErrors` maps into `react-hook-form` field errors via a small `setFormErrorsFromApi(form, err)` helper.
- **A "common anti-patterns" callout** that links each §13 / §16 banned rule to a code example of what NOT to do and the typed alternative.

---

## 15. Non-goals (foundation phase)

Explicitly out of scope. Do not design defensively for these; do not partially implement them.

- OpenAPI / Swagger codegen.
- Chat / WebSocket SDK integration.
- File upload (tus, chunked, image editing).
- Token refresh. The SDK preserves a 2-hour cookie TTL; refreshing before expiry is a follow-up workstream. The fetcher should support an interceptor-style hook so refresh can be added later without restructuring.
- Server actions (Next.js) for mutations. Mutations stay on the client in foundation.
- A type-safe SDK for the WebSocket protocol — phase 2.
- **Resource scaffolding CLI.** Foundation builds the five namespaces (Auth, Tenants, Users, Courses, Attachments) by hand; a CLI to scaffold the other ~21 resources from the backend's `urls.py` is phase 2.
- **Application features on top of the SDK.** No pages, no UI components, no dashboards in this phase. Other than the RSC litmus-test page in §14.3, the foundation ships only the SDK itself plus its tests.

---

## 16. Banned list (hard rules)

In rough priority order. **#1 is the architectural anchor; do not negotiate.**

1. **No raw axios outside `src/sdk/`.** No `import { axiosClient } from "@/lib/api"` in any component, hook, page, or helper outside the SDK.
2. **No `fetch` outside `src/sdk/`.** The same rule, restated for completeness.
3. **No per-row `useQuery` or `useMutation`.** Use a batch primitive or `useQueries`.
4. **No `enabled: Boolean(prevQuery.data)` chains.** Prefetch on the server or fetch in parallel.
5. **No `.map(useQuery)`.** Lint-enforced.
6. **No template-literal query keys.** Lint-enforced. Keys come from the factory.
7. **No `invalidateQueries` with a hand-built string key.** Must go through `queryKeys.<resource>.<bucket>._key`.
8. **No reading `res.data.data` in consumer code.** The envelope is unwrapped at the SDK boundary.
9. **No `any` in SDK exports.** Including via `as any` casts. `unknown` is acceptable where the shape is genuinely unknown (e.g., the `graphics_data` JSON field on certificate templates).
10. **No API helper outside `src/sdk/`.** Every function that issues an HTTP request lives inside the SDK boundary. No `src/helpers/<x>-api.ts`, no `src/lib/<x>-api.ts`, no ad-hoc `src/app/<x>/api.ts`.
11. **No `retry: > 0` on mutations.**
12. **No `refetchOnMount: false` without a comment explaining the staleTime tier.**
13. **No OpenAPI codegen tooling added to the repo.** (`openapi-typescript`, `kubb`, `orval`, etc.)
14. **No type without a `@source` docblock citing the serializer.**
15. **No re-implementation of `base64(JSON.stringify([...]))` or `encodeArrayToBase64` outside `src/sdk/core/`.**
16. **No raw `{ field_name, operator, value }` filter literal in consumer code.** The backend accepts this shape; the SDK hides it. Consumers use the typed `where: { ... }` builder.
17. **No mixing of hooks-layer and imperative-client imports in the same module.** Pages either use hooks or use the imperative client (in RSCs), never both.

---

## 17. How "done" is judged

The foundation phase is **complete** when:

1. The directory in §4 is fully implemented.
2. All five foundation namespaces (Auth, Tenants, Users, Courses, Attachments) ship with imperative client, hooks, keys, types, and tests passing.
3. `sdk.tenants.current()` resolves the correct tenant from the request Host on both server and client without an authenticated session (this is the prerequisite for MSAL login).
4. A user can log in via `sdk.auth.login(...)` or `sdk.auth.loginMicrosoft(...)` from the client (the latter reading MSAL config from `sdk.tenants.current()`), the SDK writes the `access` / `account` / `schema` cookies via `cookies-next`, and **both** a subsequent client-side `useUserMe()` AND a server-side `await sdk.users.me()` in an RSC return the authenticated user (the read path is dual; the write path is client-only — see §9.1).
5. The RSC litmus-test page in §14.3 renders with **zero client-side network requests on first paint** (verified in the browser devtools network panel).
6. The lint rule in §14.3 catches every lint-enforceable rule from §13 and §16 on a curated set of negative-example files (a `tests/lint-negative-examples/` folder of intentionally-bad code that the lint rule must flag).
7. The SDK README in §14.4 contains every recipe listed there, with at least one runnable example each.
8. A maintainer can pick any backend resource the agent did NOT implement (e.g., `subjects`, `categories`, `payment-methods`, `events`) and follow the "how to add a new resource" recipe in the README to ship it — typed, hooked, keyed, tested — in under 30 minutes without consulting the agent.

If the reviewer cannot do step 8 confidently, the SDK has missing pieces or the README is too thin, and the foundation needs another pass. The repeatability of adding a new resource is the deliverable, not just the existence of `src/sdk/`.
