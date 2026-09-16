# Daily Lesson Images + Teams Inline Previews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix missing image attachments on course feed posts (create/edit/append/replace) and show inline image previews in MS Teams when `send_to_microsoft=true`.

**Architecture:** Unify all course feed attachment writes on `AnnouncementAttachment` via multipart PUT (matching existing multipart POST create). Extend Teams sync to embed raster images using Graph `hostedContents`; re-post Teams messages when images are present because PATCH cannot update hosted content.

**Tech Stack:** Django REST Framework, django-q, Microsoft Graph (`MSMeeting.post_channel_message`), React/Next.js course feed composer, Vitest (FE), Django TestCase (BE).

**Spec:** [2026-07-07-daily-lesson-images-design.md](../specs/2026-07-07-daily-lesson-images-design.md)

---

## File Map

| File | Responsibility |
| --- | --- |
| `app_announcement/views.py` | Shared attachment mutation helpers; multipart PUT on details view |
| `app_announcement/tests/test_multipart_announcement_update.py` | Multipart PUT attachment tests |
| `app_microsoft/teams_image_content.py` | Raster detection, MIME mapping, hostedContents builder |
| `app_microsoft/graph_wrapper/meeting.py` | Accept `hosted_contents` on POST |
| `app_microsoft/announcement_helpers.py` | Inline Teams HTML + re-post-when-images lifecycle |
| `app_microsoft/tests/test_teams_inline_images.py` | Teams content builder + sync branch tests |
| `src/app/client-api/utils.ts` | `updateEntityWithFormData` helper |
| `src/components/course/feed/course-feed-composer.tsx` | Multipart PUT; remove JuiceBox |
| `src/components/course/feed/course-feed-card.tsx` | Optional JuiceBox read fallback |
| `src/helpers/course-feed-update-form-data.ts` | Pure helper to build update FormData (unit-testable) |

**Note:** The API uses **PUT** for updates (`updateEntity` → `PUT /announcements/{id}`), not PATCH. Implement multipart handling on `AnnouncementDetailsView.put`.

---

### Task 1: Attachment mutation helpers

**Files:**
- Modify: `schedjuice-reimagined-be/app_announcement/views.py`
- Create: `schedjuice-reimagined-be/app_announcement/tests/test_multipart_announcement_update.py`

- [ ] **Step 1: Write failing unit tests for parsers**

Add to `test_multipart_announcement_update.py`:

```python
import json
import unittest
from io import BytesIO
from uuid import uuid4

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from tenant_schemas.utils import schema_context

from app_announcement.models import Announcement, AnnouncementAttachment, PostType
from app_announcement.views import (
    _parse_deleted_attachment_ids,
    _apply_announcement_attachment_mutations,
)
from app_auth.models import User
from app_course.models import Course
from datetime import date


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


class ParseDeletedAttachmentIdsTests(unittest.TestCase):
    def test_json_array_string(self):
        class Data:
            def get(self, key, default=None):
                return "[1, 2]" if key == "deleted_attachment_ids" else default

            def getlist(self, key):
                return []

        self.assertEqual(_parse_deleted_attachment_ids(Data()), [1, 2])

    def test_repeated_form_keys(self):
        class Data:
            def get(self, key, default=None):
                return None

            def getlist(self, key):
                return ["3", "4"] if key == "deleted_attachment_ids" else []

        self.assertEqual(_parse_deleted_attachment_ids(Data()), [3, 4])


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class ApplyAnnouncementAttachmentMutationsTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            self.user = User.objects.create_user(
                email=f"teacher-{suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.course = Course.objects.first()
            self.announcement = Announcement.objects.create(
                post_type=PostType.DAILY_LESSON,
                finished_unit=1,
                data="<p>Hi</p>",
                html_data="<p>Hi</p>",
                course=self.course,
                created_by=self.user,
            )
            self.existing = AnnouncementAttachment.objects.create(
                announcement=self.announcement,
                file=SimpleUploadedFile("old.png", b"old-bytes", content_type="image/png"),
                filename="old.png",
            )

    def test_deletes_and_creates_attachments(self):
        class Data:
            def get(self, key, default=None):
                return None

            def getlist(self, key):
                if key == "deleted_attachment_ids":
                    return [str(self.existing.id)]
                return []

        class Files:
            def getlist(self, key):
                return [
                    SimpleUploadedFile("new.jpg", b"new-bytes", content_type="image/jpeg")
                ]

        class Req:
            data = Data()
            FILES = Files()

        Req.data.existing = self.existing  # for closure

        with schema_context(self.schema_name):
            _apply_announcement_attachment_mutations(Req(), self.announcement)
            self.assertFalse(
                AnnouncementAttachment.objects.filter(id=self.existing.id).exists()
            )
            att = AnnouncementAttachment.objects.get(announcement=self.announcement)
            self.assertEqual(att.filename, "new.jpg")
```

