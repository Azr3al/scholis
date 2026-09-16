# Daily Lesson & Course Feed — Image Attachments + Teams Inline Images

> Fix missing images on course feed posts (especially daily lessons) and deliver inline image previews in MS Teams when `send_to_microsoft=true`.

**Status:** Design approved (brainstorming 2026-07-07).
**Related:**
- [2026-06-26-course-feed-design.md](./2026-06-26-course-feed-design.md) — course feed v1
- [2026-06-28-course-feed-composer-ui-design.md](./2026-06-28-course-feed-composer-ui-design.md) — composer, append/replace
- [2026-07-06-course-feed-teams-sync-design.md](./2026-07-06-course-feed-teams-sync-design.md) — Teams sync lifecycle
- [ANNOUNCEMENT_MS_TEAMS_FRONTEND.md](../../schedjuice-reimagined-be/docs/ANNOUNCEMENT_MS_TEAMS_FRONTEND.md) — multipart create contract

---

## 1. Context

Course feed posts (announcements and daily lessons) support image file attachments. Teachers expect images to appear in the SuConnect feed card gallery and, when Teams sync is enabled, as visible previews in the class Team channel.

**Current behavior:**

| Flow | Attachment storage | Feed gallery | Teams payload |
| --- | --- | --- | --- |
| Create (multipart POST) | `AnnouncementAttachment` | Works | Download links only |
| Edit | JuiceBox `Attachment` | Broken | Broken |
| Daily lesson append/replace | JuiceBox (files never uploaded) | Broken | Broken |

The feed card (`course-feed-card.tsx`) reads only `expand=attachments` (`AnnouncementAttachment`). The legacy announcement card falls back to JuiceBox search; the course feed does not.

Teams sync (`_build_announcement_content` in `app_microsoft/announcement_helpers.py`) appends `<a href="...">filename</a>` links for `AnnouncementAttachment` rows. It does not embed inline images. External `<img src="https://...">` URLs are unreliable in Teams channel HTML.

---

## 2. Goals

1. **SuConnect feed** — image attachments display in `CourseFeedAttachmentGallery` for all composer flows (create, edit, append, replace).
2. **Single attachment system** — course feed uses `AnnouncementAttachment` exclusively (same as multipart create).
3. **Teams inline images** — when `send_to_microsoft=true`, image attachments render as inline previews in the channel message (Graph `hostedContents`).
4. **Teams non-image files** — remain download links below the body/images.
5. **Edit lifecycle** — append/replace daily lesson uploads new images; edit can add/remove attachments.

## 3. Non-Goals

- Inline images inside TipTap rich-text body (announcement editor explicitly excludes `QuizImage`)
- Migrating historical JuiceBox-only announcement attachments (optional follow-up; feed fallback covers display)
- Changing org-wide multi-course broadcast Teams behavior beyond shared helper improvements
- Teacher-facing toasts for async Teams failures (existing: log only)
- Push notification images

---

## 4. Locked Decisions

| # | Decision | Choice |
| --- | --- | --- |
| 1 | Attachment storage | `AnnouncementAttachment` only for course feed |
| 2 | Create API | Unchanged multipart POST |
| 3 | Update API | New multipart PATCH on `AnnouncementDetailsView` |
| 4 | Delete attachments on edit | `deleted_attachment_ids` form field (JSON array string or repeated keys) |
| 5 | Teams image embed | Graph `hostedContents` with `../hostedContents/{id}/$value` in HTML body |
| 6 | Teams update when images present | Always POST new message + soft-delete old (PATCH cannot update `hostedContents`) |
| 7 | Teams update when text-only | PATCH existing message (current behavior) |
| 8 | Oversized images (> 4 MB) | Skip inline embed; fall back to download link in Teams; still show in feed |
| 9 | Legacy JuiceBox attachments | Optional read-only fallback on feed card (display only) |
| 10 | Teams sync timing | Schedule async task **after** attachment rows are saved on PATCH (same as POST) |

---

## 5. Root Cause

Two parallel attachment systems were introduced when the course feed composer was built:

