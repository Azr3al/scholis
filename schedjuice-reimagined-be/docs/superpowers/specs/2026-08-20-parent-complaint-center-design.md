# Parent Complaint Center (CRM Issues) — Design Spec

**Date:** 2026-08-20  
**Status:** Approved (2026-08-20)  
**Surface:** BE `app_crm` Issues; student mobile + web; admin web Issues board  
**Related:** [2026-07-10-reusable-kanban-issues-design.md](./2026-07-10-reusable-kanban-issues-design.md), [2026-08-09-crm-toggle-settings-reorg-design.md](./2026-08-09-crm-toggle-settings-reorg-design.md)

## Summary

Students file **parent complaints** through a sidebar entry labeled **"Complaints by Parents"** on mobile and web. Each filing creates a CRM **Issue** (`source = PARENT_COMPLAINT`) with optional **image/document attachments** on the first message and follow-up replies. The student experience reuses **chat UI components** (bubbles, composer, attachment strip) backed by existing `issues/` endpoints and `IssueComment` / timeline APIs — not `ChatThread`. Admins manage complaints on the existing Issues kanban with a **source filter**, receive **in-app + push** notifications, and assign staff who also get notified.

## Confirmed decisions

| Topic | Decision |
|-------|----------|
| Actor | **Student accounts** file on behalf of parents (no parent login) |
| Storage | CRM **Issues** — one ticket per complaint |
| Org gate | **`is_crm_enabled`** only (no separate complaint flag) |
| API surface | Same **`issues/`** endpoints; role-aware queryset + payload shapes |
| Student access | Own `PARENT_COMPLAINT` issues only; full thread read/write while open |
| Resolved behavior | **Read-only** when status is Done/Cancelled; student may **Reopen** → Open |
| Admin board | Same Issues kanban + **source filter** (All / Parent complaints / Internal) |
| New complaint notify | **Admins/managers** (`user_can_access_admin_shortcuts`) |
| Assign notify | **Assignee** when admin assigns issue |
| Statuses | Existing seeded defaults: Open → In progress → Done / Cancelled |
| Attachments | **Allowed** on student create + follow-up comments (same rules as chat) |

---

## Section 1 — Data model & API

### New field on `Issue`

```python
class IssueSource(models.TextChoices):
    INTERNAL = "INTERNAL", "Internal"
    PARENT_COMPLAINT = "PARENT_COMPLAINT", "Parent complaint"
```

| Field | Student-filed complaint | Staff-created issue |
|-------|-------------------------|---------------------|
| `source` | `PARENT_COMPLAINT` (server-set) | `INTERNAL` (default) |
| `related_student` | Filing student (server-set) | Optional manual link |
| `created_by` | Filing student | Staff actor |
| `title` | Auto: `"Parent complaint — {student.name}"` | Client-provided |
| `description` | First message body | Client-provided |
| `assignee` | `null` on create | Optional |
| `status` | Default **Open** | Default Open |

Migration: add `source` with default `INTERNAL`; backfill existing rows as `INTERNAL`.

### New field on `IssueComment`

Add `attachments` JSONField (default `[]`) — same shape as chat: `[{ "attachment_id": number, ... }]` (`ChatAttachmentRef`).

- Reuse **`validate_chat_attachment_refs`** from `app_chat/services.py` (15 MB limit, allowed extensions, attachment must exist and not be deleted).
- Validation rule: **at least one of** non-empty `body` **or** non-empty `attachments` (mirrors chat empty-message guard).
- Staff comments may omit attachments (text-only unchanged); field is available if staff UI adds uploads later.

### Role-aware `issues/` behavior

All student paths require `tenant.is_crm_enabled`; return **404** when CRM is off (same pattern as CRM route guards).

