# Frontend: MS Teams Management Commands API

Reference for frontend clients invoking MS Teams-related management commands via REST.

---

## Overview

- **Base path**: `api/v1/management/<command-name>`
- **Method**: POST only
- **Auth**: JWT Bearer token required
- **Restriction**: Only the user with email `james@teachersucenter.com` can invoke these endpoints. All other authenticated users receive 403 Forbidden.
- **Tenant header**: Include `X-Tenant` or `Tenant` with the schema name when applicable.

---

## Endpoint Format

```
POST /api/v1/management/<command-name>
Content-Type: application/json
Authorization: Bearer <jwt_token>
```

Command arguments are passed in the request body as JSON. Omit optional params or pass `null` to use defaults.

---

## Response Format

All responses use the standard API shape:

```json
{
  "isError": boolean,
  "message": string,
  "output": string,   // stdout from command (on success)
  "stderr": string,   // stderr from command (on success)
  "details": string   // error message (on failure)
}
```

| Status | Scenario |
|--------|----------|
| 200 | Command ran successfully |
| 403 | User is not james@teachersucenter.com |
| 404 | Unknown command name |
| 500 | Command execution failed |

---

## Available Commands

### schedule-meetings

Schedule Microsoft Teams meetings for courses. Saves `meeting_link`, `meeting_join_id`, and `meeting_passcode` on each course. By default runs asynchronously (queues per-course tasks).

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `schema` | string | yes | Tenant schema name (e.g. `xteachersu`) |
| `course_id` | number | no | If provided, schedule only this course; otherwise all eligible courses |
| `sync` | boolean | no | Run synchronously (default: false, async) |

```json
{ "schema": "xteachersu" }
```

```json
{ "schema": "xteachersu", "course_id": 123 }
```

```json
{ "schema": "xteachersu", "sync": true }
```

---

### sync-meeting-attendance

Sync Microsoft Teams and/or Zoom meeting attendance into `UserAttendance`. Canonical command; aliases `sync-video-attendance` and `sync-teams-attendance` delegate here.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `schema_name` | string | no | If with `course_id`, sync single course; otherwise all orgs |
| `course_id` | number | no | Sync single course (requires `schema_name`) |
| `sync` | boolean | no | Run synchronously (default: false, uses async queue) |
| `reprocess` | boolean | no | Clear processed report markers and re-fetch all reports (use when teacher microsoft_id/email was fixed or reports were marked processed with 0 records) |

**All orgs** (no body or empty body):

```json
{}
```

**All orgs, synchronous**:

```json
{ "sync": true }
```

**Single course**:

```json
{ "schema_name": "xteachersu", "course_id": 123 }
```

**Single course, synchronous**:

```json
{ "schema_name": "xteachersu", "course_id": 123, "sync": true }
```

**Single course, reprocess (clear markers and re-fetch)**:

```json
{ "schema_name": "xteachersu", "course_id": 123, "sync": true, "reprocess": true }
```

---

### backfill-user-attendance-hourly-rates

Backfill `hourly_rate_at_creation` on `UserAttendance` rows where the rate is missing but the session has positive duration (payroll would otherwise compute zero earnings). Uses the same rate resolution as Teams sync (`get_hourly_rate_for_teacher_course`). By default only processes organizations with `is_microsoft_on=True`.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `schema_name` | string | no | Process only this tenant; omit for all Microsoft-enabled orgs |
| `dry_run` | boolean | no | If true, print counts only; do not write to the database |
| `all_organizations` | boolean | no | If true, include every tenant, not only Microsoft-enabled orgs |

**Single tenant, dry run**:

```json
{ "schema_name": "xteachersu", "dry_run": true }
```

**All Microsoft-enabled orgs (writes)**:

```json
{}
```

**Include non-Microsoft orgs (escape hatch)**:

```json
{ "all_organizations": true }
```

---

### backfill-course-teams-organizers

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `schema_name` | string | no | Limit to one tenant |
| `course_id` | number | no | Single course only (requires `schema_name`) |

---

### provision-missing-course-teams

Create Microsoft Teams classes for courses that have `microsoft_group_id = null`.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `schema_name` | string | no | Limit to one tenant |
| `course_id` | number | no | Single course only (requires `schema_name`) |
| `since_date` | string | no | Only courses created on or after `YYYY-MM-DD` |

---

### send-meeting-link-to-channel

