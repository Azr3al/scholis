# Course Feed → Microsoft Teams Sync

> Sync course feed posts (announcements and daily lessons) to the course Team's Teams channel, with per-post opt-out and configurable channel override in course settings.

**Status:** Design approved (brainstorming 2026-07-06).
**Related:**
- [ANNOUNCEMENT_MS_TEAMS_FRONTEND.md](../../../schedjuice-reimagined-be/docs/ANNOUNCEMENT_MS_TEAMS_FRONTEND.md) — org-wide announcement Teams sync
- [2026-06-28-course-feed-composer-ui-design.md](./2026-06-28-course-feed-composer-ui-design.md) — course feed composer

---

## 1. Context

Org-wide announcements already sync to MS Teams when `send_to_microsoft=true`. The backend helper `send_announcement_to_teams()` in `app_microsoft/announcement_helpers.py` posts to each matching course's Teams channel, resolving `course.microsoft_channel_id` or falling back to the **General** channel.

Course feed posts (scoped to a single `course_id`) do **not** set `send_to_microsoft` today, so they never reach Teams. Teachers want course announcements and daily lessons to appear in the class Team channel automatically, with:

- Default channel: **General**
- Override: `course.microsoft_channel_id` in course settings
- Per-post opt-out in the composer
- Edits update the original Teams message (with fallback)

---

## 2. Goals

1. **Auto-sync course feed posts** to Teams when tenant is Microsoft-enabled and the course has a linked Team.
2. **Both post types** — announcements and daily lessons.
3. **Create and edit** — update the original Teams message on feed post edits.
4. **Opt-out toggle** — "Post to Teams" checked by default; teachers can uncheck per post.
5. **Channel override** — admins pick the target channel from a dropdown in course settings (Graph channel list).

## 3. Non-Goals

- Changing org-wide broadcast announcement behavior (multi-course filters)
- Moving old Teams messages when course channel setting changes
- Teacher-facing error toasts for async Teams failures
- Telegram sync for course feed posts
- Storing Teams message IDs for org-wide multi-course broadcasts

---

## 4. Locked Decisions

| # | Decision | Choice |
| --- | --- | --- |
| 1 | Post types synced | Announcement + daily lesson |
| 2 | Sync timing | Create and edit |
| 3 | Edit behavior | PATCH original Teams message |
| 4 | PATCH failure fallback | POST new message; soft-delete old if possible; update stored IDs |
| 5 | Opt-out | Toggle in composer; default **on** when eligible |
| 6 | Eligibility | `tenant.is_microsoft_on` + `tenant.is_teams_creation_enabled` + `course.microsoft_group_id` |
| 7 | Default channel | General (via `get_general_channel_id` when `microsoft_channel_id` empty) |
| 8 | Channel override UI | Dropdown from Graph `list_channels` (admin/superadmin) |
| 9 | Scope | Course-scoped posts only (`course_id` set) |
| 10 | Teams failures | Async; log only; never block SuConnect save |

---

## 5. Eligibility

Teams sync is **available** when all are true:

```python
tenant.is_microsoft_on
and tenant.is_teams_creation_enabled is not False
and course.microsoft_group_id  # non-empty
```

If unavailable:
- Hide composer "Post to Teams" toggle
- Skip Teams scheduling regardless of `send_to_microsoft`

---

## 6. Composer — "Post to Teams" Toggle

**Location:** Course feed composer footer (`course-feed-composer.tsx`), near post type selector.

| Property | Value |
| --- | --- |
| Label | "Post to Teams" |
| Default | Checked when eligible |
| Visibility | Hidden when not eligible |
| Form field | `send_to_microsoft` (`"true"` / `"false"`) on create and update |
| Persistence | Stored on `Announcement.send_to_microsoft` |

When unchecked, no Teams task is scheduled on create or update.

---

## 7. Course Settings — Channel Dropdown

**Location:** Course edit page, in/near `MicrosoftTeamCard` section.

| Property | Value |
| --- | --- |
| Who can edit | Superadmin/admin (same gate as `MicrosoftTeamCard`) |
| Control | `<Select>` populated from Graph |
| Default option | General (or empty value → resolve General at send time) |
| Saves to | `course.microsoft_channel_id` |
| Visible when | Tenant MS on + Teams creation on + course has `microsoft_group_id` |

**New API:**

```
GET /api/v1/courses/{course_id}/microsoft-channels
→ 200 { "data": [{ "id": "...", "displayName": "General" }, ...] }
```

Implementation: `MSMeeting.list_channels(course.microsoft_group_id)`.

Errors (Graph failure): return empty list + log; dropdown shows only General fallback message.

---

## 8. Backend Trigger

### 8.1 Create

Existing paths unchanged at entry:

- JSON create via `AnnouncementSerializer.create()`
- Multipart create via `AnnouncementListView.post()` (schedules after attachments)

Schedule `send_announcement_to_teams_async` when:

- `instance.course_id` is set
- `instance.send_to_microsoft` is true
- Tenant eligible (checked inside helper)

### 8.2 Update

