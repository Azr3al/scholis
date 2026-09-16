# Reusable Kanban + Issues Board — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Repo policy:** Run `git commit` / `git push` only when the user has authorized commits. Work on the current branch unless the user asks for a feature branch.
> **Spec:** `docs/superpowers/specs/2026-07-10-reusable-kanban-issues-design.md`

**Goal:** Extract a reusable FE kanban kit from Leads, ship a staff-only Issues board (web), and share `@mention` → observers plus org-gated email on status change across Leads and Issues.

**Architecture:** Leads and Issues both live in `app_crm`. Shared BE helpers in `app_utils/board_observers.py`. FE: `components/kanban/` + `components/board-detail/` used by Leads and Issues domain wrappers under `/crm/`. Students never receive `issue.*` / `lead.*` grants.

**Tech Stack:** Django 4.2 + DRF + tenant schemas (`schedjuice-reimagined-be`); Next.js 15 + TanStack Query + `@dnd-kit` + Vitest (`schedjuice-reimagined-fe`); email via `app_microsoft.mail.send_mail`.

---

## File Structure

### Backend (`schedjuice-reimagined-be`)

| Path | Responsibility |
|------|----------------|
| `app_organization/models.py` | `notify_issue_observers_on_status_change`, `notify_lead_observers_on_status_change` |
| `app_organization/migrations/…` | Shared-schema migration for the two booleans |
| `app_utils/board_observers.py` | `users_with_permission`, `add_observers_from_mentions`, `email_observers_on_status_change` |
| `app_utils/tests/test_board_observers.py` | Unit tests for helpers (mocked mail) |
| `app_crm/models.py` | Lead + Issue models, observers M2M, comment mentions |
| `app_crm/migrations/…` | Schema + permission/status seeds for leads and issues |
| `app_crm/services.py` | Lead/issue create, move, observer helpers |
| `app_crm/views.py` | Lead + issue endpoints; comments, observers, mention-candidates |
| `app_crm/serializers.py` | Lead + issue serializers |
| `app_crm/urls.py` | Lead + issue routes |
| `app_rbac/catalog.py` + `defaults.py` | `issue.*` permissions + role matrix |

### Frontend (`schedjuice-reimagined-fe`)

| Path | Responsibility |
|------|----------------|
| `src/lib/kanban-board.ts` + `.test.ts` | `groupByColumnId`, `applyOptimisticMove` |
| `src/components/kanban/` | `KanbanBoard`, `KanbanColumn`, `KanbanCardShell` |
| `src/lib/board-mentions.ts` | Thin wrappers over chat mention helpers |
| `src/components/board-detail/` | Mention composer, observers list |
| `src/components/leads/*` | Refactor onto kanban + board-detail |
| `src/types/issue.ts`, `src/lib/issues-api.ts`, `src/hooks/issues/*` | Issues client |
| `src/components/issues/*`, `src/app/(internal)/crm/issues/**` | Issues UI + settings under CRM |
| `src/config/nav-routes.tsx`, `route-permissions.ts` | Nav + guards |
| `src/types/organization.ts`, `organization-profile-sections.ts` | Org notify toggles |

---

### Task 1: Org notify toggles (backend)

**Files:**
- Modify: `app_organization/models.py`
- Create: `app_organization/migrations/0XXX_board_observer_notify_toggles.py` (use `makemigrations`)

- [ ] **Step 1: Add fields on `Organization`**

Near other `is_*_enabled` booleans in `app_organization/models.py`:

```python
    notify_lead_observers_on_status_change = models.BooleanField(
        default=True,
        help_text="When True, email lead observers when a lead moves to a new status.",
    )
    notify_issue_observers_on_status_change = models.BooleanField(
        default=True,
        help_text="When True, email issue observers when an issue moves to a new status.",
    )
```

- [ ] **Step 2: Migrate shared schema**

```bash
cd schedjuice-reimagined-be
./env/bin/python manage.py makemigrations app_organization --name board_observer_notify_toggles
./env/bin/python manage.py migrate_schemas --shared
```

Expected: migration applies; fields default `True`. Serializer already uses `exclude=` — new fields are included automatically (do not add to AI exclude list).

- [ ] **Step 3: Ask user before commit** (if authorized)

