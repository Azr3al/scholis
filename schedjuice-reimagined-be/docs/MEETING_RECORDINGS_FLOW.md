# Meeting Recordings (read-only playback)

Teams meeting recordings were previously synced from Microsoft Graph into private storage. **New downloads are disabled**; this document covers playback of existing `ProcessedTeamsRecording` rows only.

---

## Model: ProcessedTeamsRecording

| Field | Type | Notes |
|-------|------|-------|
| `course` | FK → Course | Course the recording belongs to |
| `recording_id` | str | Microsoft recording ID (unique per course) |
| `meeting_id` | str | Teams meeting ID (matches `course.microsoft_meeting_id`) |
| `recording_content_url` | str | Legacy Graph URL (auth required; not used for playback) |
| `created_datetime` | DateTime, nullable | When the recording was created (from Microsoft) |
| `file_path` | str, nullable | Path in private storage (e.g. `meeting_recordings/123/CourseTitle_2025-02-22_1430.mp4`) |
| `onedrive_deleted` | bool | Historical: whether the OneDrive original was deleted after copy |

`unique_together = (course, recording_id)`

---

## API access (frontend)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/recordings` | List recordings (paginated) |
| GET | `/api/v1/recordings?course_id=<id>` | List recordings for a course |
| GET | `/api/v1/recordings/<id>` | Get single recording |
| POST | `/api/v1/recordings/<id>/share` | Create a 10-day share link |
| GET | `/api/v1/shared-recording/<token>` | Public playback via JWT share token |

**Auth**: JWT Bearer token. Tenant via `X-Tenant` or `Tenant` header.

**Permissions**:

- **Admins**: See all recordings.
- **Non-admins**: Only recordings for courses they are assigned to (UserCourse) or created.

List/detail responses include a presigned `download_url` when `file_path` is set (see `ProcessedTeamsRecordingSerializer.get_download_url`).

---

## Settings

| Setting | Default | Notes |
|---------|---------|-------|
| `MEETING_RECORDINGS_SUBFOLDER` | `"meeting_recordings"` | S3 path prefix for stored files |
| `RECORDING_PRESIGNED_EXPIRES_SECONDS` | 10 days | Presigned URL TTL (capped at 7 days on AWS) |
| `RECORDING_SHARE_JWT_EXPIRES` | 10 days | Share link JWT expiry |

Storage uses `PrivateMediaStorage` under `AWS_PRIVATE_MEDIA_LOCATION`.

---

## Ops: inspect DB rows

```bash
python manage.py list-processed-recordings --schema-name <tenant>
```

---

## Related code

| File | Role |
|------|------|
| `app_course/models.py` | `ProcessedTeamsRecording` |
| `app_course/views.py` | List/detail/share views |
| `app_course/serializers.py` | Presigned URL generation |
| `app_tasks/management/commands/list-processed-recordings.py` | CLI inspector |

Manual staff uploads use `UserUploadedRecording` (separate from Teams sync).
