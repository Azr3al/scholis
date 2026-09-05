# HRReportView

**Endpoint**: `POST /reports/hr/<report_type>`  
**Auth**: JWT, permission `analytics.view`  
**Method**: POST

---

## Report Types

| report_type | Body params | Output | Notes |
|-------------|-------------|--------|-------|
| `payroll` | `startDate`, `endDate` (YYYY-MM-DD), `userId` (optional) | Excel (.xlsx) | UserAttendance-based Microsoft Payroll |

Teacher Courses is `GET/POST /reports/teacher-courses` (not this HR endpoint).

---

## payroll

- **Params**: `startDate`, `endDate` (required, YYYY-MM-DD), `userId` (optional)
- **Returns**: Excel download
- **Columns**: User, Total Sessions, Total Hours, Earnings (one row per user)
- **Source**: UserAttendance (join_datetime between startDate and endDate)
- **Validation**: startDate ≤ endDate; dates must parse as YYYY-MM-DD

---

## Error Responses

- `400`: Invalid report_type, missing params, invalid date format, or startDate > endDate
- Response shape: `{"message": "..."}` or `{"details": "..."}`
