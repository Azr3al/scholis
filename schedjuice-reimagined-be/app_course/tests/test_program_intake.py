import unittest
from datetime import date
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from rest_framework.exceptions import ValidationError
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory
from tenant_schemas.utils import schema_context

from app_course.course_program_validation import validate_course_program_fields
from app_course.models import (
    Category,
    Course,
    CourseSubject,
    Event,
    Intake,
    Program,
    ProgramLevel,
    ProgramLevelSection,
    ProgramLevelSubject,
    ProgramSubject,
    Subject,
)
from app_course.intake_services import (
    build_intake_course_preview,
    generate_intake_courses,
    sanitize_generation_defaults,
)
from app_course.program_helpers import (
    create_default_general_program,
    get_default_program,
)
from app_course.program_structure_services import (
    ProgramStructureValidationError,
    setup_program_structure,
    setup_program_curriculum,
)
from app_course.serializers import CourseSerializer, IntakeSerializer, ProgramSerializer
from app_course.views import IntakeDetailsView
from app_organization.models import Organization
from types import SimpleNamespace

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False

@unittest.skipUnless(
    _database_reachable(),
    "PostgreSQL not available",
)
class ProgramIntakeTest(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        with patch("builtins.input", return_value="yes"):
            call_command("load-tenants", verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)
        Organization.objects.filter(schema_name=cls.schema_name).update(timezone="UTC")

    def test_protected_program_cannot_delete(self):
        with schema_context(self.schema_name):
            program = get_default_program()
            with self.assertRaises(ValidationError):
                program.delete()

    def test_program_with_courses_cannot_delete(self):
        with schema_context(self.schema_name):
            category = Category.objects.first()
            general = get_default_program()
            other = Program.objects.create(
                name=f"Other {uuid4().hex[:6]}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.OPTIONAL,
            )
            Course.objects.create(
                title=f"Prog del test {uuid4()}",
                category=category,
                program=other,
                start_date="2024-01-01",
                end_date="2024-12-31",
            )
            with self.assertRaises(ValidationError):
                other.delete()

    def test_subject_strategy_none_rejects_subject(self):
        with schema_context(self.schema_name):
            program = Program.objects.create(
                name=f"None strat {uuid4().hex[:6]}",
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            subject = Subject.objects.create(name=f"Sub {uuid4().hex[:6]}")
            attrs = {"program": program, "subject": subject}
            with self.assertRaises(ValidationError):
                validate_course_program_fields(attrs)

    def test_subject_strategy_required_needs_subject(self):
        with schema_context(self.schema_name):
            program = Program.objects.create(
                name=f"Req strat {uuid4().hex[:6]}",
                subject_strategy=Program.SubjectStrategy.REQUIRED,
            )
            attrs = {"program": program}
            with self.assertRaises(ValidationError):
                validate_course_program_fields(attrs)

    def test_intake_preview_required_strategy(self):
        with schema_context(self.schema_name):
            program = Program.objects.create(
                name=f"ACCA {uuid4().hex[:6]}",
                subject_strategy=Program.SubjectStrategy.REQUIRED,
                course_creation_method=Program.CourseCreationMethod.INTAKE_BASED,
            )
            sub = Subject.objects.create(name=f"Audit {uuid4().hex[:6]}")
            ProgramSubject.objects.create(program=program, subject=sub)
            intake = Intake.objects.create(
                name="Jun 2026",
                program=program,
                start_date="2026-06-01",
                end_date="2026-12-31",
            )
            rows = build_intake_course_preview(intake)
            self.assertEqual(len(rows), 1)
            self.assertIn("Audit", rows[0]["title"])
            self.assertEqual(rows[0]["subject_name"], sub.name)

    def test_intake_preview_multi_level_section_matrix(self):
        with schema_context(self.schema_name):
            program = Program.objects.create(
                name=f"IS {uuid4().hex[:6]}",
                subject_strategy=Program.SubjectStrategy.MULTI,
                course_creation_method=Program.CourseCreationMethod.INTAKE_BASED,
            )
            level = ProgramLevel.objects.create(program=program, name="Year 1")
            ProgramLevelSection.objects.create(level=level, name="A")
            ProgramLevelSection.objects.create(level=level, name="B")
            intake = Intake.objects.create(
                name="2026 Intake",
                program=program,
                start_date="2026-01-01",
                end_date="2026-12-31",
            )
            rows = build_intake_course_preview(intake)
            self.assertEqual(len(rows), 2)

    def test_intake_preview_multi_level_section_subset_override(self):
        with schema_context(self.schema_name):
            program = Program.objects.create(
                name=f"IS {uuid4().hex[:6]}",
                subject_strategy=Program.SubjectStrategy.MULTI,
                course_creation_method=Program.CourseCreationMethod.INTAKE_BASED,
            )
            level = ProgramLevel.objects.create(program=program, name="Year 1")
            ProgramLevelSection.objects.create(level=level, name="A")
            ProgramLevelSection.objects.create(level=level, name="B")
            ProgramLevelSection.objects.create(level=level, name="C")
            intake = Intake.objects.create(
                name="2026 Intake",
                program=program,
                start_date="2026-01-01",
                end_date="2026-12-31",
            )
            rows = build_intake_course_preview(
                intake,
                defaults={"level_section_names": {str(level.id): ["A", "B"]}},
            )
            self.assertEqual(len(rows), 2)
            self.assertEqual(
                sorted(r["section_id"] for r in rows),
                sorted(
                    ProgramLevelSection.objects.filter(
                        level=level, name__in=["A", "B"]
                    ).values_list("id", flat=True)
                ),
            )

    def test_intake_preview_multi_level_section_with_persisted_name(self):
        with schema_context(self.schema_name):
            program = Program.objects.create(
                name=f"IS {uuid4().hex[:6]}",
                subject_strategy=Program.SubjectStrategy.MULTI,
                course_creation_method=Program.CourseCreationMethod.INTAKE_BASED,
            )
            level = ProgramLevel.objects.create(program=program, name="Year 1")
            ProgramLevelSection.objects.create(level=level, name="A")
            ProgramLevelSection.objects.create(level=level, name="B")
            ProgramLevelSection.objects.create(level=level, name="D")
            intake = Intake.objects.create(
                name="2026 Intake",
                program=program,
                start_date="2026-01-01",
                end_date="2026-12-31",
            )
            rows = build_intake_course_preview(
                intake,
                defaults={"level_section_names": {str(level.id): ["A", "B", "D"]}},
            )
            self.assertEqual(len(rows), 3)
            self.assertTrue(all(r["section_id"] is not None for r in rows))
            self.assertEqual(
                sorted(r["section_id"] for r in rows),
                sorted(
                    ProgramLevelSection.objects.filter(
                        level=level, name__in=["A", "B", "D"]
                    ).values_list("id", flat=True)
                ),
            )

    def test_intake_preview_multi_level_section_unknown_name_raises(self):
        with schema_context(self.schema_name):
            program = Program.objects.create(
                name=f"IS {uuid4().hex[:6]}",
                subject_strategy=Program.SubjectStrategy.MULTI,
                course_creation_method=Program.CourseCreationMethod.INTAKE_BASED,
            )
            level = ProgramLevel.objects.create(program=program, name="Year 1")
            ProgramLevelSection.objects.create(level=level, name="A")
            ProgramLevelSection.objects.create(level=level, name="B")
            intake = Intake.objects.create(
                name="2026 Intake",
                program=program,
                start_date="2026-01-01",
                end_date="2026-12-31",
            )
            with self.assertRaises(ValueError) as ctx:
                build_intake_course_preview(
                    intake,
                    defaults={"level_section_names": {str(level.id): ["A", "B", "D"]}},
                )
            self.assertIn("Unknown section", str(ctx.exception))
            self.assertIn("D", str(ctx.exception))

    def test_course_program_reassignment_blocked(self):
        with schema_context(self.schema_name):
            category = Category.objects.first()
            p1 = Program.objects.create(
                name=f"P1 {uuid4().hex[:6]}",
                subject_strategy=Program.SubjectStrategy.OPTIONAL,
            )
            p2 = Program.objects.create(
                name=f"P2 {uuid4().hex[:6]}",
                subject_strategy=Program.SubjectStrategy.OPTIONAL,
            )
            course = Course.objects.create(
                title=f"Reassign {uuid4()}",
                category=category,
                program=p1,
                start_date="2024-01-01",
                end_date="2024-12-31",
            )
            ser = CourseSerializer(
                instance=course,
                data={"program": p2.id},
                partial=True,
            )
            self.assertFalse(ser.is_valid())
            self.assertIn("program", ser.errors)

    def test_allow_and_grandfather_subject_strategy_change(self):
        with schema_context(self.schema_name):
            category = Category.objects.first()
            program = Program.objects.create(
                name=f"Grand {uuid4().hex[:6]}",
                subject_strategy=Program.SubjectStrategy.OPTIONAL,
            )
            Course.objects.create(
                title=f"No subject {uuid4()}",
                category=category,
                program=program,
                start_date="2024-01-01",
                end_date="2024-12-31",
            )
            program.subject_strategy = Program.SubjectStrategy.REQUIRED
            program.save()
            program.refresh_from_db()
            self.assertEqual(program.subject_strategy, Program.SubjectStrategy.REQUIRED)

    def test_program_level_subject_unique_per_level(self):
        with schema_context(self.schema_name):
            program = Program.objects.create(
                name=f"K12 {uuid4().hex[:6]}",
                course_creation_method=Program.CourseCreationMethod.INTAKE_BASED,
                subject_strategy=Program.SubjectStrategy.MULTI,
            )
            level = ProgramLevel.objects.create(program=program, name="Year 6")
            subject = Subject.objects.create(name=f"Math {uuid4().hex[:4]}")
            ProgramLevelSubject.objects.create(
                level=level, subject=subject, sort_order=0
            )
            with self.assertRaises(Exception):
                ProgramLevelSubject.objects.create(
                    level=level, subject=subject, sort_order=1
                )

    @patch("django.db.transaction.on_commit", side_effect=lambda fn, **kw: fn())
    @patch("app_course.serializers.create_course_team_async.delay")
    @patch("app_microsoft.flows.CreateTeamFlow.start")
    def test_generate_intake_courses_enqueues_teams_async(
        self, mock_start, mock_delay, _mock_on_commit
    ):
        with schema_context(self.schema_name):
            Organization.objects.filter(schema_name=self.schema_name).update(
                is_microsoft_on=True,
                is_teams_creation_enabled=True,
            )
            category = Category.objects.first()
            program = Program.objects.create(
                name=f"MS intake {uuid4().hex[:6]}",
                course_creation_method=Program.CourseCreationMethod.INTAKE_BASED,
                subject_strategy=Program.SubjectStrategy.REQUIRED,
            )
            sub = Subject.objects.create(name=f"MS sub {uuid4().hex[:6]}")
            ProgramSubject.objects.create(program=program, subject=sub)
            intake = Intake.objects.create(
                name="T1",
                program=program,
                start_date="2026-01-01",
                end_date="2026-06-30",
            )
            tenant = Organization.objects.filter(schema_name=self.schema_name).first()
            request = SimpleNamespace(
                tenant=tenant,
                user=SimpleNamespace(id="test@schedjuice.com"),
                query_params=SimpleNamespace(
                    get=lambda _key, default=None: default,
                    getlist=lambda _field: [],
                ),
            )
            ser = CourseSerializer(
                context={"request": request, "defer_team_provisioning": True},
            )

            def _create(payload):
                return ser.create(payload)

            ids = generate_intake_courses(
                intake,
                overrides=None,
                defaults={"category_id": category.id},
                course_serializer_create=_create,
            )
            self.assertEqual(len(ids), 1)
            mock_start.assert_not_called()
            mock_delay.assert_called_once()
            course = Course.objects.get(pk=ids[0])
            self.assertIsNone(course.microsoft_group_id)
            Organization.objects.filter(schema_name=self.schema_name).update(
                is_microsoft_on=False,
                is_teams_creation_enabled=True,
            )

    @patch("django.db.transaction.on_commit", side_effect=lambda fn, **kw: fn())
    @patch("app_course.serializers.create_course_team_async.delay")
    @patch("app_microsoft.flows.CreateTeamFlow.start")
    def test_generate_intake_courses_skips_teams_when_creation_disabled(
        self, mock_start, mock_delay, _mock_on_commit
    ):
        with schema_context(self.schema_name):
            Organization.objects.filter(schema_name=self.schema_name).update(
                is_microsoft_on=True,
                is_teams_creation_enabled=False,
            )
            category = Category.objects.first()
            program = Program.objects.create(
                name=f"No teams {uuid4().hex[:6]}",
                course_creation_method=Program.CourseCreationMethod.INTAKE_BASED,
                subject_strategy=Program.SubjectStrategy.REQUIRED,
            )
            sub = Subject.objects.create(name=f"No teams sub {uuid4().hex[:6]}")
            ProgramSubject.objects.create(program=program, subject=sub)
            intake = Intake.objects.create(
                name="T1",
                program=program,
                start_date="2026-01-01",
                end_date="2026-06-30",
            )
            tenant = Organization.objects.filter(schema_name=self.schema_name).first()
            request = SimpleNamespace(
                tenant=tenant,
                user=SimpleNamespace(id="test@schedjuice.com"),
                query_params=SimpleNamespace(
                    get=lambda _key, default=None: default,
                    getlist=lambda _field: [],
                ),
            )
            ser = CourseSerializer(
                context={"request": request, "defer_team_provisioning": True},
            )

            def _create(payload):
                return ser.create(payload)

            generate_intake_courses(
                intake,
                overrides=None,
                defaults={"category_id": category.id},
                course_serializer_create=_create,
            )
            mock_start.assert_not_called()
            mock_delay.assert_not_called()
            Organization.objects.filter(schema_name=self.schema_name).update(
                is_microsoft_on=False,
                is_teams_creation_enabled=True,
            )

    def test_generate_intake_courses_uses_level_subject_ids(self):
        with schema_context(self.schema_name):
            category = Category.objects.first()
            program = Program.objects.create(
                name=f"K12 gen {uuid4().hex[:6]}",
                course_creation_method=Program.CourseCreationMethod.INTAKE_BASED,
                subject_strategy=Program.SubjectStrategy.MULTI,
            )
            y6 = ProgramLevel.objects.create(program=program, name="Year 6")
            y7 = ProgramLevel.objects.create(program=program, name="Year 7")
            ProgramLevelSection.objects.create(level=y6, name="A")
            ProgramLevelSection.objects.create(level=y7, name="A")
            s_math = Subject.objects.create(name=f"Math {uuid4().hex[:4]}")
            s_phys = Subject.objects.create(name=f"Phys {uuid4().hex[:4]}")
            intake = Intake.objects.create(
                name="T1",
                program=program,
                start_date="2026-01-01",
                end_date="2026-06-30",
            )

            def _create(payload):
                return CourseSerializer(context={}).create(payload)

            ids = generate_intake_courses(
                intake,
                overrides=None,
                defaults={
                    "category_id": category.id,
                    "level_subject_ids": {
                        str(y6.id): [s_math.id],
                        str(y7.id): [s_math.id, s_phys.id],
                    },
                },
                course_serializer_create=_create,
            )
            self.assertEqual(len(ids), 2)
            y6_course = Course.objects.get(level_id=y6.id)
            y7_course = Course.objects.get(level_id=y7.id)
            self.assertEqual(CourseSubject.objects.filter(course=y6_course).count(), 1)
            self.assertEqual(CourseSubject.objects.filter(course=y7_course).count(), 2)

    def test_generate_intake_courses_applies_row_date_override(self):
        with schema_context(self.schema_name):
            category = Category.objects.first()
            program = Program.objects.create(
                name=f"Date ov {uuid4().hex[:6]}",
                course_creation_method=Program.CourseCreationMethod.INTAKE_BASED,
                subject_strategy=Program.SubjectStrategy.REQUIRED,
            )
            sub = Subject.objects.create(name=f"Audit {uuid4().hex[:6]}")
            ProgramSubject.objects.create(program=program, subject=sub)
            intake = Intake.objects.create(
                name="T1",
                program=program,
                start_date="2026-01-01",
                end_date="2026-06-30",
            )
            row_key = f"subject:{sub.id}"

            def _create(payload):
                return CourseSerializer(context={}).create(payload)

            generate_intake_courses(
                intake,
                overrides=[
                    {
                        "key": row_key,
                        "start_date": "2026-02-01",
                        "end_date": "2026-03-31",
                    }
                ],
                defaults={"category_id": category.id},
                course_serializer_create=_create,
            )
            course = Course.objects.get(intake=intake)
            self.assertEqual(str(course.start_date), "2026-02-01")
            self.assertEqual(str(course.end_date), "2026-03-31")

    def test_generate_intake_courses_applies_default_slots(self):
        with schema_context(self.schema_name):
            category = Category.objects.first()
            program = Program.objects.create(
                name=f"Slots {uuid4().hex[:6]}",
                course_creation_method=Program.CourseCreationMethod.INTAKE_BASED,
                subject_strategy=Program.SubjectStrategy.REQUIRED,
            )
            sub = Subject.objects.create(name=f"Math {uuid4().hex[:6]}")
            ProgramSubject.objects.create(program=program, subject=sub)
            intake = Intake.objects.create(
                name="T1",
                program=program,
                start_date="2026-01-05",
                end_date="2026-01-11",
            )

            def _create(payload):
                return CourseSerializer(context={}).create(payload)

            generate_intake_courses(
                intake,
                overrides=None,
                defaults={
                    "category_id": category.id,
                    "slots": [
                        {"weekday": "Mon", "time_from": "09:00", "time_to": "10:00"},
                        {"weekday": "Wed", "time_from": "09:00", "time_to": "10:00"},
                    ],
                },
                course_serializer_create=_create,
            )
            course = Course.objects.get(intake=intake)
            self.assertTrue(course.is_recurring)
            self.assertEqual(course.repeat_every, ["Mon", "Wed"])
            self.assertEqual(Event.objects.filter(course=course).count(), 2)

    def test_generate_intake_courses_row_slot_override_replaces_default(self):
        with schema_context(self.schema_name):
            category = Category.objects.first()
            program = Program.objects.create(
                name=f"Slot ov {uuid4().hex[:6]}",
                course_creation_method=Program.CourseCreationMethod.INTAKE_BASED,
                subject_strategy=Program.SubjectStrategy.REQUIRED,
            )
            sub = Subject.objects.create(name=f"Eng {uuid4().hex[:6]}")
            ProgramSubject.objects.create(program=program, subject=sub)
            intake = Intake.objects.create(
                name="T1",
                program=program,
                start_date="2026-01-05",
                end_date="2026-01-11",
            )
            row_key = f"subject:{sub.id}"

            def _create(payload):
                return CourseSerializer(context={}).create(payload)

            generate_intake_courses(
                intake,
                overrides=[
                    {
                        "key": row_key,
                        "slots": [
                            {
                                "weekday": "Fri",
                                "time_from": "14:00",
                                "time_to": "15:00",
                            }
                        ],
                    }
                ],
                defaults={
                    "category_id": category.id,
                    "slots": [
                        {"weekday": "Mon", "time_from": "09:00", "time_to": "10:00"},
                    ],
                },
                course_serializer_create=_create,
            )
            course = Course.objects.get(intake=intake)
            self.assertEqual(course.repeat_every, ["Fri"])
            self.assertEqual(Event.objects.filter(course=course).count(), 1)
            event = Event.objects.get(course=course)
            self.assertEqual(str(event.time_from), "14:00:00")
            self.assertEqual(str(event.time_to), "15:00:00")

    def test_generate_intake_courses_applies_row_category_override(self):
        with schema_context(self.schema_name):
            default_category = Category.objects.first()
            other_category = Category.objects.exclude(pk=default_category.id).first()
            if other_category is None:
                other_category = Category.objects.create(
                    name=f"Other {uuid4().hex[:6]}",
                    sort_order=999,
                )
            program = Program.objects.create(
                name=f"Cat ov {uuid4().hex[:6]}",
                course_creation_method=Program.CourseCreationMethod.INTAKE_BASED,
                subject_strategy=Program.SubjectStrategy.REQUIRED,
            )
            sub = Subject.objects.create(name=f"Hist {uuid4().hex[:6]}")
            ProgramSubject.objects.create(program=program, subject=sub)
            intake = Intake.objects.create(
                name="T1",
                program=program,
                start_date="2026-01-01",
                end_date="2026-06-30",
            )
            row_key = f"subject:{sub.id}"

            def _create(payload):
                return CourseSerializer(context={}).create(payload)

            generate_intake_courses(
                intake,
                overrides=[{"key": row_key, "category_id": other_category.id}],
                defaults={"category_id": default_category.id},
                course_serializer_create=_create,
            )
            course = Course.objects.get(intake=intake)
            self.assertEqual(course.category_id, other_category.id)

    def test_generate_intake_courses_applies_payment_plan_defaults_and_override(self):
        from app_finance.models import PaymentPlan
        from djmoney.money import Money

        with schema_context(self.schema_name):
            category = Category.objects.first()
            default_plan = PaymentPlan.objects.create(
                name=f"Default plan {uuid4().hex[:6]}",
                price=Money(10, "USD"),
            )
            other_plan = PaymentPlan.objects.create(
                name=f"Other plan {uuid4().hex[:6]}",
                price=Money(20, "USD"),
            )
            program = Program.objects.create(
                name=f"PP ov {uuid4().hex[:6]}",
                course_creation_method=Program.CourseCreationMethod.INTAKE_BASED,
                subject_strategy=Program.SubjectStrategy.REQUIRED,
            )
            sub_a = Subject.objects.create(name=f"SubA {uuid4().hex[:6]}")
            sub_b = Subject.objects.create(name=f"SubB {uuid4().hex[:6]}")
            ProgramSubject.objects.create(program=program, subject=sub_a, sort_order=0)
            ProgramSubject.objects.create(program=program, subject=sub_b, sort_order=1)
            intake = Intake.objects.create(
                name="T1",
                program=program,
                start_date="2026-01-01",
                end_date="2026-06-30",
            )
            row_key_a = f"subject:{sub_a.id}"
            row_key_b = f"subject:{sub_b.id}"

            def _create(payload):
                return CourseSerializer(context={}).create(payload)

            generate_intake_courses(
                intake,
                overrides=[{"key": row_key_b, "payment_plan_id": other_plan.id}],
                defaults={
                    "category_id": category.id,
                    "payment_plan_id": default_plan.id,
                },
                course_serializer_create=_create,
            )
            course_a = Course.objects.get(intake=intake, subject_id=sub_a.id)
            course_b = Course.objects.get(intake=intake, subject_id=sub_b.id)
            self.assertEqual(course_a.payment_plan_id, default_plan.id)
            self.assertEqual(course_b.payment_plan_id, other_plan.id)

    def test_setup_program_structure_rejects_empty_levels(self):
        with schema_context(self.schema_name):
            program = Program.objects.create(
                name=f"Empty {uuid4().hex[:6]}",
                course_creation_method=Program.CourseCreationMethod.INTAKE_BASED,
            )
            with self.assertRaises(ProgramStructureValidationError):
                setup_program_structure(program.id, [])

    def test_setup_program_structure_rejects_level_without_sections(self):
        with schema_context(self.schema_name):
            program = Program.objects.create(
                name=f"NoSec {uuid4().hex[:6]}",
                course_creation_method=Program.CourseCreationMethod.INTAKE_BASED,
            )
            with self.assertRaises(ProgramStructureValidationError):
                setup_program_structure(
                    program.id,
                    [{"name": "Year 1", "sort_order": 0, "sections": []}],
                )

    def test_setup_program_structure_rejects_duplicate_level_names(self):
        with schema_context(self.schema_name):
            program = Program.objects.create(
                name=f"DupLvl {uuid4().hex[:6]}",
                course_creation_method=Program.CourseCreationMethod.INTAKE_BASED,
            )
            with self.assertRaises(ProgramStructureValidationError):
                setup_program_structure(
                    program.id,
                    [
                        {
                            "name": "Year 1",
                            "sections": [{"name": "A"}],
                        },
                        {
                            "name": "year 1",
                            "sections": [{"name": "A"}],
                        },
                    ],
                )

    def test_setup_program_structure_rejects_existing_levels(self):
        with schema_context(self.schema_name):
            program = Program.objects.create(
                name=f"HasLvl {uuid4().hex[:6]}",
                course_creation_method=Program.CourseCreationMethod.INTAKE_BASED,
            )
            ProgramLevel.objects.create(program=program, name="Year 1")
            with self.assertRaises(ProgramStructureValidationError):
                setup_program_structure(
                    program.id,
                    [{"name": "Year 2", "sections": [{"name": "A"}]}],
                )

    def test_setup_program_curriculum_replaces_assignments(self):
        with schema_context(self.schema_name):
            program = Program.objects.create(
                name=f"Curr {uuid4().hex[:6]}",
                course_creation_method=Program.CourseCreationMethod.INTAKE_BASED,
                subject_strategy=Program.SubjectStrategy.MULTI,
            )
            level = ProgramLevel.objects.create(program=program, name="Year 1")
            math = Subject.objects.create(name=f"Math {uuid4().hex[:4]}")
            english = Subject.objects.create(name=f"Eng {uuid4().hex[:4]}")
            physics = Subject.objects.create(name=f"Phys {uuid4().hex[:4]}")
            ProgramLevelSubject.objects.create(level=level, subject=math, sort_order=0)

            setup_program_curriculum(
                program.id,
                [
                    {"level": level.id, "subject": english.id, "sort_order": 0},
                    {"level": level.id, "subject": physics.id, "sort_order": 1},
                ],
            )

            rows = ProgramLevelSubject.objects.filter(level=level).order_by(
                "sort_order"
            )
            self.assertEqual(rows.count(), 2)
            self.assertEqual(rows[0].subject_id, english.id)
            self.assertEqual(rows[1].subject_id, physics.id)
            self.assertFalse(
                ProgramLevelSubject.objects.filter(level=level, subject=math).exists()
            )

    def test_setup_program_curriculum_allows_empty(self):
        with schema_context(self.schema_name):
            program = Program.objects.create(
                name=f"EmptyCurr {uuid4().hex[:6]}",
                course_creation_method=Program.CourseCreationMethod.INTAKE_BASED,
            )
            level = ProgramLevel.objects.create(program=program, name="Year 1")
            subject = Subject.objects.create(name=f"Sub {uuid4().hex[:4]}")
            ProgramLevelSubject.objects.create(
                level=level, subject=subject, sort_order=0
            )

            setup_program_curriculum(program.id, [])

            self.assertEqual(ProgramLevelSubject.objects.filter(level=level).count(), 0)

    def test_intake_duplicate_name_rejected(self):
        with schema_context(self.schema_name):
            program = Program.objects.create(
                name=f"DupIntake {uuid4().hex[:6]}",
                course_creation_method=Program.CourseCreationMethod.INTAKE_BASED,
            )
            Intake.objects.create(
                name="Academic Year 2026",
                program=program,
                start_date="2026-01-01",
                end_date="2026-12-31",
            )
            ser = IntakeSerializer(
                data={
                    "name": "Academic Year 2026",
                    "program": program.id,
                    "start_date": "2026-01-01",
                    "end_date": "2026-12-31",
                }
            )
            self.assertFalse(ser.is_valid())
            self.assertIn("name", ser.errors)

    def test_intake_preview_includes_resolved_dates(self):
        with schema_context(self.schema_name):
            program = Program.objects.create(
                name=f"Preview dates {uuid4().hex[:6]}",
                subject_strategy=Program.SubjectStrategy.REQUIRED,
                course_creation_method=Program.CourseCreationMethod.INTAKE_BASED,
            )
            sub = Subject.objects.create(name=f"Audit {uuid4().hex[:6]}")
            ProgramSubject.objects.create(program=program, subject=sub)
            intake = Intake.objects.create(
                name="T1",
                program=program,
                start_date="2026-01-01",
                end_date="2026-06-30",
            )
            rows = build_intake_course_preview(
                intake,
                defaults={
                    "start_date": "2026-02-01",
                    "end_date": "2026-03-31",
                },
            )
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["start_date"], "2026-02-01")
            self.assertEqual(rows[0]["end_date"], "2026-03-31")

    def test_generate_intake_courses_default_to_intake_dates(self):
        with schema_context(self.schema_name):
            category = Category.objects.first()
            program = Program.objects.create(
                name=f"Default dates {uuid4().hex[:6]}",
                course_creation_method=Program.CourseCreationMethod.INTAKE_BASED,
                subject_strategy=Program.SubjectStrategy.REQUIRED,
            )
            sub = Subject.objects.create(name=f"Audit {uuid4().hex[:6]}")
            ProgramSubject.objects.create(program=program, subject=sub)
            intake = Intake.objects.create(
                name="T1",
                program=program,
                start_date="2026-01-01",
                end_date="2026-06-30",
            )

            def _create(payload):
                return CourseSerializer(context={}).create(payload)

            generate_intake_courses(
                intake,
                overrides=None,
                defaults={"category_id": category.id},
                course_serializer_create=_create,
            )
            course = Course.objects.get(intake=intake)
            self.assertEqual(str(course.start_date), "2026-01-01")
            self.assertEqual(str(course.end_date), "2026-06-30")

    def test_generate_intake_courses_applies_default_course_dates(self):
        with schema_context(self.schema_name):
            category = Category.objects.first()
            program = Program.objects.create(
                name=f"Default ov {uuid4().hex[:6]}",
                course_creation_method=Program.CourseCreationMethod.INTAKE_BASED,
                subject_strategy=Program.SubjectStrategy.REQUIRED,
            )
            sub = Subject.objects.create(name=f"Audit {uuid4().hex[:6]}")
            ProgramSubject.objects.create(program=program, subject=sub)
            intake = Intake.objects.create(
                name="T1",
                program=program,
                start_date="2026-01-01",
                end_date="2026-06-30",
            )

            def _create(payload):
                return CourseSerializer(context={}).create(payload)

            generate_intake_courses(
                intake,
                overrides=None,
                defaults={
                    "category_id": category.id,
                    "start_date": "2026-02-01",
                    "end_date": "2026-03-31",
                },
                course_serializer_create=_create,
            )
            course = Course.objects.get(intake=intake)
            self.assertEqual(str(course.start_date), "2026-02-01")
            self.assertEqual(str(course.end_date), "2026-03-31")

    def test_generate_intake_courses_rejects_out_of_bounds_default_dates(self):
        with schema_context(self.schema_name):
            category = Category.objects.first()
            program = Program.objects.create(
                name=f"Bad default {uuid4().hex[:6]}",
                course_creation_method=Program.CourseCreationMethod.INTAKE_BASED,
                subject_strategy=Program.SubjectStrategy.REQUIRED,
            )
            sub = Subject.objects.create(name=f"Audit {uuid4().hex[:6]}")
            ProgramSubject.objects.create(program=program, subject=sub)
            intake = Intake.objects.create(
                name="T1",
                program=program,
                start_date="2026-01-01",
                end_date="2026-06-30",
            )

            def _create(payload):
                return CourseSerializer(context={}).create(payload)

            with self.assertRaises(ValueError) as ctx:
                generate_intake_courses(
                    intake,
                    overrides=None,
                    defaults={
                        "category_id": category.id,
                        "start_date": "2025-12-01",
                        "end_date": "2026-03-31",
                    },
                    course_serializer_create=_create,
                )
            self.assertIn("outside the intake window", str(ctx.exception))

    def test_generate_intake_courses_rejects_out_of_bounds_row_override(self):
        with schema_context(self.schema_name):
            category = Category.objects.first()
            program = Program.objects.create(
                name=f"Bad row {uuid4().hex[:6]}",
                course_creation_method=Program.CourseCreationMethod.INTAKE_BASED,
                subject_strategy=Program.SubjectStrategy.REQUIRED,
            )
            sub = Subject.objects.create(name=f"Audit {uuid4().hex[:6]}")
            ProgramSubject.objects.create(program=program, subject=sub)
            intake = Intake.objects.create(
                name="T1",
                program=program,
                start_date="2026-01-01",
                end_date="2026-06-30",
            )
            row_key = f"subject:{sub.id}"

            def _create(payload):
                return CourseSerializer(context={}).create(payload)

            with self.assertRaises(ValueError) as ctx:
                generate_intake_courses(
                    intake,
                    overrides=[
                        {
                            "key": row_key,
                            "start_date": "2026-01-01",
                            "end_date": "2026-07-01",
                        }
                    ],
                    defaults={"category_id": category.id},
                    course_serializer_create=_create,
                )
            self.assertIn("outside the intake window", str(ctx.exception))

    def test_course_edit_outside_intake_dates_rejected(self):
        with schema_context(self.schema_name):
            category = Category.objects.first()
            program = Program.objects.create(
                name=f"Course edit {uuid4().hex[:6]}",
                course_creation_method=Program.CourseCreationMethod.INTAKE_BASED,
                subject_strategy=Program.SubjectStrategy.REQUIRED,
            )
            sub = Subject.objects.create(name=f"Audit {uuid4().hex[:6]}")
            ProgramSubject.objects.create(program=program, subject=sub)
            intake = Intake.objects.create(
                name="T1",
                program=program,
                start_date="2026-01-01",
                end_date="2026-06-30",
            )
            course = Course.objects.create(
                title=f"Bounded {uuid4()}",
                category=category,
                program=program,
                intake=intake,
                subject=sub,
                start_date="2026-02-01",
                end_date="2026-03-31",
            )
            ser = CourseSerializer(
                instance=course,
                data={"end_date": "2026-07-01"},
                partial=True,
            )
            self.assertFalse(ser.is_valid())
            self.assertIn("end_date", ser.errors)

    def test_intake_shrink_rejected_when_courses_outside_new_window(self):
        with schema_context(self.schema_name):
            category = Category.objects.first()
            program = Program.objects.create(
                name=f"Shrink {uuid4().hex[:6]}",
                course_creation_method=Program.CourseCreationMethod.INTAKE_BASED,
                subject_strategy=Program.SubjectStrategy.REQUIRED,
            )
            sub = Subject.objects.create(name=f"Audit {uuid4().hex[:6]}")
            ProgramSubject.objects.create(program=program, subject=sub)
            intake = Intake.objects.create(
                name="T1",
                program=program,
                start_date="2026-01-01",
                end_date="2026-06-30",
            )
            Course.objects.create(
                title=f"Linked {uuid4()}",
                category=category,
                program=program,
                intake=intake,
                subject=sub,
                start_date="2026-02-01",
                end_date="2026-05-31",
            )
            ser = IntakeSerializer(
                instance=intake,
                data={"end_date": "2026-04-30"},
                partial=True,
            )
            self.assertFalse(ser.is_valid())
            self.assertIn("non_field_errors", ser.errors)

    def test_intake_preview_extra_courses_without_program_subject(self):
        with schema_context(self.schema_name):
            program = Program.objects.create(
                name=f"ACCA extra {uuid4().hex[:6]}",
                subject_strategy=Program.SubjectStrategy.REQUIRED,
                course_creation_method=Program.CourseCreationMethod.INTAKE_BASED,
            )
            sub = Subject.objects.create(name=f"Audit {uuid4().hex[:6]}")
            ProgramSubject.objects.create(program=program, subject=sub)
            intake = Intake.objects.create(
                name="Jun 2026",
                program=program,
                start_date="2026-06-01",
                end_date="2026-12-31",
            )
            rows = build_intake_course_preview(
                intake,
                defaults={
                    "extra_courses": [
                        {
                            "key": "extra:mock-a",
                            "subject_id": sub.id,
                        }
                    ]
                },
            )
            self.assertEqual(len(rows), 2)
            extra_rows = [row for row in rows if row.get("is_extra")]
            self.assertEqual(len(extra_rows), 1)
            self.assertEqual(extra_rows[0]["subject_id"], sub.id)
            self.assertEqual(extra_rows[0]["subject_name"], sub.name)
            self.assertNotIn("program_subject_id", extra_rows[0])

    def test_intake_preview_duplicate_subject_numbers_extra_rows(self):
        with schema_context(self.schema_name):
            program = Program.objects.create(
                name=f"ACCA dup {uuid4().hex[:6]}",
                subject_strategy=Program.SubjectStrategy.REQUIRED,
                course_creation_method=Program.CourseCreationMethod.INTAKE_BASED,
            )
            sub = Subject.objects.create(name=f"Audit {uuid4().hex[:6]}")
            ProgramSubject.objects.create(program=program, subject=sub)
            intake = Intake.objects.create(
                name="Jun 2026",
                program=program,
                start_date="2026-06-01",
                end_date="2026-12-31",
            )
            rows = build_intake_course_preview(
                intake,
                defaults={
                    "extra_courses": [
                        {
                            "key": "extra:mock-a",
                            "subject_id": sub.id,
                        }
                    ]
                },
            )
            titles = [row["title"] for row in rows]
            self.assertEqual(len(titles), 2)
            self.assertEqual(sum("(2)" in title for title in titles), 1)

    def test_generate_intake_courses_persists_generation_defaults(self):
        with schema_context(self.schema_name):
            category = Category.objects.first()
            program = Program.objects.create(
                name=f"Persist defaults {uuid4().hex[:6]}",
                course_creation_method=Program.CourseCreationMethod.INTAKE_BASED,
                subject_strategy=Program.SubjectStrategy.REQUIRED,
            )
            sub = Subject.objects.create(name=f"Audit {uuid4().hex[:6]}")
            ProgramSubject.objects.create(program=program, subject=sub)
            intake = Intake.objects.create(
                name="T1",
                program=program,
                start_date="2026-01-01",
                end_date="2026-06-30",
            )

            def _create(payload):
                return CourseSerializer(context={}).create(payload)

            defaults = {
                "category_id": category.id,
                "start_date": "2026-02-01",
                "end_date": "2026-03-31",
                "description": "Exam prep cohort",
                "slots": [
                    {
                        "weekday": "Mon",
                        "time_from": "09:00",
                        "time_to": "11:00",
                    }
                ],
                "extra_courses": [
                    {
                        "key": "extra:mock-a",
                        "subject_id": sub.id,
                    }
                ],
            }
            generate_intake_courses(
                intake,
                overrides=None,
                defaults=defaults,
                course_serializer_create=_create,
            )
            intake.refresh_from_db()
            self.assertEqual(
                intake.generation_defaults,
                sanitize_generation_defaults(defaults),
            )
            self.assertNotIn("extra_courses", intake.generation_defaults)

    def test_generate_intake_courses_creates_catalog_and_extra_rows(self):
        with schema_context(self.schema_name):
            category = Category.objects.first()
            program = Program.objects.create(
                name=f"Catalog extra {uuid4().hex[:6]}",
                course_creation_method=Program.CourseCreationMethod.INTAKE_BASED,
                subject_strategy=Program.SubjectStrategy.REQUIRED,
            )
            sub = Subject.objects.create(name=f"Audit {uuid4().hex[:6]}")
            ProgramSubject.objects.create(program=program, subject=sub)
            intake = Intake.objects.create(
                name="T1",
                program=program,
                start_date="2026-01-01",
                end_date="2026-06-30",
            )

            def _create(payload):
                return CourseSerializer(context={}).create(payload)

            generate_intake_courses(
                intake,
                overrides=None,
                defaults={
                    "category_id": category.id,
                    "extra_courses": [
                        {
                            "key": "extra:mock-a",
                            "subject_id": sub.id,
                        }
                    ],
                },
                course_serializer_create=_create,
            )
            courses = Course.objects.filter(intake=intake).order_by("id")
            self.assertEqual(courses.count(), 2)
            self.assertEqual(
                set(courses.values_list("subject_id", flat=True)),
                {sub.id},
            )

    def _intake_view_put(self, intake, payload):
        factory = APIRequestFactory()
        django_request = factory.put(
            f"/intakes/{intake.id}/",
            payload,
            format="json",
        )
        request = Request(django_request)
        view = IntakeDetailsView()
        view.request = request
        view.format_kwarg = None
        return view.put(request, intake.id)

    def _intake_view_delete(self, intake):
        factory = APIRequestFactory()
        django_request = factory.delete(f"/intakes/{intake.id}/")
        request = Request(django_request)
        view = IntakeDetailsView()
        view.request = request
        view.format_kwarg = None
        return view.delete(request, intake.id)

    def _create_intake_with_course(
        self,
        *,
        intake_start="2025-10-01",
        intake_end="2026-02-27",
        course_start="2025-10-01",
        course_end="2026-02-27",
    ):
        category = Category.objects.first()
        program = Program.objects.create(
            name=f"Intake range {uuid4().hex[:6]}",
            course_creation_method=Program.CourseCreationMethod.INTAKE_BASED,
            subject_strategy=Program.SubjectStrategy.OPTIONAL,
        )
        intake = Intake.objects.create(
            name=f"Batch {uuid4().hex[:4]}",
            program=program,
            start_date=intake_start,
            end_date=intake_end,
        )
        course = Course.objects.create(
            title=f"Course {uuid4().hex[:6]}",
            category=category,
            program=program,
            intake=intake,
            start_date=course_start,
            end_date=course_end,
        )
        return intake, course

    def test_intake_put_returns_conflict_when_courses_outside_new_range(self):
        with schema_context(self.schema_name):
            intake, _course = self._create_intake_with_course()
            response = self._intake_view_put(
                intake,
                {
                    "name": intake.name,
                    "start_date": "2025-11-01",
                    "end_date": "2026-01-31",
                },
            )
            self.assertEqual(response.status_code, 400)
            self.assertEqual(
                response.data["details"]["code"],
                "courses_outside_intake_range",
            )
            self.assertTrue(response.data["details"]["courses"])

    def test_intake_put_ignore_leaves_course_outside_new_range(self):
        with schema_context(self.schema_name):
            intake, course = self._create_intake_with_course()
            response = self._intake_view_put(
                intake,
                {
                    "name": intake.name,
                    "start_date": "2025-11-01",
                    "end_date": "2026-01-31",
                    "course_range_action": "ignore",
                },
            )
            self.assertEqual(response.status_code, 200)
            intake.refresh_from_db()
            course.refresh_from_db()
            self.assertEqual(str(intake.start_date), "2025-11-01")
            self.assertEqual(str(intake.end_date), "2026-01-31")
            self.assertEqual(str(course.start_date), "2025-10-01")
            self.assertEqual(str(course.end_date), "2026-02-27")

    def test_intake_put_adjust_clamps_course_to_new_range(self):
        with schema_context(self.schema_name):
            intake, course = self._create_intake_with_course()
            response = self._intake_view_put(
                intake,
                {
                    "name": intake.name,
                    "start_date": "2025-11-01",
                    "end_date": "2026-01-31",
                    "course_range_action": "adjust",
                },
            )
            self.assertEqual(response.status_code, 200)
            intake.refresh_from_db()
            course.refresh_from_db()
            self.assertEqual(str(intake.start_date), "2025-11-01")
            self.assertEqual(str(intake.end_date), "2026-01-31")
            self.assertEqual(str(course.start_date), "2025-11-01")
            self.assertEqual(str(course.end_date), "2026-01-31")

    def test_intake_delete_blocked_when_courses_exist(self):
        with schema_context(self.schema_name):
            intake, _course = self._create_intake_with_course()
            response = self._intake_view_delete(intake)
            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.data["details"]["code"], "intake_has_courses")
            self.assertTrue(Intake.objects.filter(pk=intake.pk).exists())

    def test_course_dates_outside_intake_are_allowed_on_validate(self):
        with schema_context(self.schema_name):
            category = Category.objects.first()
            program = Program.objects.create(
                name=f"Relaxed {uuid4().hex[:6]}",
                course_creation_method=Program.CourseCreationMethod.INTAKE_BASED,
                subject_strategy=Program.SubjectStrategy.OPTIONAL,
            )
            intake = Intake.objects.create(
                name="T1",
                program=program,
                start_date="2026-01-01",
                end_date="2026-06-30",
            )
            attrs = {
                "program": program,
                "intake": intake,
                "category": category,
                "title": f"Wide course {uuid4().hex[:6]}",
                "start_date": date(2025, 12, 1),
                "end_date": date(2026, 7, 1),
            }
            result = validate_course_program_fields(attrs)
            self.assertEqual(result["start_date"], date(2025, 12, 1))
            self.assertEqual(result["end_date"], date(2026, 7, 1))
