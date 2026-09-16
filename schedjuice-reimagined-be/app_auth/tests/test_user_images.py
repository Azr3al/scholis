import io
import unittest
from datetime import date
from uuid import uuid4
from unittest import mock

from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User, UserImage
from app_auth.user_image_validation import MAX_USER_IMAGE_BYTES, validate_user_image_upload
from app_auth.user_images import resolve_user_image
from app_rbac.resolution import effective_permissions
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


def _make_jpeg():
    buf = io.BytesIO()
    Image.new("RGB", (80, 100), color=(120, 140, 160)).save(buf, format="JPEG")
    return SimpleUploadedFile("photo.jpg", buf.getvalue(), content_type="image/jpeg")


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class UserImageModelTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def test_creates_user_image_row(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            user = User.objects.create_user(
                email=f"ui-{suffix}@example.com",
                password="x",
                name="Stu",
                phone_number="1",
                date_of_birth=date(2000, 1, 1),
                communication_email=f"ui-{suffix}@example.com",
                code=f"ui-{suffix}",
                roles=[User.UserRole.STUDENT],
            )
            UserImage.objects.create(
                user=user,
                image_type=UserImage.ImageType.AWARD_IMAGE,
                image=_make_jpeg(),
                uploaded_by=user,
            )
            self.assertEqual(user.user_images.count(), 1)


class UserImageValidationTests(TestCase):
    def test_accepts_jpeg(self):
        f = _make_jpeg()
        self.assertEqual(validate_user_image_upload(f, "photo.jpg"), "image/jpeg")

    def test_rejects_pdf(self):
        pdf = SimpleUploadedFile("scan.pdf", b"%PDF-1.4 junk", content_type="application/pdf")
        with self.assertRaises(ValidationError):
            validate_user_image_upload(pdf, "scan.pdf")

    def test_rejects_oversize(self):
        huge = SimpleUploadedFile(
            "big.jpg",
            b"\xff\xd8\xff" + b"x" * (MAX_USER_IMAGE_BYTES + 1),
            content_type="image/jpeg",
        )
        with self.assertRaises(ValidationError):
            validate_user_image_upload(huge, "big.jpg")


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class UserImagePermissionSeedTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def test_student_has_award_image_upload_and_view(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            seed_rbac()
            student = User.objects.create_user(
                email=f"perm-s-{suffix}@example.com",
                password="x",
                name="Stu",
                phone_number="1",
                date_of_birth=date(2000, 1, 1),
                communication_email=f"perm-s-{suffix}@example.com",
                code=f"perm-s-{suffix}",
                roles=[User.UserRole.STUDENT],
            )
            perms = set(effective_permissions(student))
        self.assertIn("user_image.upload.award_image", perms)
        self.assertIn("user_image.view.award_image", perms)
        self.assertNotIn("user_image.upload.id_image", perms)


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class ResolveUserImageTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            self.user = User.objects.create_user(
                email=f"res-{suffix}@example.com",
                password="x",
                name="Stu",
                phone_number="1",
                date_of_birth=date(2000, 1, 1),
                communication_email=f"res-{suffix}@example.com",
                code=f"res-{suffix}",
                roles=[User.UserRole.STUDENT],
            )

    def test_id_image_falls_back_to_legacy_id_photo(self):
        with schema_context(self.schema_name):
            self.user.id_photo = _make_jpeg()
            self.user.save(update_fields=["id_photo"])
            resolved = resolve_user_image(self.user, UserImage.ImageType.ID_IMAGE, expire=60)
        self.assertIsNotNone(resolved)
        self.assertEqual(resolved.source, "legacy_id_photo")
        self.assertIsNotNone(resolved.url)

    def test_award_image_returns_none_without_upload(self):
        with schema_context(self.schema_name):
            resolved = resolve_user_image(self.user, UserImage.ImageType.AWARD_IMAGE)
        self.assertIsNone(resolved)

    def test_latest_user_image_wins(self):
        with schema_context(self.schema_name):
            UserImage.objects.create(
                user=self.user,
                image_type=UserImage.ImageType.AWARD_IMAGE,
                image=_make_jpeg(),
                uploaded_by=self.user,
            )
            second = UserImage.objects.create(
                user=self.user,
                image_type=UserImage.ImageType.AWARD_IMAGE,
                image=_make_jpeg(),
                uploaded_by=self.user,
            )
            resolved = resolve_user_image(
                self.user, UserImage.ImageType.AWARD_IMAGE, expire=60
            )
        self.assertEqual(resolved.source, "user_image")
        self.assertEqual(resolved.user_image_id, second.id)


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class UserImageApiTests(TestCase):
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
        with schema_context(self.schema_name):
            seed_rbac()
            self.hr = User.objects.create_user(
                email=f"hr-{suffix}@example.com",
                password="x",
                name="HR",
                phone_number="1",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"hr-{suffix}@example.com",
                code=f"hr-{suffix}",
                roles=[User.UserRole.HR],
            )
            self.student = User.objects.create_user(
                email=f"stu-{suffix}@example.com",
                password="x",
                name="Stu",
                phone_number="2",
                date_of_birth=date(2000, 1, 1),
                communication_email=f"stu-{suffix}@example.com",
                code=f"stu-{suffix}",
                roles=[User.UserRole.STUDENT],
            )

    def _auth(self, user):
        self.client.force_authenticate(user=user)

    def test_upload_denied_without_permission(self):
        with schema_context(self.schema_name):
            teacher = User.objects.create_user(
                email=f"t-{uuid4().hex[:6]}@example.com",
                password="x",
                name="T",
                phone_number="3",
                date_of_birth=date(1990, 1, 1),
                communication_email="t@example.com",
                code=f"t-{uuid4().hex[:6]}",
                roles=[User.UserRole.TEACHER],
            )
        self._auth(teacher)
        res = self.client.post(
            f"{self.api_prefix}/users/{self.student.id}/user-images",
            {"image_type": "award_image", "image": _make_jpeg()},
            format="multipart",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(res.status_code, 403)

    def test_hr_can_upload_id_image(self):
        self._auth(self.hr)
        res = self.client.post(
            f"{self.api_prefix}/users/{self.student.id}/user-images",
            {"image_type": "id_image", "image": _make_jpeg()},
            format="multipart",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(res.data["data"]["image_type"], "id_image")

    def test_student_can_upload_own_id_image_without_global_permission(self):
        self._auth(self.student)
        res = self.client.post(
            f"{self.api_prefix}/users/{self.student.id}/user-images",
            {"image_type": "id_image", "image": _make_jpeg()},
            format="multipart",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(res.data["data"]["image_type"], "id_image")

    def test_student_cannot_upload_classmate_id_image_without_permission(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            classmate = User.objects.create_user(
                email=f"cls-{suffix}@example.com",
                password="x",
                name="Cls",
                phone_number="9",
                date_of_birth=date(2000, 1, 1),
                communication_email=f"cls-{suffix}@example.com",
                code=f"cls-{suffix}",
                roles=[User.UserRole.STUDENT],
            )
        self._auth(self.student)
        res = self.client.post(
            f"{self.api_prefix}/users/{classmate.id}/user-images",
            {"image_type": "id_image", "image": _make_jpeg()},
            format="multipart",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(res.status_code, 403)

    def test_resolve_id_image_legacy_fallback(self):
        with schema_context(self.schema_name):
            self.student.id_photo = _make_jpeg()
            self.student.save(update_fields=["id_photo"])
        self._auth(self.hr)
        res = self.client.get(
            f"{self.api_prefix}/users/{self.student.id}/user-images/resolve",
            {"image_type": "id_image"},
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["data"]["source"], "legacy_id_photo")

    def test_history_newest_first(self):
        self._auth(self.hr)
        self.client.post(
            f"{self.api_prefix}/users/{self.student.id}/user-images",
            {"image_type": "id_image", "image": _make_jpeg()},
            format="multipart",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.client.post(
            f"{self.api_prefix}/users/{self.student.id}/user-images",
            {"image_type": "id_image", "image": _make_jpeg()},
            format="multipart",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        res = self.client.get(
            f"{self.api_prefix}/users/{self.student.id}/user-images",
            {"image_type": "id_image", "page": 1, "size": 10},
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(res.status_code, 200)
        items = res.data["data"]["items"]
        self.assertEqual(len(items), 2)
        self.assertGreater(items[0]["id"], items[1]["id"])

    def test_batch_urls_include_sources(self):
        with schema_context(self.schema_name):
            self.student.id_photo = _make_jpeg()
            self.student.save(update_fields=["id_photo"])
        self._auth(self.hr)
        res = self.client.post(
            f"{self.api_prefix}/user-image-urls",
            {"user_ids": [self.student.id], "image_type": "id_image"},
            format="json",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(res.status_code, 200)
        data = res.data["data"]
        self.assertEqual(data["sources"][str(self.student.id)], "legacy_id_photo")


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class UserImageCourseUploadApiTests(TestCase):
    schema_name = "xschedjuice"
    api_prefix = "/api/v1"

    @classmethod
    def setUpClass(cls):
        cls._telegram_invite_patch = mock.patch(
            "app_telegram.signals.dm_invite_link_to_teacher.delay"
        )
        cls._telegram_remove_patch = mock.patch(
            "app_telegram.signals.remove_telegram_member.delay"
        )
        cls._telegram_invite_patch.start()
        cls._telegram_remove_patch.start()
        super().setUpClass()

    @classmethod
    def tearDownClass(cls):
        cls._telegram_remove_patch.stop()
        cls._telegram_invite_patch.stop()
        super().tearDownClass()

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        from datetime import timedelta

        from django.utils import timezone

        from app_course.models import Category, Course, Program, UserCourse

        suffix = uuid4().hex[:6]
        today = timezone.localdate()
        self.client = APIClient()
        with schema_context(self.schema_name):
            seed_rbac()
            cat = Category.objects.create(name=f"Cat {suffix}")
            prog = Program.objects.create(
                name=f"P {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"C {suffix}",
                category=cat,
                program=prog,
                start_date=today,
                end_date=today + timedelta(days=30),
            )
            self.teacher = User.objects.create_user(
                email=f"ct-{suffix}@example.com",
                password="x",
                name="T",
                phone_number="1",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"ct-{suffix}@example.com",
                code=f"ct-{suffix}",
                roles=[User.UserRole.TEACHER],
            )
            self.student = User.objects.create_user(
                email=f"cs-{suffix}@example.com",
                password="x",
                name="S",
                phone_number="2",
                date_of_birth=date(2000, 1, 1),
                communication_email=f"cs-{suffix}@example.com",
                code=f"cs-{suffix}",
                roles=[User.UserRole.STUDENT],
            )
            UserCourse.objects.create(
                user=self.teacher,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
            )
            UserCourse.objects.create(
                user=self.student,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )

    def _auth(self, user):
        self.client.force_authenticate(user=user)

    def test_course_teacher_can_upload_without_global_permission(self):
        self._auth(self.teacher)
        res = self.client.post(
            f"{self.api_prefix}/users/{self.student.id}/user-images",
            {
                "image_type": "award_image",
                "image": _make_jpeg(),
                "course_id": self.course.id,
            },
            format="multipart",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(res.status_code, 201, res.content)

    def test_course_teacher_can_upload_id_image_with_course_id(self):
        self._auth(self.teacher)
        res = self.client.post(
            f"{self.api_prefix}/users/{self.student.id}/user-images",
            {
                "image_type": "id_image",
                "image": _make_jpeg(),
                "course_id": self.course.id,
            },
            format="multipart",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(res.status_code, 201, res.content)

    def test_course_upload_denied_when_student_not_enrolled(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            other = User.objects.create_user(
                email=f"oth-{suffix}@example.com",
                password="x",
                name="O",
                phone_number="9",
                date_of_birth=date(2000, 1, 1),
                communication_email=f"oth-{suffix}@example.com",
                code=f"oth-{suffix}",
                roles=[User.UserRole.STUDENT],
            )
        self._auth(self.teacher)
        res = self.client.post(
            f"{self.api_prefix}/users/{other.id}/user-images",
            {
                "image_type": "award_image",
                "image": _make_jpeg(),
                "course_id": self.course.id,
            },
            format="multipart",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(res.status_code, 400)

    def test_course_upload_denied_for_student_actor(self):
        self._auth(self.student)
        res = self.client.post(
            f"{self.api_prefix}/users/{self.student.id}/user-images",
            {
                "image_type": "award_image",
                "image": _make_jpeg(),
                "course_id": self.course.id,
            },
            format="multipart",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(res.status_code, 403)