| Endpoint | Staff (`issue.*`) | Student (`complaint.*`) |
|----------|-------------------|-------------------------|
| `GET issues` | All issues; optional `?source=PARENT_COMPLAINT\|INTERNAL` | Only own: `source=PARENT_COMPLAINT` AND `related_student_id = me` |
| `POST issues` | Full payload | Minimal: `{ "body"?: string, "attachments"?: ChatAttachmentRef[] }` — server sets source, title, related_student, description (= body or attachment preview), status |
| `GET issues/:id` | Any | Own parent complaint only → else 404 |
| `GET issues/:id/timeline` | Full timeline | Own only; **student-safe timeline** (see below) |
| `POST issues/:id/comments` | Staff reply (`body`, optional `mentions`) | Student reply (`body?`, `attachments?`); **403** if status behavior is DONE or CANCELLED |
| `POST issues/:id/move` | Any valid transition | **Reopen only:** DONE/CANCELLED → Open; other transitions → 403 |
| `PUT/PATCH issues/:id` | Full edit | **403** |
| `DELETE issues/:id` | `issue.delete` | **403** |

### Student-safe timeline

Students see:

- **Comments** (student + staff messages) — rendered as chat bubbles **with attachments** when present
- **Status changes** — plain-language system lines, e.g. "Your complaint was marked resolved", "Your complaint was reopened"
- **Created** event — optional one-line "Complaint submitted"

Students do **not** see: assignee changes, observer additions, internal mention metadata.

Implementation: filter `IssueEvent` types in timeline serializer when actor is student; or dedicated `?view=student` query param honored only for `complaint.view_own`.

### First message → Issue + comment

On student `POST issues`:

1. Validate attachments via shared chat helper
2. Create `Issue` with fields above (`description` = body text, or `"Sent an attachment."` / chat-style preview when body empty)
3. Create first `IssueComment` with `body` + `attachments` from request
4. Record `IssueEvent.CREATED`
5. Notify admins/managers (see Notifications)
6. Return expanded issue (status, timestamps)

Staff `POST issues` unchanged (no auto-comment unless description provided).

---

## Section 2 — Student UX

### Nav entry

| Platform | Location | Visibility |
|----------|----------|------------|
| **Mobile** | App menu drawer (`sidebar-nav-config.ts`) | `isStudent(user)` AND `tenant.is_crm_enabled` |
| **Web** | Sidebar (`nav-routes.tsx`) — student-visible section | Same gates |

Label: **"Complaints by Parents"** (i18n key e.g. `complaints.byParents`; Burmese placeholder = English in mobile `my.ts`).

Route (both platforms): **`/complaints`** (student-only; middleware/route guard mirrors CRM gate + student role).

### Screens

**1. Complaint list** (`/complaints`)

- Fetches `GET issues` (student-scoped automatically)
- Two sections: **Active** (status behavior NORMAL) and **Past** (DONE / CANCELLED)
- Row: auto title, last message preview, status badge, relative time
- FAB / header action: **New complaint** → compose screen

**2. New complaint** (`/complaints/new`)

- Chat-style full screen: header shows **"School Administration"** (or org name) — no real user avatar required; use org logo or generic support icon
- Single composer with **attachment strip** (reuse chat attachment picker/upload); no title field
- Submit → `POST issues { body?, attachments? }` → navigate to thread
- Upload flow: Juice Box direct upload (mobile `uploadChatAttachments` / FE `lib/chat/chat-attachments`) **before** POST, passing attachment refs — same as DM/course chat

**3. Complaint thread** (`/complaints/[id]`)

- Reuse chat conversation layout:
  - **Mobile:** adapt `dm-chat-conversation-screen` patterns — message list + `Composer`
  - **Web:** adapt DM/chat bubble components from `components/course/chat/` or shared chat primitives
- Data: `GET issues/:id/timeline` polled every ~15–25s (no WebSocket for v1; match mobile course-chat list polling)
- **Open issue:** composer enabled (text + attachments); send → `POST issues/:id/comments { body?, attachments? }`
- **Done/Cancelled:** composer hidden; banner "This complaint is closed"; **Reopen complaint** button → `POST issues/:id/move { status: <open_id> }`
- After reopen: composer enabled; admins/assignee notified

**4. Student notification on staff reply**