- [ ] **Step 2: Run tests (expect fail)**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_announcement.tests.test_multipart_announcement_update -v 2
```

Expected: FAIL — `_parse_deleted_attachment_ids` / `_apply_announcement_attachment_mutations` not defined.

- [ ] **Step 3: Implement helpers in `views.py`**

Add after `_parse_multipart_announcement_data`:

```python
def _parse_deleted_attachment_ids(data) -> list[int]:
    raw_list = []
    if hasattr(data, "getlist"):
        raw_list = data.getlist("deleted_attachment_ids") or []
    if not raw_list and data.get("deleted_attachment_ids") not in (None, ""):
        raw = data.get("deleted_attachment_ids")
        if isinstance(raw, str):
            try:
                parsed = json.loads(raw)
                raw_list = parsed if isinstance(parsed, list) else [parsed]
            except json.JSONDecodeError:
                raw_list = [raw]
        else:
            raw_list = [raw]
    result: list[int] = []
    for item in raw_list:
        try:
            result.append(int(item))
        except (TypeError, ValueError):
            continue
    return result


def _apply_announcement_attachment_mutations(request, instance) -> None:
    deleted_ids = _parse_deleted_attachment_ids(request.data)
    if deleted_ids:
        models.AnnouncementAttachment.objects.filter(
            announcement_id=instance.id,
            id__in=deleted_ids,
        ).delete()
    files = (
        request.FILES.getlist("files")
        or request.FILES.getlist("attachments")
        or []
    )
    for f in files:
        models.AnnouncementAttachment.objects.create(
            announcement=instance,
            file=f,
            filename=f.name or "unnamed",
        )
