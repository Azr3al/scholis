from __future__ import annotations

from django.test import SimpleTestCase

from app_consultation.booking_fields import (
    BookingDetailsValidationError,
    format_calendar_description,
    parse_booking_details,
)
from app_consultation.consultant_helpers import (
    generate_cancel_token,
    sign_cancel_token,
)
from app_consultation.strategies.lwtp import (
    ClassPreference,
    format_lwtp_calendar_description,
    lwtp_detail_rows,
    parse_lwtp_details,
)
from app_organization.models import Organization


class ParseBookingDetailsDispatchTests(SimpleTestCase):
    def test_non_lwtp_strategy_rejects_lwtp_keys(self):
        with self.assertRaises(BookingDetailsValidationError):
            parse_booking_details(
                {"myanmar_name": "A", "class_preference": "group_class"},
                strategy="other",
            )

    def test_non_lwtp_strategy_allows_empty_details(self):
        self.assertEqual(parse_booking_details({}, strategy="other"), {})
        self.assertEqual(parse_booking_details(None, strategy="other"), {})


class ParseLwtpDetailsTests(SimpleTestCase):
    def test_requires_myanmar_name_and_class_preference(self):
        with self.assertRaises(BookingDetailsValidationError):
            parse_lwtp_details({"class_preference": ClassPreference.GROUP_CLASS})

    def test_normalizes_optional_fields_and_sets_strategy(self):
        details = parse_lwtp_details(
            {
                "myanmar_name": " Myanmar ",
                "class_preference": ClassPreference.BOTH_OK,
                "exam_board": "CIE",
                "subject_ids": [],
                "subject_other": "Custom subject",
                "phone": "+959123",
                "telegram_username": "@student",
                "exam_target": "A-Level",
            }
        )
        self.assertEqual(details["strategy"], "lwtp")
        self.assertEqual(details["myanmar_name"], "Myanmar")
        self.assertEqual(details["class_preference"], ClassPreference.BOTH_OK)
        self.assertEqual(details["telegram_username"], "student")
        self.assertEqual(details["subject_other"], "Custom subject")

    def test_rejects_missing_subjects(self):
        with self.assertRaises(BookingDetailsValidationError):
            parse_lwtp_details(
                {
                    "myanmar_name": "A",
                    "class_preference": ClassPreference.GROUP_CLASS,
                    "exam_board": "CIE",
                    "subject_ids": [],
                }
            )


class LwtpDisplayTests(SimpleTestCase):
    def test_detail_rows_include_class_preference_label(self):
        rows = lwtp_detail_rows(
            {
                "class_preference": ClassPreference.PREMIUM_ONE_ON_ONE,
                "exam_board": "CIE",
                "subject_names": ["CIE Math"],
            }
        )
        labels = dict(rows)
        self.assertIn("Class preference", labels)
        self.assertIn("Premium one on one", labels["Class preference"])

    def test_calendar_description_includes_student_and_details(self):
        text = format_lwtp_calendar_description(
            {"myanmar_name": "U A", "class_preference": ClassPreference.GROUP_CLASS},
            student_name="Student",
            student_email="student@example.com",
        )
        self.assertIn("Student", text)
        self.assertIn("Myanmar name", text)


class FormatCalendarDescriptionTests(SimpleTestCase):
    def test_appends_booking_manage_url_when_provided(self):
        booking = type(
            "Booking",
            (),
            {
                "student_name": "Student",
                "student_email": "student@example.com",
                "details": {},
            },
        )()
        text = format_calendar_description(
            booking,
            booking_manage_url="https://example.com/book-consultation/booking?token=abc",
        )
        self.assertIn("View or cancel booking:", text)
        self.assertIn("token=abc", text)

    def test_resolves_signed_token_from_booking(self):
        token, token_hash = generate_cancel_token()
        booking = type(
            "Booking",
            (),
            {
                "student_name": "Student",
                "student_email": "student@example.com",
                "details": {},
                "cancel_token_signed": sign_cancel_token(token),
            },
        )()
        text = format_calendar_description(booking)
        self.assertIn("View or cancel booking:", text)
        self.assertIn(f"token={token}", text)


class LwtpStrategyConstantTests(SimpleTestCase):
    def test_lwtp_strategy_matches_organization_enum(self):
        self.assertEqual(Organization.ConsultationStrategy.LWTP, "lwtp")
