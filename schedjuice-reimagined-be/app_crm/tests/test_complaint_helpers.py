from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch

from django.core.exceptions import ValidationError
from django.http import Http404
from django.test import SimpleTestCase

from app_crm.complaint_helpers import (
    ANONYMOUS_ACTOR_MINI,
    ANONYMOUS_PARENT_COMPLAINT_TITLE,
    build_parent_complaint_title,
    crm_enabled_or_404,
    description_from_complaint_body,
    is_complaint_student_actor,
    redact_issue_payload_for_staff,
    redact_timeline_actor_for_staff,
    should_redact_complaint_identity,
    student_safe_timeline_items,
    validate_complaint_message_body,
)
from app_crm.models import IssueEvent, IssueSource


class ComplaintMessageValidationTests(SimpleTestCase):
    def test_rejects_empty_body_and_attachments(self):
        with self.assertRaises(ValidationError):
            validate_complaint_message_body(body="", attachments=[])

    def test_rejects_whitespace_only_body_without_attachments(self):
        with self.assertRaises(ValidationError):
            validate_complaint_message_body(body="   ", attachments=[])

    @patch("app_crm.complaint_helpers.validate_chat_attachment_refs")
    def test_allows_attachments_only(self, mock_validate):
        body = validate_complaint_message_body(
            body="",
            attachments=[{"attachment_id": 1}],
            user=object(),
        )
        self.assertEqual(body, "")
        mock_validate.assert_called_once()

    @patch("app_crm.complaint_helpers.validate_chat_attachment_refs")
    def test_normalizes_body_whitespace(self, mock_validate):
        body = validate_complaint_message_body(body="  hello  ", attachments=[])
        self.assertEqual(body, "hello")
        mock_validate.assert_not_called()

    def test_title_includes_student_name(self):
        class Stub:
            name = "Aung Min"

        self.assertEqual(build_parent_complaint_title(Stub()), "Parent complaint — Aung Min")

    def test_anonymous_title_omits_student_name(self):
        class Stub:
            name = "Aung Min"

        self.assertEqual(
            build_parent_complaint_title(Stub(), is_anonymous=True),
            ANONYMOUS_PARENT_COMPLAINT_TITLE,
        )

    def test_description_fallback_for_attachment_only(self):
        text = description_from_complaint_body("", [{"attachment_id": 1}])
        self.assertEqual(text, "Sent an attachment.")

    def test_description_uses_body_when_present(self):
        text = description_from_complaint_body("Bus late", [{"attachment_id": 1}])
        self.assertEqual(text, "Bus late")


class StudentSafeTimelineTests(SimpleTestCase):
    def _event(self, event_id, event_type, payload=None, created_at=None):
        class StubEvent:
            pass

        event = StubEvent()
        event.id = event_id
        event.event_type = event_type
        event.payload = payload or {}
        event.actor = None
        event.created_at = created_at or datetime(2026, 1, 1, tzinfo=timezone.utc)
        return event

    def _comment(self, comment_id, body, attachments=None, created_at=None):
        class StubComment:
            pass

        comment = StubComment()
        comment.id = comment_id
        comment.body = body
        comment.attachments = attachments or []
        comment.author = None
        comment.created_at = created_at or datetime(2026, 1, 2, tzinfo=timezone.utc)
        return comment

    def test_includes_comments_with_attachments(self):
        comment = self._comment(1, "See photo", [{"attachment_id": 9}])
        items = student_safe_timeline_items([], [comment])
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["kind"], "comment")
        self.assertEqual(items[0]["attachments"], [{"attachment_id": 9}])

    def test_includes_created_and_status_events_only(self):
        events = [
            self._event(1, IssueEvent.EventType.CREATED, created_at=datetime(2026, 1, 1, tzinfo=timezone.utc)),
            self._event(2, IssueEvent.EventType.STATUS_CHANGED, {"to": "Done"}, created_at=datetime(2026, 1, 3, tzinfo=timezone.utc)),
            self._event(3, IssueEvent.EventType.ASSIGNEE_CHANGED, created_at=datetime(2026, 1, 4, tzinfo=timezone.utc)),
            self._event(4, IssueEvent.EventType.OBSERVER_ADDED, created_at=datetime(2026, 1, 5, tzinfo=timezone.utc)),
        ]
        items = student_safe_timeline_items(events, [])
        event_types = {item["event_type"] for item in items if item["kind"] == "event"}
        self.assertEqual(event_types, {IssueEvent.EventType.CREATED, IssueEvent.EventType.STATUS_CHANGED})

    def test_status_changed_uses_student_friendly_message(self):
        events = [
            self._event(1, IssueEvent.EventType.STATUS_CHANGED, {"from": "Open", "to": "Done"}),
        ]
        items = student_safe_timeline_items(events, [])
        self.assertEqual(items[0]["message"], "Your complaint was marked resolved")

    def test_reopen_status_uses_student_friendly_message(self):
        events = [
            self._event(
                1,
                IssueEvent.EventType.STATUS_CHANGED,
                {"from": "Done", "to": "Open"},
            ),
        ]
        items = student_safe_timeline_items(events, [])
        self.assertEqual(items[0]["message"], "Your complaint was reopened")

    def test_timeline_sorted_by_created_at(self):
        early = datetime(2026, 1, 1, tzinfo=timezone.utc)
        late = datetime(2026, 1, 3, tzinfo=timezone.utc)
        events = [self._event(1, IssueEvent.EventType.CREATED, created_at=late)]
        comments = [self._comment(2, "hi", created_at=early)]
        items = student_safe_timeline_items(events, comments)
        self.assertEqual([item["id"] for item in items], [2, 1])