```

Refactor `AnnouncementListView.post` to call `_apply_announcement_attachment_mutations(request, instance)` instead of inline loop.

- [ ] **Step 4: Run tests (expect pass)**

```bash
./scripts/run_backend_tests.sh app_announcement.tests.test_multipart_announcement_update -v 2
```

- [ ] **Step 5: Commit**

```bash
git add app_announcement/views.py app_announcement/tests/test_multipart_announcement_update.py
git commit -m "feat: add shared announcement attachment mutation helpers"
```

---

### Task 2: Multipart PUT on announcement details

**Files:**
- Modify: `schedjuice-reimagined-be/app_announcement/views.py`
- Modify: `schedjuice-reimagined-be/app_announcement/tests/test_multipart_announcement_update.py`

- [ ] **Step 1: Write failing integration test**

Append to `test_multipart_announcement_update.py`:

```python
from django.test import Client
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework_simplejwt.tokens import RefreshToken


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class MultipartAnnouncementUpdateTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            self.user = User.objects.create_user(
                email=f"teacher-{suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.course = Course.objects.first()
            self.announcement = Announcement.objects.create(
                post_type=PostType.DAILY_LESSON,
                finished_unit=2,
                data="<p>Before</p>",
                html_data="<p>Before</p>",
                course=self.course,
                created_by=self.user,
            )
            refresh = RefreshToken.for_user(self.user)
            self.auth = f"Bearer {refresh.access_token}"

    def test_multipart_put_adds_attachment(self):
        client = Client()
        image = SimpleUploadedFile("slide.png", b"png-bytes", content_type="image/png")
        res = client.put(
            f"/api/v1/announcements/{self.announcement.id}",
            data={
                "post_type": "daily_lesson",
                "finished_unit": "2",
                "html_data": "<p>After</p>",
                "data": "<p>After</p>",
                "course": str(self.course.id),
                "send_to_microsoft": "false",
                "files": image,
            },
            HTTP_AUTHORIZATION=self.auth,
            HTTP_X_TENANT=self.schema_name,
        )
        self.assertEqual(res.status_code, 200, res.content)
        with schema_context(self.schema_name):
            self.announcement.refresh_from_db()
            self.assertEqual(self.announcement.html_data, "<p>After</p>")
            self.assertEqual(self.announcement.attachments.count(), 1)
            self.assertEqual(self.announcement.attachments.first().filename, "slide.png")
```

Adjust URL/header names to match project conventions if test fails on routing — check an existing API test for `HTTP_X_TENANT` vs `HTTP_X_SCHEMA` pattern.

- [ ] **Step 2: Run test (expect fail)**

```bash
./scripts/run_backend_tests.sh app_announcement.tests.test_multipart_announcement_update.MultipartAnnouncementUpdateTests -v 2
```

- [ ] **Step 3: Override `put` on `AnnouncementDetailsView`**

```python
class AnnouncementDetailsView(RBACDetailsView):
    # ... existing check_permissions ...

    def put(self, request: Request, obj_id: int):
        is_multipart = (
            request.content_type
            and "multipart/form-data" in request.content_type
        )
        if not is_multipart:
            return super().put(request, obj_id)

        obj = self.get_object(obj_id)
        if obj is None:
            return self.send_not_found(obj_id)

        data = _parse_multipart_announcement_data(request.data)
        ser = self.get_serializer(
            obj,
            data=data,
            partial=True,
            context={"skip_teams_schedule": True, "request": request},
        )
        if not ser.is_valid():
            return self.send_response(
                True,
                "bad_request",
                {"details": ser.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )
        instance = ser.save()
        _apply_announcement_attachment_mutations(request, instance)

        tenant = getattr(request, "tenant", None)
        if tenant and instance.send_to_microsoft:
            send_announcement_to_teams_async.delay(
                instance.id,
                tenant.schema_name,
            )

        instance.refresh_from_db()
        out_ser = self.get_serializer(instance)
        return self.send_response(
            False,
            "updated",
            {"data": out_ser.data},
            status=status.HTTP_200_OK,
        )
```

Ensure `get_serializer` passes `request` in context (match POST handler). Use `self.updated(out_ser.data)` if `send_response` shape differs — mirror `AnnouncementListView.post` response envelope.

- [ ] **Step 4: Run tests (expect pass)**

```bash
./scripts/run_backend_tests.sh app_announcement.tests.test_multipart_announcement_update -v 2
```

- [ ] **Step 5: Commit**

```bash
git add app_announcement/views.py app_announcement/tests/test_multipart_announcement_update.py
git commit -m "feat: support multipart PUT for announcement attachments"
```

---

### Task 3: Teams image content builder

**Files:**
- Create: `schedjuice-reimagined-be/app_microsoft/teams_image_content.py`
- Create: `schedjuice-reimagined-be/app_microsoft/tests/test_teams_inline_images.py`

- [ ] **Step 1: Write failing tests**

```python
import base64
from unittest.mock import MagicMock
from django.test import SimpleTestCase

from app_microsoft.teams_image_content import (
    is_raster_image_filename,
    mime_type_for_filename,
    build_hosted_image_entries,
    announcement_has_raster_images,
)


class RasterFilenameTests(SimpleTestCase):
    def test_png(self):
        self.assertTrue(is_raster_image_filename("photo.PNG"))

    def test_pdf(self):
        self.assertFalse(is_raster_image_filename("doc.pdf"))


class BuildHostedImageEntriesTests(SimpleTestCase):
    def test_builds_hosted_content_for_small_image(self):
        att = MagicMock()
        att.filename = "a.png"
        att.file.open.return_value.__enter__ = lambda s: s
        att.file.open.return_value.__exit__ = MagicMock(return_value=False)
        att.file.read.return_value = b"\x89PNG small"
        att.file.url = "https://cdn.example.com/a.png"

        html_parts, hosted = build_hosted_image_entries([att])
        self.assertEqual(len(hosted), 1)
        self.assertEqual(hosted[0]["@microsoft.graph.temporaryId"], "1")
        self.assertEqual(hosted[0]["contentType"], "image/png")
        self.assertIn("../hostedContents/1/$value", html_parts[0])

    def test_oversized_image_falls_back_to_link(self):
        att = MagicMock()
        att.filename = "big.jpg"
        att.file.open.return_value.__enter__ = lambda s: s
        att.file.open.return_value.__exit__ = MagicMock(return_value=False)
        att.file.read.return_value = b"x" * (4 * 1024 * 1024 + 1)
        att.file.url = "https://cdn.example.com/big.jpg"

        html_parts, hosted = build_hosted_image_entries([att])
        self.assertEqual(hosted, [])
        self.assertIn('href="https://cdn.example.com/big.jpg"', html_parts[0])
```

- [ ] **Step 2: Run tests (expect fail)**

```bash
./scripts/run_backend_tests.sh app_microsoft.tests.test_teams_inline_images -v 2
```

- [ ] **Step 3: Implement `teams_image_content.py`**

```python
import base64
import logging
from typing import Any

logger = logging.getLogger(__name__)

RASTER_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".heic", ".heif",
}
MAX_HOSTED_BYTES = 4 * 1024 * 1024

MIME_BY_EXT = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".heic": "image/heic",
    ".heif": "image/heif",
}