```bash
git add app_organization/models.py app_organization/migrations/
git commit -m "$(cat <<'EOF'
feat(org): add board observer status-change email toggles

EOF
)"
```

---

### Task 2: Shared `board_observers` helpers (TDD)

**Files:**
- Create: `app_utils/board_observers.py`
- Create: `app_utils/tests/test_board_observers.py`

- [ ] **Step 1: Write failing unit tests**

```python
# app_utils/tests/test_board_observers.py
from unittest.mock import MagicMock, patch

from django.core.exceptions import ValidationError
from django.test import SimpleTestCase

from app_utils.board_observers import (
    add_observers_from_mentions,
    email_observers_on_status_change,
    mention_user_ids,
    validate_mention_user_ids,
)


class MentionParseTests(SimpleTestCase):
    def test_mention_user_ids_dedupes(self):
        mentions = [
            {"user_id": 1, "offset": 0, "length": 5},
            {"user_id": 1, "offset": 10, "length": 5},
            {"user_id": 2, "offset": 20, "length": 5},
        ]
        self.assertEqual(mention_user_ids(mentions), [1, 2])


class ValidateMentionsTests(SimpleTestCase):
    @patch("app_utils.board_observers.users_with_permission")
    def test_rejects_users_without_permission(self, mock_eligible):
        qs = MagicMock()
        qs.filter.return_value.values_list.return_value = [1]
        mock_eligible.return_value = qs
        with self.assertRaises(ValidationError):
            validate_mention_user_ids([1, 99], permission_code="issue.view")


class AddObserversTests(SimpleTestCase):
    def test_adds_only_new_observers(self):
        entity = MagicMock()
        entity.observers.filter.return_value.values_list.return_value = [1]
        entity.observers.add = MagicMock()
        added = add_observers_from_mentions(entity, [1, 2], actor=MagicMock())
        self.assertEqual(added, [2])
        entity.observers.add.assert_called_once_with(2)


class EmailObserversTests(SimpleTestCase):
    @patch("app_utils.board_observers.send_mail")
    def test_skips_when_toggle_off(self, mock_send):
        tenant = MagicMock()
        tenant.notify_issue_observers_on_status_change = False
        entity = MagicMock()
        email_observers_on_status_change(
            tenant=tenant,
            entity=entity,
            actor=MagicMock(id=1),
            subject="Status changed",
            body_html="<p>x</p>",
            toggle_attr="notify_issue_observers_on_status_change",
        )
        mock_send.assert_not_called()

    @patch("app_utils.board_observers.send_mail")
    def test_excludes_actor_and_missing_email(self, mock_send):
        tenant = MagicMock()
        tenant.notify_issue_observers_on_status_change = True
        tenant.schema_name = "xschedjuice"
        actor = MagicMock(id=1)
        obs_actor = MagicMock(id=1, email="a@x.com")
        obs_ok = MagicMock(id=2, email="b@x.com")
        obs_no_email = MagicMock(id=3, email="")
        entity = MagicMock()
        entity.observers.all.return_value = [obs_actor, obs_ok, obs_no_email]
        email_observers_on_status_change(
            tenant=tenant,
            entity=entity,
            actor=actor,
            subject="Status changed",
            body_html="<p>x</p>",
            toggle_attr="notify_issue_observers_on_status_change",
        )
        mock_send.assert_called_once()
        self.assertEqual(mock_send.call_args[0][3], "b@x.com")
```

Refine assertions to match the final helper signatures as you implement (keep behaviors: dedupe mentions, reject ineligible IDs, skip toggle-off, exclude actor, skip blank email, never raise from `send_mail` failures).

- [ ] **Step 2: Run tests — expect FAIL**

```bash
./scripts/run_backend_tests.sh app_utils.tests.test_board_observers -v 2
```

Expected: import error / missing module.

- [ ] **Step 3: Implement helpers**

