# Student Leave Request — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Subagent model:** Use **`composer-2.5`** for all subagents unless the user specifies another. One fresh subagent per task; review between tasks.
>
> **Design docs (UI tasks):** Web → [`schedjuice-reimagined-fe/DESIGN.md`](../../../schedjuice-reimagined-fe/DESIGN.md) **strictly**. Mobile → [`schedjuice-reimagined-mobile/docs/design-tokens.md`](../../../schedjuice-reimagined-mobile/docs/design-tokens.md) **strictly**.
>
> **Repo policy:** Run `git commit` / `git push` only when the user has authorized commits. Work on the current branch unless the user asks for a feature branch.
>
> **Spec:** [`docs/superpowers/specs/2026-08-21-student-leave-request-design.md`](../specs/2026-08-21-student-leave-request-design.md)

**Goal:** Let students submit whole-day leave requests (single date or range) from mobile; school admins approve/deny on web; approved leave marks the student absent on matching sessions; both sides get push + in-app notifications.

**Architecture:** New `LeaveRequest` model in `app_attendance` with approve/deny helpers (mirror `join_request_approval.py`). Role-aware `leave-requests/` API with student `leave.*` vs admin `leave.view_all` / `leave.manage_all`. Mobile student stack under `app/(protected)/leave-requests/`; FE admin list/detail under `/leave-requests`. Attendance side effect in `apply_approved_leave_to_attendance` + lazy hook in `build_marking_roster`.

**Tech Stack:** Django 4.2 + DRF + tenant schemas (`schedjuice-reimagined-be`); Next.js 15 + TanStack Query (`schedjuice-reimagined-fe`); Expo Router + React Query (`schedjuice-reimagined-mobile`); Juice Box attachments.

## Global Constraints

- **No org feature flag** — always on; RBAC only.
- **Whole-day only** — all enrolled courses per calendar day; no per-class picker in v1.
- **Dates:** `start_date >= today` (tenant TZ); `end_date >= start_date`; single-day when `end_date` omitted → defaults to `start_date`.
- **Overlap:** block if dates intersect existing **pending or approved** request → **409** with `existing_request_id`.
- **Approve:** set `UserEvent.attendance_status = absent` + note `Approved leave #<id>`; **skip** rows already `present` or `late`.
- **Deny:** required `denial_reason`; no attendance changes.
- **Pending only:** student edit/cancel; admin approve/deny.
- **Attachments:** optional; reuse chat/complaint validation (15 MB, allowed types).
- **Notifications:** `LEAVE_SUBMITTED` → `users_with_permission("leave.manage_all")`; `LEAVE_APPROVED` / `LEAVE_DENIED` → student.
- **Backend tests:** `./scripts/run_backend_tests.sh <target> --keepdb --noinput` (never Railway).
- **FE tests:** `pnpm test:unit -- <path>` in `schedjuice-reimagined-fe`.
- **Mobile tests:** `pnpm test -- <path>` in `schedjuice-reimagined-mobile`.
- **Mobile i18n:** add keys to `en.ts`; copy same English into `my.ts`.

---

## File Structure

### Backend (`schedjuice-reimagined-be`)

| Path | Responsibility |
|------|----------------|
| `app_attendance/models.py` | `LeaveRequest` model |
| `app_attendance/migrations/…` | Schema migration |
| `app_attendance/leave_request_validation.py` | Date rules, overlap detection |
| `app_attendance/leave_request_approval.py` | `approve_leave_request`, `deny_leave_request`, `apply_approved_leave_to_attendance`, `maybe_apply_approved_leave_for_user_event` |
| `app_attendance/leave_request_notifications.py` | Push + in-app notification enqueue |
| `app_attendance/leave_request_views.py` | Student + admin API views |
| `app_attendance/leave_request_serializers.py` | Student/admin serializers |
| `app_attendance/urls.py` | Route registration |
| `app_attendance/marking_services.py` | Hook after roster `bulk_create` |
| `app_attendance/tests/test_leave_requests.py` | High-value API + approval tests |
| `app_rbac/catalog.py` + `defaults.py` + migration | `leave.*` permissions |
| `app_utility_notifications/utility_notification_kinds.py` | Three new kinds |
| `app_utility_notifications/utility_notification_helpers.py` | Catalog rows for leave kinds (if needed) |

