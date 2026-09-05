# Telegram Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-organization, teacher-facing Telegram bot integration: link teacher accounts, link courses to Telegram groups, sync teacher group membership, and post announcements/DMs — mirroring the existing `app_microsoft` patterns.

**Architecture:** New `app_telegram` Django app (per-tenant via django-tenant-schemas). Per-org bot with an encrypted token on `Organization`; a per-org webhook URL carries a routing key so each inbound update resolves to a tenant. Inbound updates are dispatched by type (`message` → account binding, `my_chat_member` → group linking, `chat_join_request` → roster gating). Outbound calls go through a `TelegramClient(tenant)` wrapper; slow work runs as `@django_q_task`/`@tenant_async` jobs; deletions go through the `Task` queue.

**Tech Stack:** Django, djangorestframework, django-tenant-schemas, django-q, `cryptography` (Fernet), `requests`, PostgreSQL.

**Spec:** `docs/superpowers/specs/2026-06-19-telegram-integration-design.md`

---

## Conventions for every task

- **Tests:** Django `TestCase` subclasses under `app_telegram/tests/`, following the existing pattern in `app_announcement/tests/test_rbac_announcement.py`:
  - Decorate with `@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")` and `@override_settings(RBAC_ENFORCE="log_only")` where RBAC is involved.
  - `setUpTestData` runs `call_command("migrate_schemas", shared=True, verbosity=0)`, `call_command("migrate_schemas", verbosity=0)`, `call_command("load-data", schema=cls.schema_name, verbosity=0)`.
  - Use `schema_context(self.schema_name)` for tenant-scoped ORM work.
  - `schema_name = "xschedjuice"`.
- **Run a test:** `python manage.py test app_telegram.tests.<module>.<TestClass>.<test_method> -v 2`
- **Run all app tests:** `python manage.py test app_telegram -v 2`
- **Migrations:** after model changes run `python manage.py makemigrations app_telegram app_organization app_auth app_course app_announcement app_tasks` then `python manage.py migrate_schemas --shared` (public) and `python manage.py migrate_schemas` (tenants).
- **Commits:** This repo has a `no-git-commits` rule. **Do not run `git commit`** unless the user explicitly asks. The "Commit" steps below are written as `git add ...` staging + a *proposed* message; only stage, and surface the message to the user. (If the user later opts into commits, run the commit as written.)
- **No real network in tests:** mock `requests` / `TelegramClient` methods. Never hit `api.telegram.org` in tests.

---

## Task 1: Scaffold `app_telegram` + token encryption

**Files:**
- Create: `app_telegram/__init__.py`
- Create: `app_telegram/apps.py`
- Create: `app_telegram/crypto.py`
- Create: `app_telegram/tests/__init__.py`
- Create: `app_telegram/tests/test_crypto.py`
- Modify: `schedjuice_backend/settings.py` (add app to `INSTALLED_APPS` / tenant apps; add `TELEGRAM_TOKEN_ENCRYPTION_KEY`)

- [ ] **Step 1: Create the app package**

`app_telegram/__init__.py` — empty file.

`app_telegram/apps.py`:

```python
from django.apps import AppConfig


class AppTelegramConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "app_telegram"

    def ready(self):
        from . import signals  # noqa: F401  (registered in Task 9)
```

> Note: `signals` is created in Task 9. Until then, temporarily comment out the import or create an empty `app_telegram/signals.py`. Create the empty file now to avoid an ImportError:

`app_telegram/signals.py`:

```python
# Signal handlers registered in Task 9.
```

- [ ] **Step 2: Register the app + settings**

In `schedjuice_backend/settings.py`, add `"app_telegram"` to the tenant apps list (the same list that contains `"app_microsoft"`, `"app_announcement"`). Then add near the other integration settings (e.g. next to `ZOOM_TOKEN_ENCRYPTION_KEY` and `FRONTEND_BASE_URL`):

```python
TELEGRAM_TOKEN_ENCRYPTION_KEY = config("TELEGRAM_TOKEN_ENCRYPTION_KEY", default="")
# Public https base URL of THIS backend (where Telegram delivers webhooks).
# There is no existing backend-base-url setting (only FRONTEND_BASE_URL), so add one.
TELEGRAM_WEBHOOK_BASE_URL = config("TELEGRAM_WEBHOOK_BASE_URL", default="")
```

Find the exact `INSTALLED_APPS`/`TENANT_APPS` list:

Run: `python -c "import re,sys; print([l for l in open('schedjuice_backend/settings.py') if 'app_microsoft' in l])"`
Expected: prints the line(s) showing where `app_microsoft` is registered, so you know which list to edit.

- [ ] **Step 3: Write the failing test for crypto**

`app_telegram/tests/test_crypto.py`:

```python
from django.test import TestCase, override_settings
from cryptography.fernet import Fernet

from app_telegram.crypto import encrypt_token, decrypt_token, TokenEncryptionError

KEY = Fernet.generate_key().decode()


@override_settings(TELEGRAM_TOKEN_ENCRYPTION_KEY=KEY)
class TelegramCryptoTests(TestCase):
    def test_round_trip(self):
        ct = encrypt_token("123:abc")
        self.assertNotEqual(ct, "123:abc")
        self.assertEqual(decrypt_token(ct), "123:abc")

    def test_empty_inputs(self):
        self.assertEqual(encrypt_token(None), "")
        self.assertEqual(decrypt_token(""), "")
        self.assertEqual(decrypt_token(None), "")

    @override_settings(TELEGRAM_TOKEN_ENCRYPTION_KEY="")
    def test_missing_key_raises(self):
        with self.assertRaises(TokenEncryptionError):
            encrypt_token("x")
```

- [ ] **Step 4: Run test to verify it fails**

Run: `python manage.py test app_telegram.tests.test_crypto -v 2`
Expected: FAIL — `ModuleNotFoundError: No module named 'app_telegram.crypto'`.

- [ ] **Step 5: Implement crypto (mirror `app_zoom/crypto.py`)**

`app_telegram/crypto.py`:

```python
"""Fernet encryption for per-org Telegram bot tokens stored on `Organization`."""
from __future__ import annotations

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings


class TokenEncryptionError(RuntimeError):
    pass


def _fernet() -> Fernet:
    key = (settings.TELEGRAM_TOKEN_ENCRYPTION_KEY or "").encode("utf-8")
    if not key:
        raise TokenEncryptionError(
            "TELEGRAM_TOKEN_ENCRYPTION_KEY is not set; generate one with "
            "`python -c 'from cryptography.fernet import Fernet; "
            "print(Fernet.generate_key().decode())'`."
        )
    return Fernet(key)


def encrypt_token(plaintext: str | None) -> str:
    if plaintext is None:
        return ""
    return _fernet().encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt_token(ciphertext: str | None) -> str:
    if not ciphertext:
        return ""
    try:
        return _fernet().decrypt(ciphertext.encode("utf-8")).decode("utf-8")
    except InvalidToken as e:
        raise TokenEncryptionError("Could not decrypt Telegram token (rotated key?).") from e
```

- [ ] **Step 6: Run test to verify it passes**

Run: `python manage.py test app_telegram.tests.test_crypto -v 2`
Expected: PASS (3 tests).

- [ ] **Step 7: Stage changes (do not commit unless asked)**

```bash
git add app_telegram/ schedjuice_backend/settings.py
# Proposed message (only commit if the user opts in):
# feat(telegram): scaffold app_telegram + Fernet bot-token encryption
```

---

## Task 2: `Organization` Telegram fields + token accessors

**Files:**
- Modify: `app_organization/models.py`
- Create: `app_telegram/tests/test_org_fields.py`
- Migration: `app_organization/migrations/`

- [ ] **Step 1: Write the failing test**

`app_telegram/tests/test_org_fields.py`:

```python
import unittest
from uuid import uuid4

from cryptography.fernet import Fernet
from django.db import connection
from django.test import TestCase, override_settings
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_organization.models import Organization

KEY = Fernet.generate_key().decode()


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(TELEGRAM_TOKEN_ENCRYPTION_KEY=KEY)
class OrgTelegramFieldTests(TestCase):
    def test_set_and_get_bot_token_encrypted(self):
        with schema_context(get_public_schema_name()):
            org = Organization.objects.create(
                name=f"Org {uuid4().hex[:6]}",
                schema_name=f"t{uuid4().hex[:8]}",
            )
            org.set_telegram_bot_token("999:secret")
            org.save()
            org.refresh_from_db()
            # stored value is ciphertext, not the raw token
            self.assertNotIn("999:secret", org.telegram_bot_token_ct or "")
            self.assertEqual(org.get_telegram_bot_token(), "999:secret")
            self.assertFalse(org.is_telegram_on)
            self.assertTrue(org.is_telegram_roster_sync_enabled)
```

> If `Organization.objects.create` needs more required fields in this codebase, copy the minimal field set used by existing organization tests/factories. Find one:
> Run: `python -c "import subprocess"` is unnecessary — instead grep:
> `rg -n "Organization.objects.create" app_*/tests` (via the Grep tool) and mirror its kwargs.

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test app_telegram.tests.test_org_fields -v 2`
Expected: FAIL — `AttributeError: 'Organization' object has no attribute 'set_telegram_bot_token'`.

- [ ] **Step 3: Add fields + accessors to `Organization`**

In `app_organization/models.py`, inside the `Organization` model (after the Microsoft fields block), add:

```python
    # telegram integration
    is_telegram_on = models.BooleanField(default=False)
    is_telegram_roster_sync_enabled = models.BooleanField(
        default=True,
        help_text="When off, no teacher membership sync; bot still posts announcements/DMs.",
    )
    telegram_bot_token_ct = models.TextField(
        null=True, blank=True,
        help_text="Fernet-encrypted bot token. Use set/get_telegram_bot_token().",
    )
    telegram_bot_username = models.CharField(max_length=64, null=True, blank=True)
    telegram_bot_id = models.CharField(max_length=64, null=True, blank=True)
    telegram_webhook_secret = models.CharField(max_length=128, null=True, blank=True)
    telegram_routing_key = models.CharField(
        max_length=64, unique=True, null=True, blank=True, db_index=True,
    )

    def set_telegram_bot_token(self, raw: str | None) -> None:
        from app_telegram.crypto import encrypt_token
        self.telegram_bot_token_ct = encrypt_token(raw)

    def get_telegram_bot_token(self) -> str:
        from app_telegram.crypto import decrypt_token
        return decrypt_token(self.telegram_bot_token_ct)
```

Ensure `from django.db import models` is already imported (it is).

- [ ] **Step 4: Make + run migrations**

Run: `python manage.py makemigrations app_organization`
Expected: a new migration adding the six telegram fields.

Run: `python manage.py migrate_schemas --shared -v 0 && python manage.py migrate_schemas -v 0`
Expected: applies cleanly. (Organization lives in the public/shared schema.)

- [ ] **Step 5: Run test to verify it passes**

Run: `python manage.py test app_telegram.tests.test_org_fields -v 2`
Expected: PASS.

- [ ] **Step 6: Stage changes**

```bash
git add app_organization/ app_telegram/tests/test_org_fields.py
# Proposed: feat(telegram): add encrypted bot-token + flags to Organization
```

---

## Task 3: `User` + `Course` Telegram fields + `Course` delete hook

**Files:**
- Modify: `app_auth/models.py`
- Modify: `app_course/models.py`
- Modify: `app_tasks/models.py` (add `LEAVE_TELEGRAM_GROUP`)
- Create: `app_telegram/tests/test_model_fields.py`
- Migrations for `app_auth`, `app_course`, `app_tasks`

- [ ] **Step 1: Write the failing test**

`app_telegram/tests/test_model_fields.py`:

```python
import unittest
from datetime import date
from uuid import uuid4

from django.db import connection
from django.test import TestCase
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import Course
from app_tasks.models import Task


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class TelegramModelFieldTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        from django.core.management import call_command
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def test_user_has_telegram_fields(self):
        with schema_context(self.schema_name):
            u = User.objects.create_user(
                email=f"t-{uuid4().hex[:6]}@e.com", password="x", name="T",
                phone_number="-", date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            u.telegram_user_id = 4242
            u.save()
            u.refresh_from_db()
            self.assertEqual(u.telegram_user_id, 4242)

    def test_course_delete_queues_leave_task(self):
        with schema_context(self.schema_name):
            c = Course.objects.create(title="C", telegram_chat_id=-100123)
            # course.create may require more fields; mirror existing course tests if so
            c.delete()
            self.assertTrue(
                Task.objects.filter(name=Task.TaskName.LEAVE_TELEGRAM_GROUP).exists()
            )
```

> `Course.objects.create(title=...)` may require additional non-null fields in this codebase. If it errors, look at an existing course-creating test and copy its minimal kwargs.

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test app_telegram.tests.test_model_fields -v 2`
Expected: FAIL — `telegram_user_id` attribute / `LEAVE_TELEGRAM_GROUP` missing.

- [ ] **Step 3: Add `User` fields**

In `app_auth/models.py`, near `microsoft_id`:

```python
    telegram_user_id = models.BigIntegerField(null=True, blank=True, db_index=True)
    telegram_chat_id = models.BigIntegerField(null=True, blank=True)
    telegram_username = models.CharField(max_length=64, null=True, blank=True)
    telegram_linked_at = models.DateTimeField(null=True, blank=True)
```

- [ ] **Step 4: Add `Course` fields + delete hook**

In `app_course/models.py`, near the microsoft fields:

```python
    telegram_chat_id = models.BigIntegerField(null=True, blank=True)
    telegram_chat_title = models.CharField(max_length=256, null=True, blank=True)
    telegram_invite_link = models.CharField(max_length=512, null=True, blank=True)
    telegram_linked_at = models.DateTimeField(null=True, blank=True)
```

Then extend the existing `Course.delete()` method (currently queues `DELETE_COURSE`). Add, before `return super().delete(...)`:

```python
        if self.telegram_chat_id:
            Task(
                name=Task.TaskName.LEAVE_TELEGRAM_GROUP,
                data={"chat_id": self.telegram_chat_id},
            ).save()
```

(`Task` is already imported in `app_course/models.py` for the MS hook; reuse that import.)

- [ ] **Step 5: Add the `Task` name**

In `app_tasks/models.py`, add to `TaskName`:

```python
        LEAVE_TELEGRAM_GROUP = "leave_telegram_group", "leave_telegram_group"
```

- [ ] **Step 6: Migrations**

Run: `python manage.py makemigrations app_auth app_course app_tasks`
Run: `python manage.py migrate_schemas --shared -v 0 && python manage.py migrate_schemas -v 0`
Expected: applies cleanly.

- [ ] **Step 7: Run test to verify it passes**

Run: `python manage.py test app_telegram.tests.test_model_fields -v 2`
Expected: PASS (2 tests).

- [ ] **Step 8: Stage changes**

```bash
git add app_auth/ app_course/ app_tasks/models.py app_telegram/tests/test_model_fields.py
# Proposed: feat(telegram): add telegram fields to User/Course + leave-group task
```

---

## Task 4: New `app_telegram` models

**Files:**
- Create: `app_telegram/models.py`
- Create: `app_telegram/tests/test_models.py`
- Migration: `app_telegram/migrations/`

- [ ] **Step 1: Write the failing test**

`app_telegram/tests/test_models.py`:

```python
import unittest
from datetime import date, timedelta
from uuid import uuid4

from django.db import connection
from django.test import TestCase
from django.utils import timezone
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import Course
from app_telegram.models import (
    TelegramLinkToken, TelegramPendingGroupLink, TelegramProcessedUpdate,
)


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class TelegramModelsTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        from django.core.management import call_command
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def test_link_token_is_active(self):
        with schema_context(self.schema_name):
            u = User.objects.create_user(
                email=f"t-{uuid4().hex[:6]}@e.com", password="x", name="T",
                phone_number="-", date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            tok = TelegramLinkToken.objects.create(
                user=u, token=uuid4().hex,
                expires_at=timezone.now() + timedelta(minutes=15),
            )
            self.assertTrue(tok.is_active())
            tok.consumed_at = timezone.now()
            self.assertFalse(tok.is_active())

    def test_processed_update_dedupe(self):
        with schema_context(self.schema_name):
            TelegramProcessedUpdate.objects.create(update_id=1)
            self.assertTrue(
                TelegramProcessedUpdate.objects.filter(update_id=1).exists()
            )
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test app_telegram.tests.test_models -v 2`
Expected: FAIL — `No module named 'app_telegram.models'`.

- [ ] **Step 3: Implement models**

`app_telegram/models.py`:

```python
from django.db import models
from django.utils import timezone

from utilitas.models import BaseModel


class TelegramLinkToken(BaseModel):
    """One-time token for binding a user's Schedjuice account to Telegram."""
    user = models.ForeignKey("app_auth.User", on_delete=models.CASCADE)
    token = models.CharField(max_length=64, unique=True, db_index=True)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)

    def is_active(self) -> bool:
        return self.consumed_at is None and self.expires_at > timezone.now()


class TelegramPendingGroupLink(BaseModel):
    """Tracks an in-progress 'add bot to group' link for a course."""
    course = models.ForeignKey("app_course.Course", on_delete=models.CASCADE)
    initiated_by = models.ForeignKey("app_auth.User", on_delete=models.CASCADE)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)

    def is_active(self) -> bool:
        return self.consumed_at is None and self.expires_at > timezone.now()


class TelegramProcessedUpdate(BaseModel):
    """Dedupe table for inbound webhook update_ids (per tenant)."""
    update_id = models.BigIntegerField(db_index=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["update_id"], name="uniq_tg_update_id"),
        ]
```

- [ ] **Step 4: Migrations**

Run: `python manage.py makemigrations app_telegram`
Run: `python manage.py migrate_schemas -v 0`
Expected: creates the three tenant tables.

- [ ] **Step 5: Run test to verify it passes**

Run: `python manage.py test app_telegram.tests.test_models -v 2`
Expected: PASS (2 tests).

- [ ] **Step 6: Stage changes**

```bash
git add app_telegram/models.py app_telegram/migrations/ app_telegram/tests/test_models.py
# Proposed: feat(telegram): add link-token, pending-group-link, processed-update models
```

---

## Task 5: `TelegramClient` Bot API wrapper

**Files:**
- Create: `app_telegram/client.py`
- Create: `app_telegram/tests/test_client.py`

- [ ] **Step 1: Write the failing test (mock `requests`)**

`app_telegram/tests/test_client.py`:

```python
from unittest.mock import patch, MagicMock

from django.test import TestCase, override_settings
from cryptography.fernet import Fernet

from app_telegram.client import TelegramClient, TelegramApiError

KEY = Fernet.generate_key().decode()


class _Org:
    def get_telegram_bot_token(self):
        return "123:abc"


