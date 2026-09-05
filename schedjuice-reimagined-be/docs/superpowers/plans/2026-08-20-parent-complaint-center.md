# Parent Complaint Center — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Repo policy:** Run `git commit` / `git push` only when the user has authorized commits. Work on the current branch unless the user asks for a feature branch.
> **Spec:** [`docs/superpowers/specs/2026-08-20-parent-complaint-center-design.md`](../specs/2026-08-20-parent-complaint-center-design.md)

**Goal:** Let students file parent complaints (with attachments) into CRM Issues via chat-style UI on mobile and web; admins manage them on the existing Issues board with source filtering and notifications.

**Architecture:** Extend `Issue` with `source` and `IssueComment` with `attachments`. Reuse `issues/` endpoints with role-aware queryset and payload branches (students get `complaint.*` RBAC, not `issue.*`). Student UI maps issue timeline → chat bubbles; no `ChatThread`. Notifications via new `UtilityNotificationKind` rows + immediate push.

**Tech Stack:** Django 4.2 + DRF + tenant schemas (`schedjuice-reimagined-be`); Next.js 15 + TanStack Query (`schedjuice-reimagined-fe`); Expo Router + React Query (`schedjuice-reimagined-mobile`); Juice Box attachments (same contract as chat).

## Global Constraints

- Org gate: **`is_crm_enabled`** only — no separate complaint org flag.
- Student actor files on behalf of parents; **`related_student`** = filing student; **`source`** = `PARENT_COMPLAINT` (server-set).
- Attachments: reuse **`validate_chat_attachment_refs`**; at least one of non-empty **`body`** or non-empty **`attachments`** on student create/comment.
- Resolved complaints (status behavior `DONE` / `CANCELLED`): read-only for students; **reopen** only transition allowed (`POST issues/:id/move` → Open).
- Notifications: **`COMPLAINT_NEW`** → admins/managers (`user_can_access_admin_shortcuts`); **`COMPLAINT_ASSIGNED`** → assignee; **`COMPLAINT_REOPENED`** → assignee or admins; **`COMPLAINT_REPLY`** → `related_student`.
- Mobile i18n: add keys to `en.ts` and copy same English into `my.ts`.
- Backend tests: always `./scripts/run_backend_tests.sh <target> --keepdb --noinput` (never Railway).

---

## File Structure

### Backend (`schedjuice-reimagined-be`)

| Path | Responsibility |
|------|----------------|
| `app_crm/models.py` | `IssueSource`, `Issue.source`, `IssueComment.attachments` |
| `app_crm/migrations/…` | Schema migration |
| `app_crm/complaint_helpers.py` | Student create, body/attachment validation, auto title, timeline filter |
| `app_crm/views.py` | Role branches on list/create/detail/timeline/comment/move |
| `app_crm/serializers.py` | Expose `source`, `attachments`; student create serializer |
| `app_crm/tests/test_complaint_views.py` | High-value complaint API tests |
| `app_rbac/catalog.py` + `defaults.py` + migration | `complaint.*` permissions for student role |
| `app_utility_notifications/utility_notification_kinds.py` | Four new kinds |
| `app_utility_notifications/complaint_notifications.py` | Push + catalog row builders |
| `app_utility_notifications/utility_notification_helpers.py` | Wire student complaint rows (if needed) |

### Frontend (`schedjuice-reimagined-fe`)

| Path | Responsibility |
|------|----------------|
| `src/types/issue.ts` | `IssueSource`, `attachments` on comments |
| `src/lib/issues-api.ts` | Student create/comment payloads; `source` query param |
| `src/lib/complaints/complaint-timeline.ts` | Map timeline → bubble props |
| `src/components/complaints/complaint-conversation.tsx` | Shared thread UI |
| `src/components/complaints/complaint-list.tsx` | Active / Past sections |
| `src/app/(internal)/complaints/**` | List, new, `[id]` routes |
| `src/components/issues/issues-view.tsx` | Source filter + badge |
| `src/components/issues/issue-detail-drawer.tsx` | Render comment attachments |
| `src/config/nav-routes.tsx` | Student nav item |
| `src/config/route-permissions.ts` + `middleware.ts` | `/complaints` guard |
| `src/lib/utility-notification-display.ts` | Icons for complaint kinds |