When staff posts a comment on a `PARENT_COMPLAINT` issue, push + in-app notification to `related_student` (sanity default for two-way chat feel).

### Chat UI reuse (not ChatThread storage)

| Chat concept | Complaint mapping |
|--------------|-------------------|
| Message list | Timeline items where `kind=comment` + filtered status events |
| Own vs other bubbles | Student author = right/primary; staff = left/muted |
| Composer | `POST issues/:id/comments` |
| Header title | "School Administration" / tenant name |
| Attachments | Reuse `useChatAttachmentComposer` (mobile) + chat attachment upload/render (web); stored on `IssueComment.attachments` |
| Typing / WS / reactions | **Out of scope v1** |
| Voice messages | **Out of scope v1** (images + documents per chat attachment contract) |

Extract a thin **`ComplaintConversation`** component (FE + mobile) that maps timeline → bubble props so DM screens are not forked wholesale.

---

## Section 3 — Admin UX

### Issues board (`/crm/issues`)

- Add **source filter** control: **All** | **Parent complaints** | **Internal**
  - Filters client-side or via `GET issues?source=...` (prefer server filter for large boards)
- **Parent complaint cards:** small badge "Parent complaint" + show `related_student` chip if not already visible
- Detail drawer timeline **renders attachments** on comments via `ChatAttachmentRenderer` (or shared issue-comment attachment component)
- Staff reply via existing text comment composer (staff attachment upload **out of scope v1** — display-only for student attachments)
- Assignee picker unchanged; assignee notification on change (new)
- Move between columns unchanged (Open / In progress / Done / Cancelled)

### Staff create flow

`NewIssueDialog` unchanged; created issues default `source=INTERNAL`. Optional future: manual source override — **out of scope v1**.

### Route guards

- `/crm/issues` — existing `issue.view` + `is_crm_enabled`
- `/complaints/*` — student role + `complaint.view_own` + `is_crm_enabled`; staff redirected away or 404

---

## Section 4 — Notifications

### New utility notification kinds

Add to `UtilityNotificationKind`:

| Kind | Audience | Trigger |
|------|----------|---------|
| `COMPLAINT_NEW` | Admins/managers | Student creates parent complaint |
| `COMPLAINT_ASSIGNED` | Assignee | Assignee set/changed on `PARENT_COMPLAINT` issue |
| `COMPLAINT_REOPENED` | Assignee if set, else admins/managers | Student reopens |
| `COMPLAINT_REPLY` | `related_student` | Staff comments on parent complaint |

### Delivery

- **In-app:** `utility-notifications/me` catalog rows with deep links:
  - Staff → `/crm/issues` (open detail drawer via query `?issue=<id>` if supported, else board)
  - Student → `/complaints/<id>`
- **Push:** immediate via `enqueue_push_for_user_ids` on event (same pattern as `app_chat/notifications.py`), not daily cron digest
- **Email:** reuse existing observer email on status change for staff observers; no extra email for v1 beyond existing issue status emails

### Admin recipient resolution

Use existing `user_can_access_admin_shortcuts(user)` from `app_auth/shortcuts_availability_helpers.py` for `COMPLAINT_NEW` and fallback on reopen.

---

## Section 5 — Permissions (RBAC)

### New permissions (`app_rbac/catalog.py`)

| Code | Description | Granted to |
|------|-------------|------------|
| `complaint.create` | File a parent complaint | `student` |
| `complaint.view_own` | View own complaints + timeline | `student` |
| `complaint.comment` | Comment on own open complaints | `student` |
| `complaint.reopen` | Reopen own closed complaints | `student` |

Staff retain existing `issue.view`, `issue.create`, `issue.update`, `issue.delete`, `issue.configure`. Students do **not** receive any `issue.*` permission.

### View queryset hooks

In `IssueListView.get_queryset()` (or RBAC base):

```python
if user has complaint.view_own and not issue.view:
    return Issue.objects.filter(source=PARENT_COMPLAINT, related_student=user)
if user has issue.view:
    return Issue.objects.all()  # optional source filter from query params
return Issue.objects.none()
```

