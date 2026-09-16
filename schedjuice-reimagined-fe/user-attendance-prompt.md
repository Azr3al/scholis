# Frontend Prompt: Fetching User Attendances

Use this context when implementing the frontend for user-attendances.

---

## Base URL & Tenant

- **Base path**: `api/v1/`
- **Tenant header**: Include `X-Tenant` or `Tenant` with the schema name for multi-tenant routing.
- **Auth**: JWT Bearer token (standard `Authorization: Bearer <token>`).

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/user-attendances` | List attendances (paginated) |
| POST | `/user-attendances` | Create attendance |
| GET | `/user-attendances/<id>` | Get one attendance by ID |
| PUT/PATCH | `/user-attendances/<id>` | Update attendance |
| DELETE | `/user-attendances/<id>` | Delete attendance |
| POST | `/user-attendances/search` | Search with filters |

Full URL example: `GET /api/v1/user-attendances`

---

## UserAttendance Model Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | integer | Primary key |
| `user` | FK (integer) | User ID; expandable |
| `course` | FK (integer) | Course ID; expandable |
| `join_datetime` | datetime (ISO 8601) | When the user joined the meeting |
| `leave_datetime` | datetime (ISO 8601) | When the user left |
| `duration_seconds` | integer | Total attendance duration |
| `hourly_rate_at_creation` | decimal (nullable) | User's `per_hour_rate` at creation time |
| `created_at` | datetime | Record creation time |
| `updated_at` | datetime | Last update time |

---

## Query Parameters (List & Details)

| Param | Format | Description |
|-------|--------|-------------|
| `expand` | Base64-encoded JSON array | Expand related objects. Values: `user`, `course` or `user,course` |
| `fields` | Base64-encoded JSON array | Restrict returned fields |
| `sorts` | Base64-encoded JSON array | Sort order (e.g. `["-join_datetime"]`) |
| `page` | integer | Page number (default 1) |
| `size` | integer | Page size (default 10; use `-1` for all) |
| `meta` | boolean | Return endpoint metadata |

**Note**: `fields`, `expand`, and `sorts` use Base64-encoded JSON arrays. Example:
- `expand=["user","course"]` → `expand=WyJ1c2VyIiwiY291cnNlIl0=` (Base64 of `["user","course"]`)
- In JS: `expand=${btoa(JSON.stringify(["user","course"]))}`

---

## Search Endpoint (POST `/user-attendances/search`)

**Request body**:
```json
{
  "filter_params": [
    {
      "field_name": "course",
      "operator": "exact",
      "value": "123"
    },
    {
      "field_name": "user",
      "operator": "exact",
      "value": "456"
    },
    {
      "field_name": "join_datetime",
      "operator": "gte",
      "value": "2025-01-01T00:00:00Z"
    }
  ]
}
```

**Valid operators**: `exact`, `iexact`, `in`, `lt`, `gt`, `lte`, `gte`, `icontains`, `isnull`, `contains`, `contained_by`

**Filterable fields**: `id`, `user`, `course`, `join_datetime`, `leave_datetime`, `duration_seconds`, `created_at`, `updated_at`

---

## Response Format

Standard API response:
```json
{
  "isError": false,
  "message": "success",
  "data": [...],
  "links": {
    "next": "...",
    "previous": "..."
  },
  "count": 42,
  "count_per_page": 10,
  "total_pages": 5
}
```

---

## Example Requests

**List attendances with user and course expanded:**
```
GET /api/v1/user-attendances?page=1&size=20
Headers: X-Tenant: <schema>, Authorization: Bearer <token>
```
(Add `expand` as Base64-encoded `["user","course"]` if your client supports it.)

**Get one attendance:**
```
GET /api/v1/user-attendances/123
```

**Search attendances for a course:**
```
POST /api/v1/user-attendances/search
Body: {
  "filter_params": [
    {"field_name": "course", "operator": "exact", "value": "42"}
  ]
}
```

**Search attendances for a user:**
```
POST /api/v1/user-attendances/search
Body: {
  "filter_params": [
    {"field_name": "user", "operator": "exact", "value": "7"}
  ]
}
```

---

## Related Resources

- **User** (when expanded): `id`, `name`, `email`, `microsoft_id`, etc.
- **Course** (when expanded): `id`, `title`, `code`, `microsoft_meeting_id`, `meeting_link`, etc.

---

## Data Source

UserAttendance records are created by the `sync-meeting-attendance` cron job from Microsoft Teams or Zoom meeting attendance reports. **Only teachers** (UserCourse.AssignedAs = 'teacher') are recorded.
