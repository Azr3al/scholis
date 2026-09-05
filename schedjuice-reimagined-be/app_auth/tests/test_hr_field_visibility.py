"""Contract tests for HR field visibility on user read/write."""

import unittest
from datetime import date
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_auth.serializers import (
    HR_FIELD_NAMES,
    UserSerializer,
    _actor_can_view_hr_fields,
    _redact_hr_fields,
)
from app_organization.models import Organization
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


def _tenant(*, hr_enabled=True):
    return SimpleNamespace(is_hr_fields_enabled=hr_enabled)


def _request(*, actor, tenant=None):
    tenant = tenant or _tenant()
    return SimpleNamespace(tenant=tenant, user=actor, query_params=SimpleNamespace(getlist=lambda _f: []))


def _instance(**overrides):
    base = dict(
        pk=99,
        id=99,
        name="Staff Member",
        roles=[User.UserRole.TEACHER],
        contract_expiry_date=date(2026, 12, 31),
        probation_end_date=date(2026, 6, 30),
        employment_start_date=date(2025, 1, 1),
        employment_type="full_time",
        custom_data={},
        created_at=None,
        scoped_programs=SimpleNamespace(values_list=lambda *a, **k: []),
        scoped_categories=SimpleNamespace(values_list=lambda *a, **k: []),
    )
    base.update(overrides)
    return SimpleNamespace(**base)


class UserSerializerHrFieldUnitTests(unittest.TestCase):
    def test_actor_can_view_hr_fields_admin_only(self):
        tenant = _tenant(hr_enabled=True)
        admin = SimpleNamespace(roles=[User.UserRole.ADMIN])
        manager = SimpleNamespace(roles=[User.UserRole.MANAGER])
        teacher = SimpleNamespace(roles=[User.UserRole.TEACHER])
        self.assertTrue(_actor_can_view_hr_fields(admin, tenant))
        self.assertFalse(_actor_can_view_hr_fields(manager, tenant))
        self.assertFalse(_actor_can_view_hr_fields(teacher, tenant))

    def test_redact_hr_fields_removes_keys(self):
        payload = {
            "name": "Staff",
            "contract_expiry_date": "2026-12-31",
            "employment_type": "full_time",
        }
        _redact_hr_fields(payload)
        self.assertEqual(payload["name"], "Staff")
        self.assertNotIn("contract_expiry_date", payload)
        self.assertNotIn("employment_type", payload)

    @patch("app_auth.serializers.acting_user")
    @patch("app_auth.serializers.representation_custom_data", return_value={})
    def test_to_representation_redacts_for_teacher(
        self, _custom_data_mock, acting_user_mock
    ):
        teacher = SimpleNamespace(roles=[User.UserRole.TEACHER], email="teacher@example.com")
        acting_user_mock.return_value = teacher
        instance = _instance()
        ser = UserSerializer(
            instance=instance,
            context={"request": _request(actor=teacher)},
        )
        with patch(
            "utilitas.serializers.BaseModelSerializer.to_representation",
            return_value={
                "id": 99,
                "name": "Staff Member",
                "contract_expiry_date": "2026-12-31",
                "probation_end_date": "2026-06-30",
                "employment_start_date": "2025-01-01",
                "employment_type": "full_time",
            },
        ):
            data = ser.to_representation(instance)
        for key in HR_FIELD_NAMES:
            self.assertNotIn(key, data)

    @patch("app_auth.serializers.acting_user")
    def test_manager_patch_strips_hr_fields(self, acting_user_mock):
        manager = SimpleNamespace(
            id=7,
            roles=[User.UserRole.MANAGER],
            email="manager@example.com",
        )
        acting_user_mock.return_value = manager
        instance = _instance(id=7)
        ser = UserSerializer(
            instance=instance,
            data={"employment_type": "part_time", "name": "Staff Member"},
            partial=True,
            context={"request": _request(actor=manager)},
        )
        incoming = {"employment_type": "part_time", "name": "Staff Member"}
        with patch(
            "utilitas.serializers.BaseModelSerializer.validate",
            return_value=incoming,
        ):
            validated = ser.validate(dict(incoming))
        self.assertNotIn("employment_type", validated)
        self.assertEqual(validated["name"], "Staff Member")


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class UserHrFieldApiTests(TestCase):
    schema_name = "xschedjuice"
    api_prefix = "/api/v1"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        self.client = APIClient()
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(
                is_hr_fields_enabled=True
            )
        with schema_context(self.schema_name):
            seed_rbac()
            self.subject = User.objects.create_user(
                email=f"hr-subject-{suffix}@example.com",
                password="x",
                name="HR Subject",
                phone_number="1",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"hr-subject-{suffix}@example.com",
                code=f"hr-subject-{suffix}",
                roles=[User.UserRole.TEACHER],
                contract_expiry_date=date(2026, 12, 31),
                probation_end_date=date(2026, 6, 30),
                employment_start_date=date(2025, 1, 1),
                employment_type=User.EmploymentType.FULL_TIME,
            )
            self.admin = User.objects.filter(roles__contains=[User.UserRole.ADMIN]).first()
            if self.admin is None:
                self.admin = User.objects.create_user(
                    email=f"hr-admin-{suffix}@example.com",
                    password="x",
                    name="HR Admin",
                    phone_number="2",
                    date_of_birth=date(1990, 1, 1),
                    communication_email=f"hr-admin-{suffix}@example.com",
                    code=f"hr-admin-{suffix}",
                    roles=[User.UserRole.ADMIN],
                )
            self.manager = User.objects.create_user(
                email=f"hr-manager-{suffix}@example.com",
                password="x",
                name="HR Manager",
                phone_number="3",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"hr-manager-{suffix}@example.com",
                code=f"hr-manager-{suffix}",
                roles=[User.UserRole.MANAGER],
            )
            self.teacher = User.objects.create_user(
                email=f"hr-teacher-{suffix}@example.com",
                password="x",
                name="HR Teacher",
                phone_number="4",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"hr-teacher-{suffix}@example.com",
                code=f"hr-teacher-{suffix}",
                roles=[User.UserRole.TEACHER],
                contract_expiry_date=date(2027, 3, 15),
                employment_type=User.EmploymentType.PART_TIME,
            )

    def test_admin_get_includes_hr_fields(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(
            f"{self.api_prefix}/users/{self.subject.id}",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(res.status_code, 200)
        data = res.data["data"]
        self.assertEqual(data["contract_expiry_date"], "2026-12-31")
        self.assertEqual(data["employment_type"], "full_time")

    def test_teacher_get_redacts_hr_fields_on_own_profile(self):
        self.client.force_authenticate(user=self.teacher)
        res = self.client.get(
            f"{self.api_prefix}/users/{self.teacher.id}",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(res.status_code, 200)
        data = res.data["data"]
        for key in HR_FIELD_NAMES:
            self.assertNotIn(key, data)

    def test_manager_patch_does_not_update_hr_fields(self):
        self.client.force_authenticate(user=self.manager)
        res = self.client.patch(
            f"{self.api_prefix}/users/{self.subject.id}",
            {"employment_type": "part_time"},
            format="json",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertIn(res.status_code, (200, 204))
        with schema_context(self.schema_name):
            refreshed = User.objects.get(pk=self.subject.pk)
            self.assertEqual(refreshed.employment_type, User.EmploymentType.FULL_TIME)