Post the meeting link to a course's Teams channel. By default runs asynchronously.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `course_id` | number | yes | Course ID |
| `schema` | string | yes | Tenant schema name |
| `sync` | boolean | no | Run synchronously (default: false, async) |

```json
{ "course_id": 123, "schema": "xteachersu" }
```

```json
{ "course_id": 123, "schema": "xteachersu", "sync": true }
```

---

### update-meeting-policies

Update meeting policies on existing Teams meetings. By default updates **policy settings only** (lobby bypass, breakout rooms, allowed presenters). With `participant_update: true`, updates **participants only** (teachers as co-organizers). These must be sent as separate calls — the Graph API rejects mixed payloads. By default runs asynchronously (queues per-course tasks).

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `schema` | string | yes | Tenant schema name |
| `course_id` | number | no | Update single course; omit for all courses with meetings |
| `participant_update` | boolean | no | If true, only update participants (teachers as co-organizers). If false/omitted, only update policy settings (lobby, breakout rooms, presenters). |
| `sync` | boolean | no | Run synchronously (default: false, async) |

**Update policies (default)**:

```json
{ "schema": "xteachersu", "sync": true }
```

**Update participants**:

```json
{ "schema": "xteachersu", "sync": true, "participant_update": true }
```

**Single course, policies**:

```json
{ "schema": "xteachersu", "course_id": 123 }
```

**Single course, participants**:

```json
{ "schema": "xteachersu", "course_id": 123, "participant_update": true }
```

---

### fetch-meeting-info

Fetch meeting info (policies, participants, join URL, meeting join ID, passcode) for courses with Teams meetings. By default runs asynchronously.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `schema` | string | yes | Tenant schema name |
| `course_id` | number | no | Fetch single course; omit for all |
| `json` | boolean | no | Return JSON output (default: false; only applies when sync: true) |
| `backfill` | boolean | no | If true, save `meeting_join_id` and `meeting_passcode` to each course (for existing meetings) |
| `sync` | boolean | no | Run synchronously (default: false, async) |

```json
{ "schema": "xteachersu", "json": true }
```

```json
{ "schema": "xteachersu", "course_id": 123, "backfill": true }
```

```json
{ "schema": "xteachersu", "sync": true }
```

---

### create-payment-assignments

Create Microsoft Teams payment assignments for courses (monthly screenshot uploads). By default runs asynchronously (queues per-course tasks).

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `schema` | string | no | Single tenant; omit for all Microsoft-enabled orgs |
| `course_id` | number | no | Single course; omit for all eligible courses |
| `month` | number | no | Target month 1–12 (default: current) |
| `year` | number | no | Target year (default: current) |
| `sync` | boolean | no | Run synchronously (default: false, async) |

```json
{}
```

```json
{ "schema": "xteachersu", "course_id": 123, "month": 2, "year": 2025 }
```

```json
{ "schema": "xteachersu", "sync": true }
```

---

### ensure-payment-assignments

Ensure payment assignments exist for months in the FM/HM catch-up window (FM: 20th of prior month through month-end; HM: 9th through month-end, org-local date). Scans the payment month containing today and the following calendar month when in window.

**Scheduled cron (daily 00:05 UTC):** `schedule_ensure_payment_assignments` fans out one **sync** django-q task per Microsoft-enabled tenant (same effect as `sync: true` below).

Manual/API trigger runs the management command directly for the current tenant.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `schema_name` | string | no | Single tenant; omit when connection is already on a tenant schema |
| `sync` | boolean | no | Run synchronously (default: false, async). Cron fan-out workers always use sync. |

```json
{}
```

```json
{ "schema_name": "xteachersu" }
```

```json
{ "schema_name": "xteachersu", "sync": true }
```

---

### cleanup-ineligible-payment-assignments

Delete payment assignments for courses whose `category.is_payment_assignment_eligible` is False. Cleans up accidentally-created assignments. Deletes from MS Teams and local DB. By default runs asynchronously.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `schema` | string | no | Single tenant; omit for all Microsoft-enabled orgs |
| `dry_run` | boolean | no | If true, list ineligible assignments without deleting |
| `sync` | boolean | no | Run synchronously (default: false, async) |

```json
{}
```

```json
{ "schema": "xteachersu", "dry_run": true }
```

```json
{ "schema": "xteachersu", "sync": true }
```

---

### sync-payment-submissions

