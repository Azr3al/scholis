# User Attendance Flow

Concise reference for the UserAttendance lifecycle: meeting creation → Teams sync → hourly rate snapshot.

---

## Model: UserAttendance

| Field | Type | Notes |
|-------|------|-------|
| `user` | FK → User | Teacher only |
| `course` | FK → Course | Must have `microsoft_meeting_id` |
| `join_datetime` | DateTime | From Teams |
| `leave_datetime` | DateTime | From Teams |
| `duration_seconds` | int | From Teams (original); earnings use `(leave_datetime - join_datetime)` |
| `attendance_date` | Date, nullable | Date of `join_datetime` in tenant's timezone (`Organization.timezone`); db_index |
| `hourly_rate_at_creation` | Decimal, nullable | Snapshot of resolved hourly rate at creation (see rate resolution below) |
| `source` | str | `microsoft_teams` or `zoom` |
| `created_at`, `updated_at` | DateTime | BaseModel |

**Zoom matching**: For each teacher on the course roster, we build normalized keys from `User.zoom_user_identifier` (if set), `User.email`, and `User.communication_email`. Any of these may match the Zoom participant row (`user_email`, `user_id`, or `id`, normalized). It is not stored on `UserAttendance`.

**Source of truth**: Microsoft Teams or Zoom attendance reports (`source` field). Not linked to Event.

---

## Model: ProcessedVideoAttendanceReport

Deduplication table — tracks which attendance report batches have been synced per course (Teams or Zoom).

| Field | Type | Notes |
|-------|------|-------|
| `course` | FK → Course | |
| `platform` | str | `microsoft_teams` or `zoom` |
| `external_report_id` | str | MS Graph `attendanceReport.id` (Teams) or stable fingerprint (Zoom) |

`unique_together = (course, platform, external_report_id)`

**Important dedup rule**: A report is only marked as processed when **at least one `UserAttendance` was created** from it. If 0 records were created (e.g. teacher's `microsoft_id`/email didn't match), the report is NOT marked — it will be re-fetched on the next sync. This allows data recovery when teacher identity fields are fixed without needing `--reprocess`.

---

## Flow 1: Meeting Creation

**When**: Course events added via `CourseEventEditView`.

**Path**: `app_microsoft/meeting_helpers.py` → `create_course_meeting_if_needed(course, tenant)`

**Conditions**:
- `tenant.is_microsoft_on`
- `course.microsoft_group_id` (Teams class exists)
- `course.microsoft_meeting_id` is empty
- Course has ≥1 event
- At least one **teacher** with `User.microsoft_id` (main teacher priority: MT > AT > any teacher)

**Actions**:
1. Uses first event (by date) for start/end.
2. **Organizer** = main teacher (`get_course_teams_organizer_user`). Co-teachers are `coorganizer` attendees.
3. Default: `MSMeeting.create_calendar_event_teams_meeting()` (calendar-backed Teams meeting). Optional `--channel-meeting`: `create_online_meeting` with channel thread.
4. Saves `microsoft_meeting_id`, `microsoft_meeting_organizer_id`, optional `microsoft_calendar_event_id`, `meeting_link`.
5. Posts link to Teams General channel via `_post_meeting_to_channel()` (delegated client for channel message).

**Meeting policies** (`lobbyBypassSettings scope=invited`): Only organizer and invited attendees (teachers) bypass the lobby; students wait until admitted. For existing meetings, run `update-meeting-policies` to PATCH without creating new links.

**Graph**: `MSMeeting(..., use_app_auth=True)` for create/update; application permissions + [Application Access Policy](./GRAPH_APPLICATION_ACCESS.md).

---

## Flow 2: Attendance Sync (Primary Creation Path)

**When**: Daily cron via `app_tasks`.

**Command**: `python manage.py sync-meeting-attendance [--schema-name <sn>] [--course-id <id>] [--sync] [--reprocess] [--channel-meeting]`

**Deprecated aliases**: `sync-video-attendance` and `sync-teams-attendance` delegate to `sync-meeting-attendance`.

**Path**: `app_tasks/management/commands/sync-meeting-attendance.py` → Teams: `app_tasks/sync_attendance_helpers.py`; Zoom: `app_tasks/sync_zoom_attendance_helpers.py`

### Teams attendance sync org flag

Teams Graph sync is controlled by **`Organization.is_teams_attendance_sync_enabled`** (default `False` for new orgs).

| Condition | Teams sync runs? |
|-----------|------------------|
| `is_teams_attendance_sync_enabled=True` **and** `is_microsoft_on=True` **and** course has `microsoft_meeting_id` | Yes |
| Flag off, or Microsoft off, or no meeting ID | No (Graph not called) |

Zoom sync is **not** gated by this flag — it uses `course_eligible_for_zoom_attendance_sync()` separately.

**UI**: Org settings → Microsoft Teams → *Sync Microsoft Teams meeting attendance into teacher payroll records*.