@override_settings(TELEGRAM_TOKEN_ENCRYPTION_KEY=KEY)
class TelegramClientTests(TestCase):
    def _client(self):
        return TelegramClient(_Org())

    @patch("app_telegram.client.requests.post")
    def test_send_message_calls_correct_url(self, mock_post):
        mock_post.return_value = MagicMock(
            status_code=200,
            json=lambda: {"ok": True, "result": {"message_id": 7}},
        )
        res = self._client().send_message(-100123, "hi")
        self.assertEqual(res["message_id"], 7)
        url = mock_post.call_args[0][0]
        self.assertEqual(url, "https://api.telegram.org/bot123:abc/sendMessage")
        self.assertEqual(
            mock_post.call_args[1]["json"],
            {"chat_id": -100123, "text": "hi", "parse_mode": "HTML"},
        )

    @patch("app_telegram.client.requests.post")
    def test_api_error_raises(self, mock_post):
        mock_post.return_value = MagicMock(
            status_code=400,
            json=lambda: {"ok": False, "description": "Bad Request: chat not found"},
        )
        with self.assertRaises(TelegramApiError):
            self._client().send_message(-1, "x")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test app_telegram.tests.test_client -v 2`
Expected: FAIL — `No module named 'app_telegram.client'`.

- [ ] **Step 3: Implement the client**

`app_telegram/client.py`:

```python
"""Thin Telegram Bot API wrapper built from a per-org bot token."""
from __future__ import annotations

import logging
from typing import Any

import requests

logger = logging.getLogger(__name__)

BASE = "https://api.telegram.org"
TIMEOUT = 15


class TelegramApiError(RuntimeError):
    def __init__(self, method: str, description: str, error_code: int | None = None):
        self.method = method
        self.description = description
        self.error_code = error_code
        super().__init__(f"{method} failed: {description} (code={error_code})")


class TelegramClient:
    def __init__(self, tenant):
        self.tenant = tenant
        self._token = tenant.get_telegram_bot_token()
        if not self._token:
            raise TelegramApiError("__init__", "Organization has no Telegram bot token")

    def _call(self, method: str, payload: dict[str, Any] | None = None) -> Any:
        url = f"{BASE}/bot{self._token}/{method}"
        resp = requests.post(url, json=payload or {}, timeout=TIMEOUT)
        try:
            body = resp.json()
        except ValueError:
            raise TelegramApiError(method, f"non-JSON response ({resp.status_code})")
        if not body.get("ok"):
            raise TelegramApiError(
                method, body.get("description", "unknown error"), body.get("error_code")
            )
        return body.get("result")

    # --- bot / webhook ---
    def get_me(self) -> dict:
        return self._call("getMe")

    def set_webhook(self, url: str, secret_token: str, allowed_updates: list[str]) -> Any:
        return self._call("setWebhook", {
            "url": url,
            "secret_token": secret_token,
            "allowed_updates": allowed_updates,
            "drop_pending_updates": True,
        })

    def delete_webhook(self) -> Any:
        return self._call("deleteWebhook", {"drop_pending_updates": True})

    def set_my_commands(self, commands: list[dict]) -> Any:
        return self._call("setMyCommands", {"commands": commands})

    # --- messaging ---
    def send_message(self, chat_id: int, text: str, parse_mode: str = "HTML") -> dict:
        return self._call("sendMessage", {
            "chat_id": chat_id, "text": text, "parse_mode": parse_mode,
        })

    # --- chats / membership ---
    def get_chat(self, chat_id: int) -> dict:
        return self._call("getChat", {"chat_id": chat_id})

    def create_chat_invite_link(self, chat_id: int, name: str = "") -> dict:
        return self._call("createChatInviteLink", {
            "chat_id": chat_id, "name": name[:32], "creates_join_request": True,
        })

    def approve_chat_join_request(self, chat_id: int, user_id: int) -> Any:
        return self._call("approveChatJoinRequest", {"chat_id": chat_id, "user_id": user_id})

    def decline_chat_join_request(self, chat_id: int, user_id: int) -> Any:
        return self._call("declineChatJoinRequest", {"chat_id": chat_id, "user_id": user_id})

    def kick_member(self, chat_id: int, user_id: int) -> Any:
        """Ban then unban = remove without permanent ban."""
        self._call("banChatMember", {"chat_id": chat_id, "user_id": user_id})
        return self._call("unbanChatMember", {
            "chat_id": chat_id, "user_id": user_id, "only_if_banned": True,
        })

    def leave_chat(self, chat_id: int) -> Any:
        return self._call("leaveChat", {"chat_id": chat_id})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python manage.py test app_telegram.tests.test_client -v 2`
Expected: PASS (2 tests).

- [ ] **Step 5: Stage changes**

```bash
git add app_telegram/client.py app_telegram/tests/test_client.py
# Proposed: feat(telegram): add TelegramClient Bot API wrapper
```

---

## Task 6: Config endpoint (set token, validate, register webhook)

**Files:**
- Create: `app_telegram/config.py` (service)
- Create: `app_telegram/serializers.py`
- Create: `app_telegram/views.py`
- Create: `app_telegram/urls.py`
- Modify: `schedjuice_backend/urls.py` (include `app_telegram.urls` under `api/v1/telegram/`)
- Create: `app_telegram/tests/test_config.py`

- [ ] **Step 1: Write the failing test**

`app_telegram/tests/test_config.py`:

```python
import unittest
from datetime import date
from uuid import uuid4
from unittest.mock import patch

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only", TELEGRAM_TOKEN_ENCRYPTION_KEY="")
class TelegramConfigTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        from cryptography.fernet import Fernet
        self.key = Fernet.generate_key().decode()
        with schema_context(self.schema_name):
            seed_rbac()
            self.admin = User.objects.create_user(
                email=f"adm-{uuid4().hex[:6]}@e.com", password="x", name="A",
                phone_number="-", date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )

    def _client(self):
        c = APIClient()
        c.force_authenticate(user=self.admin)
        c.credentials(HTTP_TENANT=self.schema_name)
        return c

    @patch("app_telegram.config.TelegramClient")
    def test_enable_sets_token_and_webhook(self, MockClient):
        MockClient.return_value.get_me.return_value = {
            "id": 555, "username": "schoolbot"
        }
        with override_settings(TELEGRAM_TOKEN_ENCRYPTION_KEY=self.key):
            res = self._client().post(
                "/api/v1/telegram/config",
                {"bot_token": "555:secret", "is_telegram_on": True},
                format="json",
            )
        self.assertEqual(res.status_code, 200, res.content)
        MockClient.return_value.set_webhook.assert_called_once()
        from app_organization.models import Organization
        from tenant_schemas.utils import get_public_schema_name
        with schema_context(get_public_schema_name()):
            org = Organization.objects.get(schema_name=self.schema_name)
        self.assertTrue(org.is_telegram_on)
        self.assertEqual(org.telegram_bot_username, "schoolbot")
        self.assertTrue(org.telegram_routing_key)
        self.assertTrue(org.telegram_webhook_secret)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test app_telegram.tests.test_config -v 2`
Expected: FAIL — URL `/api/v1/telegram/config` not found (404) / module missing.

- [ ] **Step 3: Implement the config service**

`app_telegram/config.py`:

```python
"""Service for enabling/configuring the per-org Telegram bot."""
from __future__ import annotations

import secrets

from django.conf import settings
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_organization.models import Organization
from app_telegram.client import TelegramClient

WEBHOOK_ALLOWED_UPDATES = ["message", "my_chat_member", "chat_join_request", "chat_member"]


def _public_org(schema_name: str) -> Organization:
    with schema_context(get_public_schema_name()):
        return Organization.objects.get(schema_name=schema_name)


def configure_telegram(schema_name: str, *, bot_token: str, is_telegram_on: bool) -> Organization:
    """Validate the token, persist config, (re)register the webhook."""
    org = _public_org(schema_name)
    with schema_context(get_public_schema_name()):
        org.set_telegram_bot_token(bot_token)
        if not org.telegram_routing_key:
            org.telegram_routing_key = secrets.token_urlsafe(24)
        if not org.telegram_webhook_secret:
            org.telegram_webhook_secret = secrets.token_urlsafe(24)
        org.is_telegram_on = is_telegram_on
        org.save()

        client = TelegramClient(org)
        me = client.get_me()
        org.telegram_bot_id = str(me["id"])
        org.telegram_bot_username = me.get("username")
        org.save()

        if is_telegram_on:
            webhook_url = (
                f"{settings.TELEGRAM_WEBHOOK_BASE_URL.rstrip('/')}"
                f"/api/v1/telegram/webhook/{org.telegram_routing_key}/"
            )
            client.set_webhook(
                url=webhook_url,
                secret_token=org.telegram_webhook_secret,
                allowed_updates=WEBHOOK_ALLOWED_UPDATES,
            )
        else:
            client.delete_webhook()
    return org
```

- [ ] **Step 4: Implement serializer + view + urls**

`app_telegram/serializers.py`:

```python
from rest_framework import serializers


class TelegramConfigSerializer(serializers.Serializer):
    bot_token = serializers.CharField(write_only=True)
    is_telegram_on = serializers.BooleanField(default=True)
```

`app_telegram/views.py`:

```python
from django.db import connection
from rest_framework import status
from rest_framework.response import Response

from app_rbac.views import RBACView
from app_telegram.config import configure_telegram
from app_telegram.serializers import TelegramConfigSerializer
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication


class TelegramConfigView(RBACView):
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"POST": "telegram.configure"}

    def post(self, request):
        ser = TelegramConfigSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        org = configure_telegram(
            connection.schema_name,
            bot_token=ser.validated_data["bot_token"],
            is_telegram_on=ser.validated_data["is_telegram_on"],
        )
        return Response(
            {
                "is_telegram_on": org.is_telegram_on,
                "telegram_bot_username": org.telegram_bot_username,
            },
            status=status.HTTP_200_OK,
        )
```

> `RBACView` (from `app_rbac.views`) enforces a per-method `required_permissions` dict — this is the same mechanism the MS views use (`required_permissions = {"GET": "microsoft.configure"}`). Confirm the base class name/import by reading `app_microsoft/views.py` top + `app_rbac/views.py`. The binding/link views below that should be teacher/admin-accessible use `IsAuthenticated` instead (import `from rest_framework.views import APIView` and `from rest_framework.permissions import IsAuthenticated` for those).

`app_telegram/urls.py`:

```python
from django.urls import path

from app_telegram.views import TelegramConfigView

urlpatterns = [
    path("config", TelegramConfigView.as_view(), name="telegram-config"),
]
```

In `schedjuice_backend/urls.py`, add alongside the other `api/v1/...` includes:

```python
    path("api/v1/telegram/", include("app_telegram.urls")),
```

- [ ] **Step 5: Run test to verify it passes**

Run: `python manage.py test app_telegram.tests.test_config -v 2`
Expected: PASS.

- [ ] **Step 6: Stage changes**

```bash
git add app_telegram/config.py app_telegram/serializers.py app_telegram/views.py app_telegram/urls.py schedjuice_backend/urls.py app_telegram/tests/test_config.py
# Proposed: feat(telegram): config endpoint to set token + register webhook
```

---

## Task 7: Webhook receiver (routing, secret validation, dedupe, dispatch skeleton)

**Files:**
- Create: `app_telegram/webhook.py`
- Modify: `app_telegram/views.py`, `app_telegram/urls.py`
- Create: `app_telegram/tests/test_webhook.py`

- [ ] **Step 1: Write the failing test**

`app_telegram/tests/test_webhook.py`:

```python
import unittest
from uuid import uuid4
from unittest.mock import patch

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_organization.models import Organization


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class TelegramWebhookTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        with schema_context(get_public_schema_name()):
            self.org = Organization.objects.get(schema_name=self.schema_name)
            self.org.telegram_routing_key = f"rk-{uuid4().hex[:8]}"
            self.org.telegram_webhook_secret = "s3cr3t"
            self.org.is_telegram_on = True
            self.org.save()

    def _url(self):
        return f"/api/v1/telegram/webhook/{self.org.telegram_routing_key}/"

    def test_rejects_bad_secret(self):
        res = APIClient().post(
            self._url(), {"update_id": 1}, format="json",
            HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN="wrong",
        )
        self.assertEqual(res.status_code, 401)

    def test_unknown_routing_key_404(self):
        res = APIClient().post(
            "/api/v1/telegram/webhook/nope/", {"update_id": 1}, format="json",
            HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN="s3cr3t",
        )
        self.assertEqual(res.status_code, 404)

    @patch("app_telegram.webhook.dispatch_update")
    def test_valid_update_dispatched_and_deduped(self, mock_dispatch):
        body = {"update_id": 99, "message": {"text": "hi"}}
        r1 = APIClient().post(
            self._url(), body, format="json",
            HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN="s3cr3t",
        )
        r2 = APIClient().post(
            self._url(), body, format="json",
            HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN="s3cr3t",
        )
        self.assertEqual(r1.status_code, 200)
        self.assertEqual(r2.status_code, 200)
        # dispatched once (second is a duplicate update_id)
        self.assertEqual(mock_dispatch.call_count, 1)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test app_telegram.tests.test_webhook -v 2`
Expected: FAIL — webhook URL missing.

- [ ] **Step 3: Implement the webhook dispatch module**

`app_telegram/webhook.py`:

```python
"""Inbound Telegram update dispatch (runs inside the tenant schema)."""
from __future__ import annotations

import logging

from app_telegram.models import TelegramProcessedUpdate

logger = logging.getLogger(__name__)


def dispatch_update(tenant, update: dict) -> None:
    """Route a single update to the right handler. Tenant schema is already active."""
    # Lazy imports avoid circulars; handlers added in Tasks 8 & 9.
    if "message" in update:
        from app_telegram.binding import handle_message
        handle_message(tenant, update["message"])
    elif "my_chat_member" in update:
        from app_telegram.linking import handle_my_chat_member
        handle_my_chat_member(tenant, update["my_chat_member"])
    elif "chat_join_request" in update:
        from app_telegram.roster import handle_join_request
        handle_join_request(tenant, update["chat_join_request"])
    else:
        logger.info("telegram: ignoring update with keys=%s", list(update.keys()))


def process_incoming(tenant, update: dict) -> None:
    """Dedupe by update_id, then dispatch. Caller ensures tenant schema is active."""
    update_id = update.get("update_id")
    if update_id is None:
        return
    _, created = TelegramProcessedUpdate.objects.get_or_create(update_id=update_id)
    if not created:
        logger.info("telegram: duplicate update_id=%s ignored", update_id)
        return
    try:
        dispatch_update(tenant, update)
    except Exception:
        logger.exception("telegram: error handling update_id=%s", update_id)
```

> The three handler modules (`binding`, `linking`, `roster`) are created in later tasks. To keep Task 7 runnable in isolation, the dispatch test patches `dispatch_update`, so the missing handler modules don't break this task.

- [ ] **Step 4: Implement the webhook view + url**

Add to `app_telegram/views.py`:

```python
from tenant_schemas.utils import get_public_schema_name, schema_context
from app_organization.models import Organization
from app_telegram.webhook import process_incoming
from rest_framework.permissions import AllowAny
from rest_framework.authentication import BaseAuthentication


class TelegramWebhookView(APIView):
    authentication_classes: list = []
    permission_classes = [AllowAny]

    def post(self, request, routing_key: str):
        with schema_context(get_public_schema_name()):
            org = Organization.objects.filter(
                telegram_routing_key=routing_key
            ).first()
        if org is None:
            return Response(status=status.HTTP_404_NOT_FOUND)

        secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token")
        if not secret or secret != org.telegram_webhook_secret:
            return Response(status=status.HTTP_401_UNAUTHORIZED)

        with schema_context(org.schema_name):
            process_incoming(org, request.data)
        return Response({"ok": True}, status=status.HTTP_200_OK)
```

Add to `app_telegram/urls.py`:

```python
from app_telegram.views import TelegramWebhookView
# ...
    path("webhook/<str:routing_key>/", TelegramWebhookView.as_view(), name="telegram-webhook"),
```

> CSRF: this is a DRF `APIView` with empty `authentication_classes`, so SessionAuthentication's CSRF check does not apply. If a global middleware enforces CSRF, confirm DRF APIViews are exempt (they are by default). The secret-token header is the auth mechanism.

- [ ] **Step 5: Run test to verify it passes**

Run: `python manage.py test app_telegram.tests.test_webhook -v 2`
Expected: PASS (3 tests).

- [ ] **Step 6: Stage changes**

```bash
git add app_telegram/webhook.py app_telegram/views.py app_telegram/urls.py app_telegram/tests/test_webhook.py
# Proposed: feat(telegram): webhook receiver with routing, secret check, dedupe
```

---

## Task 8: Account binding (link-token endpoint + `/start` handler)

**Files:**
- Create: `app_telegram/binding.py`
- Modify: `app_telegram/views.py`, `app_telegram/urls.py`
- Create: `app_telegram/tests/test_binding.py`

- [ ] **Step 1: Write the failing test**

`app_telegram/tests/test_binding.py`:

```python
import unittest
from datetime import date, timedelta
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_organization.models import Organization
from app_telegram.binding import handle_message
from app_telegram.models import TelegramLinkToken


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class TelegramBindingTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        with schema_context(get_public_schema_name()):
            self.org = Organization.objects.get(schema_name=self.schema_name)
            self.org.telegram_bot_username = "schoolbot"
            self.org.save()
        with schema_context(self.schema_name):
            self.teacher = User.objects.create_user(
                email=f"t-{uuid4().hex[:6]}@e.com", password="x", name="T",
                phone_number="-", date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )

    def _client(self, user):
        c = APIClient()
        c.force_authenticate(user=user)
        c.credentials(HTTP_TENANT=self.schema_name)
        return c

    def test_link_token_endpoint_returns_deeplink(self):
        res = self._client(self.teacher).post("/api/v1/telegram/link-token")
        self.assertEqual(res.status_code, 200, res.content)
        self.assertIn("https://t.me/schoolbot?start=", res.data["deep_link"])
        with schema_context(self.schema_name):
            self.assertTrue(
                TelegramLinkToken.objects.filter(user=self.teacher).exists()
            )

    def test_start_message_binds_account(self):
        with schema_context(self.schema_name):
            tok = TelegramLinkToken.objects.create(
                user=self.teacher, token="abc123",
                expires_at=timezone.now() + timedelta(minutes=15),
            )
            # mock outbound reply so we don't hit the network
            from unittest.mock import patch
            with patch("app_telegram.binding.TelegramClient") as MockClient:
                handle_message(self.org, {
                    "text": "/start abc123",
                    "chat": {"id": 4242, "type": "private"},
                    "from": {"id": 4242, "username": "teach"},
                })
            self.teacher.refresh_from_db()
            tok.refresh_from_db()
        self.assertEqual(self.teacher.telegram_user_id, 4242)
        self.assertEqual(self.teacher.telegram_chat_id, 4242)
        self.assertEqual(self.teacher.telegram_username, "teach")
        self.assertIsNotNone(self.teacher.telegram_linked_at)
        self.assertIsNotNone(tok.consumed_at)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test app_telegram.tests.test_binding -v 2`
Expected: FAIL — `app_telegram.binding` missing / endpoint 404.

- [ ] **Step 3: Implement binding service + handler**

`app_telegram/binding.py`:

```python
"""Account binding: issue link tokens, handle `/start <token>`."""
from __future__ import annotations

