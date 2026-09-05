# Reusable Kanban + Issues Board — Design Spec

**Date:** 2026-07-10  
**Status:** Approved for planning  
**Surface:** Web FE Leads + new Issues tracker; BE `app_crm` (Leads + Issues)  
**Related:** FE Leads kanban (`src/components/leads/`); chat mentions (`course-chat-mentions.ts`, `app_chat`); org settings toggles (`Organization.is_*_enabled`)

## Summary

Extract the Leads kanban into a **reusable frontend kit**, then ship a staff-only **Issues** board for internal work and student-support tickets. Both Leads and Issues share detail features: **`@` mentions that auto-add observers**, and **org-gated email to observers on status change**. Students never see the tracker.

## Confirmed decisions

| Topic | Decision |
|-------|----------|
| Purpose | Internal staff work **and** student-support tickets (one board) |
| Entity links | Optional `related_student` and/or `related_course` on Issue |
| Access | RBAC like Leads (`issue.view` etc.); students get nothing |
| Shared features | Mentions, observers, status-change email on **both** Leads and Issues |
| Ownership | One **assignee** + many **observers** (manual + auto from `@mention`) |
| Mention pool | Only users who already have that board’s view permission |
| Status-change notify | **Email** only (not push / in-app for this path) |
| Issue columns | Tenant-configurable statuses (seeded defaults + full CRUD) |
| Platform | Web only (FE + BE); mobile later |
| Architecture | Shared kanban kit + Leads and Issues both in `app_crm` |
| Org notify defaults | Both toggles **on** by default |
| Issues table view | Out of scope for v1 (board-first) |

## Goals / non-goals

**Goals**

- Reusable FE kanban (board / column / card / DnD) used by Leads and Issues.
- New Issues domain with configurable statuses, assignee, observers, comments, timeline.
- `@mention` in detail comments → auto-add observer (idempotent, permission-gated).
- Org settings toggles to email observers when a card’s status changes.
- Hide Issues (and keep Leads) from students via RBAC + nav + route guards.

**Non-goals**

- Mobile Issues UI
- Push or in-app utility notifications for status-change (email only)
- Polymorphic single-board backend (`Board` / `Card` shared table)
- Issues table/list view in v1
- Porting Leads appointment/convert behaviors onto Issues
- TipTap-based mentions (reuse chat contenteditable / offset mention pattern)

## Architecture

```
FE                              BE
────────────────────────────    ────────────────────────────────
components/kanban/              app_crm (Lead + Issue + observers/mentions)
  KanbanBoard / Column / Card     └─ move_lead / move_issue → shared notify
                                  └─ comments + mentions → observers
components/board-detail/
  mention composer
  observers list
  timeline shell
                                shared helpers (mention → observer, email)
LeadsView ──► app_crm lead APIs   Organization.notify_*_observers_on_status_change
IssuesView ──► app_crm issue APIs
```

- **Do not** merge Leads and Issues into one polymorphic model. Leads keep CRM-specific status behaviors (`APPOINTMENT`, `CONVERTED`, etc.).
- Shared BE logic lives in `app_utils/board_observers.py` (add observers from mentions; email observers on status change) — not duplicated per app.

## Data model

### `Issue` (new, tenant-scoped)

| Field | Notes |
|-------|--------|
| `title` | Required |
| `description` | Plain text for v1 |
| `status` | FK → `IssueStatus` |
| `assignee` | FK → User, nullable |
| `created_by` | FK → User |
| `related_student` | Optional FK → User (student link only; does not grant access) |
| `related_course` | Optional FK → Course |
| `observers` | M2M → User |
| timestamps | Created / updated |

### `IssueStatus`

| Field | Notes |
|-------|--------|
| `name`, `color`, `order` | Column display |
| `is_default` | Default column for new issues |
| `behavior` | `NORMAL` \| `DONE` \| `CANCELLED` (no appointment/convert) |

**Seeded defaults:** Open → In progress → Done → Cancelled.

### `IssueComment`

| Field | Notes |
|-------|--------|
| `issue`, `author`, `body` | Plain text body |
| `mentions` | JSON list `{ user_id, offset, length }` (same shape as chat) |
| `created_at` | |

### `IssueEvent`

Immutable audit: `created`, `status_changed`, `assignee_changed`, `observer_added`, etc., with JSON payload where useful (`from` / `to` status names or ids).

### Lead extensions

- M2M `Lead.observers` → User (same semantics as Issue).
- `LeadComment.mentions` JSON (same shape).
- Existing `LeadEvent` types extended or reused for observer changes where needed.
- On lead create, creator is added as an observer (in addition to becoming assignee). No backfill of existing leads required for v1.

### Organization (shared schema)

| Field | Default | Notes |
|-------|---------|--------|
| `notify_issue_observers_on_status_change` | `True` | Email issue observers on status move |
| `notify_lead_observers_on_status_change` | `True` | Email lead observers on status move |