### Mobile (`schedjuice-reimagined-mobile`)

| Path | Responsibility |
|------|----------------|
| `lib/api/issues.ts` | Student issue/comment API |
| `lib/complaints/complaint-timeline.ts` | Timeline → bubbles (mirror FE) |
| `components/complaints/**` | List, conversation, composer wiring |
| `app/(protected)/complaints/**` | Routes |
| `lib/navigation/sidebar-nav-config.ts` | Nav item |
| `lib/i18n/locales/en.ts`, `my.ts` | Copy keys |

---

### Task 1: CRM models — `Issue.source` + `IssueComment.attachments`

**Files:**
- Modify: `app_crm/models.py`
- Create: `app_crm/migrations/0XXX_issue_source_and_comment_attachments.py`

**Interfaces:**
- Produces: `Issue.Source` enum (`INTERNAL`, `PARENT_COMPLAINT`); `Issue.source` CharField default `INTERNAL`; `IssueComment.attachments` JSONField default `[]`

- [ ] **Step 1: Add model fields**

In `app_crm/models.py`, on `Issue`:

```python
class IssueSource(models.TextChoices):
    INTERNAL = "INTERNAL", "Internal"
    PARENT_COMPLAINT = "PARENT_COMPLAINT", "Parent complaint"
```

Add to `Issue`:

```python
source = models.CharField(
    max_length=32,
    choices=IssueSource.choices,
    default=IssueSource.INTERNAL,
)
```

Add to `IssueComment`:

```python
attachments = models.JSONField(default=list, blank=True)
```

- [ ] **Step 2: Create and apply migration**

```bash
cd schedjuice-reimagined-be
./env/bin/python manage.py makemigrations app_crm --name issue_source_and_comment_attachments
./scripts/run_backend_tests.sh app_crm.tests.test_issue_views -v 2 --keepdb --noinput
```

Expected: existing issue tests still pass; new columns exist with defaults.

---

### Task 2: RBAC — `complaint.*` permissions

**Files:**
- Modify: `app_rbac/catalog.py`
- Modify: `app_rbac/defaults.py`
- Create: `app_rbac/migrations/0XXX_complaint_permissions.py` (via `makemigrations`)

**Interfaces:**
- Produces: permission codes `complaint.create`, `complaint.view_own`, `complaint.comment`, `complaint.reopen` granted to **student** role only

- [ ] **Step 1: Register permissions in catalog**

In `app_rbac/catalog.py` near other `issue.*` entries:

```python
_p("complaint.create", "File parent complaint", "file a parent complaint", "Personal"),
_p("complaint.view_own", "View own complaints", "view own parent complaints", "Personal"),
_p("complaint.comment", "Comment on own complaint", "reply on own open parent complaint", "Personal"),
_p("complaint.reopen", "Reopen own complaint", "reopen a closed parent complaint", "Personal"),
```

- [ ] **Step 2: Grant to student role in `defaults.py`**

Add the four codes to the student role permission list. **Do not** add any `issue.*` to student.

- [ ] **Step 3: Migrate and smoke-test seed**

```bash
./env/bin/python manage.py makemigrations app_rbac --name complaint_permissions
./scripts/run_backend_tests.sh app_rbac.tests -v 2 --keepdb --noinput
```

---

### Task 3: Complaint helpers (TDD)

**Files:**
- Create: `app_crm/complaint_helpers.py`
- Create: `app_crm/tests/test_complaint_helpers.py`