Sync new submissions from Teams payment assignments to UserPayment. By default runs asynchronously (queues per-payment-assignment tasks).

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `schema_name` | string | no | Single tenant; omit for all Microsoft-enabled orgs |
| `course_id` | number | no | Sync only payment assignments for this course; omit for all eligible courses |
| `sync` | boolean | no | Run synchronously (default: false, async) |

```json
{}
```

```json
{ "schema_name": "xteachersu" }
```

```json
{ "schema_name": "xteachersu", "course_id": 123 }
```

```json
{ "schema_name": "xteachersu", "course_id": 123, "sync": true }
```

---

### update-payment-assignments

Update display names (FM/HM naming) and due dates for existing Microsoft Teams
payment assignments according to the current backend rules. Useful for backfilling
changes to the payment assignment flow (e.g. HM/FM threshold, due date logic).

By default, queues per-course async tasks and returns immediately; check django-q
for completion. Use `sync: true` to run updates synchronously (waits for all to
finish before returning). Use sync if async only updates the first assignment.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `schema` | string | no | Single tenant; omit for all Microsoft-enabled orgs |
| `course_id` | number | no | Single course; omit for all eligible courses |
| `month` | number | no | Target month 1–12 (default: current month; ignored if `all` is true) |
| `year` | number | no | Target year (default: current year; ignored if `all` is true) |
| `all` | boolean | no | If true, process all months that have assignments |
| `dry_run` | boolean | no | If true, list assignments that would be updated without making changes |
| `sync` | boolean | no | If true, run updates synchronously (waits for completion; no async queue) |

```json
{}
```

```json
{ "schema": "xteachersu", "course_id": 123, "month": 2, "year": 2025 }
```

```json
{ "all": true }
```

```json
{ "dry_run": true }
```

```json
{ "sync": true }
```

---

### delete-payment-assignments

Delete Microsoft Teams payment assignments (from MS Teams and local DB). Targetable by course and/or month. Queues per-assignment async tasks; returns immediately. Use `sync: true` to run synchronously.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `schema` | string | no | Single tenant; omit for all Microsoft-enabled orgs |
| `course_id` | number | no | Target a specific course only |
| `month` | number | no | Target month 1–12 (e.g. 2 = February). Use with `year` |
| `year` | number | no | Target year (e.g. 2025). Use with `month` |
| `dry_run` | boolean | no | If true, list assignments that would be deleted without making changes |
| `sync` | boolean | no | If true, run deletions synchronously (waits for completion) |

```json
{ "course_id": 123, "month": 2, "year": 2025 }
```

```json
{ "schema": "xteachersu", "course_id": 123 }
```

```json
{ "month": 2, "year": 2025 }
```

```json
{ "dry_run": true }
```

```json
{ "sync": true }
```

---

### backfill-daily-billing

Backfill missing `Billing` rows for a date range (same `active_user_count` heuristic as `record_daily_billing`). Omit `schema` to process every organization.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `from_date` | string | yes | Start date `YYYY-MM-DD` (inclusive) |
| `to_date` | string | yes | End date `YYYY-MM-DD` (inclusive) |
| `schema` | string | no | Tenant schema name; omit for all orgs |
| `dry_run` | boolean | no | If true, list rows that would be created without writing |

```json
{
  "from_date": "2026-01-01",
  "to_date": "2026-01-31",
  "schema": "xteachersu"
}
```

```json
{
  "from_date": "2026-01-01",
  "to_date": "2026-01-31",
  "dry_run": true
}
```

---

## Example (JavaScript/TypeScript)

```ts
const BASE = "/api/v1";

async function runManagementCommand(
  commandName: string,
  body: Record<string, unknown>,
  token: string,
  tenant?: string
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
  if (tenant) headers["X-Tenant"] = tenant;

  const res = await fetch(`${BASE}/management/${commandName}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.details ?? data.message ?? "Request failed");
  }
  return data;
}

// Usage
await runManagementCommand("schedule-meetings", { schema: "xteachersu" }, token);
await runManagementCommand(
  "send-meeting-link-to-channel",
  { course_id: 123, schema: "xteachersu" },
  token
);
```

---

## Notes

1. **Auth**: The frontend must be logged in as `james@teachersucenter.com` to use these endpoints.
2. **Async commands**: All management commands run asynchronously by default (queue work via django-q). The response returns immediately; check django-q for completion. Pass `sync: true` to run any command synchronously instead.
3. **Output**: `output` and `stderr` contain the command's stdout/stderr. Use them for debugging or user feedback.
