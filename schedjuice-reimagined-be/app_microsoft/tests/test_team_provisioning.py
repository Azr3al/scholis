"""Tests for async Microsoft Teams course provisioning."""

import unittest
from datetime import date
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.db import connection
from django.test import TestCase
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import Category, Course, Program
from app_course.serializers import CourseSerializer
from app_microsoft.team_provisioning_helpers import (
    create_course_team_async,
    tenant_syncs_course_team_roster,
)
from app_organization.models import Organization

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False

def _mock_tenant(*, microsoft_on=True, teams_enabled=True):
    return SimpleNamespace(
        is_microsoft_on=microsoft_on,
        is_teams_creation_enabled=teams_enabled,
        schema_name="xschedjuice",
        private_key=None,
        domain_url="test.example",
    )

def _mock_request(tenant):
    # rest_flex_fields reads request.query_params.getlist(...) at serializer init.
    return SimpleNamespace(
        tenant=tenant,
        user=SimpleNamespace(id="test@example.com"),
        query_params=SimpleNamespace(getlist=lambda _field: []),
    )

class TenantSyncsCourseTeamRosterTests(unittest.TestCase):
    def test_false_when_microsoft_off(self):
        tenant = _mock_tenant(microsoft_on=False, teams_enabled=True)
        self.assertFalse(tenant_syncs_course_team_roster(tenant))

    def test_false_when_teams_creation_disabled(self):
        tenant = _mock_tenant(microsoft_on=True, teams_enabled=False)
        self.assertFalse(tenant_syncs_course_team_roster(tenant))

