# Egress fixes rollout

Deploy guide for Teams attendance sync opt-in and event-centric class-starting reminders.

## What changed

| Change | Effect |
|--------|--------|
| `is_teams_attendance_sync_enabled` org flag | Teams Graph attendance sync is opt-in (`default=False` for new orgs) |
| Migration `0069` | **Grandfathers** existing orgs with `is_microsoft_on=True` → flag set to `True` |
| Event-centric `send-class-starting-reminders` | Queries events in the 15–60 min window + roster, not all active users |
| Cron cadence `*/5` → `*/10` | Halves reminder cron runs; safe with the 15–60 minute push window |

## Grandfathering decision

- **New orgs**: `is_teams_attendance_sync_enabled=False` by default (must opt in via org settings).
- **Existing orgs with Microsoft on**: migration `0069` sets the flag to `True` so prod behavior is unchanged after deploy.
- **To disable Teams sync on prod** (e.g. to cut Broker egress): turn off the toggle in org settings → Microsoft Teams → *Sync Microsoft Teams meeting attendance into teacher payroll records*. Zoom sync is unaffected.

## Cron cadence (`*/10`)

The class-starting reminder window is **15–60 minutes before start**. A 10-minute cron still catches every event:

- At `now`, an event is eligible when `15 min ≤ (start - now) ≤ 60 min`.
- Worst case: a class starting at `T+15` is first eligible at `T`; with `*/10` the run at `T` (or the prior run at `T-10` if delta is exactly 15) covers it.

Keeping `*/10` roughly halves Postgres load from this cron versus `*/5`, on top of the event-centric rewrite.

## Deploy steps

1. **Deploy backend** (REST API + Broker images).
2. **Run migrations** — Railway preDeploy runs `migrate_schemas` on the REST API
   service only (see `scripts/railway_predeploy.sh`); locally:
   ```bash
   cd schedjuice-reimagined-be
   ./env/bin/python manage.py migrate_schemas --shared
   ./env/bin/python manage.py migrate_schemas
   ```
3. **Restart Broker** — `app_tasks.apps.AppTasksConfig.ready()` updates the django-q schedule for `send-class-starting-reminders` to `*/10 * * * *`.
4. **Deploy frontend** (org settings toggle for Teams attendance sync).
5. **Verify prod org flag** (optional):
   ```python
   from app_organization.models import Organization
   org = Organization.objects.get(schema_name="<prod_schema>")
   print(org.is_microsoft_on, org.is_teams_attendance_sync_enabled)
   ```
   After `0069`, Microsoft-enabled orgs should show `(True, True)`.

## Post-deploy verification

### Class-starting reminders

```python
from datetime import timedelta
from django.utils import timezone
from django.db.models import Count
from app_tasks.models import CronCommandLog

since = timezone.now() - timedelta(days=7)
CronCommandLog.objects.filter(
    command_name="send-class-starting-reminders",
    started_at__gte=since,
).count()
# Expect ~1,008/week (every 10 min) vs ~2,016/week at */5
```

Confirm logs show `sent=` counts proportional to classes starting soon, not ~5,200 evaluations per run.

### Teams attendance sync

- If flag is **on**: nightly `sync-meeting-attendance` should still queue Teams tasks for courses with `microsoft_meeting_id`.
- If flag is **off**: no Graph calls; Zoom-eligible courses still sync.

```python
CronCommandLog.objects.filter(
    command_name="sync-meeting-attendance",
    started_at__gte=since,
).values("status").annotate(n=Count("id"))
```

## Egress monitoring (7 days)

Watch Railway **Postgres egress** and **Broker egress** daily for one week after deploy.

| Metric | Expected trend |
|--------|----------------|
| Postgres egress | Large drop (class-starting cron was likely ~2 TB/month driver) |
| Broker egress | Drop if Teams sync disabled; smaller drop if grandfathered and still syncing |

### If Postgres egress remains high

These crons still scan all active users via `utility_notifications_for_user()`:

| Cron | Frequency |
|------|-----------|
| `send-daily-schedule-digest` | hourly |
| `send-assignment-due-reminders` | hourly |
| `send-payment-due-reminders` | hourly |
| `send-admin-finance-digest` | hourly |
| `process-courses` | every 15 min |

**Follow-up (Approach B)**: pass `kinds_filter` into `utility_notifications_for_user()` and skip unrelated query blocks per cron. See `docs/NPLUSONE_PHASE2_BACKLOG.md` and the egress investigation session for context.

### If Broker egress remains high

- Confirm whether Teams attendance sync is enabled on prod.
- Check MS Graph / Zoom volume from `sync-meeting-attendance` course counts.
- Review other Broker workloads: AI (Gemini), Expo push, email, Telegram.

## Related docs

- [USER_ATTENDANCE_FLOW.md](./USER_ATTENDANCE_FLOW.md) — Teams sync flag and sync command behavior
- [FRONTEND_MANAGEMENT_COMMANDS.md](./FRONTEND_MANAGEMENT_COMMANDS.md) — `sync-meeting-attendance` CLI