def is_raster_image_filename(filename: str) -> bool:
    name = (filename or "").strip().lower()
    dot = name.rfind(".")
    if dot <= 0:
        return False
    return name[dot:] in RASTER_EXTENSIONS


def mime_type_for_filename(filename: str) -> str:
    name = (filename or "").strip().lower()
    dot = name.rfind(".")
    ext = name[dot:] if dot > 0 else ""
    return MIME_BY_EXT.get(ext, "application/octet-stream")


def announcement_has_raster_images(announcement) -> bool:
    return any(
        is_raster_image_filename(att.filename)
        for att in announcement.attachments.all()
    )


def build_hosted_image_entries(attachments) -> tuple[list[str], list[dict[str, Any]]]:
    html_parts: list[str] = []
    hosted: list[dict[str, Any]] = []
    temp_id = 0

    for att in attachments:
        if not is_raster_image_filename(att.filename):
            continue
        temp_id += 1
        tid = str(temp_id)
        try:
            with att.file.open("rb") as fh:
                raw = fh.read()
        except Exception:
            logger.warning("Could not read attachment %s for Teams inline image", att.id)
            continue

        if len(raw) > MAX_HOSTED_BYTES:
            try:
                url = att.file.url
                html_parts.append(f'<p><a href="{url}">{att.filename}</a></p>')
            except (ValueError, AttributeError):
                html_parts.append(f"<p>{att.filename}</p>")
            continue

        hosted.append(
            {
                "@microsoft.graph.temporaryId": tid,
                "contentBytes": base64.b64encode(raw).decode("ascii"),
                "contentType": mime_type_for_filename(att.filename),
            }
        )
        html_parts.append(f'<p><img src="../hostedContents/{tid}/$value" alt="{att.filename}" /></p>')

    return html_parts, hosted