import logging
import secrets
from datetime import timedelta

from django.utils import timezone

from app_telegram.client import TelegramClient
from app_telegram.models import TelegramLinkToken

logger = logging.getLogger(__name__)
TOKEN_TTL_MINUTES = 15


def issue_link_token(user, bot_username: str) -> str:
    """Create a one-time token and return the t.me deep link."""
    token = secrets.token_urlsafe(24)
    TelegramLinkToken.objects.create(
        user=user, token=token,
        expires_at=timezone.now() + timedelta(minutes=TOKEN_TTL_MINUTES),
    )
    return f"https://t.me/{bot_username}?start={token}"


def handle_message(tenant, message: dict) -> None:
    """Dispatch private-chat messages. Only `/start <token>` is handled."""
    text = (message.get("text") or "").strip()
    chat = message.get("chat") or {}
    if chat.get("type") != "private":
        return
    if not text.startswith("/start"):
        return
    parts = text.split(maxsplit=1)
    if len(parts) != 2:
        return
    token_value = parts[1].strip()

    tok = TelegramLinkToken.objects.filter(token=token_value).select_related("user").first()
    if tok is None or not tok.is_active():
        _reply(tenant, chat["id"], "This link is invalid or expired. Generate a new one in Schedjuice.")
        return

    from_user = message.get("from") or {}
    tg_user_id = from_user.get("id")

    # one telegram account == one user; clear any previous owner
    type(tok.user).objects.filter(telegram_user_id=tg_user_id).exclude(
        id=tok.user.id
    ).update(telegram_user_id=None, telegram_chat_id=None, telegram_linked_at=None)

    user = tok.user
    user.telegram_user_id = tg_user_id
    user.telegram_chat_id = chat["id"]
    user.telegram_username = from_user.get("username")
    user.telegram_linked_at = timezone.now()
    user.save(update_fields=[
        "telegram_user_id", "telegram_chat_id", "telegram_username", "telegram_linked_at",
    ])

    tok.consumed_at = timezone.now()
    tok.save(update_fields=["consumed_at"])

    _reply(tenant, chat["id"], f"Linked to {tenant.name}. You'll receive course updates here.")


def _reply(tenant, chat_id: int, text: str) -> None:
    try:
        TelegramClient(tenant).send_message(chat_id, text)
    except Exception:
        logger.exception("telegram: failed to send binding reply")
```

- [ ] **Step 4: Add endpoint + url**

Add to `app_telegram/views.py`:

```python
from app_telegram.binding import issue_link_token
from tenant_schemas.utils import get_public_schema_name as _pub


class TelegramLinkTokenView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        with schema_context(_pub()):
            org = Organization.objects.get(schema_name=connection.schema_name)
        if not org.telegram_bot_username:
            return Response(
                {"detail": "Telegram is not configured for this school."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        deep_link = issue_link_token(request.user, org.telegram_bot_username)
        return Response({"deep_link": deep_link}, status=status.HTTP_200_OK)


class TelegramUnlinkView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        u = request.user
        u.telegram_user_id = None
        u.telegram_chat_id = None
        u.telegram_username = None
        u.telegram_linked_at = None
        u.save(update_fields=[
            "telegram_user_id", "telegram_chat_id", "telegram_username", "telegram_linked_at",
        ])
        return Response({"ok": True}, status=status.HTTP_200_OK)
```

Add to `app_telegram/urls.py`:

```python
from app_telegram.views import TelegramLinkTokenView, TelegramUnlinkView
# ...
    path("link-token", TelegramLinkTokenView.as_view(), name="telegram-link-token"),
    path("unlink", TelegramUnlinkView.as_view(), name="telegram-unlink"),
```

- [ ] **Step 5: Run test to verify it passes**

Run: `python manage.py test app_telegram.tests.test_binding -v 2`
Expected: PASS (2 tests).

- [ ] **Step 6: Stage changes**

```bash
git add app_telegram/binding.py app_telegram/views.py app_telegram/urls.py app_telegram/tests/test_binding.py
# Proposed: feat(telegram): account binding via one-time-token start deep link
```

---

## Task 9: Course↔group linking (`telegram-link` endpoint + `my_chat_member` handler)

**Files:**
- Create: `app_telegram/linking.py`
- Modify: `app_telegram/views.py`, `app_telegram/urls.py`
- Create: `app_telegram/tests/test_linking.py`

- [ ] **Step 1: Write the failing test**

`app_telegram/tests/test_linking.py`:

```python
import unittest
from datetime import date, timedelta
from uuid import uuid4
from unittest.mock import patch

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_course.models import Course
from app_organization.models import Organization
from app_telegram.linking import build_group_link_deeplink, handle_my_chat_member
from app_telegram.models import TelegramPendingGroupLink


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class TelegramLinkingTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        with schema_context(get_public_schema_name()):
            self.org = Organization.objects.get(schema_name=self.schema_name)
            self.org.telegram_bot_username = "schoolbot"
            self.org.save()
        with schema_context(self.schema_name):
            self.admin = User.objects.create_user(
                email=f"a-{uuid4().hex[:6]}@e.com", password="x", name="A",
                phone_number="-", date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )
            self.admin.telegram_user_id = 7001
            self.admin.save()
            self.course = Course.objects.create(title="Algebra")

    def test_build_deeplink_contains_admin_rights(self):
        link = build_group_link_deeplink("schoolbot")
        self.assertTrue(link.startswith("https://t.me/schoolbot?startgroup"))
        self.assertIn("admin=", link)

    def test_my_chat_member_links_course(self):
        with schema_context(self.schema_name):
            TelegramPendingGroupLink.objects.create(
                course=self.course, initiated_by=self.admin,
                expires_at=timezone.now() + timedelta(minutes=30),
            )
            with patch("app_telegram.linking.TelegramClient") as MockClient:
                MockClient.return_value.create_chat_invite_link.return_value = {
                    "invite_link": "https://t.me/+abc"
                }
                handle_my_chat_member(self.org, {
                    "chat": {"id": -100555, "title": "Algebra Group", "type": "supergroup"},
                    "from": {"id": 7001},
                    "new_chat_member": {
                        "user": {"id": 555, "is_bot": True}, "status": "administrator",
                    },
                    "old_chat_member": {
                        "user": {"id": 555, "is_bot": True}, "status": "left",
                    },
                })
            self.course.refresh_from_db()
        self.assertEqual(self.course.telegram_chat_id, -100555)
        self.assertEqual(self.course.telegram_chat_title, "Algebra Group")
        self.assertEqual(self.course.telegram_invite_link, "https://t.me/+abc")
        self.assertIsNotNone(self.course.telegram_linked_at)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test app_telegram.tests.test_linking -v 2`
Expected: FAIL — `app_telegram.linking` missing.

- [ ] **Step 3: Implement linking**

`app_telegram/linking.py`:

```python
"""Course <-> Telegram group linking via the startgroup&admin deep link."""
from __future__ import annotations

import logging
from datetime import timedelta

from django.utils import timezone

from app_telegram.client import TelegramClient
from app_telegram.models import TelegramPendingGroupLink

logger = logging.getLogger(__name__)
PENDING_TTL_MINUTES = 30
ADMIN_RIGHTS = "restrict_members+invite_users+delete_messages+pin_messages"


def build_group_link_deeplink(bot_username: str) -> str:
    return f"https://t.me/{bot_username}?startgroup&admin={ADMIN_RIGHTS}"


def start_group_link(course, initiated_by, bot_username: str) -> str:
    """Create (or refresh) the single active pending link for this admin."""
    TelegramPendingGroupLink.objects.filter(
        initiated_by=initiated_by, consumed_at__isnull=True,
    ).update(consumed_at=timezone.now())
    TelegramPendingGroupLink.objects.create(
        course=course, initiated_by=initiated_by,
        expires_at=timezone.now() + timedelta(minutes=PENDING_TTL_MINUTES),
    )
    return build_group_link_deeplink(bot_username)


def handle_my_chat_member(tenant, payload: dict) -> None:
    """Bot's membership in a chat changed. Detect 'added as admin' and link the course."""
    new = payload.get("new_chat_member") or {}
    old = payload.get("old_chat_member") or {}
    member = new.get("user") or {}
    if not member.get("is_bot"):
        return  # only care about the bot's own membership

    new_status = new.get("status")
    was_present = old.get("status") in {"member", "administrator"}
    now_present = new_status in {"member", "administrator"}

    chat = payload.get("chat") or {}
    actor_id = (payload.get("from") or {}).get("id")

    # Bot removed from a chat -> clear any course link.
    if was_present and not now_present:
        _unlink_chat(tenant, chat.get("id"))
        return

    if not now_present:
        return

    # Bot added (or promoted): find the actor's pending link.
    pending = (
        TelegramPendingGroupLink.objects
        .select_related("course", "initiated_by")
        .filter(
            initiated_by__telegram_user_id=actor_id,
            consumed_at__isnull=True,
            expires_at__gt=timezone.now(),
        )
        .order_by("-created_at")
        .first()
    )
    if pending is None:
        logger.info("telegram: bot added to chat %s but no pending link for actor %s",
                    chat.get("id"), actor_id)
        return

    client = TelegramClient(tenant)
    course = pending.course
    course.telegram_chat_id = chat.get("id")
    course.telegram_chat_title = chat.get("title")
    course.telegram_linked_at = timezone.now()

    if new_status == "administrator":
        try:
            res = client.create_chat_invite_link(chat["id"], name=course.title)
            course.telegram_invite_link = res.get("invite_link")
        except Exception:
            logger.exception("telegram: could not create invite link for chat %s", chat.get("id"))

    course.save(update_fields=[
        "telegram_chat_id", "telegram_chat_title",
        "telegram_invite_link", "telegram_linked_at",
    ])
    pending.consumed_at = timezone.now()
    pending.save(update_fields=["consumed_at"])

    try:
        msg = f"Linked to course: {course.title}."
        if new_status != "administrator":
            msg += " Please make me an admin so I can manage the teacher roster."
        client.send_message(chat["id"], msg)
    except Exception:
        logger.exception("telegram: could not post link confirmation")


def _unlink_chat(tenant, chat_id) -> None:
    if chat_id is None:
        return
    from app_course.models import Course
    Course.objects.filter(telegram_chat_id=chat_id).update(
        telegram_chat_id=None, telegram_chat_title=None,
        telegram_invite_link=None, telegram_linked_at=None,
    )
```

- [ ] **Step 4: Add endpoints + urls**

Add to `app_telegram/views.py`:

```python
from app_course.models import Course
from app_telegram.linking import start_group_link
from app_telegram.client import TelegramClient


class CourseTelegramLinkView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, course_id: int):
        with schema_context(_pub()):
            org = Organization.objects.get(schema_name=connection.schema_name)
        if not org.telegram_bot_username:
            return Response({"detail": "Telegram not configured."},
                            status=status.HTTP_400_BAD_REQUEST)
        if not request.user.telegram_user_id:
            return Response({"detail": "Link your own Telegram account first."},
                            status=status.HTTP_400_BAD_REQUEST)
        course = Course.objects.filter(id=course_id).first()
        if course is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        deep_link = start_group_link(course, request.user, org.telegram_bot_username)
        return Response(
            {"deep_link": deep_link, "suggested_group_name": course.title},
            status=status.HTTP_200_OK,
        )


class CourseTelegramUnlinkView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, course_id: int):
        with schema_context(_pub()):
            org = Organization.objects.get(schema_name=connection.schema_name)
        course = Course.objects.filter(id=course_id).first()
        if course is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        if course.telegram_chat_id:
            try:
                TelegramClient(org).leave_chat(course.telegram_chat_id)
            except Exception:
                pass
            course.telegram_chat_id = None
            course.telegram_chat_title = None
            course.telegram_invite_link = None
            course.telegram_linked_at = None
            course.save(update_fields=[
                "telegram_chat_id", "telegram_chat_title",
                "telegram_invite_link", "telegram_linked_at",
            ])
        return Response({"ok": True}, status=status.HTTP_200_OK)