```python
# app_utils/board_observers.py
from __future__ import annotations

import logging
from typing import Iterable, Sequence

from django.core.exceptions import ValidationError

from app_microsoft.mail import send_mail
from app_rbac.models import RolePermission

logger = logging.getLogger(__name__)


def users_with_permission(permission_code: str):
    """Users whose roles include a RolePermission for permission_code (current schema)."""
    from app_auth.models import User

    slugs = list(
        RolePermission.objects.filter(permission_code=permission_code).values_list(
            "role__slug", flat=True
        )
    )
    if not slugs:
        return User.objects.none()
    # User.roles is ArrayField — overlap any granted role slug
    q = None
    from django.db.models import Q

    for slug in slugs:
        clause = Q(roles__contains=[slug])
        q = clause if q is None else (q | clause)
    return User.objects.filter(q).distinct()


def mention_user_ids(mentions: Sequence[dict] | None) -> list[int]:
    if not mentions:
        return []
    seen: set[int] = set()
    out: list[int] = []
    for m in mentions:
        uid = m.get("user_id")
        if uid is None:
            continue
        uid = int(uid)
        if uid in seen:
            continue
        seen.add(uid)
        out.append(uid)
    return out


def validate_mention_user_ids(user_ids: Iterable[int], *, permission_code: str) -> list[int]:
    ids = list(dict.fromkeys(int(i) for i in user_ids))
    if not ids:
        return []
    eligible = set(
        users_with_permission(permission_code).filter(id__in=ids).values_list("id", flat=True)
    )
    bad = [i for i in ids if i not in eligible]
    if bad:
        raise ValidationError({"mentions": f"Users not allowed to be mentioned: {bad}"})
    return ids


def add_observers_from_mentions(entity, user_ids: Iterable[int], *, actor=None) -> list[int]:
    """Add users as observers; returns newly added user ids. Idempotent."""
    ids = list(dict.fromkeys(int(i) for i in user_ids))
    if not ids:
        return []
    existing = set(entity.observers.filter(id__in=ids).values_list("id", flat=True))
    to_add = [i for i in ids if i not in existing]
    if to_add:
        entity.observers.add(*to_add)
    return to_add


def email_observers_on_status_change(
    *,
    tenant,
    entity,
    actor,
    subject: str,
    body_html: str,
    toggle_attr: str,
) -> None:
    if not getattr(tenant, toggle_attr, False):
        return
    actor_id = getattr(actor, "id", None)
    for user in entity.observers.all():
        if actor_id is not None and user.id == actor_id:
            continue
        email = (getattr(user, "email", None) or "").strip()
        if not email:
            continue
        try:
            send_mail(tenant, subject, body_html, email)
        except Exception:
            logger.exception(
                "Failed status-change email to user=%s entity=%s",
                user.id,
                getattr(entity, "id", None),
            )
```

- [ ] **Step 4: Re-run tests — expect PASS**

```bash
./scripts/run_backend_tests.sh app_utils.tests.test_board_observers -v 2
```

- [ ] **Step 5: Ask user before commit**

---

### Task 3: Lead observers + comment mentions (backend)

**Files:**
- Modify: `app_crm/models.py`, `serializers.py`, `services.py`, `views.py`, `urls.py`
- Create: migration via `makemigrations app_crm`

- [ ] **Step 1: Model changes**

On `Lead`:

```python
    observers = models.ManyToManyField(
        "app_auth.User",
        blank=True,
        related_name="observed_leads",
    )
```

On `LeadComment`:

```python
    mentions = models.JSONField(default=list, blank=True)
```

On `LeadEvent.EventType` add:

```python
        OBSERVER_ADDED = "observer_added", "Observer added"
```

- [ ] **Step 2: Migrate**

```bash
./env/bin/python manage.py makemigrations app_crm --name lead_observers_and_mentions
# Apply with tenant migrate (tests use migrate_schemas)
```

- [ ] **Step 3: Create lead — add creator as observer**

In `LeadListView.post` (where assignee is set to creator), after save:

```python
lead.observers.add(acting_user(request))
```

- [ ] **Step 4: Comment POST accepts mentions**

In `LeadCommentListView.post`:

```python
from app_utils.board_observers import (
    add_observers_from_mentions,
    mention_user_ids,
    validate_mention_user_ids,
)

mentions = request.data.get("mentions") or []
ids = validate_mention_user_ids(mention_user_ids(mentions), permission_code="lead.view")
comment = models.LeadComment.objects.create(
    lead=lead,
    author=acting_user(request),
    body=body,
    mentions=mentions,
)
added = add_observers_from_mentions(lead, ids, actor=acting_user(request))
if added:
    services.record_event(
        lead,
        acting_user(request),
        models.LeadEvent.EventType.OBSERVER_ADDED,
        {"user_ids": added, "via": "mention"},
    )
```

