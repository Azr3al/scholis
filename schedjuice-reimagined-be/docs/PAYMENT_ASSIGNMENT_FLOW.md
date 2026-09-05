# Payment Assignment Flow

Microsoft Teams Education assignments for monthly payment screenshot uploads. Students submit proof-of-payment screenshots to these assignments.

---

## Model: PaymentAssignment


| Field                      | Type        | Notes                                     |
| -------------------------- | ----------- | ----------------------------------------- |
| `course`                   | FK → Course | Must have `microsoft_group_id`            |
| `year`                     | int         | Calendar year, e.g. 2025                  |
| `month_index`              | int         | Calendar month: 1=Jan, 2=Feb, ..., 12=Dec |
| `microsoft_assignment_id`  | str         | MS Graph educationAssignment id           |
| `created_at`, `updated_at` | DateTime    | BaseModel                                 |


**Unique**: `(course, year, month_index)`

**Category eligibility**: Only courses whose `category.is_payment_assignment_eligible` is True are eligible for payment assignment creation.

---

## Currently-Ongoing Classes Only

Assignments are created only for **currently-ongoing** classes. A course is considered ongoing when:

- `course.start_date <= today` (course has started)
- `course.end_date >= today` (course has not ended)

This applies to all flows that create payment assignments (Flow 1, Flow 2, Flow 3).

---

## Month Type (FM / HM)

Derived from `course.start_date.day`:

- **FM (full-month)**: `day <= 13` → billing per calendar month
- **HM (half-month)**: `day > 13` → billing periods span two months (e.g. Jan 14–Feb 13)

**Assignment naming**:

- FM: `"January 2025 payment"`
- HM: `"Jan - Feb 2025 payment"` (first month is payment month, range shows billing period)

**Due date**:

- FM payments are due **2 days after the payment month starts** (anchor = 1st of the month).  
Example: March 2025 payment → due on March 3, 2025.
- HM payments are due **2 days after the course's start_date.day within the payment month**.  
Example: course start_date = 16 → February 2025 payment due on February 18, 2025.

---

## Creation window (calendar schedule + catch-up)

`ensure-payment-assignments` and `create-payment-assignments` use the **same** org-local calendar windows (catch-up through the last day of the payment month if cron was missed). **Due dates** are unchanged: still 2 days after the billing anchor (1st for FM, `start_date.day` for HM).

- **FM**: First eligible day is the **20th of the month before** the payment month; last day is the last day of the payment month.  
  Example: March 2025 payment → create between **20 Feb 2025** and **31 Mar 2025** (inclusive).
- **HM**: First eligible day is the **9th of the payment month** (first month of the Mar–Apr-style label); last day is the last day of that month.  
  Example: March–April 2025 payment (`month_index` = March) → create between **9 Mar 2025** and **31 Mar 2025** (inclusive).

Constants: `FM_PAYMENT_ASSIGNMENT_CREATION_DAY`, `HM_PAYMENT_ASSIGNMENT_CREATION_DAY` in `app_microsoft/payment_assignment_helpers.py`.

---

## First-Month Skip Rule

**No assignment for the first month of the course.** Students have paid elsewhere for that month.

**Example**: Course `start_date` = 1.2.2026 (February 1, 2026)

- No assignment for February 2026 (first month)
- For March 2026 (FM), the daily ensure job creates once org-local date is **20 Feb 2026** or later through **31 Mar 2026**

**Applied in**: Flow 1 (Course Creation), Flow 2 (Command), Flow 3 (Monthly Cron).

---

## Flow 1: Course Creation

**When**: Course created via `CourseListView` POST (CourseSerializer.create).

**Path**: `app_course/serializers.py` → `CourseSerializer.create()` → `CreateTeamFlow.schedule_payment_assignment()` → async `create_payment_assignment_for_course_async()`

**Conditions**:

- `tenant.is_microsoft_on`
- `course.microsoft_group_id` (set by CreateTeamFlow)
- `course.is_payment_enabled` (default True)
- `course.category.is_payment_assignment_eligible` (default True)
- **Course is currently ongoing**: `start_date <= today <= end_date`
- Current month is within course span (`end_date >= today`)
- **Current month is NOT the first month** of the course (see First-Month Skip Rule)

**Actions**:

1. `month_index` = calendar month (1=Jan, 2=Feb, etc.).
2. Create MS Education assignment: FM `"January 2025 payment"`, HM `"Jan - Feb 2025 payment"`.
3. Publish assignment so students can submit.
4. Create `PaymentAssignment` record.

Assignments are created with `addedStudentAction: assignIfOpen` so students who join the class after publish receive open assignments.

**Graph**: `app_microsoft/graph_wrapper/education.py` (MSEducation, app-only client credentials).