**Interfaces:**
- Produces:
  - `def validate_complaint_message_body(*, body: str, attachments: list) -> str` — returns normalized body; raises `ValidationError` if both empty
  - `def build_parent_complaint_title(student: User) -> str`
  - `def description_from_complaint_body(body: str, attachments: list) -> str`
  - `def student_safe_timeline_items(events, comments) -> list[dict]`
  - `def is_complaint_student_actor(user) -> bool` — has any `complaint.*` and not `issue.view`
  - `def crm_enabled_or_404(tenant) -> None` — raises Http404 if not `is_crm_enabled`

- [ ] **Step 1: Write failing unit tests**

```python
# app_crm/tests/test_complaint_helpers.py
from django.core.exceptions import ValidationError
from django.test import SimpleTestCase

from app_crm.complaint_helpers import (
    build_parent_complaint_title,
    description_from_complaint_body,
    validate_complaint_message_body,
)


class ComplaintMessageValidationTests(SimpleTestCase):
    def test_rejects_empty_body_and_attachments(self):
        with self.assertRaises(ValidationError):
            validate_complaint_message_body(body="", attachments=[])

    def test_allows_attachments_only(self):
        body = validate_complaint_message_body(body="", attachments=[{"attachment_id": 1}])
        self.assertEqual(body, "")

    def test_title_includes_student_name(self):
        class Stub:
            name = "Aung Min"
        self.assertEqual(build_parent_complaint_title(Stub()), "Parent complaint — Aung Min")

    def test_description_fallback_for_attachment_only(self):
        text = description_from_complaint_body("", [{"attachment_id": 1}])
        self.assertEqual(text, "Sent an attachment.")
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
./scripts/run_backend_tests.sh app_crm.tests.test_complaint_helpers -v 2 --keepdb --noinput
```

- [ ] **Step 3: Implement `complaint_helpers.py`**

Use `validate_chat_attachment_refs` from `app_chat.services` when attachments non-empty.

- [ ] **Step 4: Run tests — expect PASS**

---

### Task 4: Role-aware Issues API

**Files:**
- Modify: `app_crm/serializers.py`
- Modify: `app_crm/views.py`
- Create: `app_crm/tests/test_complaint_views.py`

**Interfaces:**
- Consumes: Task 1 models, Task 2 permissions, Task 3 helpers
- Produces: Student `POST issues` with `{body?, attachments?}`; scoped `GET issues`; student-safe timeline; reopen-only move

- [ ] **Step 1: Write failing API tests**

Create `app_crm/tests/test_complaint_views.py` extending patterns from `test_issue_views.py`:

```python
def test_student_create_parent_complaint_sets_source_and_related_student(self):
    # student with complaint.create posts {body: "Bus late"}
    # assert 201, issue.source == PARENT_COMPLAINT, related_student == student

def test_student_list_only_own_complaints(self):
    # two students, each creates one; student A list returns 1

def test_student_cannot_view_other_students_complaint(self):
    # GET issues/{other_id} -> 404

def test_student_comment_blocked_when_done(self):
    # move to Done, POST comment -> 403

def test_student_reopen_moves_to_open(self):
    # Done -> POST move {status: open_id} -> 200

def test_staff_filter_by_source(self):
    # admin GET issues?source=PARENT_COMPLAINT

def test_create_with_attachments_only(self):
    # valid attachment fixture -> 201, comment.attachments non-empty

def test_crm_disabled_returns_404(self):
    # org.is_crm_enabled=False -> student POST 404
```

- [ ] **Step 2: Run — expect FAIL**

```bash
./scripts/run_backend_tests.sh app_crm.tests.test_complaint_views -v 2 --keepdb --noinput
```

- [ ] **Step 3: Implement view branches**

Key changes in `app_crm/views.py`:

**`IssueListView`**
- Override `get_queryset()`:
  - Student (`complaint.view_own` without `issue.view`): filter `source=PARENT_COMPLAINT`, `related_student=actor`
  - Staff: all issues; if `request.query_params.get("source")` in `INTERNAL|PARENT_COMPLAINT`, filter