- [ ] **Step 5: Observer + mention-candidate endpoints**

URLs:

```python
path("leads/mention-candidates", views.LeadMentionCandidatesView.as_view()),
path("leads/<int:obj_id>/observers", views.LeadObserverListView.as_view()),
path("leads/<int:obj_id>/observers/<int:user_id>", views.LeadObserverDetailView.as_view()),
```

- `GET leads/mention-candidates?q=` → `users_with_permission("lead.view")`, exclude pure students if any slip through, filter name/email by `q`, return minimal user list. Permission: `lead.view`.
- `POST leads/:id/observers` body `{ "user_id": N }` — validate `lead.view` on target; `lead.update` required. Record `OBSERVER_ADDED`.
- `DELETE leads/:id/observers/:user_id` — `lead.update`.

Expand `observers` on Lead serializer (`expandable_fields`).

- [ ] **Step 6: Wire `move_lead` email**

At end of successful status change in `move_lead` (after `STATUS_CHANGED` event), accept optional `tenant` or read from actor context — views must pass `request.tenant`:

```python
# In LeadMoveView after move_lead(...):
from app_utils.board_observers import email_observers_on_status_change

email_observers_on_status_change(
    tenant=request.tenant,
    entity=lead,
    actor=acting_user(request),
    subject=f"Lead status updated: {lead.name}",
    body_html=f"<p><strong>{lead.name}</strong> moved to <strong>{lead.status.name}</strong>.</p>",
    toggle_attr="notify_lead_observers_on_status_change",
)
```

Prefer calling from the view (has tenant) rather than service, unless you thread `tenant` into `move_lead`.

- [ ] **Step 7: Tests**

Extend `app_crm/tests/test_views.py`:

- Comment with mention adds observer.
- Mention of student / user without `lead.view` → 400.
- Move with toggle off → `send_mail` not called (mock).
- Move with toggle on → mail to observer except actor.
- Student still 403 on leads.

```bash
./scripts/run_backend_tests.sh app_crm.tests.test_views -v 2
```

- [ ] **Step 8: Ask user before commit**

---

### Task 4: RBAC `issue.*` permissions

**Files:**
- Modify: `app_rbac/catalog.py`, `app_rbac/defaults.py`
- Create: `app_issues/migrations/0002_seed_issue_permissions.py` (after app exists) **or** `app_rbac/migrations/…` — prefer data migration on `app_issues` mirroring CRM `0002_seed_crm_permissions.py`

- [ ] **Step 1: Catalog**

```python
    _p("issue.view", "View issues", "view the issues board", "Personal"),
    _p("issue.create", "Create issues", "create issues", "Personal"),
    _p("issue.update", "Edit issues", "edit issues and move them between columns", "Personal"),
    _p("issue.delete", "Delete issues", "delete issues", "Personal", sensitive=True),
    _p("issue.configure", "Configure issues", "configure issue statuses", "Operational"),
```

- [ ] **Step 2: Defaults**

Admin + manager: all five. Teacher: `issue.view` only. Student: none.

- [ ] **Step 3: Seed migration** (same `RunPython` pattern as CRM grants)

- [ ] **Step 4: Ask user before commit** (can land with Task 5)

---

### Task 5: `app_issues` app — models + registration

**Files:**
- Create: `app_issues/__init__.py`, `apps.py`, `models.py`, `admin.py` (optional empty)
- Modify: `schedjuice_backend/settings.py`, `schedjuice_backend/urls.py`

- [ ] **Step 1: `apps.py`**

```python
from django.apps import AppConfig

class AppIssuesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "app_issues"
```

- [ ] **Step 2: Models** (mirror CRM shapes; see spec)

`IssueStatus` with `Behavior`: `NORMAL`, `DONE`, `CANCELLED`.  
`Issue` with title, description, status, assignee, created_by, related_student, related_course, observers M2M.  
`IssueEvent`, `IssueComment` (with `mentions` JSONField).

- [ ] **Step 3: Register app**

Add `"app_issues"` to `TENANT_APPS` and `INSTALLED_APPS` next to `app_crm`.  
In `schedjuice_backend/urls.py`: `path("api/v1/", include("app_issues.urls"))`.

- [ ] **Step 4: Initial migration + seed statuses**

