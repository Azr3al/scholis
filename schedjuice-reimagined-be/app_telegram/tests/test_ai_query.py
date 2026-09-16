import unittest
from datetime import date
from uuid import uuid4
from unittest.mock import patch

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.client import AIResult
from app_ai.exceptions import AIQuotaExceeded
from app_auth.models import User
from app_organization.models import Organization
from app_rbac.seeding import seed_rbac
from app_telegram.binding import handle_message
from app_telegram.tasks import run_ai_query

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False

def _private_message(*, tg_user_id: int, chat_id: int, text: str, message_id: int = 42) -> dict:
    return {
        "message_id": message_id,
        "from": {"id": tg_user_id},
        "chat": {"id": chat_id, "type": "private"},
        "text": text,
    }

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class TelegramFreeTextHandlerTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        with schema_context(get_public_schema_name()):
            self.org = Organization.objects.get(schema_name=self.schema_name)
            self.org.name = "Test School"
            self.org.save()
        with schema_context(self.schema_name):
            seed_rbac()
            self.admin = User.objects.create_user(
                email=f"a-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Admin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
                telegram_user_id=9001,
                telegram_chat_id=9001,
            )
            self.teacher = User.objects.create_user(
                email=f"t-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
                telegram_user_id=9002,
                telegram_chat_id=9002,
            )

    @patch("app_telegram.binding.TelegramClient")
    def test_unlinked_user_gets_link_prompt(self, MockClient):
        with schema_context(self.schema_name):
            handle_message(
                self.org,
                _private_message(tg_user_id=9999, chat_id=9999, text="Find Sarah"),
            )
        MockClient.return_value.send_message.assert_called_once_with(
            9999,
            "Your Telegram isn't linked to Test School yet. Sign in to link your account.",
        )

    @patch("app_telegram.binding.TelegramClient")
    def test_linked_user_without_permission_gets_denial(self, MockClient):
        with schema_context(self.schema_name):
            handle_message(
                self.org,
                _private_message(
                    tg_user_id=self.teacher.telegram_user_id,
                    chat_id=self.teacher.telegram_chat_id,
                    text="Find Sarah",
                ),
            )
        MockClient.return_value.send_message.assert_called_once_with(
            self.teacher.telegram_chat_id,
            "You don't have access to the Test School assistant.",
        )

    @patch("app_telegram.binding.pick_ai_pending_message", return_value="Looking up…")
    @patch("app_telegram.binding.random.choice", return_value="👀")
    @patch("app_telegram.binding.TelegramClient")
    @patch("app_telegram.tasks.run_ai_query")
    def test_linked_admin_enqueues_ai_query(
        self, mock_run_ai_query, MockClient, _mock_choice, _mock_pending
    ):
        MockClient.return_value.send_message.return_value = {"message_id": 501}
        with schema_context(self.schema_name):
            handle_message(
                self.org,
                _private_message(
                    tg_user_id=self.admin.telegram_user_id,
                    chat_id=self.admin.telegram_chat_id,
                    text="Find Sarah in Grade 7",
                    message_id=99,
                ),
            )
        MockClient.return_value.set_message_reaction.assert_called_once_with(
            self.admin.telegram_chat_id, 99, "👀"
        )
        MockClient.return_value.send_message.assert_called_once_with(
            self.admin.telegram_chat_id,
            "Looking up…",
            parse_mode=None,
            reply_to_message_id=None,
        )
        mock_run_ai_query.delay.assert_called_once_with(
            self.admin.id,
            self.schema_name,
            chat_id=self.admin.telegram_chat_id,
            prompt="Find Sarah in Grade 7",
            history=[],
            user_message_id=99,
            ack_message_id=501,
            channel_key=f"telegram:{self.admin.telegram_chat_id}",
        )

    @patch("app_telegram.tasks.run_ai_query")
    def test_slash_commands_are_ignored(self, mock_run_ai_query):
        with schema_context(self.schema_name):
            handle_message(
                self.org,
                _private_message(
                    tg_user_id=self.admin.telegram_user_id,
                    chat_id=self.admin.telegram_chat_id,
                    text="/help",
                ),
            )
        mock_run_ai_query.delay.assert_not_called()

    @patch("app_telegram.binding.TelegramClient")
    @patch("app_telegram.tasks.run_ai_query")
    def test_obvious_math_rejected_sync_without_enqueue(
        self, mock_run_ai_query, MockClient
    ):
        with schema_context(self.schema_name):
            handle_message(
                self.org,
                _private_message(
                    tg_user_id=self.admin.telegram_user_id,
                    chat_id=self.admin.telegram_chat_id,
                    text="what is 2 + 2525 ?",
                    message_id=100,
                ),
            )
        mock_run_ai_query.delay.assert_not_called()
        MockClient.return_value.send_message.assert_called()
        sent = MockClient.return_value.send_message.call_args[0][1]
        self.assertIn(self.org.name, sent)

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class TelegramRunAiQueryTaskTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        with schema_context(get_public_schema_name()):
            self.org = Organization.objects.get(schema_name=self.schema_name)
        with schema_context(self.schema_name):
            self.admin = User.objects.create_user(
                email=f"a-{uuid4().hex[:6]}@e.com",
                password="x",
                name="Admin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )

    @patch("app_telegram.tasks.TelegramClient")
    @patch("app_telegram.tasks.AIService")
    def test_dm_success_edits_ack_message(self, MockAIService, MockClient):
        MockAIService.return_value.run.return_value = AIResult(
            text="Found 2 students named Sarah.",
            model="gpt-5.6-luna",
            iterations=1,
        )
        with schema_context(self.schema_name):
            run_ai_query(
                self.admin.id,
                self.schema_name,
                chat_id=12345,
                prompt="Find Sarah",
                user_message_id=99,
                ack_message_id=777,
            )
        MockClient.return_value.edit_message_text.assert_called_once()
        call = MockClient.return_value.edit_message_text.call_args
        self.assertEqual(call.args[:3], (12345, 777, "Found 2 students named Sarah."))
        self.assertEqual(call.kwargs.get("parse_mode"), "HTML")
        MockClient.return_value.send_message.assert_not_called()

    @patch("app_telegram.tasks.TelegramClient")
    @patch("app_telegram.tasks.AIService")
    def test_pending_confirm_edits_ack_with_keyboard(self, MockAIService, MockClient):
        from app_ai.confirmation import save_write_confirmation

        MockAIService.return_value.run.return_value = AIResult(
            text="I have initiated the removal...",
            model="gpt-5.6-luna",
            iterations=1,
        )
        with schema_context(self.schema_name):
            save_write_confirmation(
                user=self.admin,
                channel_key="telegram:12345",
                tool_name="remove_staff_from_course",
                action="remove_staff",
                execution_payload={"course_id": 1, "staff_id": 2},
                summary="legacy",
                preview={
                    "staff": {"name": "Thiha"},
                    "course": {"title": "KET 152 WE"},
                },
            )
            run_ai_query(
                self.admin.id,
                self.schema_name,
                chat_id=12345,
                prompt="remove him",
                user_message_id=99,
                ack_message_id=777,
            )
        MockClient.return_value.edit_message_text.assert_called_once()
        self.assertIn("reply_markup", MockClient.return_value.edit_message_text.call_args.kwargs)
        self.assertIn("Remove Thiha", MockClient.return_value.edit_message_text.call_args.args[2])
        MockClient.return_value.send_message.assert_not_called()

    @patch("app_telegram.tasks.TelegramClient")
    @patch("app_telegram.tasks.AIService")
    def test_group_success_replies_to_user_message(self, MockAIService, MockClient):
        MockAIService.return_value.run.return_value = AIResult(
            text="Found 2 students named Sarah.",
            model="gpt-5.6-luna",
            iterations=1,
        )
        with schema_context(self.schema_name):
            run_ai_query(
                self.admin.id,
                self.schema_name,
                chat_id=12345,
                prompt="Find Sarah",
                user_message_id=99,
            )
        MockClient.return_value.send_message.assert_called_once()
        call = MockClient.return_value.send_message.call_args
        self.assertEqual(call.args[:2], (12345, "Found 2 students named Sarah."))
        self.assertEqual(call.kwargs.get("reply_to_message_id"), 99)
        MockClient.return_value.edit_message_text.assert_not_called()

    @patch("app_telegram.tasks.TelegramClient")
    def test_disabled_ai_sends_disabled_message(self, MockClient):
        with schema_context(get_public_schema_name()):
            self.org.is_ai_enabled = False
            self.org.save(update_fields=["is_ai_enabled"])
        with schema_context(self.schema_name):
            run_ai_query(
                self.admin.id,
                self.schema_name,
                chat_id=12345,
                prompt="Find Sarah",
                user_message_id=99,
                ack_message_id=777,
            )
        MockClient.return_value.edit_message_text.assert_called_once_with(
            12345,
            777,
            "AI assistant is disabled for your school.",
            parse_mode=None,
            reply_markup=None,
        )

    @patch("app_telegram.tasks.TelegramClient")
    @patch("app_telegram.tasks.AIService")
    def test_quota_exceeded_sends_graceful_reply(self, MockAIService, MockClient):
        MockAIService.return_value.run.side_effect = AIQuotaExceeded("limit reached")
        with schema_context(self.schema_name):
            run_ai_query(
                self.admin.id,
                self.schema_name,
                chat_id=12345,
                prompt="Find Sarah",
                user_message_id=99,
                ack_message_id=777,
            )
        MockClient.return_value.edit_message_text.assert_called_once_with(
            12345,
            777,
            "The school's monthly AI limit has been reached. Please contact an administrator.",
            parse_mode=None,
            reply_markup=None,
        )

    @patch("app_telegram.tasks.TelegramClient")
    @patch("app_telegram.tasks.AIService")
    def test_runtime_error_sends_unavailable_reply(self, MockAIService, MockClient):
        MockAIService.return_value.run.side_effect = RuntimeError("OPENAI_API_KEY is not configured.")
        with schema_context(self.schema_name):
            run_ai_query(
                self.admin.id,
                self.schema_name,
                chat_id=12345,
                prompt="Find Sarah",
                user_message_id=99,
                ack_message_id=777,
            )
        MockClient.return_value.edit_message_text.assert_called_once_with(
            12345,
            777,
            "The assistant isn't available right now. Please try again later.",
            parse_mode=None,
            reply_markup=None,
        )

    @patch("app_telegram.tasks.TelegramClient")
    @patch("app_telegram.tasks.AIService")
    def test_generic_error_sends_fallback_reply(self, MockAIService, MockClient):
        MockAIService.return_value.run.side_effect = Exception("boom")
        with schema_context(self.schema_name):
            run_ai_query(
                self.admin.id,
                self.schema_name,
                chat_id=12345,
                prompt="Find Sarah",
                user_message_id=99,
                ack_message_id=777,
            )
        MockClient.return_value.edit_message_text.assert_called_once_with(
            12345,
            777,
            "Sorry, something went wrong handling your request.",
            parse_mode=None,
            reply_markup=None,
        )

    @patch("app_telegram.tasks.TelegramClient")
    @patch("app_telegram.tasks.AIService")
    def test_blocked_math_sends_refusal_with_org_name(self, MockAIService, MockClient):
        from app_ai.exceptions import AIPromptBlocked

        MockAIService.return_value.run.side_effect = AIPromptBlocked(
            f"I can only help with {self.org.name} operations — things like students, staff, courses, schedules, and attendance. Try rephrasing your question.",
            reason="heuristic_reject",
        )
        with schema_context(self.schema_name):
            run_ai_query(
                self.admin.id,
                self.schema_name,
                chat_id=12345,
                prompt="what is 2 + 2525",
                user_message_id=99,
                ack_message_id=777,
            )
        MockClient.return_value.edit_message_text.assert_called_once()
        sent_text = MockClient.return_value.edit_message_text.call_args[0][2]
        self.assertIn(self.org.name, sent_text)

    @patch("app_telegram.tasks.TelegramClient")
    @patch("app_telegram.tasks.AIService")
    def test_success_formats_markdown_links_and_strips_ids(
        self, MockAIService, MockClient
    ):
        MockAIService.return_value.run.return_value = AIResult(
            text=(
                "Student [Bruce](https://schedjuice.thiha.net/users/3812) "
                "(bruce@school.com) (ID: 3812) is enrolled in:\n"
                "* [test course 3](https://schedjuice.thiha.net/courses/94) (Course ID: 94)"
            ),
            model="gpt-5.6-luna",
            iterations=2,
        )
        with schema_context(self.schema_name):
            run_ai_query(
                self.admin.id,
                self.schema_name,
                chat_id=12345,
                prompt="which courses is Bruce taking?",
                user_message_id=99,
                ack_message_id=777,
            )
        sent = MockClient.return_value.edit_message_text.call_args[0][2]
        self.assertIn(
            '<a href="https://schedjuice.thiha.net/users/3812">Bruce</a>',
            sent,
        )
        self.assertIn("(bruce@school.com)", sent)
        self.assertNotIn("(ID: 3812)", sent)
        self.assertIn(
            '<a href="https://schedjuice.thiha.net/courses/94">test course 3</a>',
            sent,
        )
        self.assertNotIn("Course ID: 94", sent)

    @patch("app_telegram.tasks.TelegramClient")
    @patch("app_telegram.tasks.AIService")
    def test_empty_answer_gets_fallback(self, MockAIService, MockClient):
        MockAIService.return_value.run.return_value = AIResult(
            text="",
            model="gpt-5.6-luna",
            iterations=1,
        )
        with schema_context(self.schema_name):
            run_ai_query(
                self.admin.id,
                self.schema_name,
                chat_id=12345,
                prompt="Find Sarah",
                user_message_id=99,
                ack_message_id=777,
            )
        MockClient.return_value.edit_message_text.assert_called_once_with(
            12345,
            777,
            "I couldn't find an answer.",
            parse_mode="HTML",
            reply_markup=None,
        )

    @patch("app_telegram.tasks.TelegramClient")
    @patch("app_telegram.tasks.AIService")
    def test_dm_edit_failure_falls_back_to_send_message(self, MockAIService, MockClient):
        from app_telegram.client import TelegramApiError

        MockAIService.return_value.run.return_value = AIResult(
            text="Done.",
            model="gpt-5.6-luna",
            iterations=1,
        )
        MockClient.return_value.edit_message_text.side_effect = TelegramApiError(
            "editMessageText", "message to edit not found"
        )
        with schema_context(self.schema_name):
            run_ai_query(
                self.admin.id,
                self.schema_name,
                chat_id=12345,
                prompt="Find Sarah",
                user_message_id=99,
                ack_message_id=777,
            )
        MockClient.return_value.send_message.assert_called_once_with(
            12345,
            "Done.",
            parse_mode="HTML",
            reply_to_message_id=None,
            reply_markup=None,
        )
