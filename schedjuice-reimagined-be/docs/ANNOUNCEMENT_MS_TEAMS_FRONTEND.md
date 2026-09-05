# Announcement → Microsoft Teams (Frontend Reference)

Concise reference for frontend clients implementing announcement creation with MS Teams sync.

---

## Overview

When `send_to_microsoft` is `true`, the backend posts the announcement to matching courses' MS Teams channels on create. Courses are filtered by `course_filters`. Attachments are uploaded in the same request via `multipart/form-data`.

---

## Announcement Model (relevant fields)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `send_to_microsoft` | boolean | `false` | If true, post to MS Teams on create |
| `course_filters` | object | `{"month_type":"ALL"}` | Filters which courses receive the announcement |

---

## course_filters Schema

```ts
{
  category_ids?: number[];  // optional; omit = all categories
  month_type: "HM" | "FM" | "ALL";
}
```

| month_type | Meaning | Course rule |
|------------|---------|-------------|
| `FM` | Full-month | `course.start_date.day < 10` |
| `HM` | Half-month | `course.start_date.day >= 10` |
| `ALL` | No filter | All courses (default) |

---

## API

| Method | Endpoint |
|--------|----------|
| POST | `/api/v1/announcements` |
| GET | `/api/v1/announcements/<id>` |

---

## Create Announcement (multipart/form-data)

**Content-Type**: `multipart/form-data`

**Form fields**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | yes | Announcement title |
| `data` | string | no | HTML content (sent to MS Teams) |
| `html_data` | string | no | Alternative HTML content |
| `course` | number | no | Course ID (null = broadcast) |
| `is_pinned` | "true"/"false" | no | Default false |
| `send_to_microsoft` | "true"/"false" | no | Default false |
| `course_filters` | string (JSON) | no | e.g. `{"category_ids":[1,2],"month_type":"FM"}` |
| `files` | File[] | no | Attachments (multiple files, same key) |

**File field**: Use `files` or `attachments` as the form key. Multiple files supported (same key).

**Example (JavaScript FormData):**
```js
const formData = new FormData();
formData.append("title", "Important update");
formData.append("data", "<p>Content here</p>");
formData.append("send_to_microsoft", "true");
formData.append("course_filters", JSON.stringify({ category_ids: [1, 2], month_type: "FM" }));
// Attachments
files.forEach((f) => formData.append("files", f));

fetch("/api/v1/announcements", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "X-Tenant": schema },
  body: formData,
});
```

---

## Create Announcement (JSON, no attachments)

**Content-Type**: `application/json`

For announcements without attachments, JSON is still supported:

```json
{
  "title": "General notice",
  "data": "<p>Hello everyone</p>",
  "send_to_microsoft": true
}
```

---

## Attachments

- **AnnouncementAttachment**: One-to-many with Announcement. Upload in same request.
- Use `multipart/form-data` with `files` or `attachments` form key.
- Files are stored with public URLs; links are included in the Teams message.
- **Expand**: `expand=WyJhdHRhY2htZW50cyJd` (Base64 of `["attachments"]`) to include attachments in GET response.

---

## Behavior

1. **Course scope**: If `course` is set, only that course is considered (and must match filters). If `course` is null, all courses matching filters are used.
2. **MS Teams required**: Only courses with `microsoft_group_id` receive the post.
3. **Content**: `data` (HTML) is sent to Teams; `json_data` is not.
4. **Attachments**: Uploaded in same request; links included in Teams message.

---

## Example Payloads (multipart form fields)

**All courses, all month types:**
```
title: General notice
data: <p>Hello everyone</p>
send_to_microsoft: true
```

**Categories 1 and 2, full-month only:**
```
title: FM classes update
data: <p>For full-month classes</p>
send_to_microsoft: true
course_filters: {"category_ids":[1,2],"month_type":"FM"}
```

**With attachments:**
```
title: Update with docs
data: <p>See attached</p>
send_to_microsoft: true
files: [file1.pdf, file2.png]  // multiple files, same key
```