```bash
./env/bin/python manage.py makemigrations app_issues
```

Data migration seed (per tenant via `migrate_schemas`):

| order | name | color | behavior | is_default |
|------|------|-------|----------|------------|
| 0 | Open | `#64748b` | NORMAL | True |
| 1 | In progress | `#2563eb` | NORMAL | False |
| 2 | Done | `#16a34a` | DONE | False |
| 3 | Cancelled | `#94a3b8` | CANCELLED | False |

Include permission seed migration (Task 4) here.

- [ ] **Step 5: Ask user before commit**

---

### Task 6: `app_issues` services, serializers, views, URLs

**Files:**
- Create: `app_issues/services.py`, `serializers.py`, `views.py`, `urls.py`

- [ ] **Step 1: Services**

```python
@transaction.atomic
def move_issue(issue, target_status, *, actor):
    from_status = issue.status
    issue.status = target_status
    issue.save(update_fields=["status", "updated_at"])
    record_event(issue, actor, IssueEvent.EventType.STATUS_CHANGED, {
        "from": from_status.name if from_status else None,
        "to": target_status.name,
    })
    return issue
```

Create: set assignee + observer to creator; default status = `IssueStatus` with `is_default=True`.

- [ ] **Step 2: Views** — mirror CRM with `RBACView` / list/detail:

| Route | Permissions |
|-------|-------------|
| `issues` GET/POST | view / create |
| `issues/<id>` | view / update / delete |
| `issues/<id>/move` POST | update |
| `issues/<id>/comments` | view (GET+POST like leads) |
| `issues/<id>/timeline` | view |
| `issues/<id>/observers` | update for mutate |
| `issues/mention-candidates` | view |
| `issue-statuses` CRUD | configure |

After move, call `email_observers_on_status_change(..., toggle_attr="notify_issue_observers_on_status_change")`.  
Comments: validate mentions with `permission_code="issue.view"`.

- [ ] **Step 3: Serializers** — expandable status, assignee, observers, related_student, related_course, author.

- [ ] **Step 4: Ask user before commit**

---

### Task 7: `app_issues` API tests

**Files:**
- Create: `app_issues/tests/__init__.py`, `app_issues/tests/test_views.py`

- [ ] **Step 1: Base test class** — copy pattern from `app_crm/tests/test_views.py` (`schema_context`, `seed_rbac`, `HTTP_TENANT`, `RBAC_ENFORCE=enforce`).

- [ ] **Step 2: Cases**

1. Admin creates issue → assignee + observer = self; default Open status.
2. Admin moves issue → status event; with toggle on, `send_mail` mocked once to other observer.
3. Toggle off → no mail.
4. Comment `@mention` eligible user → observer added.
5. Mention ineligible → 400.
6. Teacher can GET board, cannot POST create (403) if defaults match Leads (teacher view-only).
7. Student 403 on `GET issues`.
8. `issue.configure` required for status create.

```bash
./scripts/run_backend_tests.sh app_issues.tests -v 2
```

- [ ] **Step 3: Ask user before commit**

---

### Task 8: FE kanban kit + unit tests

**Files:**
- Create: `src/lib/kanban-board.ts`, `src/lib/kanban-board.test.ts`
- Create: `src/components/kanban/kanban-board.tsx`, `kanban-column.tsx`, `kanban-card-shell.tsx`

- [ ] **Step 1: Failing tests for helpers**

```ts
// src/lib/kanban-board.test.ts
import { describe, expect, it } from "vitest";
import { applyOptimisticMove, groupByColumnId } from "./kanban-board";

describe("groupByColumnId", () => {
  it("groups items under column ids", () => {
    const columns = [{ id: 1 }, { id: 2 }];
    const items = [
      { id: 10, statusId: 1 },
      { id: 11, statusId: 2 },
      { id: 12, statusId: 1 },
    ];
    const grouped = groupByColumnId(columns, items, (i) => i.statusId);
    expect(grouped.get(1)?.map((i) => i.id)).toEqual([10, 12]);
    expect(grouped.get(2)?.map((i) => i.id)).toEqual([11]);
  });
});

describe("applyOptimisticMove", () => {
  it("patches status id on matching item", () => {
    const items = [{ id: 1, status: 1 }, { id: 2, status: 1 }];
    const next = applyOptimisticMove(items, 1, 9, (i) =>
      typeof i.status === "number" ? i.status : 0,
    );
    // Prefer a simpler API: applyOptimisticMove(items, id, newStatusId, patch)
    expect(next.find((i) => i.id === 1)?.status).toBe(9);
  });
});
```