### Frontend (`schedjuice-reimagined-fe`)

| Path | Responsibility |
|------|----------------|
| `src/sdk/_types/leave-requests.ts` | Wire types |
| `src/sdk/resources/leave-requests.ts` | Search list + detail fetch |
| `src/sdk/hooks/leave-requests.ts` | TanStack Query hooks + approve/deny mutations |
| `src/app/(internal)/leave-requests/page.tsx` | Admin list (pending default) |
| `src/app/(internal)/leave-requests/[id]/page.tsx` | Admin detail + approve/deny |
| `src/components/leave-requests/` | List table, detail panel, deny modal |
| `src/config/nav-routes.tsx` | Academics nav entry |
| `src/config/route-permissions.ts` | `/leave-requests` guard |
| `src/lib/utility-notification-display.ts` | Icons for leave kinds |

### Mobile (`schedjuice-reimagined-mobile`)

| Path | Responsibility |
|------|----------------|
| `types/leave-request.ts` | Status enum + row type |
| `lib/api/leave-requests.ts` | CRUD + approve/deny not used on mobile |
| `lib/hooks/use-leave-requests.ts` | TanStack Query hooks |
| `lib/leave-requests/leave-request-status.ts` | Status → section grouping |
| `app/(protected)/leave-requests/**` | Stack routes |
| `components/leave-requests/**` | List, new, detail screens |
| `lib/rbac/require-permissions.ts` | Route permissions |
| `lib/notifications/leave-request-notification.ts` | Push deep link parser |
| `lib/notifications/use-push-notifications.ts` | Wire handler |
| `app/(protected)/(tabs)/profile/index.tsx` | Replace coming-soon stub |
| `lib/i18n/locales/en.ts`, `my.ts` | Copy keys |

---

### Task 1: `LeaveRequest` model + migration

**Files:**
- Modify: `app_attendance/models.py`
- Create: `app_attendance/migrations/0XXX_leaverequest.py`

**Interfaces:**
- Produces: `LeaveRequest` with `Status` enum (`pending`, `approved`, `denied`, `cancelled`); FKs `student`, `reviewed_by`, `attachment`; fields `start_date`, `end_date`, `reason`, `denial_reason`, `reviewed_at`

- [ ] **Step 1: Add model** (append to `app_attendance/models.py`):

```python
class LeaveRequest(BaseModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        DENIED = "denied", "Denied"
        CANCELLED = "cancelled", "Cancelled"

    student = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="leave_requests"
    )
    start_date = models.DateField()
    end_date = models.DateField()
    reason = models.TextField()
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.PENDING,
    )
    denial_reason = models.TextField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="reviewed_leave_requests",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    attachment = models.ForeignKey(
        "app_attachment.Attachment",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
    )

    class Meta:
        indexes = [
            models.Index(fields=["student", "status"]),
            models.Index(fields=["start_date", "end_date"]),
        ]
        ordering = ("-created_at",)
```

- [ ] **Step 2: Create migration**

```bash
cd schedjuice-reimagined-be
./env/bin/python manage.py makemigrations app_attendance --name leaverequest
./env/bin/python manage.py migrate_schemas --schema=xschedjuice
```

Expected: `app_attendance_leaverequest` table exists in tenant schema.

---

### Task 2: Validation helpers

**Files:**
- Create: `app_attendance/leave_request_validation.py`
- Create: `app_attendance/tests/test_leave_request_validation.py`

**Interfaces:**
- Consumes: `LeaveRequest` model
- Produces:
  - `tenant_today(tenant) -> date`
  - `validate_leave_dates(*, start_date, end_date, tenant) -> None` (raises `ValidationError`)
  - `find_overlapping_leave_request(student, start_date, end_date, *, exclude_id=None) -> LeaveRequest | None`
  - `LeaveOverlapError` exception with `existing_request_id`, `existing_request_status`

- [ ] **Step 1: Write failing tests**

```python
# app_attendance/tests/test_leave_request_validation.py
def test_rejects_start_date_before_today_in_tenant_tz():
    ...

def test_find_overlap_returns_pending_request():
    ...

def test_find_overlap_ignores_cancelled_and_denied():
    ...
```