class CourseSerializerTeamProvisioningTests(unittest.TestCase):
    @staticmethod
    def _course_fk_mocks():
        category = MagicMock()
        category.name = "Test Category"
        category.is_payment_assignment_eligible = False
        program = MagicMock()
        program.name = "Test Program"
        program.course_creation_method = Program.CourseCreationMethod.MANUAL
        program.subject_strategy = Program.SubjectStrategy.NONE
        return category, program

    @patch("app_course.course_scoping.assign_creator_as_teacher_if_applicable")
    @patch(
        "app_course.serializers.User.get_user_from_request",
        return_value=MagicMock(
            roles=[User.UserRole.ADMIN],
            email="test@example.com",
        ),
    )
    @patch("app_course.serializers.schedule_post_team_provisioning")
    @patch("app_course.serializers.CreateTeamFlow")
    def test_create_provisions_team_sync_when_ms_and_teams_enabled(
        self, mock_flow_cls, mock_post_provision, _mock_user, _mock_assign
    ):
        mock_flow_cls.return_value.start.return_value = {
            "group_id": "grp-sync",
            "channel_id": "ch-sync",
        }
        tenant = _mock_tenant(microsoft_on=True, teams_enabled=True)
        request = _mock_request(tenant)
        ser = CourseSerializer(context={"request": request})
        category, program = self._course_fk_mocks()
        created = MagicMock(id=42, microsoft_group_id="grp-sync")

        with patch(
            "app_course.serializers.CourseSerializer._create_course_row",
            return_value=created,
        ) as mock_super_create:
            ser.create(
                {
                    "title": "Test Course",
                    "category": category,
                    "program": program,
                    "start_date": date(2026, 1, 1),
                    "end_date": date(2026, 12, 31),
                }
            )

        mock_flow_cls.assert_called_once()
        mock_super_create.assert_called_once()
        call_kwargs = mock_super_create.call_args[0][0]
        self.assertEqual(call_kwargs["microsoft_group_id"], "grp-sync")
        self.assertEqual(call_kwargs["microsoft_channel_id"], "ch-sync")
        mock_post_provision.assert_called_once()

    @patch("app_course.course_scoping.assign_creator_as_teacher_if_applicable")
    @patch(
        "app_course.serializers.User.get_user_from_request",
        return_value=MagicMock(
            roles=[User.UserRole.ADMIN],
            email="test@example.com",
        ),
    )
    @patch("app_course.serializers.schedule_post_team_provisioning")
    @patch("app_course.serializers.CreateTeamFlow")
    def test_admin_cannot_opt_out_when_ms_and_teams_enabled(
        self, mock_flow_cls, mock_post_provision, _mock_user, _mock_assign
    ):
        mock_flow_cls.return_value.start.return_value = {
            "group_id": "grp-no-opt-out",
            "channel_id": "ch-no-opt-out",
        }
        tenant = _mock_tenant(microsoft_on=True, teams_enabled=True)
        request = _mock_request(tenant)
        ser = CourseSerializer(context={"request": request})
        category, program = self._course_fk_mocks()
        created = MagicMock(id=43, microsoft_group_id="grp-no-opt-out")

        with patch(
            "app_course.serializers.CourseSerializer._create_course_row",
            return_value=created,
        ) as mock_super_create:
            ser.create(
                {
                    "title": "Opt-out ignored",
                    "category": category,
                    "program": program,
                    "start_date": date(2026, 1, 1),
                    "end_date": date(2026, 12, 31),
                    "create_microsoft_team": False,
                }
            )

        mock_flow_cls.assert_called_once()
        mock_super_create.assert_called_once()
        call_kwargs = mock_super_create.call_args[0][0]
        self.assertEqual(call_kwargs["microsoft_group_id"], "grp-no-opt-out")
        self.assertEqual(call_kwargs["microsoft_channel_id"], "ch-no-opt-out")
        mock_post_provision.assert_called_once()

    @patch("app_course.course_scoping.assign_creator_as_teacher_if_applicable")
    @patch(
        "app_course.serializers.User.get_user_from_request",
        return_value=MagicMock(
            roles=[User.UserRole.ADMIN],
            email="test@example.com",
        ),
    )
    @patch("django.db.transaction.on_commit", side_effect=lambda fn, **kw: fn())
    @patch("app_course.serializers.create_course_team_async.delay")
    @patch("app_microsoft.flows.CreateTeamFlow.start")
    def test_create_defers_team_provisioning_when_flag_set(
        self, mock_start, mock_delay, _mock_on_commit, _mock_user, _mock_assign
    ):
        tenant = _mock_tenant(microsoft_on=True, teams_enabled=True)
        request = _mock_request(tenant)
        ser = CourseSerializer(
            context={"request": request, "defer_team_provisioning": True},
        )
        category, program = self._course_fk_mocks()

        with patch(
            "app_course.serializers.CourseSerializer._create_course_row",
            return_value=MagicMock(id=42, microsoft_group_id=None),
        ):
            ser.create(
                {
                    "title": "Test Course",
                    "category": category,
                    "program": program,
                    "start_date": date(2026, 1, 1),
                    "end_date": date(2026, 12, 31),
                }
            )

        mock_start.assert_not_called()
        mock_delay.assert_called_once_with(42, "xschedjuice")

    @patch("app_course.course_scoping.assign_creator_as_teacher_if_applicable")
    @patch(
        "app_course.serializers.User.get_user_from_request",
        return_value=MagicMock(
            roles=[User.UserRole.ADMIN],
            email="test@example.com",
        ),
    )
    @patch("app_course.serializers.schedule_post_team_provisioning")
    @patch("app_microsoft.flows.CreateTeamFlow.start")
    def test_create_skips_team_when_teams_creation_disabled(
        self, mock_start, mock_post_provision, _mock_user, _mock_assign
    ):
        tenant = _mock_tenant(microsoft_on=True, teams_enabled=False)
        request = _mock_request(tenant)
        ser = CourseSerializer(context={"request": request})
        category, program = self._course_fk_mocks()

        with patch(
            "app_course.serializers.CourseSerializer._create_course_row",
            return_value=MagicMock(id=99, microsoft_group_id=None),
        ):
            ser.create(
                {
                    "title": "No Team Course",
                    "category": category,
                    "program": program,
                    "start_date": date(2026, 1, 1),
                    "end_date": date(2026, 12, 31),
                }
            )

        mock_start.assert_not_called()
        mock_post_provision.assert_not_called()

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class ProvisionCourseTeamTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        from django.core.management import call_command

        from schedjuice_backend.test_tenant_helpers import ensure_public_schema

        ensure_public_schema()
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", schema_name=cls.schema_name, verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def _tenant(self):
        return Organization.objects.filter(schema_name=self.schema_name).first()

    def _make_course(self):
        with schema_context(self.schema_name):
            category = Category.objects.first()
            if category is None:
                category = Category.objects.create(name=f"MS test category {id(self)}")
            program = Program.objects.filter(
                course_creation_method=Program.CourseCreationMethod.MANUAL
            ).first()
            if program is None:
                program = Program.objects.create(
                    name=f"MS test {id(self)}",
                    course_creation_method=Program.CourseCreationMethod.MANUAL,
                    subject_strategy=Program.SubjectStrategy.NONE,
                )
            return Course.objects.create(
                title=f"Team async {id(self)}",
                category=category,
                program=program,
                start_date=date(2026, 1, 1),
                end_date=date(2026, 12, 31),
                is_payment_enabled=False,
            )

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class CreateCourseTeamAsyncTests(ProvisionCourseTeamTests):
    def _set_teams_creation_enabled(self, enabled: bool) -> None:
        Organization.objects.filter(schema_name=self.schema_name).update(
            is_teams_creation_enabled=enabled
        )

    @patch("app_microsoft.team_provisioning_helpers.CreateTeamFlow")
    def test_sets_group_and_channel_ids(self, mock_flow_cls):
        mock_flow_cls.return_value.start.return_value = {
            "group_id": "grp-123",
            "channel_id": "ch-456",
        }
        tenant = self._tenant()
        self._set_teams_creation_enabled(True)
        with schema_context(self.schema_name):
            course = self._make_course()
            create_course_team_async(course.id, tenant.schema_name)
            course.refresh_from_db()
            self.assertEqual(course.microsoft_group_id, "grp-123")
            self.assertEqual(course.microsoft_channel_id, "ch-456")

    @patch("app_microsoft.team_provisioning_helpers.CreateTeamFlow")
    def test_idempotent_when_group_already_set(self, mock_flow_cls):
        tenant = self._tenant()
        with schema_context(self.schema_name):
            course = self._make_course()
            course.microsoft_group_id = "existing-grp"
            course.save(update_fields=["microsoft_group_id"])
            create_course_team_async(course.id, tenant.schema_name)
        mock_flow_cls.assert_not_called()

    @patch("app_microsoft.team_provisioning_helpers.CreateTeamFlow")
    def test_skips_when_teams_creation_disabled_on_tenant(self, mock_flow_cls):
        tenant = self._tenant()
        self._set_teams_creation_enabled(False)
        with schema_context(self.schema_name):
            course = self._make_course()
            create_course_team_async(course.id, tenant.schema_name)
            course.refresh_from_db()
            self.assertIsNone(course.microsoft_group_id)
        mock_flow_cls.assert_not_called()

    @patch(
        "app_microsoft.team_provisioning_helpers.is_first_month_of_course",
        return_value=False,
    )
    @patch("app_microsoft.team_provisioning_helpers.CreateTeamFlow")
    def test_schedules_payment_assignment_when_eligible(
        self,
        mock_flow_cls,
        _mock_first_month,
    ):
        mock_flow = mock_flow_cls.return_value
        mock_flow.start.return_value = {"group_id": "grp-pay"}
        tenant = self._tenant()
        self._set_teams_creation_enabled(True)
        today = date.today()
        with schema_context(self.schema_name):
            category = Category.objects.filter(
                is_payment_assignment_eligible=True
            ).first()
            if category is None:
                category = Category.objects.first()
                category.is_payment_assignment_eligible = True
                category.save(update_fields=["is_payment_assignment_eligible"])
            program = Program.objects.filter(
                course_creation_method=Program.CourseCreationMethod.MANUAL
            ).first()
            course = Course.objects.create(
                title=f"Pay assign {id(self)}",
                category=category,
                program=program,
                start_date=date(today.year - 1, 1, 1),
                end_date=date(today.year + 1, 12, 31),
                is_payment_enabled=True,
            )
            create_course_team_async(course.id, tenant.schema_name)
        mock_flow.schedule_payment_assignment.assert_called_once()