---

## Flow 2: Programmatic Creation (Django Command)

**When**: Manual or scripted.

**Command**: `python manage.py create-payment-assignments`

**Options**:

- (none): Create for current month, all eligible courses
- `--course_id 123`: Create for course 123 only
- `--month 2 --year 2025`: Target February 2025
- `--schema tenant_schema`: Process single tenant

**Path**: `app_tasks/management/commands/create-payment-assignments.py`

**Note**: Only processes **currently-ongoing** courses (`start_date <= today <= end_date`). Respects First-Month Skip Rule—does not create assignments for the first month of any course. Only runs creation when org-local **today** falls in the FM/HM catch-up window for the target month (same as Flow 3).

---

## Flow 3: Daily Cron (Ensure Assignments)

**When**: Daily at 00:05 UTC (cron: `5 0 * * `*).

**Command**: `python manage.py ensure-payment-assignments`

**Path**: `app_tasks/management/commands/ensure-payment-assignments.py`

**Logic**:

1. **Today** = org-local calendar date (`Organization.timezone`).
2. **Months to ensure**: same two candidates as before—the payment month that contains `today`, and the following calendar month—if `today` lies in that month’s FM or HM catch-up window (20th of prior month through month-end for FM; 9th through month-end for HM).
3. For each org with `is_microsoft_on`:
4. For each **currently-ongoing** course (`start_date <= today <= end_date`) with `microsoft_group_id`, `is_payment_enabled`, `category.is_payment_assignment_eligible`:
5. For each `(year, month_index)` in months to ensure: skip if `course.end_date` is before that month’s first day; skip first month of course; skip if row exists.
6. If no `PaymentAssignment` for `(course, year, month_index)`, create one (FM or HM naming). Same prechecks as `create_payment_assignment_for_course_month`.

---

## month_index

Calendar month number: Jan = 1, Feb = 2, ..., Dec = 12. For HM, this is the first month of the billing period.

---

## Key Files


| File                                                                      | Purpose                                                                                                                           |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `app_course/models.py`                                                    | PaymentAssignment model                                                                                                           |
| `app_course/serializers.py`                                               | CourseSerializer.create() → CreateTeamFlow.schedule_payment_assignment()                                                          |
| `app_microsoft/flows.py`                                                  | CreateTeamFlow.schedule_payment_assignment() → async_task                                                                         |
| `app_microsoft/payment_assignment_helpers.py`                             | is_hm_course, get_assignment_display_name, create_payment_assignment_for_course_month, create_payment_assignment_for_course_async |
| `app_microsoft/graph_wrapper/education.py`                                | MSEducation (create_assignment, publish_assignment, delete_assignment)                                                            |
| `app_microsoft/graph_wrapper/base.py`                                     | EduAssignments.ReadWriteBasic scope                                                                                               |
| `app_tasks/management/commands/create-payment-assignments.py`             | Programmatic creation                                                                                                             |
| `app_tasks/management/commands/ensure-payment-assignments.py`             | Daily cron                                                                                                                        |
| `app_tasks/management/commands/update-payment-assignments.py`             | Update display names and due dates on existing assignments                                                                        |
| `app_tasks/management/commands/delete-payment-assignments.py`             | Delete assignments (targetable by course_id, month, year)                                                                         |
| `app_tasks/management/commands/cleanup-duplicate-payment-assignments.py`  | Delete orphaned duplicate Teams assignments (DB rows kept)                                                                        |
| `app_tasks/management/commands/cleanup-ineligible-payment-assignments.py` | Delete assignments for ineligible categories                                                                                      |
| `app_tasks/management/commands/sync-payment-submissions.py`               | Daily cron: sync submissions → UserPayment                                                                                        |
| `app_tasks/apps.py`                                                       | Cron schedules                                                                                                                    |


---

## Flow 3a: Update Existing Payment Assignments

**When**: Manual (e.g. after changing HM/FM rules or due date logic).

**Command**: `python manage.py update-payment-assignments`

**Options**:

- `--schema tenant_schema`: Process single tenant
- `--course_id 123`: Process single course
- `--month 2 --year 2025`: Target a specific month (default: current month)
- `--all`: Process all months that have assignments
- `--dry-run`: List assignments that would be updated without making changes

**Path**: `app_tasks/management/commands/update-payment-assignments.py`

**Logic**:

1. For each PaymentAssignment in scope, recompute display name (via `get_assignment_display_name`) and due date (via `get_due_date_for_month`).
2. PATCH the MS Teams assignment with the new `displayName` and `dueDateTime`.

Use this to backfill changes when the HM/FM threshold or due date rules are updated.

---

## Flow 3a2: Delete Payment Assignments