Extend `AnnouncementSerializer.update()` and multipart PATCH handler to schedule the same async task when:

- `instance.course_id` is set
- `send_to_microsoft` is true (from payload or existing instance)
- Content-relevant fields changed OR always on update when toggle on (simpler: always sync on update when toggle on)

Multipart PATCH must parse `send_to_microsoft` (already supported in `_parse_multipart_announcement_data`).

---

## 9. Teams Message Content

Built in `_build_teams_html(announcement)` (refactor from current inline logic):

| Post type | Heading |
| --- | --- |
| `announcement` | `<h2>{title}</h2>` |
| `daily_lesson` | `<h2>Unit {finished_unit} complete</h2>` |

Body: `announcement.data` or `html_data` (prefer `html_data`), plus attachment links (existing `_build_announcement_content` logic).

Footer: `<p><em>— SuConnect</em></p>`.

---

## 10. Message Lifecycle

### 10.1 New model fields

On `Announcement`:

| Field | Type | Description |
| --- | --- | --- |
| `microsoft_teams_message_id` | `CharField(max_length=512, null=True, blank=True)` | Graph chatMessage id |
| `microsoft_teams_team_id` | `CharField(max_length=512, null=True, blank=True)` | Team id at post time |
| `microsoft_teams_channel_id` | `CharField(max_length=512, null=True, blank=True)` | Channel id at post time |

Only populated for course-scoped posts that successfully posted to Teams.

### 10.2 Channel resolution

At sync time for a course:

```python
channel_id = course.microsoft_channel_id or meeting.get_general_channel_id(course.microsoft_group_id)
```

If `microsoft_channel_id` was empty and General resolved, optionally persist to `course.microsoft_channel_id` (existing behavior).

### 10.3 Create flow

1. Resolve team + channel
2. POST `/teams/{team}/channels/{channel}/messages`
3. On success: store `message.id`, team id, channel id on announcement

### 10.4 Update flow (course posts only)

If `microsoft_teams_message_id` and stored team/channel exist:

1. PATCH `/teams/{team}/channels/{channel}/messages/{message_id}` with new HTML
2. On success: done

**Fallback (PATCH fails):**

1. POST new message to **current** configured channel (course's override or General)
2. POST `/teams/{team}/channels/{channel}/messages/{old_message_id}/softDelete` (best-effort)
3. Update stored message/team/channel IDs from new POST

Use stored team/channel for PATCH/softDelete; use current course channel for new POST.

### 10.5 Graph wrapper additions

In `MSMeeting` (`graph_wrapper/meeting.py`):

```python
def patch_channel_message(self, team_id, channel_id, message_id, content, content_type="html")
def soft_delete_channel_message(self, team_id, channel_id, message_id)
```

Permissions: existing delegated auth for channel messages (`ChannelMessage.Send`; PATCH/delete may require `ChannelMessage.ReadWrite` — verify tenant app registration has required scopes).

---

## 11. Refactor: `send_announcement_to_teams`

Split behavior:

| Announcement scope | Behavior |
| --- | --- |
| `course_id` set | Single course; create or update lifecycle (§10) |
| `course_id` null | Existing org-wide broadcast loop (unchanged) |

For course-scoped posts, skip `send_to_microsoft` check at org level but still require tenant MS on.

---

## 12. Error Handling

- All Graph calls in async task — exceptions logged, not raised to API
- PATCH failure → fallback path (§10.4)
- softDelete failure → log warning; new message still stands
- Missing team/channel → log warning; skip sync

---

## 13. Testing

### Backend (required)

| Test | Assert |
| --- | --- |
| Course post create + MS on + toggle on | POST message scheduled; IDs stored |
| Course post + toggle off | No Teams call |
| Daily lesson heading | HTML contains `Unit 5 complete` |
| Update with message id | PATCH called |
| PATCH fails | POST new + softDelete attempted |
| No `microsoft_group_id` | Skip sync |

### Manual

1. Eligible course: toggle on by default; post → Teams General
2. Change channel in settings → new posts go to selected channel
3. Edit feed post → Teams message updates
4. Uncheck toggle → edit does not touch Teams
5. Ineligible tenant/course → no toggle shown

---

## 14. Files

| File | Change |
| --- | --- |
| `app_announcement/models.py` | Add 3 Teams tracking fields |
| `app_announcement/migrations/` | New migration |
| `app_announcement/serializers.py` | Schedule Teams on update |
| `app_announcement/views.py` | Multipart PATCH Teams schedule |
| `app_microsoft/announcement_helpers.py` | Course create/update lifecycle, content builder |
| `app_microsoft/graph_wrapper/meeting.py` | PATCH + softDelete |
| `app_course/views.py` | `GET .../microsoft-channels` |
| `app_course/urls.py` | Route |
| `app_microsoft/tests/` or `app_announcement/tests/` | New tests |
| `course-feed-composer.tsx` | Post to Teams toggle |
| `microsoft-team-card.tsx` or new component | Channel dropdown |
| `client-api/microsoft.ts` | `getCourseMicrosoftChannels` |