Implement a clean API:

```ts
export function groupByColumnId<C extends { id: number }, T>(
  columns: C[],
  items: T[],
  getColumnId: (item: T) => number,
): Map<number, T[]> { ... }

export function applyOptimisticMove<T extends { id: number }>(
  items: T[],
  itemId: number,
  patch: (item: T) => T,
): T[] { ... }
```

- [ ] **Step 2:** `pnpm`/`npm run test:unit -- src/lib/kanban-board.test.ts` — fail then pass.

- [ ] **Step 3: Generic board components**

`KanbanBoard` props:

```ts
{
  columns: { id: number; name: string; color: string }[];
  itemsByColumn: Map<number, T[]> | Record<number, T[]>;
  getItemId: (item: T) => number;
  renderCard: (item: T, opts: { overlay?: boolean }) => ReactNode;
  onOpenItem: (item: T) => void;
  onMoveItem: (item: T, column: { id: number }) => void;
}
```

Lift DnD wiring from `leads-board.tsx` (`PointerSensor` distance 6, `closestCorners`, `DragOverlay`).

- [ ] **Step 4: Ask user before commit**

---

### Task 9: Refactor Leads onto kanban kit

**Files:**
- Modify: `src/components/leads/leads-board.tsx`, `lead-column.tsx`, `lead-card.tsx`
- Modify: `src/lib/leads-board.ts` — keep `resolveStatusChange`; delegate grouping to `kanban-board.ts`

- [ ] **Step 1:** `LeadsBoard` becomes a thin wrapper: map leads → `KanbanBoard` with `LeadCardContent` as `renderCard`; keep `sourceById` domain-only.

- [ ] **Step 2:** Manual smoke: Leads board drag + open still works.

- [ ] **Step 3: Ask user before commit**

---

### Task 10: Board-detail mentions + observers on Leads

**Files:**
- Create: `src/lib/board-mentions.ts` (re-export/filter helpers from `course-chat-mentions.ts`)
- Create: `src/components/board-detail/mention-comment-composer.tsx`, `observers-list.tsx`
- Modify: `src/components/leads/lead-detail-drawer.tsx`, `src/lib/leads-api.ts`, hooks

- [ ] **Step 1: API client**

```ts
postLeadComment(id, { body, mentions })
fetchLeadMentionCandidates(q?: string)
addLeadObserver(leadId, userId)
removeLeadObserver(leadId, userId)
```

- [ ] **Step 2: Composer**

Port contenteditable + `getActiveMentionQuery` pattern from course chat (not TipTap). Roster from `fetchLeadMentionCandidates`. On submit, `buildChatMentionsFromInsertions` → POST. Cmd/Ctrl+Enter. `isLoading` on Button while pending.

- [ ] **Step 3: Observers list** in drawer sidebar — chips + add (combobox of candidates) + remove.

- [ ] **Step 4: Ask user before commit**

---

### Task 11: Issues FE — types, API, hooks

**Files:**
- Create: `src/types/issue.ts`, `src/lib/issues-api.ts`, `src/hooks/issues/use-issues-board.ts`

- [ ] **Step 1: Types** — `IssueStatus`, `Issue`, `IssueTimelineItem`, helpers `issueStatusId`.

- [ ] **Step 2: API** — mirror leads-api paths under `issues` / `issue-statuses`.

- [ ] **Step 3: Hooks** — `issuesKeys`, `useIssues`, `useIssueStatuses`, `useMoveIssue` (optimistic via `applyOptimisticMove`), timeline/comment/observer mutations with invalidation.

- [ ] **Step 4: Unit test** optimistic helper usage if not already covered.

- [ ] **Step 5: Ask user before commit**

---

### Task 12: Issues UI pages

**Files:**
- Create: `src/components/issues/issues-view.tsx`, `issue-card.tsx`, `issue-detail-drawer.tsx`, `new-issue-dialog.tsx`, `issue-settings-panel.tsx`
- Create: `src/app/(internal)/issues/page.tsx`, `src/app/(internal)/issues/settings/page.tsx`