- Check `request.tenant.is_crm_enabled` for student paths → 404
- Override `post()`:
  - If student: use `StudentCreateComplaintSerializer` — validate body/attachments, create issue + first comment, notify (Task 5)
  - Else: existing staff create

**`IssueDetailView`**
- Object check: student may only access own `PARENT_COMPLAINT`

**`IssueCommentListView.post`**
- If student: validate open status (not DONE/CANCELLED), validate body/attachments, save `attachments` on comment
- If staff commenting on `PARENT_COMPLAINT`: trigger `COMPLAINT_REPLY` (Task 5)

**`IssueTimelineView.get`**
- If student: return `student_safe_timeline_items(...)`

**`IssueMoveView.post`**
- If student: only allow transition from DONE/CANCELLED → Open; else 403

**Serializers**
- Add `source` to `IssueSerializer` fields (read-only on input for students)
- Add `attachments` to `IssueCommentSerializer`
- New `StudentCreateComplaintSerializer` with `body`, `attachments` only

- [ ] **Step 4: Run full CRM tests**

```bash
./scripts/run_backend_tests.sh app_crm.tests -v 2 --keepdb --noinput
```

---

### Task 5: Complaint notifications

**Files:**
- Modify: `app_utility_notifications/utility_notification_kinds.py`
- Create: `app_crm/complaint_notifications.py`
- Modify: `app_crm/views.py` (call notify hooks)
- Modify: `app_crm/serializers.py` (assignee change on `PARENT_COMPLAINT`)

**Interfaces:**
- Produces:
  - `notify_complaint_created(issue, tenant)`
  - `notify_complaint_assigned(issue, tenant, assignee_id)`
  - `notify_complaint_reopened(issue, tenant)`
  - `notify_complaint_reply(issue, tenant, student_id)`

- [ ] **Step 1: Add enum values**

```python
COMPLAINT_NEW = "complaint_new"
COMPLAINT_ASSIGNED = "complaint_assigned"
COMPLAINT_REOPENED = "complaint_reopened"
COMPLAINT_REPLY = "complaint_reply"
```

- [ ] **Step 2: Implement `complaint_notifications.py`**

Pattern: resolve recipient user ids → `enqueue_push_for_user_ids` with `data={"href": "..."}` + optional utility catalog row if the app reads live events (mirror `app_chat/notifications.py`).

Admin recipients: iterate active users where `user_can_access_admin_shortcuts(user)`.

- [ ] **Step 3: Wire hooks**

| Hook location | Event |
|---------------|-------|
| Student `POST issues` success | `COMPLAINT_NEW` |
| `IssueSerializer.update` assignee change on `PARENT_COMPLAINT` | `COMPLAINT_ASSIGNED` |
| Student reopen move | `COMPLAINT_REOPENED` |
| Staff `POST comments` on `PARENT_COMPLAINT` | `COMPLAINT_REPLY` |

- [ ] **Step 4: Test notification calls**

Extend `test_complaint_views.py` with `@patch("app_crm.complaint_notifications.enqueue_push_for_user_ids")` asserting admin notified on create and student on staff reply.

---

### Task 6: Frontend types + API client

**Files:**
- Modify: `schedjuice-reimagined-fe/src/types/issue.ts`
- Modify: `schedjuice-reimagined-fe/src/lib/issues-api.ts`
- Create: `schedjuice-reimagined-fe/src/lib/complaints/complaint-timeline.ts`

**Interfaces:**
- Produces:
  - `export enum IssueSource { Internal = "INTERNAL", ParentComplaint = "PARENT_COMPLAINT" }`
  - `createParentComplaint({ body?, attachments? })`
  - `postComplaintComment(issueId, { body?, attachments? })`
  - `fetchIssues({ source?: IssueSource })`
  - `mapComplaintTimelineToBubbles(items, currentUserId)`