```

- [ ] **Step 4: Run tests (expect pass)**

```bash
./scripts/run_backend_tests.sh app_microsoft.tests.test_teams_inline_images -v 2
```

- [ ] **Step 5: Commit**

```bash
git add app_microsoft/teams_image_content.py app_microsoft/tests/test_teams_inline_images.py
git commit -m "feat: add Teams hostedContents builder for announcement images"
```

---

### Task 4: Graph POST with hostedContents

**Files:**
- Modify: `schedjuice-reimagined-be/app_microsoft/graph_wrapper/meeting.py`
- Modify: `schedjuice-reimagined-be/app_microsoft/tests/test_teams_inline_images.py`

- [ ] **Step 1: Write failing test**

```python
from unittest.mock import MagicMock, patch
from django.test import SimpleTestCase
from app_microsoft.graph_wrapper.meeting import MSMeeting


class PostChannelMessageHostedContentsTests(SimpleTestCase):
    @patch.object(MSMeeting, "post")
    def test_includes_hosted_contents_in_payload(self, mock_post):
        mock_post.return_value = MagicMock(status_code=201, json=lambda: {"id": "m1"})
        meeting = MSMeeting(MagicMock(), use_app_auth=False)
        hosted = [{"@microsoft.graph.temporaryId": "1", "contentBytes": "abc", "contentType": "image/png"}]
        meeting.post_channel_message("t", "c", "<img />", hosted_contents=hosted)
        payload = mock_post.call_args.kwargs["json"]
        self.assertEqual(payload["hostedContents"], hosted)
```

- [ ] **Step 2: Run test (expect fail)**

```bash
./scripts/run_backend_tests.sh app_microsoft.tests.test_teams_inline_images.PostChannelMessageHostedContentsTests -v 2
```

- [ ] **Step 3: Extend `post_channel_message`**

```python
def post_channel_message(
    self,
    team_id: str,
    channel_id: str,
    content: str,
    content_type: str = "html",
    hosted_contents: list | None = None,
):
    payload = {
        "body": {
            "contentType": content_type,
            "content": content,
        }
    }
    if hosted_contents:
        payload["hostedContents"] = hosted_contents
    return self.post(
        f"{self.URL}teams/{team_id}/channels/{channel_id}/messages",
        json=payload,
    )
```

- [ ] **Step 4: Run tests (expect pass)**

```bash
./scripts/run_backend_tests.sh app_microsoft.tests.test_teams_inline_images -v 2
```

- [ ] **Step 5: Commit**

```bash
git add app_microsoft/graph_wrapper/meeting.py app_microsoft/tests/test_teams_inline_images.py
git commit -m "feat: pass hostedContents through Teams channel message POST"
```

---

### Task 5: Wire inline images into Teams sync lifecycle

**Files:**
- Modify: `schedjuice-reimagined-be/app_microsoft/announcement_helpers.py`
- Modify: `schedjuice-reimagined-be/app_microsoft/tests/test_teams_inline_images.py`
- Modify: `schedjuice-reimagined-be/app_microsoft/tests/test_course_feed_teams_sync.py`

- [ ] **Step 1: Write failing tests for builder + sync branch**

```python
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from django.test import SimpleTestCase
from app_announcement.models import PostType
from app_microsoft.announcement_helpers import _build_teams_html, sync_course_announcement_to_teams


class BuildTeamsHtmlInlineImageTests(SimpleTestCase):
    def test_includes_hosted_content_refs(self):
        att = MagicMock()
        att.filename = "x.png"
        att.file.open.return_value.__enter__ = lambda s: s
        att.file.open.return_value.__exit__ = MagicMock(return_value=False)
        att.file.read.return_value = b"\x89PNG"
        announcement = SimpleNamespace(
            post_type=PostType.DAILY_LESSON,
            finished_unit=3,
            title=None,
            html_data="<p>Notes</p>",
            data=None,
            attachments=MagicMock(all=MagicMock(return_value=[att])),
        )
        html, hosted = _build_teams_html(announcement)
        self.assertIn("../hostedContents/1/$value", html)
        self.assertEqual(len(hosted), 1)


