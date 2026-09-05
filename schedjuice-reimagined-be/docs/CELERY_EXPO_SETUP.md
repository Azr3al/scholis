# Celery & django-expo-notifications Setup

This project uses **Celery** for django-expo-notifications (Expo push notifications). Celery runs alongside **django-q2** (which handles scheduled management commands). Both use the same Redis instance.

## Multi-tenant compatibility

The project uses **django-tenant-schemas**. Celery workers run outside the request context, so the tenant schema is not set automatically. Tasks that access tenant-scoped models must run inside `schema_context(schema_name)`.

### Tenant-aware tasks

Use `TenantTask` from `app_utils.celery_tasks` for custom tasks that access tenant models:

```python
from celery import shared_task
from app_utils.celery_tasks import TenantTask

@shared_task(base=TenantTask, bind=True)
def my_tenant_task(self, schema_name: str, user_id: int):
    # schema_context(schema_name) is already set
    user = User.objects.get(id=user_id)
    ...
```

When calling: `my_tenant_task.delay(org.schema_name, user.id)`

### django-expo-notifications

The `expo_notifications` app is in **TENANT_APPS** because `Device` has a foreign key to `User` (tenant-scoped). The project includes a multi-tenant compatibility layer in `app_utils.expo_compat` that patches the MessageManager to use tenant-aware tasks (`send_messages_tenant`, `check_receipts_tenant`). These tasks receive `schema_name` and run inside `schema_context`, so Celery workers correctly access tenant-scoped models.

**Note:** The Django admin "Send selected messages" and "Check selected tickets" actions use the package's original tasks. For tenant data, use the API/views or ensure you're in the correct tenant schema when using admin.

## Installation

1. Install dependencies:
   ```bash
   pip install "celery[redis]" django-expo-notifications
   ```

2. Run migrations for tenant schemas (expo_notifications tables are created per-tenant):
   ```bash
   python manage.py migrate_schemas
   ```

## Running Celery

Start a Celery worker (e.g. for development):

```bash
celery -A schedjuice_backend worker -l INFO
```

For production, run the worker as a daemon or use a process manager (systemd, supervisord, etc.).

Production **celery-prod** (Railway, [`Dockerfile-celery`](../Dockerfile-celery)):

```bash
celery -A schedjuice_backend worker -l INFO --concurrency=2 --max-tasks-per-child=100 --max-memory-per-child=262144 -Ofair
```

### Production memory

Celery in this project handles **Expo push only** (MS Graph, attendance, OCR, etc. run on django-q Broker workers).

| Setting | Value | Purpose |
|---------|-------|---------|
| `--concurrency` | 2 | Predictable RSS on small containers; push is I/O-bound |
| `--max-tasks-per-child` | 100 | Recycle prefork children so RSS returns to the OS |
| `--max-memory-per-child` | 262144 (256 MiB) | Hard cap per child; recycle if RSS exceeds limit |
| `CELERY_WORKER_PREFETCH_MULTIPLIER` | 1 | Avoid holding multiple large task payloads per child |
| `PUSH_FANOUT_CELERY_CHUNK_SIZE` | 300 | Max recipient user IDs per push fan-out Celery task |
| `EXPO_PUSH_CELERY_CHUNK_SIZE` | 200 | Max Message/Ticket PKs per send/receipt Celery task |

Large org-wide announcements use **two-tier chunking**:

1. **Fan-out layer** — `enqueue_push_for_user_ids` splits recipients into batches of `PUSH_FANOUT_CELERY_CHUNK_SIZE` and enqueues `send_push_fanout_batch` Celery tasks (`app_utils.push_fanout_tasks`). Each batch bounds device query, `Message` bulk_create, and web push delivery.
2. **Expo layer** — `bulk_send` fans out into `send_messages_tenant` / `check_receipts_tenant` tasks chunked at `EXPO_PUSH_CELERY_CHUNK_SIZE` (`app_utils.expo_push_chunking`).

Workers also re-chunk inside `send_messages_tenant` / `check_receipts_tenant` if a caller passes an oversized PK list.

## Environment variables

- `REDIS_URL` – Used as Celery broker and result backend (same as django-q2)
- `EXPO_NOTIFICATIONS_TOKEN` – (Optional) Expo access token for Enhanced Security

## Notification retention

Notification history (Message, Ticket, Receipt) is retained for **2 weeks** only. A daily scheduled task (`cleanup_expo_notifications`) deletes older records. Run manually:

```bash
python manage.py cleanup_expo_notifications
```

## Sending push notifications

```python
from tenant_schemas.utils import schema_context
from expo_notifications.models import Device, Message

# From a view (tenant already set by middleware):
device = Device.objects.get(user=request.user, push_token=token)
device.messages.send(title="Hello", body="World!")

# From a management command or Celery task:
with schema_context(org.schema_name):
    device = Device.objects.get(user=user, push_token=token)
    device.messages.send(title="Hello", body="World!")
```