Object-level checks on detail/comment/move endpoints mirror the same rules.

### Nav & middleware

- Web: `canShow: (tenant, user) => isStudent(user) && tenant.is_crm_enabled` on Complaints nav item
- Web middleware: add `/complaints` prefix guard (student + CRM enabled)
- Mobile: mirror in `filter-app-menu.ts` + route guard

---

## Section 6 — Error handling, edge cases, testing

### Error handling

| Case | Response |
|------|----------|
| CRM disabled | 404 on all complaint student endpoints; nav hidden |
| Student accesses another student's issue | 404 |
| Comment on closed complaint | 403 + message "This complaint is closed. Reopen to reply." |
| Invalid reopen (already open) | 400 |
| Empty body **and** no attachments on create/comment | 400 validation |
| Invalid / oversize attachment refs | 400 (same messages as chat) |
| Non-student hits `/complaints` | Redirect (web) / guard (mobile) |

### Edge cases

- **Multiple open complaints:** allowed — each `POST issues` creates a new ticket
- **Student graduated/deactivated:** existing complaints remain visible read-only; new create blocked by auth
- **Teacher with `issue.view`:** sees parent complaints on board when filter applied; not notified on new complaint (admin/manager only)
- **Assignee removed:** reopen notifies admins/managers

### High-value tests (BE)

- Student create sets `source`, `related_student`, auto title; admin notified
- Student list/detail scoped to own rows only
- Student cannot `GET issues` board-wide (empty or own only)
- Comment blocked when Done/Cancelled; allowed when Open
- Reopen moves to Open; notifies assignee/admins
- Staff filter `?source=PARENT_COMPLAINT` returns only parent complaints
- CRM disabled → student create 404
- Create with attachments only (no body) succeeds; first comment stores refs
- Rejects invalid `attachment_id` and >15 MB files

### High-value tests (FE/mobile)

- Nav hidden when `!is_crm_enabled`
- Complaint thread disables composer when Done
- Reopen button calls move endpoint and re-enables composer
- Admin source filter toggles visible cards
- New complaint upload + send with image; attachment visible in thread + admin drawer

---

## Out of scope (v1)

- Parent/guardian login accounts
- Voice messages, reactions, WebSocket realtime
- Staff uploading attachments in issue replies (display student attachments only)
- Separate `/complaints/` API namespace (use role-aware `issues/`)
- Dedicated org flag beyond `is_crm_enabled`
- Issues table view (board remains canonical admin UI)
- AI triage or auto-assign rules
- CRM Leads integration

---

## Implementation touchpoints (reference)

| Layer | Files / areas |
|-------|----------------|
| BE model | `app_crm/models.py` — `Issue.source`, `IssueComment.attachments`; migrations |
| BE validation | Reuse `app_chat.services.validate_chat_attachment_refs` |
| BE views | `app_crm/views.py` — queryset + create/comment/move branches |
| BE RBAC | `app_rbac/catalog.py`, `defaults.py`, migration seed |
| BE notify | `app_utility_notifications/utility_notification_kinds.py`, `utility_notification_helpers.py`, issue signal hooks in views |
| FE types | `src/types/issue.ts` — add `source` |
| FE admin | `src/components/issues/issues-view.tsx` — source filter |
| FE student | New `src/app/(internal)/complaints/` routes + `ComplaintConversation`; reuse `lib/chat/chat-attachments` + `ChatAttachmentRenderer` |
| Mobile student | Reuse `useChatAttachmentComposer`, `uploadChatAttachments`, `ChatComposerAttachmentStrip` |
| FE nav | `src/config/nav-routes.tsx` |
| Mobile | `lib/navigation/sidebar-nav-config.ts`, new `app/(protected)/complaints/` routes |
| Mobile i18n | `lib/i18n/locales/en.ts`, `my.ts` |

---

## Open questions (resolved)

All product questions resolved in brainstorming session 2026-08-20. No TBDs remain for v1 planning.
