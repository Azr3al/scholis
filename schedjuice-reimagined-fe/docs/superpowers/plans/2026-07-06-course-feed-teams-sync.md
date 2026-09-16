# Course Feed Teams Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sync course feed announcements and daily lessons to MS Teams with create/edit lifecycle, composer opt-out toggle, and course channel dropdown.

**Architecture:** Extend existing `send_announcement_to_teams` pipeline with course-scoped create/update/delete-via-softDelete lifecycle, store Graph message IDs on `Announcement`, expose channel list API, add FE toggle + settings dropdown.

**Tech Stack:** Django REST Framework, django-q async tasks, Microsoft Graph (`MSMeeting`), React/Next.js course feed composer.

**Spec:** [2026-07-06-course-feed-teams-sync-design.md](../specs/2026-07-06-course-feed-teams-sync-design.md)

---

## File Map

| File | Responsibility |
| --- | --- |
| `app_announcement/models.py` | Teams message tracking fields |
| `app_microsoft/graph_wrapper/meeting.py` | PATCH + softDelete Graph calls |
| `app_microsoft/announcement_helpers.py` | Course sync lifecycle + HTML builder |
| `app_announcement/serializers.py` | Schedule Teams on update |
| `app_announcement/views.py` | Multipart PATCH Teams schedule |
| `app_course/views.py` + `urls.py` | List channels endpoint |
| `course-feed-composer.tsx` | Post to Teams toggle |
| `microsoft-team-card.tsx` | Channel dropdown (or sibling component) |
| `client-api/microsoft.ts` | Channel list client |

---

### Task 1: Announcement Teams tracking fields

**Files:**
- Modify: `schedjuice-reimagined-be/app_announcement/models.py`
- Create: migration via `makemigrations`

- [ ] **Step 1: Add fields to Announcement model**

After `send_to_telegram`:

```python
microsoft_teams_message_id = models.CharField(max_length=512, null=True, blank=True)
microsoft_teams_team_id = models.CharField(max_length=512, null=True, blank=True)
microsoft_teams_channel_id = models.CharField(max_length=512, null=True, blank=True)
```

- [ ] **Step 2: Create migration**

```bash
cd schedjuice-reimagined-be
./env/bin/python manage.py makemigrations app_announcement --name announcement_teams_message_tracking
./env/bin/python manage.py migrate
```

- [ ] **Step 3: Commit**

```bash
git add app_announcement/models.py app_announcement/migrations/
git commit -m "feat: add Teams message tracking fields on announcements"
```

---

### Task 2: Graph PATCH and softDelete helpers

**Files:**
- Modify: `schedjuice-reimagined-be/app_microsoft/graph_wrapper/meeting.py`
- Test: `schedjuice-reimagined-be/app_microsoft/tests/test_channel_messages.py` (create)

- [ ] **Step 1: Write failing tests**

```python
from unittest.mock import MagicMock, patch
from django.test import SimpleTestCase
from app_microsoft.graph_wrapper.meeting import MSMeeting


class ChannelMessageMutationTests(SimpleTestCase):
    @patch.object(MSMeeting, "patch")
    def test_patch_channel_message(self, mock_patch):
        mock_patch.return_value = MagicMock(status_code=200)
        meeting = MSMeeting(MagicMock(), use_app_auth=False)
        meeting.patch_channel_message("team-1", "ch-1", "msg-1", "<p>Hi</p>")
        mock_patch.assert_called_once()
        url = mock_patch.call_args[0][0]
        self.assertIn("/teams/team-1/channels/ch-1/messages/msg-1", url)

    @patch.object(MSMeeting, "post")
    def test_soft_delete_channel_message(self, mock_post):
        mock_post.return_value = MagicMock(status_code=204)
        meeting = MSMeeting(MagicMock(), use_app_auth=False)
        meeting.soft_delete_channel_message("team-1", "ch-1", "msg-1")
        mock_post.assert_called_once()
        url = mock_post.call_args[0][0]
        self.assertIn("/softDelete", url)
```

