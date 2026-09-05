# Frontend Prompt: Course-Specific Hourly Rates

Use this context when implementing the frontend for course-specific teacher pay rates (differential pay).

---

## Overview

Some organizations pay teachers different hourly rates per course. When enabled, a teacher's rate for a specific course can override their default `User.per_hour_rate`.

**Feature flag**: `Organization.supports_course_specific_rates` (boolean, default `false`)

- **`false`**: Always use `User.per_hour_rate`. Ignore any `UserCourse.hourly_rate` values.
- **`true`**: Use `UserCourse.hourly_rate` when set for a teacher-course pair; otherwise fall back to `User.per_hour_rate`.

**Auto-population from category rates**: `User.course_rates` is a JSON object `{ category_id: rate }`. When a UserCourse is **created** for a teacher, if the course's `category_id` exists in the user's `course_rates`, `UserCourse.hourly_rate` is automatically set to that value. This allows admins to define rates per category on the user, and have them applied when assigning teachers to courses.

---

## Base URL & Tenant

- **Base path**: `api/v1/`
- **Tenant header**: Include `X-Tenant` or `Tenant` with the schema name for multi-tenant routing.
- **Auth**: JWT Bearer token (standard `Authorization: Bearer <token>`).

---

## User: Category-Based Rates

| Endpoint | Method | Description |
|----------|--------|--------------|
| `/users` | GET | List users |
| `/users/<id>` | GET | Get user details |
| `/users/<id>` | PUT/PATCH | Update user |

**New field**:

| Field | Type | Description |
|-------|------|-------------|
| `course_rates` | object (nullable) | `{ category_id: rate }`. Keys are category IDs (strings in JSON). Values are hourly rates (number or string). Used to auto-set `UserCourse.hourly_rate` when a teacher is assigned to a course whose category exists in this map. |

**Example**:
```json
{
  "course_rates": {
    "1": "1500.00",
    "2": 1800
  }
}
```

When a teacher (user 7) with `course_rates: {"1": "1500.00"}` is assigned to a course in category 1, `UserCourse.hourly_rate` is automatically set to `1500.00`.

---

## Organization: Feature Flag

| Endpoint | Method | Description |
|----------|--------|--------------|
| `/organizations` | GET | List organizations |
| `/organizations/<id>` | GET | Get organization details |
| `/organizations/<id>` | PUT/PATCH | Update organization (admin) |

**New field**:

| Field | Type | Description |
|-------|------|-------------|
| `supports_course_specific_rates` | boolean | When `true`, course-specific rates are used for payroll. Default `false`. |

**Frontend behavior**:
- Fetch organization (e.g. from tenant context or `GET /organizations/<id>`) to read `supports_course_specific_rates`.
- Only show the **course-specific hourly rate** UI when `supports_course_specific_rates === true`.
- When `false`, hide or disable the `hourly_rate` field on UserCourse forms; the user's default rate applies to all courses.

---

## UserCourse: Course-Specific Rate

| Endpoint | Method | Description |
|----------|--------|--------------|
| `/user-courses` | GET | List user-course assignments |
| `/user-courses/<id>` | GET | Get one user-course by ID |
| `/user-courses/<id>` | PUT/PATCH | Update user-course |
| `/user-courses/search` | POST | Search with filters |
| `/user-courses/management` | POST | Bulk create/update/delete |

**New field** (only meaningful when `Organization.supports_course_specific_rates` is true):

| Field | Type | Description |
|-------|------|-------------|
| `hourly_rate` | decimal (nullable) | Course-specific hourly rate for this teacher. Overrides `User.per_hour_rate` when set. |

**Existing UserCourse fields** (relevant): `user`, `course`, `assigned_as`, `assigned_as_role`, `is_dropped_out`, `dropped_out_date`, `is_fully_paid`, `created_at`, `updated_at`.

---

## UI Flow

### 1. Check if feature is enabled

```
GET /api/v1/organizations/<org_id>
```

Read `supports_course_specific_rates`. If `false`, do not show course-specific rate UI.

### 2. Define category rates on User (optional)

On the User form, when `supports_course_specific_rates === true`, allow editing `course_rates` as a map of category ID → rate. Example UI: for each category, an optional rate input. Stored as `{"1": "1500.00", "2": "1800.00"}`.

### 3. Teacher assignment to course

When assigning a teacher to a course (create UserCourse with `assigned_as: "teacher"`):

- **Auto-population**: If the user has `course_rates` and the course's category exists in it, `UserCourse.hourly_rate` is auto-set. No need to send it.
- If `supports_course_specific_rates === true`: Show an optional `hourly_rate` input to override the auto value.
- If `supports_course_specific_rates === false`: Omit `hourly_rate`; backend uses `User.per_hour_rate`.

### 4. Displaying rates

- **User list/detail**: Show `per_hour_rate` as the default rate.
- **UserCourse list/detail** (teacher assignments): When `supports_course_specific_rates` is true, show `hourly_rate` if set, otherwise show "Uses default" or the user's `per_hour_rate`.
- **Payroll / earnings**: The effective rate is computed at check-in/attendance creation time and stored in `hourly_rate_at_calculation` (UserEvent) or `hourly_rate_at_creation` (UserAttendance). Display those snapshot values for historical accuracy.

---

## Example: Update teacher's course-specific rate

**Request** (when `supports_course_specific_rates` is true):

```
PATCH /api/v1/user-courses/42
Content-Type: application/json

{
  "hourly_rate": "1500.00"
}
```

**Response** (excerpt):

```json
{
  "isError": false,
  "message": "success",
  "data": {
    "id": 42,
    "user": 7,
    "course": 12,
    "assigned_as": "teacher",
    "hourly_rate": "1500.00",
    ...
  }
}
```

---

## Example: Create teacher assignment (with auto rate from course_rates)

**Request** (when `supports_course_specific_rates` is true):

```
POST /api/v1/user-courses/management
Content-Type: application/json

[
  {
    "user": 7,
    "course": 12,
    "assigned_as": "teacher",
    "assigned_as_role": 1
  }
]
```

If user 7 has `course_rates: {"3": "1800.00"}` and course 12 has `category_id: 3`, then `UserCourse.hourly_rate` is automatically set to `1800.00`. You can omit `hourly_rate` or send it to override.

The management endpoint expects an array of objects. For updating `hourly_rate` on existing assignments, use `PATCH /user-courses/<id>`.

---

## Rate Resolution Logic (Backend)

For reference; the frontend does not compute this—it is done at check-in and attendance creation:

| Condition | Effective rate |
|-----------|----------------|
| `supports_course_specific_rates === false` | Always `User.per_hour_rate` |
| `supports_course_specific_rates === true` and `UserCourse.hourly_rate` set | `UserCourse.hourly_rate` |
| `supports_course_specific_rates === true` and `UserCourse.hourly_rate` null | `User.per_hour_rate` |

---

## Related Resources

- **User**: `per_hour_rate` (default rate), `course_rates` (category → rate map), `student_bonus_hourly_rate`
- **UserAttendance**: `hourly_rate_at_creation` (snapshot at creation)
- **UserEvent**: `hourly_rate_at_calculation` (snapshot at check-in)
- ** docs/USER_ATTENDANCE_FLOW.md** – Backend flow for attendance and rate snapshots