class SyncRepostWhenImagesTests(SimpleTestCase):
    @patch("app_microsoft.announcement_helpers._post_channel_message_and_store", return_value=True)
    @patch("app_microsoft.announcement_helpers._resolve_course_channel", return_value="ch-1")
    def test_skips_patch_when_images_present(self, _resolve, mock_post):
        att = MagicMock(filename="a.png")
        announcement = SimpleNamespace(
            id=1,
            post_type=PostType.DAILY_LESSON,
            finished_unit=1,
            title=None,
            html_data="<p>x</p>",
            data=None,
            microsoft_teams_message_id="msg-old",
            microsoft_teams_team_id="team-1",
            microsoft_teams_channel_id="ch-1",
            attachments=MagicMock(all=MagicMock(return_value=[att])),
            save=MagicMock(),
        )
        course = SimpleNamespace(id=10, microsoft_group_id="team-1", microsoft_channel_id="ch-1", save=MagicMock())
        meeting = MagicMock()
        sync_course_announcement_to_teams(
            announcement,
            SimpleNamespace(is_microsoft_on=True, is_teams_creation_enabled=True),
            course,
            meeting,
        )
        meeting.patch_channel_message.assert_not_called()
        mock_post.assert_called_once()
```

- [ ] **Step 2: Run tests (expect fail)**

```bash
./scripts/run_backend_tests.sh app_microsoft.tests.test_teams_inline_images app_microsoft.tests.test_course_feed_teams_sync -v 2
```

- [ ] **Step 3: Refactor `announcement_helpers.py`**

Key changes:

```python
from app_microsoft.teams_image_content import (
    announcement_has_raster_images,
    build_hosted_image_entries,
    is_raster_image_filename,
)

def _build_announcement_content(announcement: Announcement) -> tuple[str, list]:
    content = announcement.html_data or announcement.data or ""
    attachments = list(announcement.attachments.all())
    image_atts = [a for a in attachments if is_raster_image_filename(a.filename)]
    non_image_atts = [a for a in attachments if not is_raster_image_filename(a.filename)]

    img_html_parts, hosted = build_hosted_image_entries(image_atts)
    if img_html_parts:
        content += "".join(img_html_parts)

    if non_image_atts:
        attachment_lines = []
        for att in non_image_atts:
            try:
                url = att.file.url
                attachment_lines.append(f'<li><a href="{url}">{att.filename}</a></li>')
            except (ValueError, AttributeError):
                attachment_lines.append(f"<li>{att.filename}</li>")
        content += "<p><strong>Attachments:</strong></p><ul>" + "".join(attachment_lines) + "</ul>"

    return content or "<p>No content</p>", hosted


def _build_teams_html(announcement: Announcement) -> tuple[str, list]:
    content, hosted = _build_announcement_content(announcement)
    html = f"{_teams_heading(announcement)}{content}<p><em>— SuConnect</em></p>"
    return html, hosted
```

Update `_post_channel_message_and_store`:

```python
def _post_channel_message_and_store(..., html: str, hosted_contents: list | None = None) -> bool:
    res = meeting.post_channel_message(
        team_id=team_id,
        channel_id=channel_id,
        content=html,
        content_type="html",
        hosted_contents=hosted_contents or None,
    )
    ...
```

Update `sync_course_announcement_to_teams`:

```python
html, hosted = _build_teams_html(announcement)
has_images = announcement_has_raster_images(announcement)

if stored_message_id and stored_team_id and stored_channel_id and not has_images:
    # PATCH path (text-only)
    ...
elif stored_message_id and stored_team_id and stored_channel_id and has_images:
    # Re-post with hostedContents; soft-delete old
    if _post_channel_message_and_store(..., html=html, hosted_contents=hosted):
        meeting.soft_delete_channel_message(old_team_id, old_channel_id, old_message_id)
else:
    _post_channel_message_and_store(..., html=html, hosted_contents=hosted)