- [ ] **Step 2: Run tests (expect fail)**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_microsoft.tests.test_channel_messages -v 2
```

- [ ] **Step 3: Implement methods**

```python
def patch_channel_message(
    self, team_id: str, channel_id: str, message_id: str, content: str, content_type: str = "html"
):
    payload = {"body": {"contentType": content_type, "content": content}}
    return self.patch(
        f"{self.URL}teams/{team_id}/channels/{channel_id}/messages/{message_id}",
        json=payload,
    )

def soft_delete_channel_message(self, team_id: str, channel_id: str, message_id: str):
    return self.post(
        f"{self.URL}teams/{team_id}/channels/{channel_id}/messages/{message_id}/softDelete",
    )
```

- [ ] **Step 4: Run tests (expect pass)**

```bash
./scripts/run_backend_tests.sh app_microsoft.tests.test_channel_messages -v 2
```

- [ ] **Step 5: Commit**

```bash
git add app_microsoft/graph_wrapper/meeting.py app_microsoft/tests/test_channel_messages.py
git commit -m "feat: add Graph channel message patch and soft delete helpers"
```

---

### Task 3: Course-scoped Teams sync lifecycle

**Files:**
- Modify: `schedjuice-reimagined-be/app_microsoft/announcement_helpers.py`
- Test: `schedjuice-reimagined-be/app_microsoft/tests/test_course_feed_teams_sync.py` (create)

- [ ] **Step 1: Add HTML builder and course sync functions**

Key functions to add/refactor:

```python
def _teams_heading(announcement: Announcement) -> str:
    if announcement.post_type == PostType.DAILY_LESSON:
        return f"<h2>Unit {announcement.finished_unit} complete</h2>"
    title = announcement.title or "Announcement"
    return f"<h2>{title}</h2>"

def _build_teams_html(announcement: Announcement) -> str:
    content = _build_announcement_content(announcement)
    return f"{_teams_heading(announcement)}{content}<p><em>— SuConnect</em></p>"

def _resolve_course_channel(meeting: MSMeeting, course: Course) -> str | None:
    channel_id = course.microsoft_channel_id
    if not channel_id:
        channel_id = meeting.get_general_channel_id(course.microsoft_group_id)
        if channel_id:
            course.microsoft_channel_id = channel_id
            course.save(update_fields=["microsoft_channel_id"])
    return channel_id

def sync_course_announcement_to_teams(announcement: Announcement, tenant: Organization) -> None:
    # eligibility, resolve course, build html
    # if message_id: patch; else: post
    # on patch fail: post new, soft_delete old, update fields
    # store microsoft_teams_* on announcement
```

Update `send_announcement_to_teams` to call `sync_course_announcement_to_teams` when `announcement.course_id` is set, else existing org-wide loop (use `_build_teams_html` / `_teams_heading` for org-wide too so daily-lesson never applies there).

- [ ] **Step 2: Write tests** (mock MSMeeting)

Cover: create POST, update PATCH, PATCH fail fallback with softDelete, skip when no group id, daily lesson heading.

- [ ] **Step 3: Run tests**

```bash
./scripts/run_backend_tests.sh app_microsoft.tests.test_course_feed_teams_sync -v 2
```

- [ ] **Step 4: Commit**

```bash
git add app_microsoft/announcement_helpers.py app_microsoft/tests/test_course_feed_teams_sync.py
git commit -m "feat: sync course feed announcements to Teams with edit lifecycle"
```

---

### Task 4: Schedule Teams sync on announcement update

**Files:**
- Modify: `schedjuice-reimagined-be/app_announcement/serializers.py`
- Modify: `schedjuice-reimagined-be/app_announcement/views.py`
- Test: extend announcement serializer tests

- [ ] **Step 1: Update AnnouncementSerializer.update()**

After `super().update()`, when `instance.course_id` and `instance.send_to_microsoft` and tenant:

```python
send_announcement_to_teams_async.delay(instance.id, tenant.schema_name)
```

- [ ] **Step 2: Multipart PATCH in AnnouncementDetailsView**

Mirror create path: if multipart, parse data, save, schedule Teams when `course_id` + `send_to_microsoft`.

- [ ] **Step 3: Run tests**

```bash
./scripts/run_backend_tests.sh app_announcement.tests -v 2
```

- [ ] **Step 4: Commit**

```bash
git add app_announcement/serializers.py app_announcement/views.py
git commit -m "feat: schedule Teams sync when course feed posts are updated"
```

---

### Task 5: Course Microsoft channels API

**Files:**
- Modify: `schedjuice-reimagined-be/app_course/views.py`
- Modify: `schedjuice-reimagined-be/app_course/urls.py`
- Test: `schedjuice-reimagined-be/app_course/tests/test_microsoft_channels.py` (create)

- [ ] **Step 1: Add view**

```python
class CourseMicrosoftChannelsView(RBACView):
    def get(self, request, course_id: int):
        if not request.tenant.is_microsoft_on:
            return self.bad_request("Microsoft integration is not enabled.")
        course = get_object_or_404(Course, pk=course_id)
        if not course.microsoft_group_id:
            return self.ok({"data": []})
        meeting = MSMeeting(request.tenant)
        channels = meeting.list_channels(course.microsoft_group_id) or []
        data = [{"id": ch["id"], "displayName": ch.get("displayName", "")} for ch in channels]
        return self.ok({"data": data})