**When**: Manual (e.g. to remove a specific assignment or all assignments for a course/month).

**Command**: `python manage.py delete-payment-assignments`

**Options**:

- `--schema tenant_schema`: Process single tenant
- `--course_id 123`: Target a specific course only
- `--month 2 --year 2025`: Target a specific month (Feb 2025). Month 1–12.
- `--dry-run`: List assignments that would be deleted without making changes
- `--sync`: Run deletions synchronously (no async queue)

**Path**: `app_tasks/management/commands/delete-payment-assignments.py`

**Logic**:

1. Find PaymentAssignments matching the filters (course_id, month, year).
2. For each: queue async task (or run sync with `--sync`) to delete from MS Teams (Graph API), then delete local record.
3. If MS delete returns 404 (already gone), still delete local record.

**Examples**:

- `--course_id 123 --month 2 --year 2025` → delete Feb 2025 assignment for course 123
- `--course_id 123` → delete all assignments for course 123
- `--month 2 --year 2025` → delete all Feb 2025 assignments (all courses)

---

## Flow 3a3: Cleanup Duplicate Payment Assignments

**When**: Manual (e.g. after async manual triggers created duplicate Teams assignments).

**Command**: `python manage.py cleanup-duplicate-payment-assignments`

**Options**:

- `--schema tenant_schema`: Process single tenant
- `--course_id 123`: Limit to one course
- `--month 9 --year 2026`: Limit to one payment month
- `--dry-run`: List duplicate orphans without deleting (always sync)
- `--sync`: Run inline instead of queuing one django-q task per course

**Path**: `app_tasks/management/commands/cleanup-duplicate-payment-assignments.py`

**Logic**:

1. For each eligible course (those with `PaymentAssignment` rows matching filters), call Graph `list_assignments` once.
2. Group payment-like assignments by normalized display name (case-insensitive).
3. Keep the assignment whose id matches `PaymentAssignment.microsoft_assignment_id`; delete other orphans from Teams only.
4. `--dry-run` always runs sync and prints the report. Default delete mode queues async per course.

**Examples**:

- `--schema xteachersu --dry-run` → preview all duplicates in tenant
- `--schema xteachersu` → queue cleanup for all courses with payment assignment rows
- `--schema xteachersu --course_id 123 --sync` → dedupe one class inline

---

## Flow 3b: Cleanup Ineligible Payment Assignments

**When**: Manual (e.g. after setting `category.is_payment_assignment_eligible=False`).

**Command**: `python manage.py cleanup-ineligible-payment-assignments`

**Options**:

- `--schema tenant_schema`: Process single tenant
- `--dry-run`: List ineligible assignments without deleting

**Path**: `app_tasks/management/commands/cleanup-ineligible-payment-assignments.py`

**Logic**:

1. Find PaymentAssignments where `course.category.is_payment_assignment_eligible=False`.
2. For each: delete from MS Teams (Graph API), then delete local record.
3. If MS delete returns 404 (already gone), still delete local record.

---

## Flow 4: Sync Submissions to UserPayment (Daily Cron)

**When**: Daily at 1 AM UTC (cron: `0 1 * * `*).

**Command**: `python manage.py sync-payment-submissions`

**Path**: `app_tasks/management/commands/sync-payment-submissions.py`

**Graph auth**: App-only client credentials (`MSEducation(tenant)`), same pattern as `MSGroup` / Teams creation. Requires Azure application permissions `EduAssignments.ReadWrite.All` and `Files.Read.All`. Does not require the org OAuth service account.

**Logic**:

1. For each org with `is_microsoft_on`:
2. For each eligible `PaymentAssignment` — last **3 org-local calendar months** (current month + 2 prior), on courses with `is_payment_enabled=True`, non-empty `microsoft_group_id`, `start_date < today`, and `end_date >= today - 10 days`:
3. List submissions with `status=submitted`:
4. For each submission not in UserPayment (by `microsoft_submission_id`):
  - Find User by `recipient.userId` (microsoft_id)
  - Get course from PaymentAssignment
  - Download first file from submittedResources (educationFileResource) as screenshot
  - Create UserPayment with user, course, microsoft_submission_id, screenshot, status=AWAITING_EXTRACTION
  - Trigger OCR extraction (async)

**UserPayment**: New field `microsoft_submission_id` (unique, nullable) links to MS submission.

---

## Azure / MS Graph

- **Permissions** (application, admin consent): `EduAssignments.ReadWrite.All`, `Files.Read.All`
  - `Files.Read.All` required for downloading submission file content from SharePoint
- **API**: `POST /education/classes/{id}/assignments` (create), `POST .../assignments/{id}/publish` (publish)
- **Auth**: App-only client credentials (`MSEducation`), same as Teams group creation