- [ ] **Step 1: Extend types**

Add `source` to `Issue`; `attachments?: ChatAttachmentRef[]` to `IssueComment` and timeline comment items.

- [ ] **Step 2: Add API functions**

```typescript
export async function createParentComplaint(input: {
  body?: string;
  attachments?: ChatAttachmentRef[];
}): Promise<Issue> {
  const res = await axiosClient.post<Envelope<Issue>>("issues", input);
  return res.data.data;
}

export async function fetchIssues(options?: { source?: IssueSource }): Promise<Issue[]> {
  const params = options?.source ? { source: options.source } : {};
  // existing expand + size=500
}
```

- [ ] **Step 3: Timeline mapper**

Map `IssueTimelineItem` → `{ id, text, isMe, attachments, isSystem, systemLabel? }`.

---

### Task 7: Frontend admin — source filter + attachments in drawer

**Files:**
- Modify: `src/components/issues/issues-view.tsx`
- Modify: `src/components/issues/issue-card.tsx` (or `issue-card-content.tsx`)
- Modify: `src/components/issues/issue-detail-drawer.tsx`
- Modify: `src/lib/utility-notification-display.ts`
- Modify: `src/lib/resolve-utility-notification-href.ts`
- Test: `src/components/issues/__tests__/issues-source-filter.test.tsx` (optional high-value)

- [ ] **Step 1: Source filter UI**

Add segmented control: All | Parent complaints | Internal. Pass `source` to `fetchIssues` when not All.

- [ ] **Step 2: Card badge**

When `issue.source === ParentComplaint`, show badge "Parent complaint".

- [ ] **Step 3: Comment attachments in drawer**

For timeline items with `attachments`, render `<ChatAttachmentRenderer attachments={...} isMe={...} />`.

- [ ] **Step 4: Deep link from notifications**

Support `/crm/issues?issue=<id>` to auto-open `IssueDetailDrawer` (read `useSearchParams` in `IssuesView`).

- [ ] **Step 5: Utility notification icons + hrefs for four complaint kinds**

---

### Task 8: Frontend student complaints UI

**Files:**
- Create: `src/app/(internal)/complaints/page.tsx`
- Create: `src/app/(internal)/complaints/new/page.tsx`
- Create: `src/app/(internal)/complaints/[id]/page.tsx`
- Create: `src/components/complaints/complaint-list.tsx`
- Create: `src/components/complaints/complaint-conversation.tsx`
- Modify: `src/config/nav-routes.tsx`
- Modify: `src/config/route-permissions.ts`
- Modify: `src/middleware.ts` (if needed for CRM + student gate)

- [ ] **Step 1: Nav item**

```tsx
{
  title: "Complaints by Parents",
  href: "/complaints",
  canShow: (tenant, user) => Boolean(user && isStudent(user) && tenant.is_crm_enabled),
}
```

- [ ] **Step 2: Complaint list page**

- `useQuery` → `fetchIssues()` (student-scoped by BE)
- Split Active / Past by `status.behavior`
- Link rows → `/complaints/[id]`; FAB → `/complaints/new`

- [ ] **Step 3: New complaint page**

- Reuse chat composer + `uploadChatAttachments` + attachment strip from `chat-section.tsx` patterns
- Header: tenant name / "School Administration"
- Submit → `createParentComplaint` → `router.push(/complaints/${id})`

- [ ] **Step 4: Thread page (`ComplaintConversation`)**

- Poll `fetchIssueTimeline(id)` every 20s
- Render bubbles via `complaint-timeline.ts`
- Composer when status behavior NORMAL; closed banner + Reopen button when DONE/CANCELLED
- Reopen: fetch Open status id from `fetchIssueStatuses()`, `moveIssue(id, openId)`

- [ ] **Step 5: Route guard**

Add `/complaints` to `route-permissions.ts` requiring student role (mirror finance student-only routes).