## Domain rules

1. **Create issue:** Creator becomes default `assignee` and is added as an observer (same spirit as Leads assignee-on-create).
2. **`@mention` in a comment:** If the mentioned user has the board’s view permission (`issue.view` or `lead.view`), add them as an observer (idempotent). Server rejects mention user IDs that fail the permission check. FE picker only lists eligible users.
3. **Manual observers:** Users with update permission can add/remove observers in the detail sidebar. Removing self or the last observer is allowed.
4. **Status move:** Update status, record `status_changed` event. If the matching org toggle is on, **email each observer except the actor**. Skip users without an email. Assignee is notified only if they are also an observer. Mail is best-effort: failures are logged and must not fail the move.
5. **Students:** No `issue.*` (or `lead.*`) grants; no nav entry; API returns 403. `related_student` is metadata only.

## RBAC

| Permission | Typical roles |
|------------|----------------|
| `issue.view` | Teacher, admin, manager |
| `issue.create` / `issue.update` / `issue.delete` | Admin, manager |
| `issue.configure` | Admin, manager (status CRUD) |
| (none) | Student |

Frontend: nav item + `route-permissions` for `/issues` (`issue.view`) and `/issues/settings` (`issue.configure`), mirroring Leads / CRM.

## API

### Issues

| Method | Path | Notes |
|--------|------|--------|
| GET/POST | `issues` | List with expand (status, assignee, observers, related_*); create |
| GET/PATCH/DELETE | `issues/:id` | Detail / update / delete |
| POST | `issues/:id/move` | `{ status_id }` → event + optional emails |
| GET/POST | `issues/:id/comments` | Body + mentions; POST adds observers from mentions |
| GET | `issues/:id/timeline` | Merged events + comments by `created_at` |
| POST/DELETE | `issues/:id/observers` | Manual observer manage |
| CRUD | `issue-statuses` | Requires `issue.configure` |

### Leads extensions

- Comment create accepts `mentions`; runs shared add-observers helper.
- Observer add/remove endpoints (same shape as Issues).
- `move_lead` calls shared notify helper when `notify_lead_observers_on_status_change` is on (appointment/convert flows unchanged).

### Mention candidates

- `GET issues/mention-candidates` — users with `issue.view` (never students).
- `GET leads/mention-candidates` — users with `lead.view` (never students).
- Optional `q` query param for name/email filter; used by the detail composer picker.

### Organization

- Existing org update path exposes the two boolean notify flags; FE org settings pane adds two switches.

## UI / UX

### Shared kanban (`src/components/kanban/`)

Lifted from current Leads board (`@dnd-kit`): generic board, column, card, drag overlay. Domain supplies column list, cards by status, card renderer, `onMove(cardId, toStatusId)`, `onOpenCard`.

### Issues (`/issues`)

- Board view (no table in v1).
- Card: title, assignee avatar, observer affordance, related student/course chips when set.
- New issue dialog: title, description, optional student + course pickers, optional assignee (defaults to self).
- Configure → `/issues/settings` (status CRUD), gated by `issue.configure`.

### Detail drawer (shared shell)

- Left: timeline + mention-capable comment composer (port chat mention helpers / contenteditable pattern).
- Right: status, assignee, observers (add/remove), related student/course (Issues) or CRM fields (Leads).
- Posting a comment with mentions updates observers (invalidate timeline + card).

### Org settings

Two switches (AI-settings-pane pattern): “Email lead observers on status change” / “Email issue observers on status change”.

## Error handling

- Mutation failures: toast; optimistic kanban moves roll back (Leads pattern).
- Invalid mention IDs: 400 from server; picker never offers ineligible users.
- Email send failures: log only; move still succeeds.
- Org toggle off: move succeeds with no emails.
- Missing permission / student: 403 on API; FE redirect / hidden nav.

## Testing

**Backend** (`./scripts/run_backend_tests.sh`, always `--keepdb --noinput`):

- Issue CRUD and move; status configure permissions.
- Comment mention → observer added; ineligible mention rejected.
- Status-change email skipped when toggle off; actor excluded from recipients.
- Student (no permission) denied on Issues APIs.
- Lead comment mentions + observers + notify gate.

**Frontend:**

- Unit tests for kanban grouping/move helpers and mention token building.
- Manual web smoke: Issues board, mention → observer, org toggle, student cannot see nav.

## Implementation order

1. BE: org toggles, shared helpers, Lead observers/mentions, Issue models in `app_crm` + RBAC + tests.
2. FE: extract kanban kit; refactor Leads onto it; shared detail mentions/observers.
3. FE: Issues page, settings, nav, org toggles.
4. End-to-end status-change email wiring and smoke.

## Out of scope follow-ups

- Mobile Issues
- Issues table view
- Push / in-app status-change notifications
- Rich-text issue descriptions
- Per-user notification preferences (org-level toggles only in v1)
