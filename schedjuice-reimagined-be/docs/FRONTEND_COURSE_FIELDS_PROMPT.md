# Frontend Prompt: Organization course_fields and Course Extensions

Use this context when implementing the frontend for organization-configurable Course fields and the new Course fields (subject, exam_intake, exam_board).

---

## Overview

**Organization.course_fields** is a string array of Course column names. The frontend uses it to decide which fields to show in Course forms, tables, and detail views. Each organization can have its own subset and order.

**New Course fields** (all optional):

| Field | Type | Description |
|-------|------|--------------|
| `subject` | FK (nullable) | Reference to Subject. Use `expand=subject` to get nested Subject object. |
| `exam_intake` | datetime (nullable) | Exam intake date. Display as month only (e.g. "June 2025"). |
| `exam_board` | enum | `"EdExcel"` or `"CIE"`. |

---

## Base URL & Tenant

- **Base path**: `api/v1/`
- **Tenant header**: Include `X-Tenant` or `Tenant` with the schema name for multi-tenant routing.
- **Auth**: JWT Bearer token (standard `Authorization: Bearer <token>`).

---

## Organization: course_fields

| Endpoint | Method | Description |
|----------|--------|--------------|
| `/organizations` | GET | List organizations |
| `/organizations/<id>` | GET | Get organization details |
| `/organizations/<id>` | PUT/PATCH | Update organization (admin) |

**Field**:

| Field | Type | Description |
|-------|------|-------------|
| `course_fields` | string[] (nullable) | Course field names to show in forms/tables. Order matters. Example: `["title", "code", "subject", "exam_intake", "exam_board"]`. |

**Default**:

- New organizations get `course_fields` = all Course columns except `subject`, `exam_intake`, `exam_board`.
- Existing organizations that had `null` are backfilled with the same default.
- When `course_fields` is set, render only those fields in the specified order.

**Validation**: Backend rejects invalid field names (e.g. typos). Invalid names return `400` with `{"course_fields": "Invalid Course field names: [...]"}`.

---

## Course: New Fields

| Endpoint | Method | Description |
|----------|--------|--------------|
| `/courses` | GET | List courses |
| `/courses/<id>` | GET | Get course details |
| `/courses` | POST | Create course |
| `/courses/<id>` | PUT/PATCH | Update course |

**New fields**:

| Field | Type | Description |
|-------|------|-------------|
| `subject` | number (nullable) | Subject ID. Use `expand=subject` to get `{ id, name, description }`. |
| `exam_intake` | string (ISO 8601) | Stored in UTC. Convert to `Organization.timezone` before truncating to month. |
| `exam_board` | string | `"EdExcel"` or `"CIE"`. |

**Field types for forms**:

- Use `GET /courses?meta=1` to get field metadata (name, type, description). Map `subject` to a dropdown of Subjects, `exam_intake` to a month picker, `exam_board` to a dropdown.

---

## Subject: New Model

| Endpoint | Method | Description |
|----------|--------|--------------|
| `/subjects` | GET | List subjects |
| `/subjects/<id>` | GET | Get subject details |
| `/subjects` | POST | Create subject |
| `/subjects/<id>` | PUT/PATCH | Update subject |
| `/subjects/search` | POST | Search subjects |

**Fields**:

| Field | Type | Description |
|-------|------|-------------|
| `id` | number | Subject ID |
| `name` | string | Unique per tenant |
| `description` | string (nullable) | |

**Subject dropdown**: When `subject` is in `course_fields`, fetch `GET /subjects` and use it for the Course form dropdown.

---

## exam_intake Display

- Backend stores full datetime (UTC).
- Frontend converts to org timezone (`Organization.timezone`) and displays month only (e.g. "June 2025" or "2025-06").
- Use a month picker (not full date) when editing.

---

## Frontend Flow

1. **Resolve tenant**: From `X-Tenant` or login context.
2. **Fetch organization**: `GET /organizations/<id>` to get `course_fields` and `timezone`.
3. **Render Course form/table**: Use `course_fields` for field order and visibility. If `course_fields` is null/empty (edge case), use all Course columns except subject, exam_intake, exam_board.
4. **Subject dropdown**: When `subject` is in `course_fields`, fetch `GET /subjects` for the dropdown.
5. **Field metadata**: `GET /courses?meta=1` for field types (e.g. string, datetime, FK, enum).

---

## Edge Cases

- **Invalid field names in course_fields**: Backend validates on save. If an org already has invalid names (e.g. from before validation), the frontend should ignore unknown fields or show a warning.
- **Schema evolution**: New Course fields added later won't appear in existing orgs' `course_fields`. Frontend can optionally show new fields with a "new" badge or let admins add them.
- **Relation fields**: For `subject`, the API returns `subject` (ID) or `subject: { id, name, description }` when `expand=subject` is used.