class ComplaintActorHelperTests(SimpleTestCase):
    @patch("app_crm.complaint_helpers.effective_permissions")
    def test_student_actor_with_complaint_view_own(self, mock_perms):
        mock_perms.return_value = frozenset(
            {"complaint.create", "complaint.view_own", "complaint.comment"}
        )
        user = SimpleNamespace(is_student=lambda: True)
        self.assertTrue(is_complaint_student_actor(user))

    @patch("app_crm.complaint_helpers.effective_permissions")
    def test_staff_with_issue_view_is_not_student_actor(self, mock_perms):
        mock_perms.return_value = frozenset({"issue.view", "complaint.view_own"})
        user = SimpleNamespace(is_student=lambda: False)
        self.assertFalse(is_complaint_student_actor(user))

    @patch("app_crm.complaint_helpers.effective_permissions")
    def test_non_student_with_complaint_view_own_is_not_student_actor(self, mock_perms):
        mock_perms.return_value = frozenset({"complaint.view_own"})
        user = SimpleNamespace(is_student=lambda: False)
        self.assertFalse(is_complaint_student_actor(user))

    @patch("app_crm.complaint_helpers.effective_permissions")
    def test_user_without_complaint_view_own_is_not_student_actor(self, mock_perms):
        mock_perms.return_value = frozenset({"course.view"})
        user = SimpleNamespace(is_student=lambda: True)
        self.assertFalse(is_complaint_student_actor(user))

    @patch("app_crm.complaint_helpers.effective_permissions")
    def test_jwt_token_user_without_is_student_method_is_not_student_actor(self, mock_perms):
        mock_perms.return_value = frozenset({"complaint.view_own"})
        user = SimpleNamespace(is_student=None)
        self.assertFalse(is_complaint_student_actor(user))

class CrmEnabledGateTests(SimpleTestCase):
    def test_raises_404_when_crm_disabled(self):
        class Tenant:
            is_crm_enabled = False

        with self.assertRaises(Http404):
            crm_enabled_or_404(Tenant())

    def test_no_op_when_crm_enabled(self):
        class Tenant:
            is_crm_enabled = True

        crm_enabled_or_404(Tenant())


class AnonymousRedactionHelperTests(SimpleTestCase):
    def _issue(self, *, is_anonymous: bool = True):
        return SimpleNamespace(
            source=IssueSource.PARENT_COMPLAINT,
            is_anonymous=is_anonymous,
        )

    @patch("app_crm.complaint_helpers.effective_permissions")
    def test_should_redact_for_staff_viewing_anonymous_complaint(self, mock_perms):
        mock_perms.return_value = frozenset({"issue.view"})
        staff = SimpleNamespace(is_student=lambda: False)
        self.assertTrue(should_redact_complaint_identity(self._issue(), staff))

    @patch("app_crm.complaint_helpers.effective_permissions")
    def test_should_not_redact_for_student_viewer(self, mock_perms):
        mock_perms.return_value = frozenset({"complaint.view_own"})
        student = SimpleNamespace(is_student=lambda: True)
        self.assertFalse(should_redact_complaint_identity(self._issue(), student))

    def test_should_not_redact_named_complaint(self):
        staff = SimpleNamespace(is_student=lambda: False)
        issue = self._issue(is_anonymous=False)
        with patch(
            "app_crm.complaint_helpers.is_complaint_student_actor",
            return_value=False,
        ):
            self.assertFalse(should_redact_complaint_identity(issue, staff))

    def test_redact_issue_payload_nulls_student_fields(self):
        payload = {
            "id": 1,
            "related_student": {"id": 9, "name": "Student"},
            "created_by": {"id": 9, "name": "Student"},
        }
        redacted = redact_issue_payload_for_staff(payload)
        self.assertIsNone(redacted["related_student"])
        self.assertIsNone(redacted["created_by"])

    def test_redact_timeline_actor_for_filing_student(self):
        item = {
            "kind": "comment",
            "actor": {"id": 9, "name": "Student", "email": "s@example.com"},
        }
        redacted = redact_timeline_actor_for_staff(item, related_student_id=9)
        self.assertEqual(redacted["actor"], ANONYMOUS_ACTOR_MINI)

    def test_redact_timeline_actor_leaves_staff_unchanged(self):
        item = {
            "kind": "comment",
            "actor": {"id": 2, "name": "Admin", "email": "a@example.com"},
        }
        redacted = redact_timeline_actor_for_staff(item, related_student_id=9)
        self.assertEqual(redacted["actor"]["name"], "Admin")