- [ ] **Step 2: Run tests (expect FAIL)**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_attendance.tests.test_leave_request_validation -v 2 --keepdb --noinput
```

- [ ] **Step 3: Implement `leave_request_validation.py`**

Overlap query:

```python
LeaveRequest.objects.filter(
    student=student,
    status__in=[LeaveRequest.Status.PENDING, LeaveRequest.Status.APPROVED],
    start_date__lte=end_date,
    end_date__gte=start_date,
).exclude(id=exclude_id).first()
```

Use `marking_services._tenant_local_date` pattern for tenant today.

- [ ] **Step 4: Run tests (expect PASS)**

```bash
./scripts/run_backend_tests.sh app_attendance.tests.test_leave_request_validation -v 2 --keepdb --noinput
```

---

### Task 3: RBAC — `leave.*` permissions

**Files:**
- Modify: `app_rbac/catalog.py` (after attendance block)
- Modify: `app_rbac/defaults.py` (`student`, `admin`, `manager` matrices)
- Create: `app_rbac/migrations/0XXX_leave_permissions.py`
- Create: `app_rbac/tests/test_leave_permissions.py`

**Interfaces:**
- Produces: permissions `leave.create`, `leave.view_own`, `leave.update_own`, `leave.view_all`, `leave.manage_all`

- [ ] **Step 1: Add catalog entries**

```python
_p("leave.create", "Submit leave request", "submit a leave request", "Personal"),
_p("leave.view_own", "View own leave requests", "view own leave requests", "Personal"),
_p("leave.update_own", "Edit own leave requests", "edit or cancel own pending leave requests", "Personal"),
_p("leave.view_all", "View all leave requests", "view all student leave requests", "Academic"),
_p("leave.manage_all", "Manage leave requests", "approve or deny student leave requests", "Academic"),
```

- [ ] **Step 2: Update `DEFAULT_MATRIX`**

- `student`: add `leave.create`, `leave.view_own`, `leave.update_own`
- `admin` + `manager`: add `leave.view_all`, `leave.manage_all`
- **Do not** add to `teacher`

- [ ] **Step 3: Migration** (mirror `0025_complaint_permissions.py` — `seed_rbac()` only)

- [ ] **Step 4: Test seeding**

```python
# app_rbac/tests/test_leave_permissions.py
def test_student_role_has_leave_create_view_own_update_own():
    seed_rbac()
    assert {"leave.create", "leave.view_own", "leave.update_own"} <= student_perms

def test_teacher_role_lacks_leave_manage_all():
    ...
```

```bash
./scripts/run_backend_tests.sh app_rbac.tests.test_leave_permissions -v 2 --keepdb --noinput
```

---

### Task 4: Approve/deny helpers + attendance sync

**Files:**
- Create: `app_attendance/leave_request_approval.py`
- Create: `app_attendance/tests/test_leave_request_approval.py`

**Interfaces:**
- Consumes: `leave_request_validation`, `UserEvent`, `Event`, `UserCourse`, `marking_services._tenant_local_date`
- Produces:
  - `approve_leave_request(leave_request, *, actor, tenant) -> LeaveRequest`
  - `deny_leave_request(leave_request, *, actor, denial_reason: str, tenant) -> LeaveRequest`
  - `apply_approved_leave_to_attendance(leave_request, tenant) -> int` (rows updated count)
  - `maybe_apply_approved_leave_for_user_event(user_event, tenant) -> bool`

- [ ] **Step 1: Write failing approval tests**

Cover:
- Marks `unregistered` → `absent` with note
- Skips `present` / `late`
- No-op when student has no sessions that day
- Deny does not touch `UserEvent`

- [ ] **Step 2: Implement approval module**

Key loop in `apply_approved_leave_to_attendance`:

```python
for day in date_range(start_date, end_date):
    events = Event.objects.filter(
        course_id__in=enrolled_course_ids,
        date__date=day,  # use tenant-local date filter via marking helper
    )
    for event in events:
        ue, _ = UserEvent.objects.get_or_create(user_id=student_id, event_id=event.id)
        if ue.attendance_status in (UserEvent.AttendanceStatus.PRESENT, UserEvent.AttendanceStatus.LATE):
            continue
        ue.attendance_status = UserEvent.AttendanceStatus.ABSENT
        ue.attendance_note = f"Approved leave #{leave_request.id}"
        ue.save(update_fields=["attendance_status", "attendance_note"])