---

### Task 9: Mobile complaints UI

**Files:**
- Create: `lib/api/issues.ts`
- Create: `lib/complaints/complaint-timeline.ts`
- Create: `components/complaints/complaint-list-screen.tsx`
- Create: `components/complaints/complaint-new-screen.tsx`
- Create: `components/complaints/complaint-thread-screen.tsx`
- Create: `app/(protected)/complaints/index.tsx`
- Create: `app/(protected)/complaints/new.tsx`
- Create: `app/(protected)/complaints/[id].tsx`
- Modify: `lib/navigation/sidebar-nav-config.ts`
- Modify: `lib/i18n/locales/en.ts`, `my.ts`

- [ ] **Step 1: API module**

Mirror FE `createParentComplaint`, `fetchIssues`, `fetchIssueTimeline`, `postComplaintComment`, `moveIssue`.

- [ ] **Step 2: Nav config**

Add complaints item with same `canShow` as web.

- [ ] **Step 3: List screen**

Active / Past sections; pull-to-refresh; navigate to thread and new.

- [ ] **Step 4: New + thread screens**

Reuse:
- `useChatAttachmentComposer` with `foreignKey: 'complaint-new'` or issue id
- `uploadChatAttachments`
- `ChatComposerAttachmentStrip`
- `Composer` from chat conversation

Thread: poll timeline; map to bubble component (extract or duplicate minimal bubble from DM screen).

- [ ] **Step 5: i18n keys**

```typescript
complaints: {
  byParents: 'Complaints by Parents',
  newComplaint: 'New complaint',
  schoolAdministration: 'School Administration',
  closedBanner: 'This complaint is closed.',
  reopen: 'Reopen complaint',
  active: 'Active',
  past: 'Past',
}
```

Copy same strings to `my.ts`.

- [ ] **Step 6: Route guard**

In complaints layout or screen: redirect non-students; hide when `!tenant.is_crm_enabled`.

---

### Task 10: End-to-end verification

- [ ] **Backend full slice**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_crm.tests app_utility_notifications.tests -v 2 --keepdb --noinput
```

- [ ] **Frontend unit tests**

```bash
cd schedjuice-reimagined-fe
pnpm run test:unit -- src/lib/complaints src/components/issues
pnpm run typecheck
pnpm run lint
```

- [ ] **Mobile tests**

```bash
cd schedjuice-reimagined-mobile
pnpm test -- complaint
```

- [ ] **Manual smoke (local)**

1. Enable `is_crm_enabled` on dev tenant.
2. Log in as student (mobile + web): nav shows "Complaints by Parents".
3. File complaint with image → appears in list; admin sees on Issues board with filter.
4. Admin assigns → assignee notified; admin replies → student notified.
5. Admin marks Done → student read-only; student reopens → admin/assignee notified.

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| `Issue.source` + `IssueComment.attachments` | 1 |
| `complaint.*` RBAC | 2 |
| Role-aware `issues/` endpoints | 4 |
| Student-safe timeline | 3, 4 |
| Attachments validation | 3, 4 |
| Notifications (4 kinds) | 5 |
| Admin source filter + badge | 7 |
| Admin attachment display | 7 |
| Student list/new/thread UI (FE) | 8 |
| Student UI (mobile) | 9 |
| Nav + route guards | 8, 9 |
| `is_crm_enabled` gate | 4, 8, 9 |
| Reopen flow | 4, 8, 9 |

## Suggested commit order (when user authorizes)

1. `feat(crm): add issue source and comment attachments`
2. `feat(rbac): add complaint permissions for students`
3. `feat(crm): student parent complaint API and helpers`
4. `feat(notifications): complaint utility notification kinds`
5. `feat(fe): admin issues source filter and complaint attachments`
6. `feat(fe): student complaints pages and nav`
7. `feat(mobile): student complaints flow and i18n`