- [ ] **Step 1: Board page** — `IssuesView` uses `KanbanBoard`; card shows title, assignee, observer count, related student/course chips.

- [ ] **Step 2: New issue dialog** — title, description, optional student/course/assignee EntityCombobox patterns already used elsewhere.

- [ ] **Step 3: Detail drawer** — shared mention composer + observers; sidebar status/assignee/related links.

- [ ] **Step 4: Settings** — status CRUD like `crm-settings-panel.tsx`; gate with `issue.configure`.

- [ ] **Step 5: Ask user before commit**

---

### Task 13: Nav, route permissions, org toggles (FE)

**Files:**
- Modify: `src/config/nav-routes.tsx`, `src/config/route-permissions.ts`
- Modify: `src/types/organization.ts`, `src/config/organization-profile-sections.ts`

- [ ] **Step 1: Nav**

Add section (sibling to CRM or under it):

```tsx
{
  title: "Issues",
  icon: CircleDot, // or existing iconoir icon already used in project
  href: "/issues",
  requiredPermissions: ["issue.view"],
},
// settings child or separate entry with issue.configure
```

Prefer a small group:

```tsx
{
  title: "Trackers",
  children: [
    { title: "Leads", ... }, // optional regroup — OR keep CRM and add Issues as top-level
    { title: "Issues", href: "/issues", requiredPermissions: ["issue.view"] },
  ],
}
```

**Decision locked for implementers:** Issues live under the **CRM** nav group at `/crm/issues` and `/crm/issues/settings` (Leads at `/crm/leads`). No separate top-level Issues section.

- [ ] **Step 2: Route permissions**

```ts
{ prefix: "/crm/issues/settings", anyOf: ["issue.configure"] },
{ prefix: "/crm/issues", anyOf: ["issue.view"] },
{ prefix: "/crm/leads/settings", anyOf: ["crm.configure"] },
{ prefix: "/crm/leads", anyOf: ["lead.view"] },
```

Put settings routes **before** their parent board routes if matching is prefix-first.

- [ ] **Step 3: Org schema**

In `organizationFieldsSchema`:

```ts
notify_lead_observers_on_status_change: z.boolean().default(true)
  .describe("Email lead observers when status changes"),
notify_issue_observers_on_status_change: z.boolean().default(true)
  .describe("Email issue observers when status changes"),
```

Add section in `ORGANIZATION_PROFILE_EDIT_SECTIONS`:

```ts
{
  id: "boards",
  title: "Boards and trackers",
  description: "Email alerts for people watching leads or issues.",
  keys: [
    "notify_lead_observers_on_status_change",
    "notify_issue_observers_on_status_change",
  ],
},
```

Ensure section coverage assert still passes (every schema key listed once).

- [ ] **Step 4: Ask user before commit**

---

### Task 14: End-to-end smoke checklist

- [ ] **Step 1: Backend**

```bash
./scripts/run_backend_tests.sh app_utils.tests.test_board_observers app_crm.tests app_issues.tests -v 2
```

- [ ] **Step 2: Frontend unit**

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/lib/kanban-board.test.ts
```

- [ ] **Step 3: Manual (web)**

1. Login as admin (`james@schedjuice.com`) — see Issues in nav; open board; create issue; drag column; comment with `@` staff → appears in observers.
2. Toggle off “Email issue observers…” in org settings; move issue — no email (check logs / mock in staging).
3. Toggle on; move with a second observer — email sent.
4. Login as student — Issues hidden; `/issues` blocked.
5. Leads: mention still works; drag still triggers appointment/convert behaviors.

---

## Spec coverage self-review

| Spec requirement | Task |
|------------------|------|
| Reusable FE kanban | 8–9 |
| `app_issues` domain | 5–7 |
| Lead observers + mentions | 3 |
| Shared helpers + email | 2, 3, 6 |
| Org toggles | 1, 13 |
| RBAC + students excluded | 4, 7, 13 |
| Mention candidates | 3, 6, 10–12 |
| Configurable issue statuses | 5–6, 12 |
| Optional student/course links | 5, 12 |
| Web only / no Issues table | 12 (board only) |
| Email only (no push) | 2 |

No intentional TBDs. Commit steps always require user authorization per repo policy.