```

Use `@transaction.atomic` on approve/deny entry points.

- [ ] **Step 3: Run tests**

```bash
./scripts/run_backend_tests.sh app_attendance.tests.test_leave_request_approval -v 2 --keepdb --noinput
```

---

### Task 5: Notifications

**Files:**
- Modify: `app_utility_notifications/utility_notification_kinds.py`
- Create: `app_attendance/leave_request_notifications.py`
- Modify: `app_utility_notifications/utility_notification_helpers.py` (catalog builders if pattern requires)
- Create: `app_attendance/tests/test_leave_request_notifications.py`

**Interfaces:**
- Produces:
  - `notify_leave_submitted(leave_request, tenant)`
  - `notify_leave_approved(leave_request, tenant)`
  - `notify_leave_denied(leave_request, tenant)`
- Uses: `users_with_permission("leave.manage_all")` from `app_utils.board_observers`
- Push data: `{ "type": "leave_submitted", "leave_request_id": "...", "href": "/leave-requests/<id>" }` (admin web) or `/(protected)/leave-requests/<id>` (student mobile)

- [ ] **Step 1: Add kinds**

```python
LEAVE_SUBMITTED = "leave_submitted"
LEAVE_APPROVED = "leave_approved"
LEAVE_DENIED = "leave_denied"
```

- [ ] **Step 2: Implement notification module** (mirror `app_crm/complaint_notifications.py`)

- [ ] **Step 3: Test admin recipients use RBAC not role heuristics**

```bash
./scripts/run_backend_tests.sh app_attendance.tests.test_leave_request_notifications -v 2 --keepdb --noinput
```

---

### Task 6: Serializers

**Files:**
- Create: `app_attendance/leave_request_serializers.py`

**Interfaces:**
- Produces:
  - `LeaveRequestSerializer` — admin read (expand `student`, `reviewed_by`, `attachment`)
  - `StudentLeaveRequestCreateSerializer` — `start_date`, `end_date?`, `reason`, `attachment_id?`
  - `StudentLeaveRequestUpdateSerializer` — same writable fields; pending only enforced in view
  - `LeaveRequestDenySerializer` — `denial_reason` required

- [ ] **Step 1: Implement serializers**

On create: default `end_date = start_date` when omitted; set `student = request.user`; `status = pending`.

Attachment validation: import and reuse chat attachment validator (same as complaints).

- [ ] **Step 2: Unit-test serializer validation** (empty reason, past date) in `test_leave_requests.py` or dedicated serializer test file.

---

### Task 7: API views + URLs

**Files:**
- Create: `app_attendance/leave_request_views.py`
- Modify: `app_attendance/urls.py`
- Create: `app_attendance/tests/test_leave_requests.py`

**Interfaces:**
- Consumes: serializers, validation, approval helpers, notifications
- Produces REST endpoints per spec Section 1

- [ ] **Step 1: Implement views**

| View | Pattern |
|------|---------|
| `LeaveRequestStudentListCreateView` | GET own rows (`leave.view_own`); POST create (`leave.create`) |
| `LeaveRequestAdminListView` | GET all + filters (`leave.view_all`) |
| `LeaveRequestStudentDetailView` | GET/PATCH own (`leave.view_own` / `leave.update_own`); 404 if not owner |
| `LeaveRequestAdminDetailView` | GET (`leave.view_all`) |
| `LeaveRequestCancelView` | POST (`leave.update_own`); pending only |
| `LeaveRequestApproveView` | POST (`leave.manage_all`) |
| `LeaveRequestDenyView` | POST (`leave.manage_all`) |

Role branching: if user has `leave.view_all`, use admin queryset; elif `leave.view_own`, filter `student=request.user`; else 403.

On create/PATCH overlap → return 409:

```python
return Response(
    {
        "code": "leave_overlap",
        "message": "You already have a leave request for these dates.",
        "existing_request_id": overlap.id,
        "existing_request_status": overlap.status,
    },
    status=409,
)
```

On successful create → `notify_leave_submitted`.

- [ ] **Step 2: Register URLs** in `app_attendance/urls.py`:

```python
path("leave-requests", leave_request_views.LeaveRequestStudentListCreateView.as_view(), ...),
path("leave-requests/admin", leave_request_views.LeaveRequestAdminListView.as_view(), ...),
# OR single list view with role-aware queryset — pick one pattern and stay consistent
path("leave-requests/<int:obj_id>", ...),
path("leave-requests/<int:obj_id>/cancel", ...),
path("leave-requests/<int:obj_id>/approve", ...),
path("leave-requests/<int:obj_id>/deny", ...),
```

Prefer **one list endpoint** `GET leave-requests` with role-aware queryset (simpler for mobile + FE) over separate `/admin` path unless filtering needs differ greatly.

- [ ] **Step 3: High-value API tests**

```bash
./scripts/run_backend_tests.sh app_attendance.tests.test_leave_requests -v 2 --keepdb --noinput
```

Must include:
- Student cannot list others' requests
- Overlap 409 payload shape
- Approve → absent UserEvents
- Deny without reason → 400
- Edit/cancel blocked when not pending
- Teacher without `leave.manage_all` → 403 on approve

---

### Task 8: Marking roster hook (future sessions)

**Files:**
- Modify: `app_attendance/marking_services.py` (`build_marking_roster`)

**Interfaces:**
- Consumes: `maybe_apply_approved_leave_for_user_event`

- [ ] **Step 1: After `bulk_create` missing UserEvents**, iterate new rows and call `maybe_apply_approved_leave_for_user_event(ue, tenant)` when tenant is available in call chain.

- [ ] **Step 2: Test** in `test_leave_request_approval.py` — approved leave for future date; build roster; assert new UserEvent is absent.

```bash
./scripts/run_backend_tests.sh app_attendance.tests.test_leave_request_approval -v 2 --keepdb --noinput
```

---

### Task 9: Mobile — types, API, hooks

**Files:**
- Create: `types/leave-request.ts`
- Create: `lib/api/leave-requests.ts`
- Create: `lib/hooks/use-leave-requests.ts`
- Create: `lib/leave-requests/leave-request-status.ts`

**Interfaces:**
- Produces:
  - `fetchLeaveRequests()`, `fetchLeaveRequest(id)`, `createLeaveRequest(input)`, `updateLeaveRequest(id, input)`, `cancelLeaveRequest(id)`
  - `useLeaveRequests()`, `useLeaveRequest(id)`, `useCreateLeaveRequest()`, `useUpdateLeaveRequest()`, `useCancelLeaveRequest()`
  - `LeaveRequestStatus` enum matching BE
  - `groupLeaveRequestsBySection(requests)` → pending / approved / past

- [ ] **Step 1: Define types**

```typescript
export enum LeaveRequestStatus {
  Pending = 'pending',
  Approved = 'approved',
  Denied = 'denied',
  Cancelled = 'cancelled',
}