```

Add to `app_telegram/urls.py`:

```python
from app_telegram.views import CourseTelegramLinkView, CourseTelegramUnlinkView
# ...
    path("courses/<int:course_id>/link", CourseTelegramLinkView.as_view(), name="course-telegram-link"),
    path("courses/<int:course_id>/unlink", CourseTelegramUnlinkView.as_view(), name="course-telegram-unlink"),
```

> Final course-link route is `POST /api/v1/telegram/courses/<id>/link`. (The spec mentioned `/api/v1/courses/<id>/telegram-link`; placing it under the telegram namespace keeps all telegram URLs in one module. If the frontend contract requires the `courses/` namespace, add the alias route in `app_course/urls.py` pointing to the same view instead.)

- [ ] **Step 5: Run test to verify it passes**

Run: `python manage.py test app_telegram.tests.test_linking -v 2`
Expected: PASS (2 tests).

- [ ] **Step 6: Stage changes**

```bash
git add app_telegram/linking.py app_telegram/views.py app_telegram/urls.py app_telegram/tests/test_linking.py
# Proposed: feat(telegram): course<->group linking via startgroup deep link
```

---

## Task 10: Teacher roster sync (DM on assign, approve join, kick on unassign)

**Files:**
- Create: `app_telegram/roster.py`
- Create: `app_telegram/tasks.py` (django-q jobs)
- Create: `app_telegram/signals.py` (replace the placeholder from Task 1)
- Create: `app_telegram/tests/test_roster.py`

- [ ] **Step 1: Write the failing test**

`app_telegram/tests/test_roster.py`:

```python
import unittest
from datetime import date
from uuid import uuid4
from unittest.mock import patch

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_course.models import Course, UserCourse
from app_organization.models import Organization
from app_telegram.roster import handle_join_request


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class TelegramRosterTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        with schema_context(get_public_schema_name()):
            self.org = Organization.objects.get(schema_name=self.schema_name)
            self.org.is_telegram_on = True
            self.org.is_telegram_roster_sync_enabled = True
            self.org.save()
        with schema_context(self.schema_name):
            self.teacher = User.objects.create_user(
                email=f"t-{uuid4().hex[:6]}@e.com", password="x", name="T",
                phone_number="-", date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.teacher.telegram_user_id = 8001
            self.teacher.save()
            self.course = Course.objects.create(title="Geo", telegram_chat_id=-100777)

    def test_approves_assigned_teacher(self):
        with schema_context(self.schema_name):
            UserCourse.objects.create(
                user=self.teacher, course=self.course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
            )
            with patch("app_telegram.roster.TelegramClient") as MockClient:
                handle_join_request(self.org, {
                    "chat": {"id": -100777},
                    "from": {"id": 8001},
                })
            MockClient.return_value.approve_chat_join_request.assert_called_once_with(
                -100777, 8001
            )

    def test_declines_non_teacher(self):
        with schema_context(self.schema_name):
            with patch("app_telegram.roster.TelegramClient") as MockClient:
                handle_join_request(self.org, {
                    "chat": {"id": -100777},
                    "from": {"id": 9999},  # unknown / not a teacher
                })
            MockClient.return_value.decline_chat_join_request.assert_called_once_with(
                -100777, 9999
            )
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test app_telegram.tests.test_roster -v 2`
Expected: FAIL — `app_telegram.roster` missing.

- [ ] **Step 3: Implement roster handlers**

`app_telegram/roster.py`:

```python
"""Teacher roster sync: join-request gating + kick on unassign."""
from __future__ import annotations

import logging

from app_telegram.client import TelegramClient

logger = logging.getLogger(__name__)


def _is_active_teacher(course, telegram_user_id: int) -> bool:
    from app_auth.models import User
    from app_course.models import UserCourse
    user = User.objects.filter(telegram_user_id=telegram_user_id).first()
    if user is None:
        return False
    return UserCourse.objects.filter(
        course=course, user=user,
        assigned_as=UserCourse.AssignedAs.TEACHER,
        is_dropped_out=False,
    ).exists()


def handle_join_request(tenant, payload: dict) -> None:
    if not tenant.is_telegram_roster_sync_enabled:
        return
    from app_course.models import Course
    chat = payload.get("chat") or {}
    requester = (payload.get("from") or {}).get("id")
    course = Course.objects.filter(telegram_chat_id=chat.get("id")).first()
    if course is None or requester is None:
        return
    client = TelegramClient(tenant)
    try:
        if _is_active_teacher(course, requester):
            client.approve_chat_join_request(chat["id"], requester)
        else:
            client.decline_chat_join_request(chat["id"], requester)
    except Exception:
        logger.exception("telegram: join-request handling failed for chat %s", chat.get("id"))
```

- [ ] **Step 4: Implement django-q jobs**

`app_telegram/tasks.py`:

```python
"""Async (django-q) Telegram jobs."""
from __future__ import annotations

import logging

from app_course.models import Course, UserCourse
from app_telegram.client import TelegramClient
from utilitas.async_tasks import django_q_task, tenant_async

logger = logging.getLogger(__name__)


@django_q_task
@tenant_async(entity=UserCourse)
def dm_invite_link_to_teacher(user_course, tenant):
    """DM the course invite link to a newly-assigned teacher."""
    if not (tenant.is_telegram_on and tenant.is_telegram_roster_sync_enabled):
        return
    if user_course.assigned_as != UserCourse.AssignedAs.TEACHER:
        return
    course = user_course.course
    teacher = user_course.user
    if not course.telegram_invite_link or not teacher.telegram_chat_id:
        logger.info("telegram: skip invite DM (no link or teacher not linked)")
        return
    TelegramClient(tenant).send_message(
        teacher.telegram_chat_id,
        f"You've been added to <b>{course.title}</b>.\n"
        f"Tap to join the group: {course.telegram_invite_link}",
    )


@django_q_task
@tenant_async(entity=Course)
def remove_telegram_member(course, tenant, *, telegram_user_id: int):
    """Kick a teacher from a course's Telegram group."""
    if not (tenant.is_telegram_on and tenant.is_telegram_roster_sync_enabled):
        return
    if not course.telegram_chat_id:
        return
    TelegramClient(tenant).kick_member(course.telegram_chat_id, telegram_user_id)


@django_q_task
@tenant_async(entity=Course)
def send_telegram_group_message(course, tenant, *, text: str):
    if not (tenant.is_telegram_on and course.telegram_chat_id):
        return
    TelegramClient(tenant).send_message(course.telegram_chat_id, text)
```

- [ ] **Step 5: Wire signals for assign/unassign**

Replace `app_telegram/signals.py` (the placeholder from Task 1) with:

```python
"""Connect UserCourse changes to Telegram roster jobs."""
from __future__ import annotations

from django.db import connection
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver

from app_course.models import UserCourse
from app_telegram.tasks import dm_invite_link_to_teacher, remove_telegram_member


@receiver(post_save, sender=UserCourse)
def _on_user_course_saved(sender, instance: UserCourse, created, **kwargs):
    if instance.assigned_as != UserCourse.AssignedAs.TEACHER:
        return
    schema_name = connection.schema_name
    if created and not instance.is_dropped_out:
        dm_invite_link_to_teacher.delay(instance.id, schema_name)
    elif instance.is_dropped_out and instance.user.telegram_user_id:
        remove_telegram_member.delay(
            instance.course_id, schema_name,
            telegram_user_id=instance.user.telegram_user_id,
        )


@receiver(post_delete, sender=UserCourse)
def _on_user_course_deleted(sender, instance: UserCourse, **kwargs):
    if instance.assigned_as != UserCourse.AssignedAs.TEACHER:
        return
    if instance.user.telegram_user_id:
        remove_telegram_member.delay(
            instance.course_id, connection.schema_name,
            telegram_user_id=instance.user.telegram_user_id,
        )
```

Confirm `app_telegram/apps.py` `ready()` imports `signals` (done in Task 1).

- [ ] **Step 6: Run test to verify it passes**

Run: `python manage.py test app_telegram.tests.test_roster -v 2`
Expected: PASS (2 tests).

> Note: the signal-driven `.delay()` calls enqueue real django-q tasks. In tests that create `UserCourse` rows (e.g. Task 9), this is fine because `async_task` just enqueues; it does not execute inline. If a test asserts no network call happens, that holds. If django-q is configured to run synchronously in the test settings, patch `app_telegram.tasks.dm_invite_link_to_teacher.delay` in those tests.

- [ ] **Step 7: Stage changes**

```bash
git add app_telegram/roster.py app_telegram/tasks.py app_telegram/signals.py app_telegram/tests/test_roster.py
# Proposed: feat(telegram): teacher roster sync (join gating, DM invite, kick)
```

---

## Task 11: Announcements `send_to_telegram`

**Files:**
- Modify: `app_announcement/models.py` (add `send_to_telegram`)
- Modify: `app_announcement/serializers.py` (expose the flag)
- Modify: the announcement create/dispatch path (mirror `send_to_microsoft` → async) — likely `app_announcement/serializers.py` or `app_announcement/views.py`
- Create: `app_telegram/announcement.py` (the send job)
- Create: `app_telegram/tests/test_announcement.py`
- Migration: `app_announcement/`

- [ ] **Step 1: Find the existing MS announcement dispatch to mirror**

Use Grep on `send_to_microsoft` in `app_announcement/serializers.py` and `app_microsoft/announcement_helpers.py` to see exactly how the async post is triggered after an announcement is created. Mirror that structure.

Run: `python manage.py test app_announcement -v 1`
Expected: existing announcement tests still pass (baseline before changes).

- [ ] **Step 2: Write the failing test**

`app_telegram/tests/test_announcement.py`:

```python
import unittest
from datetime import date
from uuid import uuid4
from unittest.mock import patch

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_course.models import Course
from app_organization.models import Organization
from app_telegram.announcement import send_announcement_to_telegram


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class TelegramAnnouncementTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        with schema_context(get_public_schema_name()):
            self.org = Organization.objects.get(schema_name=self.schema_name)
            self.org.is_telegram_on = True
            self.org.save()
        with schema_context(self.schema_name):
            self.author = User.objects.create_user(
                email=f"a-{uuid4().hex[:6]}@e.com", password="x", name="A",
                phone_number="-", date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )
            self.course = Course.objects.create(title="C", telegram_chat_id=-100888)

    def test_send_announcement_posts_to_group(self):
        from app_announcement.models import Announcement
        with schema_context(self.schema_name):
            ann = Announcement.objects.create(
                title="Exam Monday", data="Study!", course=self.course,
                created_by=self.author, send_to_telegram=True,
            )
            with patch("app_telegram.announcement.TelegramClient") as MockClient:
                send_announcement_to_telegram(ann.id, self.schema_name)
            MockClient.return_value.send_message.assert_called_once()
            args = MockClient.return_value.send_message.call_args[0]
        self.assertEqual(args[0], -100888)
        self.assertIn("Exam Monday", args[1])
```

- [ ] **Step 3: Run test to verify it fails**

Run: `python manage.py test app_telegram.tests.test_announcement -v 2`
Expected: FAIL — `send_to_telegram` field and/or `app_telegram.announcement` missing.

- [ ] **Step 4: Add the model field**

In `app_announcement/models.py`, after `send_to_microsoft`:

```python
    send_to_telegram = models.BooleanField(default=False)
```

- [ ] **Step 5: Implement the send job**

`app_telegram/announcement.py`:

```python
"""Post an Announcement to its course's Telegram group."""
from __future__ import annotations

import logging

from app_announcement.models import Announcement
from app_telegram.client import TelegramClient
from utilitas.async_tasks import django_q_task, tenant_async

logger = logging.getLogger(__name__)


@django_q_task
@tenant_async(entity=Announcement)
def send_announcement_to_telegram(announcement, tenant):
    if not tenant.is_telegram_on:
        return
    course = announcement.course
    if course is None or not course.telegram_chat_id:
        return
    body = announcement.data or ""
    text = f"<b>{announcement.title}</b>\n{body}".strip()
    TelegramClient(tenant).send_message(course.telegram_chat_id, text)
```

- [ ] **Step 6: Expose the flag + trigger on create**

In `app_announcement/serializers.py`, add `send_to_telegram` to the serializer `fields` (next to `send_to_microsoft`). The MS dispatch lives in `AnnouncementSerializer.create()` (around lines 44-74): after `super().create()`, it reads `tenant = getattr(self.context.get("request"), "tenant", None)` and, when `instance.send_to_microsoft` and `tenant`, calls `send_announcement_to_teams_async.delay(instance.id, tenant.schema_name)`. Add a parallel Telegram dispatch right after that `send_announcement_to_teams_async.delay(...)` call:

```python
        if tenant and instance.send_to_telegram:
            from app_telegram.announcement import send_announcement_to_telegram
            send_announcement_to_telegram.delay(instance.id, tenant.schema_name)
```

> Note: the `skip_teams_schedule` early-return at line ~52 also skips Telegram for the multipart/attachment flow. If announcements with attachments should also go to Telegram, mirror whatever the multipart flow does for Teams after attachments are saved (it calls the Teams async there). For v1, sharing the same skip is acceptable — document it.

- [ ] **Step 7: Migration + run tests**

Run: `python manage.py makemigrations app_announcement && python manage.py migrate_schemas -v 0`
Run: `python manage.py test app_telegram.tests.test_announcement -v 2`
Expected: PASS.
Run: `python manage.py test app_announcement -v 1`
Expected: existing announcement tests still pass.

- [ ] **Step 8: Stage changes**

```bash
git add app_announcement/ app_telegram/announcement.py app_telegram/tests/test_announcement.py
# Proposed: feat(telegram): post announcements to course telegram group
```

---

## Task 12: `Task` queue dispatch for `LEAVE_TELEGRAM_GROUP`

**Files:**
- Modify: `app_tasks/tasks.py` (add `leave_telegram_group`)
- Modify: `app_tasks/management/commands/run-tasks.py` (dispatch the new name)
- Create: `app_telegram/tests/test_leave_task.py`

- [ ] **Step 1: Write the failing test**

`app_telegram/tests/test_leave_task.py`:

```python
import unittest
from unittest.mock import patch

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_organization.models import Organization
from app_tasks.models import Task
from app_tasks import tasks as task_handlers


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class LeaveTelegramTaskTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def test_leave_telegram_group_calls_client(self):
        with schema_context(get_public_schema_name()):
            org = Organization.objects.get(schema_name=self.schema_name)
        with schema_context(self.schema_name):
            t = Task.objects.create(
                name=Task.TaskName.LEAVE_TELEGRAM_GROUP,
                data={"chat_id": -100999}, response="",
            )
            with patch("app_tasks.tasks.TelegramClient") as MockClient:
                task_handlers.leave_telegram_group(t, org)
            MockClient.return_value.leave_chat.assert_called_once_with(-100999)
            t.refresh_from_db()
        self.assertTrue(t.is_success)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test app_telegram.tests.test_leave_task -v 2`
Expected: FAIL — `app_tasks.tasks.leave_telegram_group` missing.

- [ ] **Step 3: Implement the handler**

In `app_tasks/tasks.py`, add (and add the import at top: `from app_telegram.client import TelegramClient`):

```python
def leave_telegram_group(task, org):
    chat_id = (task.data or {}).get("chat_id")
    if org is not None and org.is_telegram_on and chat_id is not None:
        TelegramClient(org).leave_chat(chat_id)
    task.is_success = True
    task.save()
```

> Match the success/`save()` convention used by the other handlers in this file (some set `is_success` + `save()` themselves; mirror the nearest one).

- [ ] **Step 4: Dispatch it in `run-tasks.py`**

In `app_tasks/management/commands/run-tasks.py`, add another branch in the `if/elif` chain:

```python
                elif task.name == models.Task.TaskName.LEAVE_TELEGRAM_GROUP:
                    tasks.leave_telegram_group(task, org)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `python manage.py test app_telegram.tests.test_leave_task -v 2`
Expected: PASS.

- [ ] **Step 6: Stage changes**

```bash
git add app_tasks/tasks.py app_tasks/management/commands/run-tasks.py app_telegram/tests/test_leave_task.py
# Proposed: feat(telegram): leave-group task handler
```

---

## Task 13: Management commands (reconcile rosters, set webhooks)

**Files:**
- Create: `app_telegram/management/__init__.py`, `app_telegram/management/commands/__init__.py`
- Create: `app_telegram/management/commands/reconcile-telegram-rosters.py`
- Create: `app_telegram/management/commands/telegram-set-webhooks.py`
- Create: `app_telegram/tests/test_commands.py`

- [ ] **Step 1: Write the failing test**

`app_telegram/tests/test_commands.py`:

```python
import unittest
from unittest.mock import patch

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_organization.models import Organization


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class TelegramCommandTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def test_set_webhooks_runs_without_error(self):
        with schema_context(get_public_schema_name()):
            org = Organization.objects.get(schema_name=self.schema_name)
            org.is_telegram_on = True
            org.telegram_routing_key = "rk-cmd"
            org.telegram_webhook_secret = "sec"
            org.set_telegram_bot_token("1:tok")
            org.save()
        with patch("app_telegram.management.commands.__init__", create=True):
            with patch("app_telegram.client.TelegramClient.set_webhook") as mock_sw, \
                 patch("app_telegram.client.TelegramClient.get_me", return_value={"id": 1, "username": "b"}):
                # command must run inside the tenant schema context
                with schema_context(self.schema_name):
                    call_command("telegram-set-webhooks")
        # at least attempted to set webhook for the enabled tenant
        self.assertTrue(mock_sw.called)
```

> If the command iterates tenants itself (public-schema fan-out) rather than relying on the active schema, adjust the test to not wrap in `schema_context`. Decide the iteration style in Step 3 and make the test match.

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test app_telegram.tests.test_commands -v 2`
Expected: FAIL — command not found.

- [ ] **Step 3: Implement the commands**

Create the package files (`management/__init__.py`, `management/commands/__init__.py` — empty).

`app_telegram/management/commands/telegram-set-webhooks.py`:

```python
"""(Re)register the webhook for the current tenant's bot (idempotent)."""
import logging

from django.conf import settings
from django.core.management import BaseCommand
from django.db import connection
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_organization.models import Organization
from app_telegram.client import TelegramClient
from app_telegram.config import WEBHOOK_ALLOWED_UPDATES

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Register the Telegram webhook for the current tenant."

    def handle(self, *args, **options):
        schema = connection.schema_name
        with schema_context(get_public_schema_name()):
            org = Organization.objects.filter(schema_name=schema).first()
        if org is None or not org.is_telegram_on or not org.telegram_routing_key:
            self.stdout.write("Telegram not enabled for this tenant; skipping.")
            return
        url = (
            f"{settings.TELEGRAM_WEBHOOK_BASE_URL.rstrip('/')}"
            f"/api/v1/telegram/webhook/{org.telegram_routing_key}/"
        )
        TelegramClient(org).set_webhook(
            url=url,
            secret_token=org.telegram_webhook_secret,
            allowed_updates=WEBHOOK_ALLOWED_UPDATES,
        )
        self.stdout.write(self.style.SUCCESS(f"Webhook set: {url}"))
```

`app_telegram/management/commands/reconcile-telegram-rosters.py`:

```python
"""Remove teachers from course groups who are no longer active teachers.

Note: Telegram Bot API cannot enumerate all group members. This command only
re-kicks teachers we know were dropped/unassigned but whose removal job may have
failed. It iterates dropped UserCourse rows that still have a linked teacher.
"""
import logging

from django.core.management import BaseCommand

from app_course.models import UserCourse
from app_telegram.tasks import remove_telegram_member

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Reconcile teacher membership in Telegram course groups."

    def handle(self, *args, **options):
        from django.db import connection
        schema = connection.schema_name
        dropped = (
            UserCourse.objects
            .select_related("user", "course")
            .filter(
                assigned_as=UserCourse.AssignedAs.TEACHER,
                is_dropped_out=True,
                user__telegram_user_id__isnull=False,
                course__telegram_chat_id__isnull=False,
            )
        )
        count = 0
        for uc in dropped:
            remove_telegram_member.delay(
                uc.course_id, schema, telegram_user_id=uc.user.telegram_user_id
            )
            count += 1
        self.stdout.write(self.style.SUCCESS(f"Queued {count} removals."))
```

> Register these commands in the per-tenant cron fan-out (`app_tasks/cron_runner.py`) only if you want them scheduled — mirror how MS commands are scheduled there. For v1, manual/cron invocation is fine.

- [ ] **Step 4: Run test to verify it passes**

Run: `python manage.py test app_telegram.tests.test_commands -v 2`
Expected: PASS.

- [ ] **Step 5: Stage changes**

```bash
git add app_telegram/management/ app_telegram/tests/test_commands.py
# Proposed: feat(telegram): management commands for webhooks + roster reconcile
```

---

## Task 14: RBAC permission `telegram.configure`

**Files:**
- Modify: `app_rbac/catalog.py` (add the permission)
- Modify: `app_telegram/views.py` (enforce on config/link views)
- Modify: any role-default seeding that grants `microsoft.configure` (grant `telegram.configure` to the same roles)
- Create: `app_telegram/tests/test_rbac.py`

- [ ] **Step 1: Add the permission to the catalog**

In `app_rbac/catalog.py`, next to the microsoft entries:

```python
    _p("telegram.configure", "Configure Telegram", "configure the Telegram integration", "Operational", tier=PLATFORM_INTERNAL),
```

- [ ] **Step 2: Confirm enforcement + seeding for the permission**

Enforcement is via `RBACView` + a per-method `required_permissions` dict (e.g. `app_microsoft/views.py:121` → `required_permissions = {"GET": "microsoft.configure"}`). The config view in Task 6 already uses `required_permissions = {"POST": "telegram.configure"}`, so once the catalog entry exists it is enforced.

For seeding, grep for where `microsoft.configure` is granted to roles (e.g. in `app_rbac/seeding.py` or a default-role map) and grant `telegram.configure` to the same role(s) (`PLATFORM_INTERNAL` tier → typically superadmin/platform). Mirror it exactly.

- [ ] **Step 3: Write the failing test**

`app_telegram/tests/test_rbac.py`:

```python
import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class TelegramRBACTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        with schema_context(self.schema_name):
            seed_rbac()
            self.teacher = User.objects.create_user(
                email=f"t-{uuid4().hex[:6]}@e.com", password="x", name="T",
                phone_number="-", date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )

    def test_teacher_cannot_configure(self):
        c = APIClient()
        c.force_authenticate(user=self.teacher)
        c.credentials(HTTP_TENANT=self.schema_name)
        res = c.post("/api/v1/telegram/config", {"bot_token": "x"}, format="json")
        self.assertIn(res.status_code, (401, 403))
```

> Set `RBAC_ENFORCE="enforce"` (or whatever the codebase's strict value is — check `app_rbac` for the exact choices; the announcement test used `"log_only"`). Match the real enforcement value.

- [ ] **Step 4: Run test to verify it fails**

Run: `python manage.py test app_telegram.tests.test_rbac -v 2`
Expected: FAIL — teacher currently allowed (200/400) because the view only checks `IsAuthenticated`.

- [ ] **Step 5: Enforce the permission**

`TelegramConfigView` already inherits `RBACView` with `required_permissions = {"POST": "telegram.configure"}` (Task 6), so adding the catalog entry in Step 1 enforces it. Verify the test now returns 401/403 for the teacher. (The `CourseTelegramLinkView`/`CourseTelegramUnlinkView` are intentionally `IsAuthenticated`-only since teachers/managers may manage their own course groups; if you want to gate them too, add `required_permissions` there and switch them to `RBACView`.)

- [ ] **Step 6: Run test to verify it passes**

Run: `python manage.py test app_telegram.tests.test_rbac -v 2`
Expected: PASS.

- [ ] **Step 7: Full suite + stage**

Run: `python manage.py test app_telegram -v 1`
Expected: all `app_telegram` tests pass.

```bash
git add app_rbac/ app_telegram/views.py app_telegram/tests/test_rbac.py
# Proposed: feat(telegram): add telegram.configure RBAC permission + enforce
```

---

## Final verification

- [ ] Run the whole new suite: `python manage.py test app_telegram -v 1` → all green.
- [ ] Run touched neighbors: `python manage.py test app_announcement app_tasks -v 1` → still green.
- [ ] Sanity-check migrations apply on a fresh DB: `python manage.py migrate_schemas --shared && python manage.py migrate_schemas`.
- [ ] Manual smoke (staging, real bot): create bot via BotFather → `POST /api/v1/telegram/config` → link your account via the deep link → create a course + link a group → assign a teacher → confirm invite DM + join approval → post an announcement with `send_to_telegram` → unassign teacher → confirm kick.

## Spec coverage map

| Spec section | Task(s) |
| --- | --- |
| §2 architecture / app layout | 1, 5, 7 |
| §3 Organization fields + encryption | 1, 2 |
| §3 User/Course fields, delete hook, new models | 3, 4 |
| §4 account binding | 8 |
| §5 group linking | 9 |
| §6 teacher roster sync | 10, 13 |
| §7 announcements & DMs | 10 (DM), 11 (announcements) |
| §8 webhook handling & security | 7 |
| §9 async jobs, commands, config | 6, 10, 12, 13 |
| §10 API surface | 6, 8, 9 |
| RBAC `telegram.configure` | 14 |