- **Create** follows the org-wide pattern: multipart → `AnnouncementAttachment`.
- **Edit / append / replace** follow the legacy announcement form pattern: JSON PATCH + JuiceBox upload.

The course feed list expands `AnnouncementAttachment` only. Teams builder reads `announcement.attachments.all()` (`AnnouncementAttachment` related name). JuiceBox rows are invisible to both paths.

Additionally, append/replace calls JSON `updateEntity` without uploading composer files, so images selected during duplicate resolution are silently dropped.

---

## 6. Backend — Multipart PATCH

Extend `AnnouncementDetailsView` to handle `multipart/form-data` on PATCH (and PUT if routed), mirroring `AnnouncementListView.post()`:

```
PATCH /api/v1/announcements/{id}
Content-Type: multipart/form-data
```

**Form fields** (same parsers as create via `_parse_multipart_announcement_data`):

| Field | Description |
| --- | --- |
| `post_type`, `title`, `data`, `html_data`, `finished_unit`, `course`, `posted_on`, `send_to_microsoft`, … | Announcement fields |
| `files` | New files → new `AnnouncementAttachment` rows |
| `deleted_attachment_ids` | IDs of `AnnouncementAttachment` rows to delete (accept JSON string `"[1,2]"` or repeated form keys) |

**Handler sequence:**

1. Parse multipart data.
2. Validate and save announcement via serializer with `context={"skip_teams_schedule": True}`.
3. Delete listed `AnnouncementAttachment` rows (scoped to this announcement id).
4. Create new `AnnouncementAttachment` rows from `request.FILES.getlist("files")`.
5. If `send_to_microsoft` and tenant eligible → `send_announcement_to_teams_async.delay()` **after** attachment mutations.

JSON PATCH without files continues to work for text-only updates (no attachment changes).

---

## 7. Frontend — Composer Unification

**File:** `schedjuice-reimagined-fe/src/components/course/feed/course-feed-composer.tsx`

| Change | Detail |
| --- | --- |
| Remove JuiceBox upload on update | Delete `uploadToJuiceBox` call in `updateMutation` |
| Remove JuiceBox fetch on edit | Delete `useJuiceBoxAttachments`; load from `initialPost.attachments` |
| Multipart PATCH | Build `FormData` for edit, append, replace; use PATCH to `announcements/{id}` |
| Delete attachments | Append removed `AnnouncementAttachment` ids to `deleted_attachment_ids` |
| New files | Append to `files` in same FormData |
| Delete API | Stop calling `deleteEntity("attachments", id)` (JuiceBox table) |

**Append/replace:** Include new image files in the multipart PATCH (fixes silent drop).

**API client:** Add or reuse a helper for multipart PATCH (same pattern as `makePostRequest` for create).

---

## 8. Frontend — Feed Display

**Primary path:** No gallery changes required once attachments are unified.

**Optional legacy fallback** in `course-feed-card.tsx` (or shared hook):

- If `post.attachments` is empty, query JuiceBox `attachments` where `table_name=announcement` and `foreign_key=post.id` (same pattern as `announcement-card.tsx`).
- Display only; do not write new JuiceBox rows from course feed.

---

## 9. Teams — Inline Images via `hostedContents`

### 9.1 Graph API contract

POST channel message payload:

```json
{
  "body": {
    "contentType": "html",
    "content": "<h2>Unit 5 covered today</h2><p>Notes</p><img src=\"../hostedContents/1/$value\" />"
  },
  "hostedContents": [
    {
      "@microsoft.graph.temporaryId": "1",
      "contentBytes": "<base64>",
      "contentType": "image/png"
    }
  ]
}
```

The `temporaryId` in `hostedContents` must match the reference in HTML (`../hostedContents/{id}/$value`).

**Limit:** ~4 MB per hosted item. Larger files → download link fallback.

**PATCH limitation:** Microsoft Graph does not support updating `hostedContents` on existing messages. Inline images require a new POST.

### 9.2 Graph wrapper

**File:** `schedjuice-reimagined-be/app_microsoft/graph_wrapper/meeting.py`

Extend `post_channel_message(team_id, channel_id, content, content_type="html", hosted_contents=None)`:

- When `hosted_contents` is non-empty, include `"hostedContents": hosted_contents` in JSON payload.

`patch_channel_message` unchanged (text-only updates).

### 9.3 Content builder

**File:** `app_microsoft/announcement_helpers.py`

Refactor `_build_teams_html` / `_build_announcement_content`:

1. Heading (`_teams_heading`) — unchanged.
2. Body — `html_data` or `data`.
3. **Image attachments** — for each raster image in `announcement.attachments.all()`:
   - Read bytes from `AnnouncementAttachment.file` (S3/public storage).
   - If ≤ 4 MB: add to `hosted_contents` list + `<img src="../hostedContents/{tid}/$value">` in HTML.
   - If > 4 MB: append download link (existing `<a href>` pattern).
4. **Non-image attachments** — download links in `<ul>` (existing pattern).
5. Footer — `— SuConnect`.

Return `(html_string, hosted_contents_list)` from builder; pass both to `post_channel_message`.

MIME type: derive from filename extension (`image/jpeg`, `image/png`, `image/webp`, `image/gif`).

### 9.4 Update lifecycle

In `sync_course_announcement_to_teams`:

```
has_images = any(is_raster_image(att.filename) for att in announcement.attachments.all())

if stored_message_id and not has_images:
    PATCH existing message with text + link attachments
else if stored_message_id and has_images:
    POST new message with hostedContents
    soft-delete old message (best effort)
    update stored message IDs
else:
    POST new message (create path)
```

Org-wide broadcast loop (`send_announcement_to_teams`) uses the same builder; benefits from inline images automatically.

---

## 10. Error Handling

| Scenario | Behavior |
| --- | --- |
| Teams POST fails | Log warning; SuConnect save already succeeded |
| Image read from S3 fails | Skip that image; log; continue with others |
| Image > 4 MB | Link fallback in Teams; full image still in feed |
| Multipart PATCH partial failure | Transaction: announcement save + attachment ops should be atomic where possible |
| Invalid `deleted_attachment_ids` | Ignore ids not belonging to announcement (no 404) |

---

## 11. Testing

### Backend

| Test | Assert |
| --- | --- |
| Multipart PATCH adds `AnnouncementAttachment` | Rows created, expandable in serializer |
| Multipart PATCH deletes attachments | Rows removed |
| Teams HTML with images | Payload includes `hostedContents` + matching `../hostedContents/N/$value` refs |
| Teams sync with images on update | POST called (not PATCH); soft-delete attempted |
| Teams sync text-only update | PATCH called |
| Oversized image | No hostedContent entry; link present in HTML |

Suggested locations: `app_announcement/tests/`, `app_microsoft/tests/test_course_feed_teams_sync.py`.

### Frontend

| Test | Assert |
| --- | --- |
| Edit sends FormData with `files` and `deleted_attachment_ids` | Unit test on composer helper or integration |
| `getAttachmentUrl` / `isAttachmentImage` | Already covered for `AnnouncementAttachment` shape |

Manual QA:

1. Create daily lesson with images → feed gallery + Teams inline previews
2. Edit post: add/remove images → feed updates; Teams re-posts with previews
3. Append to existing daily lesson with new images → images appear in feed and Teams
4. Toggle Teams off → no Teams call; feed still shows images

---

## 12. Files to Change

| Area | File |
| --- | --- |
| Backend PATCH | `app_announcement/views.py` |
| Teams builder | `app_microsoft/announcement_helpers.py` |
| Graph client | `app_microsoft/graph_wrapper/meeting.py` |
| Composer | `course-feed-composer.tsx` |
| Feed card (optional) | `course-feed-card.tsx` |
| API client | multipart PATCH helper if needed |
| Tests | `app_announcement/tests/`, `app_microsoft/tests/` |

---

## 13. Rollout Notes

- No database migration required (`AnnouncementAttachment` model exists).
- Existing posts with JuiceBox-only attachments: optional fallback shows them in feed; re-saving via edit with multipart PATCH migrates them to `AnnouncementAttachment` if teacher re-uploads.
- Teams messages edited after deploy will re-post (when images present) rather than PATCH — acceptable; matches existing PATCH-failure fallback pattern.