export type LeaveRequest = {
  id: number;
  start_date: string;
  end_date: string;
  reason: string;
  status: LeaveRequestStatus;
  denial_reason: string | null;
  reviewed_at: string | null;
  attachment_id: number | null;
  // expanded student/reviewer/attachment as needed
};
```

- [ ] **Step 2: API module** using `axiosClient` + envelope unwrap (mirror `lib/api/issues.ts`).

Handle 409 overlap — export typed error:

```typescript
export type LeaveOverlapError = {
  code: 'leave_overlap';
  existing_request_id: number;
  existing_request_status: string;
};
```

- [ ] **Step 3: React Query hooks** with stable keys `['leave-requests']`, `['leave-requests', id]`.

---

### Task 10: Mobile — RBAC, routes, i18n

**Files:**
- Modify: `lib/rbac/require-permissions.ts`
- Create: `app/(protected)/leave-requests/_layout.tsx`
- Create: `app/(protected)/leave-requests/index.tsx`
- Create: `app/(protected)/leave-requests/new.tsx`
- Create: `app/(protected)/leave-requests/[id].tsx`
- Modify: `lib/i18n/locales/en.ts`, `my.ts`
- Modify: `app/(protected)/(tabs)/profile/index.tsx`

**Design:** Read `docs/design-tokens.md` before building screens.

- [ ] **Step 1: Route permissions**

```typescript
{ prefix: '/leave-requests/new', anyOf: ['leave.create'] },
{ prefix: '/leave-requests', anyOf: ['leave.view_own'] },
```

- [ ] **Step 2: Stack layout** with `PermissionGate` (mirror `complaints/_layout.tsx`).

- [ ] **Step 3: Profile menu** — replace Alert with `router.push('/(protected)/leave-requests')`.

- [ ] **Step 4: i18n keys** under `leaveRequest.*` (list title, new, reason label, date labels, overlap message, cancel confirm, status badges, empty states). Copy English to `my.ts`.

---

### Task 11: Mobile — screens

**Files:**
- Create: `components/leave-requests/leave-list-screen.tsx`
- Create: `components/leave-requests/leave-new-screen.tsx`
- Create: `components/leave-requests/leave-detail-screen.tsx`
- Create: `components/leave-requests/leave-page-header.tsx`

**Design:** `docs/design-tokens.md` — spacing, radii, semantic colors only.

- [ ] **Step 1: List screen**

Sections: Pending, Approved, Past (denied + cancelled). FAB → `/leave-requests/new`.

- [ ] **Step 2: New screen**

- Start date picker (default today)
- Toggle "Multiple days" → end date picker
- Required reason `TextInput` multiline
- Optional attachment strip — reuse `useChatAttachmentComposer` + `uploadChatAttachments` from complaints
- Submit via `useCreateLeaveRequest`
- On 409 → Alert with **Edit existing** → `router.push(/(protected)/leave-requests/${existing_request_id})`

- [ ] **Step 3: Detail screen**

- Pending: editable fields + Save (PATCH) + Cancel request (POST cancel with confirm)
- Approved/denied/cancelled: read-only; show denial reason when denied

---

### Task 12: Mobile — push notifications

**Files:**
- Create: `lib/notifications/leave-request-notification.ts`
- Modify: `lib/notifications/index.ts`
- Modify: `lib/notifications/use-push-notifications.ts`
- Create: `__tests__/lib/notifications/leave-request-notification.test.ts`

- [ ] **Step 1: Parser** (mirror `complaint-notification.ts`)

Kinds: `leave_approved`, `leave_denied` → route `/(protected)/leave-requests/[id]`

- [ ] **Step 2: Wire into push handler** + invalidate `['leave-requests']` queries on open.

- [ ] **Step 3: Test parser** with sample push payloads.

```bash
cd schedjuice-reimagined-mobile
pnpm test -- __tests__/lib/notifications/leave-request-notification.test.ts
```

---

### Task 13: FE — SDK, types, hooks

**Files:**
- Create: `src/sdk/_types/leave-requests.ts`
- Create: `src/sdk/resources/leave-requests.ts`
- Create: `src/sdk/hooks/leave-requests.ts`

**Design:** N/A (data layer only).

- [ ] **Step 1: Types** — snake_case wire fields per `backend-api-snake-case` rule.

- [ ] **Step 2: Resource** using `defineSearchListResource` (mirror `course-join-requests.ts`):

```typescript
export const leaveRequestsSearch = defineSearchListResource<LeaveRequest>({
  path: "leave-requests",
  keyNamespace: "leave-requests",
});
```

- [ ] **Step 3: Hooks**

- `useLeaveRequestsList(filters)` — default `status=pending` for admin home
- `useLeaveRequestDetail(id)`
- `useApproveLeaveRequest()` → `POST leave-requests/:id/approve`
- `useDenyLeaveRequest()` → `POST leave-requests/:id/deny` with `{ denial_reason }`
- Mutations invalidate `leave-requests` list + detail keys

---

### Task 14: FE — nav, RBAC, utility notification display

**Files:**
- Modify: `src/config/nav-routes.tsx`
- Modify: `src/config/route-permissions.ts`
- Modify: `src/lib/utility-notification-display.ts`

**Design:** Read `DESIGN.md` before Task 15 UI.

- [ ] **Step 1: Nav entry** under Academics (near Attendance God View):

```typescript
{
  label: "Leave requests",
  href: "/leave-requests",
  requiredPermissions: ["leave.view_all"],
}
```

- [ ] **Step 2: Route guard** — `/leave-requests` → `anyOf: ['leave.view_all']`

- [ ] **Step 3: Notification icons** for `leave_submitted`, `leave_approved`, `leave_denied`

---

### Task 15: FE — admin list + detail UI

**Files:**
- Create: `src/app/(internal)/leave-requests/page.tsx`
- Create: `src/app/(internal)/leave-requests/[id]/page.tsx`
- Create: `src/components/leave-requests/leave-requests-table.tsx`
- Create: `src/components/leave-requests/leave-request-detail.tsx`
- Create: `src/components/leave-requests/deny-leave-dialog.tsx`

**Design:** Follow `DESIGN.md` strictly — warm cream surfaces, semantic tokens, plain-language copy, no shadcn.

- [ ] **Step 1: List page**

- Tabs or filter chips: Pending (default, badge count), Approved, Denied, Cancelled, All
- Table columns: student, date range, reason (truncated), submitted, status
- Student filter via existing user combobox pattern
- Row click → detail route

- [ ] **Step 2: Detail page**

- Student link to user record
- Date range, full reason, attachment preview (`ChatAttachmentRenderer` or document preview)
- Pending actions:
  - **Approve** — confirm dialog; `isLoading` on button while pending
  - **Deny** — modal with required reason textarea; disable confirm until non-empty
- Decided state: reviewer name, timestamp, denial reason if denied

- [ ] **Step 3: Loading / error states** — Skeleton + `aria-busy` per `async-loading-states` rule.

---

### Task 16: FE tests

**Files:**
- Create: `src/components/leave-requests/deny-leave-dialog.test.tsx` (or colocated vitest)

- [ ] **Step 1: Deny button disabled until reason entered**

```typescript
it("disables confirm until denial reason is non-empty", async () => {
  render(<DenyLeaveDialog open onConfirm={vi.fn()} />);
  expect(screen.getByRole("button", { name: /deny/i })).toBeDisabled();
  await userEvent.type(screen.getByRole("textbox"), "Incomplete documentation");
  expect(screen.getByRole("button", { name: /deny/i })).toBeEnabled();
});
```

- [ ] **Step 2: Nav visibility** — route config test or policy overview test that `leave.view_all` gates nav entry.

```bash
cd schedjuice-reimagined-fe
pnpm test:unit -- src/components/leave-requests/
```

---

### Task 17: Mobile tests

**Files:**
- Create: `__tests__/lib/leave-requests/leave-request-status.test.ts`
- Optional: component test for overlap navigation if high-value

- [ ] **Step 1: Status grouping helper tests**

- [ ] **Step 2: Notification route resolver tests** (if not covered in Task 12)

```bash
cd schedjuice-reimagined-mobile
pnpm test -- __tests__/lib/leave-requests/
```

---

### Task 18: End-to-end smoke (manual)

- [ ] Student on mobile: submit single-day leave with reason + attachment
- [ ] Student: submit overlapping range → see edit-existing prompt
- [ ] Admin on web: see pending request; approve → verify attendance absent on god view / course marking for that date
- [ ] Admin: deny with reason → student receives push; mobile shows denial reason
- [ ] Student: edit pending request; cancel pending request

---

## Self-review (plan ↔ spec)

| Spec requirement | Task |
|------------------|------|
| LeaveRequest model + statuses | Task 1 |
| Date validation (today+) | Task 2 |
| Overlap 409 + existing_request_id | Tasks 2, 7 |
| RBAC leave.* permissions | Task 3 |
| Approve → absent; skip present/late | Task 4 |
| Future session hook | Task 8 |
| Notifications both sides | Task 5 |
| Student mobile submit/edit/cancel | Tasks 9–11 |
| Admin web approve/deny | Tasks 13–15 |
| Required denial reason | Tasks 6, 7, 15, 16 |
| Optional attachment | Tasks 6, 11 |
| No org flag | Global constraints |
| composer-2.5 subagents | Header |
| DESIGN.md / design-tokens.md | Header + Tasks 10, 11, 15 |

No TBDs remain.

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-08-21-student-leave-request.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — dispatch a fresh `composer-2.5` subagent per task, review between tasks, fast iteration. REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**2. Inline Execution** — execute tasks in this session using superpowers:executing-plans, batch execution with checkpoints.

**Which approach?**
