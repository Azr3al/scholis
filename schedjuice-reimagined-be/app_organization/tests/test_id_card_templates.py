from decimal import Decimal
from io import BytesIO

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_organization.models import IdCardTemplate, Organization


def _png_file(name: str = "bg.png") -> SimpleUploadedFile:
    return SimpleUploadedFile(
        name,
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
        b"\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
        b"\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01"
        b"\r\n-\xdb\x00\x00\x00\x00IEND\xaeB`\x82",
        content_type="image/png",
    )


class IdCardTemplateModelTests(TestCase):
    def setUp(self):
        with schema_context(get_public_schema_name()):
            self.org = Organization.objects.first()

    def test_rejects_non_positive_dimensions(self):
        with schema_context(get_public_schema_name()):
            template = IdCardTemplate(
                organization=self.org,
                name="Bad",
                audience=IdCardTemplate.Audience.STUDENT,
                width_in=Decimal("0"),
                height_in=Decimal("3.375"),
                background=_png_file(),
                slots=[],
            )
            with self.assertRaises(Exception):
                template.full_clean()


class IdCardTemplateApiTests(TestCase):
    def setUp(self):
        with schema_context(get_public_schema_name()):
            self.org = Organization.objects.first()
            self.other_org = Organization.objects.exclude(pk=self.org.pk).first()

    def _create_template(self, org=None, audience=IdCardTemplate.Audience.STUDENT, name="T1"):
        org = org or self.org
        with schema_context(get_public_schema_name()):
            return IdCardTemplate.objects.create(
                organization=org,
                name=name,
                audience=audience,
                width_in=Decimal("2.125"),
                height_in=Decimal("3.375"),
                background=_png_file(f"{name}.png"),
                slots=[
                    {
                        "id": "name",
                        "type": "text",
                        "field": "name",
                        "x": 0.2,
                        "y": 2.0,
                        "width": 1.7,
                        "height": 0.25,
                        "fontSizePt": 14,
                        "fontFamily": "serif",
                        "color": "#111111",
                        "align": "center",
                    }
                ],
            )

    def test_activate_student_template_sets_org_fk(self):
        template = self._create_template()
        with schema_context(get_public_schema_name()):
            self.org.active_student_id_card_template = template
            self.org.save(update_fields=["active_student_id_card_template"])
            self.org.refresh_from_db()
            self.assertEqual(self.org.active_student_id_card_template_id, template.id)

    def test_cannot_delete_only_template_for_audience(self):
        template = self._create_template()
        with schema_context(get_public_schema_name()):
            count = IdCardTemplate.objects.filter(
                organization=self.org,
                audience=IdCardTemplate.Audience.STUDENT,
            ).count()
            self.assertEqual(count, 1)
            remaining = IdCardTemplate.objects.filter(
                organization=self.org,
                audience=IdCardTemplate.Audience.STUDENT,
            ).exclude(pk=template.id)
            self.assertFalse(remaining.exists())

    def test_back_slots_persist_on_template(self):
        template = self._create_template()
        with schema_context(get_public_schema_name()):
            template.back_slots = [
                {
                    "id": "qr-back",
                    "type": "qr",
                    "x": 0.5,
                    "y": 1.0,
                    "width": 1.0,
                    "height": 1.0,
                }
            ]
            template.full_clean()
            template.save(update_fields=["back_slots"])
            template.refresh_from_db()
            self.assertEqual(len(template.back_slots), 1)
            self.assertEqual(template.back_slots[0]["type"], "qr")

    def test_static_text_slot_persists_copy(self):
        template = self._create_template()
        with schema_context(get_public_schema_name()):
            template.slots = [
                {
                    "id": "label",
                    "type": "static_text",
                    "text": "Student ID Card",
                    "x": 0.2,
                    "y": 0.2,
                    "width": 1.7,
                    "height": 0.25,
                    "fontSizePt": 18,
                    "align": "center",
                }
            ]
            template.full_clean()
            template.save(update_fields=["slots"])
            template.refresh_from_db()
            self.assertEqual(template.slots[0]["text"], "Student ID Card")

    def test_background_transform_persists_on_template(self):
        template = self._create_template()
        with schema_context(get_public_schema_name()):
            template.background_transform = {
                "front": {"offsetX": -0.1, "offsetY": 0, "scale": 1.2},
                "back": {"offsetX": 0, "offsetY": 0, "scale": 1},
            }
            template.save(update_fields=["background_transform"])
            template.refresh_from_db()
            self.assertEqual(template.background_transform["front"]["scale"], 1.2)

    def test_rejects_non_positive_background_transform_scale(self):
        from rest_framework.exceptions import ValidationError

        from app_organization.id_card_template_serializers import (
            IdCardTemplateSerializer,
        )

        serializer = IdCardTemplateSerializer()
        with self.assertRaises(ValidationError):
            serializer.validate_background_transform(
                {
                    "front": {"offsetX": 0, "offsetY": 0, "scale": 0},
                    "back": {"offsetX": 0, "offsetY": 0, "scale": 1},
                }
            )

    def test_rejects_invalid_text_slot_font_style(self):
        from rest_framework.exceptions import ValidationError

        from app_organization.id_card_template_serializers import validate_slots

        with self.assertRaises(ValidationError):
            validate_slots(
                [
                    {
                        "id": "name",
                        "type": "text",
                        "field": "name",
                        "x": 0.2,
                        "y": 2.0,
                        "width": 1.7,
                        "height": 0.25,
                        "fontStyle": "italic",
                    }
                ]
            )

    def test_accepts_bold_font_style_on_text_slot(self):
        from app_organization.id_card_template_serializers import validate_slots

        slots = validate_slots(
            [
                {
                    "id": "name",
                    "type": "text",
                    "field": "name",
                    "x": 0.2,
                    "y": 2.0,
                    "width": 1.7,
                    "height": 0.25,
                    "fontStyle": "bold",
                }
            ]
        )
        self.assertEqual(slots[0]["fontStyle"], "bold")


    def test_staff_and_student_templates_are_independent(self):
        student = self._create_template(name="Student")
        staff = self._create_template(
            audience=IdCardTemplate.Audience.STAFF,
            name="Staff",
        )
        with schema_context(get_public_schema_name()):
            self.org.active_student_id_card_template = student
            self.org.active_staff_id_card_template = staff
            self.org.save(
                update_fields=[
                    "active_student_id_card_template",
                    "active_staff_id_card_template",
                ]
            )
            self.org.refresh_from_db()
            self.assertEqual(self.org.active_student_id_card_template_id, student.id)
            self.assertEqual(self.org.active_staff_id_card_template_id, staff.id)


class MobileIdCardFlagPublicPayloadTests(TestCase):
    """The mobile digital-ID page gates template rendering on
    ``is_mobile_id_card_enabled`` read from the public tenant payload."""

    def setUp(self):
        with schema_context(get_public_schema_name()):
            self.org = Organization.objects.first()

    def _public_payload(self):
        from app_organization.serializers import OrganizationTenantPublicSerializer

        with schema_context(get_public_schema_name()):
            return OrganizationTenantPublicSerializer(self.org).data

    def test_flag_defaults_off_in_public_payload(self):
        with schema_context(get_public_schema_name()):
            self.org.is_mobile_id_card_enabled = False
        self.assertIs(self._public_payload()["is_mobile_id_card_enabled"], False)

    def test_flag_reflects_toggle_in_public_payload(self):
        with schema_context(get_public_schema_name()):
            self.org.is_mobile_id_card_enabled = True
        self.assertIs(self._public_payload()["is_mobile_id_card_enabled"], True)