```

Register: `courses/<int:course_id>/microsoft-channels`

- [ ] **Step 2: Tests + run**

```bash
./scripts/run_backend_tests.sh app_course.tests.test_microsoft_channels -v 2
```

- [ ] **Step 3: Commit**

```bash
git add app_course/views.py app_course/urls.py app_course/tests/test_microsoft_channels.py
git commit -m "feat: add API to list Microsoft Teams channels for a course"
```

---

### Task 6: Composer "Post to Teams" toggle

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/course/feed/course-feed-composer.tsx`
- May need course + tenant props or hooks already present

- [ ] **Step 1: Compute eligibility**

```tsx
const teamsSyncEligible = Boolean(
  tenant?.is_microsoft_on &&
  tenant?.is_teams_creation_enabled !== false &&
  course?.microsoft_group_id,
);
```

Fetch course if not available (or pass from parent `course-feed.tsx`).

- [ ] **Step 2: Add checkbox state**

Default `postToTeams = true` when eligible. Include in FormData:

```tsx
formData.append("send_to_microsoft", postToTeams ? "true" : "false");
```

Same for `runDailyLessonUpdate` / `runUpdate` JSON payloads.

- [ ] **Step 3: Render toggle in footer**

Only when `teamsSyncEligible`. Label: "Post to Teams".

- [ ] **Step 4: Manual verify + lint**

- [ ] **Step 5: Commit**

```bash
git add src/components/course/feed/course-feed-composer.tsx
git commit -m "feat: add Post to Teams opt-out toggle on course feed composer"
```

---

### Task 7: Course settings channel dropdown

**Files:**
- Modify: `schedjuice-reimagined-fe/src/app/client-api/microsoft.ts`
- Modify: `schedjuice-reimagined-fe/src/components/microsoft/microsoft-team-card.tsx` (or new `microsoft-channel-select.tsx`)
- Modify: course edit page if needed for save wiring

- [ ] **Step 1: Client API**

```typescript
export const getCourseMicrosoftChannels = (courseId: number | string) =>
  axiosClient.get(`courses/${courseId}/microsoft-channels`);
```

- [ ] **Step 2: Channel select component**

When course linked + admin: query channels, `<Select>` bound to `microsoft_channel_id`, default General, PATCH course on change.

- [ ] **Step 3: Lint + manual verify**

- [ ] **Step 4: Commit**

```bash
git add src/app/client-api/microsoft.ts src/components/microsoft/
git commit -m "feat: add Teams channel dropdown to course Microsoft settings"
```

---

### Task 8: Final verification

- [ ] **Step 1: Backend test suite (targeted)**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_microsoft.tests.test_channel_messages app_microsoft.tests.test_course_feed_teams_sync app_course.tests.test_microsoft_channels app_announcement.tests -v 2
```

- [ ] **Step 2: Frontend lint**

```bash
cd schedjuice-reimagined-fe
npm run lint -- --file src/components/course/feed/course-feed-composer.tsx
```

- [ ] **Step 3: Manual smoke checklist** (from spec §13)