```

Update org-wide loop in `send_announcement_to_teams`:

```python
full_content, hosted = _build_teams_html(announcement)
res = meeting.post_channel_message(..., content=full_content, hosted_contents=hosted or None)
```

Fix existing `test_daily_lesson_heading` in `test_course_feed_teams_sync.py` — `_build_teams_html` now returns a tuple:

```python
html, _hosted = _build_teams_html(announcement)
```

- [ ] **Step 4: Run tests (expect pass)**

```bash
./scripts/run_backend_tests.sh app_microsoft.tests.test_teams_inline_images app_microsoft.tests.test_course_feed_teams_sync -v 2
```

- [ ] **Step 5: Commit**

```bash
git add app_microsoft/announcement_helpers.py app_microsoft/tests/
git commit -m "feat: embed inline announcement images in Teams via hostedContents"
```

---

### Task 6: Frontend FormData helper + unit test

**Files:**
- Create: `schedjuice-reimagined-fe/src/helpers/course-feed-update-form-data.ts`
- Create: `schedjuice-reimagined-fe/src/helpers/course-feed-update-form-data.test.ts`
- Modify: `schedjuice-reimagined-fe/src/app/client-api/utils.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, expect, it } from "vitest";
import { buildCourseFeedUpdateFormData } from "./course-feed-update-form-data";

describe("buildCourseFeedUpdateFormData", () => {
  it("appends fields, files, and deleted ids", () => {
    const file = new File(["x"], "a.png", { type: "image/png" });
    const fd = buildCourseFeedUpdateFormData({
      post_type: "daily_lesson",
      finished_unit: 3,
      html_data: "<p>Hi</p>",
      course: 12,
      send_to_microsoft: true,
      newFiles: [file],
      deletedAttachmentIds: [5, 6],
    });
    expect(fd.get("post_type")).toBe("daily_lesson");
    expect(fd.get("finished_unit")).toBe("3");
    expect(fd.get("send_to_microsoft")).toBe("true");
    expect(fd.getAll("files")).toHaveLength(1);
    expect(fd.get("deleted_attachment_ids")).toBe("[5,6]");
  });
});
```

- [ ] **Step 2: Run test (expect fail)**

```bash
cd schedjuice-reimagined-fe
npm test -- src/helpers/course-feed-update-form-data.test.ts
```

- [ ] **Step 3: Implement helper + API wrapper**

`course-feed-update-form-data.ts`:

```typescript
export type CourseFeedUpdatePayload = {
  post_type: "announcement" | "daily_lesson";
  title?: string | null;
  finished_unit?: number | null;
  html_data: string;
  data?: string;
  course: number;
  send_to_microsoft?: boolean;
  posted_on?: string;
  newFiles?: File[];
  deletedAttachmentIds?: number[];
};

export function buildCourseFeedUpdateFormData(
  payload: CourseFeedUpdatePayload,
): FormData {
  const fd = new FormData();
  fd.append("post_type", payload.post_type);
  fd.append("course", String(payload.course));
  fd.append("html_data", payload.html_data);
  fd.append("data", payload.data ?? payload.html_data);
  if (payload.post_type === "announcement" && payload.title) {
    fd.append("title", payload.title);
  }
  if (payload.post_type === "daily_lesson" && payload.finished_unit != null) {
    fd.append("finished_unit", String(payload.finished_unit));
  }
  if (payload.posted_on) fd.append("posted_on", payload.posted_on);
  if (payload.send_to_microsoft != null) {
    fd.append("send_to_microsoft", payload.send_to_microsoft ? "true" : "false");
  }
  payload.newFiles?.forEach((f) => fd.append("files", f));
  if (payload.deletedAttachmentIds?.length) {
    fd.append(
      "deleted_attachment_ids",
      JSON.stringify(payload.deletedAttachmentIds),
    );
  }
  return fd;
}
```

`utils.ts`:

```typescript
export const updateEntityWithFormData = async (
  entity: string,
  entityId: number | string,
  data: FormData,
) => {
  return await axiosClient.put(`${entity}/${entityId}`, data);
};
```

- [ ] **Step 4: Run test (expect pass)**

```bash
npm test -- src/helpers/course-feed-update-form-data.test.ts
```

- [ ] **Step 5: Commit (FE repo)**

```bash
git add src/helpers/course-feed-update-form-data.ts src/helpers/course-feed-update-form-data.test.ts src/app/client-api/utils.ts
git commit -m "feat: add FormData builder for course feed announcement updates"
```

---

### Task 7: Unify course feed composer on multipart PUT

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/course/feed/course-feed-composer.tsx`