**Deploy note**: migration `0069` sets the flag to `True` for existing orgs that already have `is_microsoft_on=True` so production behavior is preserved. See [egress-fixes-rollout.md](./egress-fixes-rollout.md).

### Teams (`sync_attendance_for_course`)

1. Guard: skip if `is_teams_attendance_sync_enabled` is off, `course.microsoft_meeting_id` is missing, or tenant not Microsoft-enabled (`tenant_teams_attendance_sync_enabled()`).
2. Get teachers: `UserCourse` where `assigned_as=TEACHER`, `is_dropped_out=False`. Build two lookup dicts: `user_by_ms_id` (keyed on `User.microsoft_id`) and `user_by_email` (keyed on `User.email.lower()`).
3. **Graph `user_id`**: `graph_organizer_user_id_for_course(course, tenant)` → `course.microsoft_meeting_organizer_id` or resolved main teacher’s `microsoft_id` (fallback: `default_owner_id`). Must match the **meeting organizer** in Graph. `MSMeeting(tenant, use_app_auth=True)`.
4. `MSMeeting.list_attendance_reports(user_id=<organizer id>, meeting_id=course.microsoft_meeting_id)` — up to 50 most recent.
5. **Default mode**: For each new report (not in `ProcessedVideoAttendanceReport` with `platform=microsoft_teams`), `MSMeeting.get_attendance_report(..., $expand=attendanceRecords)`.
6. **`--channel-meeting` mode** ([List meetingAttendanceReports](https://learn.microsoft.com/en-us/graph/api/meetingattendancereport-list) may return reports for every meeting in the channel): filter reports whose `meetingStartDateTime`/`meetingEndDateTime` **overlap** any `Course` `Event` window (built from each event’s date + `time_from`/`time_to` in tenant timezone). Load participant rows with `GET .../attendanceReports/{reportId}/attendanceRecords` ([List attendanceRecords](https://learn.microsoft.com/en-us/graph/api/attendancerecord-list)) — **not** Get meetingAttendanceReport with `$expand` ([Get does not support channel meetings](https://learn.microsoft.com/en-us/graph/api/meetingattendancereport-get)).
7. Skip reports already processed for this course/platform.
8. For each `attendanceRecord` → `attendanceIntervals`:
   - Extract identity: try `identity.id`, then `identity.user.id` for `ms_user_id`; also extract `emailAddress`.
   - Match user: `user_by_ms_id[ms_user_id]` first, then `user_by_email[email]` as fallback.
   - Skip if no match (teacher not found by either identifier).
   - Parse `joinDateTime`, `leaveDateTime`, `durationInSeconds` (uses `_parse_ms_datetime` — truncates fractional seconds >6 digits which MS Graph sometimes returns).
   - Dedupe by `(user_id, join_datetime, leave_datetime)` in-memory across the run.
   - Set `attendance_date = join_dt.astimezone(tenant.timezone).date()`, `source=microsoft_teams`.
   - Resolve and snapshot `hourly_rate_at_creation` via `get_hourly_rate_for_teacher_course(user, course, tenant)`.
9. `UserAttendance.objects.bulk_create(to_create)`.
10. `ProcessedVideoAttendanceReport.objects.bulk_create(...)` — only for reports that produced ≥1 record.

### Zoom (`sync_zoom_attendance_for_course`)

Runs when the tenant is Zoom-capable and the course has a non-empty `zoom_meeting_id`, plus either an active **school** `ZoomAccount` (`zoom_meeting_source=school`) or an active **personal** teacher `UserZoomOAuth` row (`zoom_meeting_source=personal`).

- **School Zoom** (default): calls the Reports API — `GET /report/meetings/{id}/participants` — which requires Zoom **Report** granular scopes (e.g. `report:read:list_meeting_participants:admin`). Matches teachers by **`User.zoom_user_identifier`** against participant `user_email` / `user_id` / `id` (normalized).
- **Personal (user-managed) Zoom**: uses **Meeting** APIs (no `report:` scopes): `GET /past_meetings/{meetingId}/instances` lists ended occurrences; `GET /past_meetings/{uuid}/participants` loads each. The sync walks instances **newest-first** and imports the **first occurrence not already in** `ProcessedVideoAttendanceReport`. Requires **`meeting:read:list_past_instances`** plus **`meeting:read:list_past_participants`** (Marketplace → **Meeting**, then reconnect the teacher). Without **list past instances**, only heuristics (`GET /meetings/{id}` uuid, stored course UUID, finally Report API) run and **additional class sessions often cannot be discovered** — add the scope to fix the Zoom 4711 error on `/instances`.

Sets `source=zoom` on new rows. Uses a content fingerprint as `external_report_id` for `ProcessedVideoAttendanceReport`.

**Async path** (default): django-q `async_task` per course per provider (`sync_attendance_for_course_async`, `sync_zoom_attendance_for_course_async`).

**Flags**:
| Flag | Effect |
|------|--------|
| `--sync` | Run inline (no django-q queue); logs counts per course |
| `--channel-meeting` | **Teams only**: filter listed reports to course event time overlap; fetch rows via `attendanceRecords` list API. Requires course events. |
| `--reprocess` | Deletes all `ProcessedVideoAttendanceReport` rows for the course(s) before syncing — forces re-fetch. Use when teacher `microsoft_id`/email was wrong and has since been fixed. |
| `--schema-name` + `--course-id` | Sync a single course only |

**Org setting** (Teams only):

| Setting | Effect |
|---------|--------|
| `is_teams_attendance_sync_enabled` | When off, Teams courses are skipped (no Graph API). Zoom unchanged. |

---

## Flow 3: API Creation (Manual)

**When**: POST `/api/v1/user-attendances`.

**Path**: `app_course/serializers.py` → `UserAttendanceSerializer.create()`

**Logic**:
- Accepts `user`, `course`, `join_datetime`, `leave_datetime`, `duration_seconds`.
- Sets `hourly_rate_at_creation` via `get_hourly_rate_for_teacher_course(user, course, tenant)` when rate is not None.

---

## hourly_rate_at_creation

| Creation Path | Where Set |
|---------------|-----------|
| Sync command | `sync_attendance_helpers.sync_attendance_for_course()` |
| API POST | `UserAttendanceSerializer.create()` |

**Rate resolution** (`app_course/rate_utils.py` → `get_hourly_rate_for_teacher_course`):
- When `Organization.supports_course_specific_rates` is **True**: use `UserCourse.hourly_rate` if set for the teacher-course pair, else `User.per_hour_rate`.
- When **False** (default): always use `User.per_hour_rate`.

---

## Troubleshooting

| Problem | Check |
|---------|-------|
| 0 records synced despite meetings having attendance | Verify `User.microsoft_id` matches Azure AD Object ID **or** `User.email` matches the Teams sign-in email. Run `--reprocess` after fixing. |
| `default_owner_id must be the user's object ID` warning | `Organization.default_owner_id` is set to `app_id` by mistake. Must be from Entra > Users > [user] > Object ID. |
| **403 Forbidden** on `list_attendance_reports` | Confirm `user_id` is the **organizer’s** Entra object id (stored on `course.microsoft_meeting_organizer_id` or resolved teacher). Confirm **OnlineMeetingArtifact.Read.All** (application) and Application Access Policy. Meeting must exist under `/users/{organizerId}/onlineMeetings/`. |
| Channel meeting / Get attendance errors | Use `sync-meeting-attendance --channel-meeting` (event-window filter + `attendanceRecords` list API). Plain Get with `$expand` is [not supported for channel meetings](https://learn.microsoft.com/en-us/graph/api/meetingattendancereport-get). |
| Report fetched but 0 attendance records | Teacher identity not matched → report not marked processed → will retry next sync automatically. |

---

## Key Files

| File | Purpose |
|------|---------|
| `app_course/models.py` | `UserAttendance`, `ProcessedVideoAttendanceReport`, `UserCourse` |
| `app_course/serializers.py` | `UserAttendanceSerializer.create()` |
| `app_course/views.py` | `UserAttendanceListView`, `DetailsView`, `SearchView` |
| `app_course/rate_utils.py` | `get_hourly_rate_for_teacher_course()` |
| `app_microsoft/meeting_helpers.py` | `create_course_meeting_if_needed`, `_post_meeting_to_channel` |
| `app_microsoft/meeting_helpers.py` | `graph_organizer_user_id_for_course` |
| `app_microsoft/graph_wrapper/meeting.py` | `MSMeeting` (create, list_attendance_reports, get_attendance_report) |
| `app_tasks/sync_attendance_helpers.py` | Teams sync: `sync_attendance_for_course`, `sync_attendance_for_course_async` |
| `app_tasks/sync_zoom_attendance_helpers.py` | Zoom sync: `sync_zoom_attendance_for_course`, `sync_zoom_attendance_for_course_async` |
| `app_tasks/management/commands/sync-meeting-attendance.py` | Management command (cron entrypoint); deprecated aliases `sync-video-attendance`, `sync-teams-attendance` |
| `app_course/meeting_attendance_dashboard.py` | `build_meeting_attendance_dashboard` for staff meeting attendance UI |

---

## API Endpoints

- `GET /api/v1/courses/<course_id>/meeting-attendance-dashboard` (legacy: `.../teams-attendance-dashboard`)
- `GET/POST /api/v1/user-attendances`
- `GET/PUT/PATCH/DELETE /api/v1/user-attendances/<id>`
- `POST /api/v1/user-attendances/search`

See `docs/FRONTEND_USER_ATTENDANCES_PROMPT.md` for request/response details.

---

## Related

- **Meeting Recordings**: See `docs/MEETING_RECORDINGS_FLOW.md` for read-only playback of stored recordings.
- **Payment Assignments**: For monthly payment screenshot uploads, see `docs/PAYMENT_ASSIGNMENT_FLOW.md`.