- [ ] **Step 1: Replace update mutation**

Remove imports/usages:
- `uploadToJuiceBox`
- `useJuiceBoxAttachments`
- `deleteEntity("attachments", …)` in update success path

Add imports:
- `updateEntityWithFormData`
- `buildCourseFeedUpdateFormData`

Replace `updateMutation.mutationFn`:

```typescript
const updateMutation = useMutation({
  mutationFn: async (payload: CourseFeedUpdatePayload & { id: number }) => {
    const formData = buildCourseFeedUpdateFormData(payload);
    return updateEntityWithFormData("announcements", payload.id, formData);
  },
  onSuccess: () => {
    // remove JuiceBox upload/delete try/catch block — toast + invalidate only
    ...
  },
});
```

Replace `runDailyLessonUpdate` and `runUpdate` to pass structured payload including:

```typescript
newFiles: attachments.filter((f): f is File => f instanceof File),
deletedAttachmentIds: toDeletedAttachmentId,
```

Remove the `useJuiceBoxAttachments` effect block; on edit mode initialize attachments from `initialPost?.attachments ?? []`.

- [ ] **Step 2: Manual smoke test**

1. Create daily lesson with image → appears in feed
2. Edit same post → add second image → both visible
3. Remove one image in edit → only one remains
4. Append to duplicate daily lesson with new image → image appears

- [ ] **Step 3: Commit**

```bash
git add src/components/course/feed/course-feed-composer.tsx
git commit -m "fix: use AnnouncementAttachment multipart PUT in course feed composer"
```

---

### Task 8: Legacy JuiceBox read fallback (optional but recommended)

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/course/feed/course-feed-card.tsx`

- [ ] **Step 1: Add fallback query when expand attachments empty**

Mirror `announcement-card.tsx` pattern:

```typescript
const { data: juiceBoxAttachments } = useQuery({
  queryKey: ["announcementJuiceBoxAttachments", post.id],
  queryFn: () =>
    searchEntities("attachments", { page: 1, size: -1 }, {
      filter_params: [
        { field_name: "table_name", value: "announcement", operator: operatorEnum.exact },
        { field_name: "foreign_key", value: String(post.id), operator: operatorEnum.exact },
      ],
    }),
  enabled: !(post.attachments?.length),
});
const attachments = post.attachments?.length
  ? post.attachments
  : juiceBoxAttachments?.data?.data ?? [];
```

- [ ] **Step 2: Commit**

```bash
git add src/components/course/feed/course-feed-card.tsx
git commit -m "fix: show legacy JuiceBox attachments on course feed cards"
```

---

## Manual QA Checklist

- [ ] Create daily lesson + images + Teams on → feed gallery + Teams inline previews
- [ ] Edit post: add/remove images → feed updates; Teams message re-posts with previews
- [ ] Append to existing daily lesson with images → images saved and visible
- [ ] Teams toggle off → no Teams call; feed still shows images
- [ ] Non-image attachment (e.g. PDF) on edit → feed link + Teams download link (not inline)

---

## Plan Self-Review

| Spec requirement | Task |
| --- | --- |
| Unified `AnnouncementAttachment` | Tasks 1–2, 7 |
| Multipart update API | Task 2 |
| Feed gallery fix | Tasks 7–8 |
| Teams `hostedContents` inline | Tasks 3–5 |
| Re-post when images on update | Task 5 |
| 4 MB fallback | Task 3 |
| Teams sync after attachments saved | Task 2 |
| Tests | All tasks |

No placeholders remain. API verb corrected to PUT to match codebase.
