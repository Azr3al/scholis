from datetime import date, datetime, time, timedelta
from types import SimpleNamespace
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.test import SimpleTestCase
from django.utils import timezone

from app_attendance.checkin_policy import (
    _event_start_utc,
    checkin_allowed_at,
    format_checkin_blocked_message,
    get_checkin_window,
    resolve_checkout_time,
    select_next_checkin_user_event,
    validate_checkin_checkout_pair,
)
from app_auth.models import User

YANGON_TZ = ZoneInfo("Asia/Yangon")


def _tenant(timezone_name="UTC"):
    return SimpleNamespace(timezone=timezone_name)


def _event(event_date, time_from, time_to):
    return SimpleNamespace(
        date=timezone.make_aware(datetime.combine(event_date, time(0, 0)), timezone.utc),
        time_from=time_from,
        time_to=time_to,
    )


def _event_utc_stored(aware_utc_datetime, time_from, time_to):
    return SimpleNamespace(
        date=aware_utc_datetime,
        time_from=time_from,
        time_to=time_to,
    )


def _user_event(event, label=""):
    return SimpleNamespace(event=event, label=label)


class SelectNextCheckinUserEventTest(SimpleTestCase):
    def setUp(self):
        self.event_date = date(2026, 7, 2)
        self.tenant = _tenant("UTC")
        self.grace = 15
        self.morning = _event(self.event_date, time(9, 0), time(10, 0))
        self.afternoon = _event(self.event_date, time(14, 0), time(15, 0))

    def test_skips_ended_first_session_when_second_is_open(self):
        now = timezone.make_aware(datetime.combine(self.event_date, time(14, 30)), timezone.utc)
        user_event, window = select_next_checkin_user_event(
            unchecked_user_events=[
                _user_event(self.morning, "morning"),
                _user_event(self.afternoon, "afternoon"),
            ],
            tenant=self.tenant,
            now=now,
            grace_minutes=self.grace,
        )
        self.assertEqual(user_event.label, "afternoon")
        self.assertTrue(window["allowed"])

    def test_returns_first_when_too_early_for_first_and_second_not_yet_open(self):
        now = timezone.make_aware(datetime.combine(self.event_date, time(8, 30)), timezone.utc)
        user_event, window = select_next_checkin_user_event(
            unchecked_user_events=[
                _user_event(self.morning, "morning"),
                _user_event(self.afternoon, "afternoon"),
            ],
            tenant=self.tenant,
            now=now,
            grace_minutes=self.grace,
        )
        self.assertEqual(user_event.label, "morning")
        self.assertEqual(window["block_reason"], "checkin_too_early")

    def test_returns_last_ended_when_all_unchecked_sessions_are_past(self):
        now = timezone.make_aware(datetime.combine(self.event_date, time(16, 0)), timezone.utc)
        user_event, window = select_next_checkin_user_event(
            unchecked_user_events=[
                _user_event(self.morning, "morning"),
                _user_event(self.afternoon, "afternoon"),
            ],
            tenant=self.tenant,
            now=now,
            grace_minutes=self.grace,
        )
        self.assertEqual(user_event.label, "afternoon")
        self.assertEqual(window["block_reason"], "checkin_after_event_end")


class EventStartUtcTest(SimpleTestCase):
    def test_event_start_uses_tenant_timezone(self):
        event_date = date(2026, 7, 2)
        event = _event(event_date, time(10, 0), time(11, 0))
        start = _event_start_utc(event, _tenant("UTC"))
        self.assertEqual(start, timezone.make_aware(datetime.combine(event_date, time(10, 0)), timezone.utc))


class CheckinWindowTest(SimpleTestCase):
    def setUp(self):
        self.event_date = date(2026, 7, 2)
        self.event = _event(self.event_date, time(10, 0), time(11, 0))
        self.tenant = _tenant("UTC")
        self.grace = 15

    def test_too_early_before_grace_rejected(self):
        now = timezone.make_aware(datetime.combine(self.event_date, time(9, 30)), timezone.utc)
        ok, code = checkin_allowed_at(
            event=self.event,
            tenant=self.tenant,
            now=now,
            grace_minutes=self.grace,
        )
        self.assertFalse(ok)
        self.assertEqual(code, "checkin_too_early")

    def test_within_grace_allowed(self):
        now = timezone.make_aware(datetime.combine(self.event_date, time(9, 50)), timezone.utc)
        ok, code = checkin_allowed_at(
            event=self.event,
            tenant=self.tenant,
            now=now,
            grace_minutes=self.grace,
        )
        self.assertTrue(ok)
        self.assertEqual(code, "")

    def test_after_event_end_rejected(self):
        now = timezone.make_aware(datetime.combine(self.event_date, time(12, 0)), timezone.utc)
        ok, code = checkin_allowed_at(
            event=self.event,
            tenant=self.tenant,
            now=now,
            grace_minutes=self.grace,
        )
        self.assertFalse(ok)
        self.assertEqual(code, "checkin_after_event_end")


class GetCheckinWindowTest(SimpleTestCase):
    def setUp(self):
        self.event_date = date(2026, 7, 2)
        self.event = _event(self.event_date, time(10, 0), time(11, 0))
        self.tenant = _tenant("UTC")
        self.grace = 15

    def test_too_early_returns_window_bounds(self):
        now = timezone.make_aware(datetime.combine(self.event_date, time(9, 30)), timezone.utc)
        window = get_checkin_window(
            event=self.event,
            tenant=self.tenant,
            now=now,
            grace_minutes=self.grace,
        )
        self.assertFalse(window["allowed"])
        self.assertEqual(window["block_reason"], "checkin_too_early")
        self.assertEqual(
            window["opens_at"],
            timezone.make_aware(datetime.combine(self.event_date, time(9, 45)), timezone.utc),
        )
        self.assertEqual(
            window["closes_at"],
            timezone.make_aware(datetime.combine(self.event_date, time(11, 0)), timezone.utc),
        )

    def test_within_window_allowed(self):
        now = timezone.make_aware(datetime.combine(self.event_date, time(9, 50)), timezone.utc)
        window = get_checkin_window(
            event=self.event,
            tenant=self.tenant,
            now=now,
            grace_minutes=self.grace,
        )
        self.assertTrue(window["allowed"])
        self.assertIsNone(window["block_reason"])

    def test_after_end_blocked(self):
        now = timezone.make_aware(datetime.combine(self.event_date, time(12, 0)), timezone.utc)
        window = get_checkin_window(
            event=self.event,
            tenant=self.tenant,
            now=now,
            grace_minutes=self.grace,
        )
        self.assertFalse(window["allowed"])
        self.assertEqual(window["block_reason"], "checkin_after_event_end")


class YangonLocalDateCheckinWindowTest(SimpleTestCase):
    """
    Evening sessions in Asia/Yangon: event.date UTC calendar day can lag the local
    teaching day (see FE attendance-marking date_ymd). Window must use local date.
    """

    def setUp(self):
        self.tenant = _tenant("Asia/Yangon")
        self.grace = 5
        # UTC 2026-07-05 17:30 -> local 2026-07-06 00:00 Yangon (teaching day July 6)
        self.event = _event_utc_stored(
            timezone.make_aware(datetime(2026, 7, 5, 17, 30), timezone.utc),
            time(19, 0),
            time(20, 30),
        )
        self.local_teaching_day = date(2026, 7, 6)

    def test_mid_session_allowed_when_utc_date_lags_local_day(self):
        # 7:00 PM July 6 Yangon = 13:30 UTC
        now = (
            datetime.combine(self.local_teaching_day, time(19, 0))
            .replace(tzinfo=YANGON_TZ)
            .astimezone(timezone.utc)
        )
        window = get_checkin_window(
            event=self.event,
            tenant=self.tenant,
            now=now,
            grace_minutes=self.grace,
        )
        self.assertTrue(window["allowed"])
        self.assertIsNone(window["block_reason"])

    def test_after_local_end_blocked_when_utc_date_lags_local_day(self):
        # 8:45 PM July 6 Yangon = 14:15 UTC (after 20:30 local end)
        now = (
            datetime.combine(self.local_teaching_day, time(20, 45))
            .replace(tzinfo=YANGON_TZ)
            .astimezone(timezone.utc)
        )
        window = get_checkin_window(
            event=self.event,
            tenant=self.tenant,
            now=now,
            grace_minutes=self.grace,
        )
        self.assertFalse(window["allowed"])
        self.assertEqual(window["block_reason"], "checkin_after_event_end")

    def test_event_start_uses_local_teaching_day_not_utc_date(self):
        start = _event_start_utc(self.event, self.tenant)
        expected = (
            datetime.combine(self.local_teaching_day, time(19, 0))
            .replace(tzinfo=YANGON_TZ)
            .astimezone(timezone.utc)
        )
        self.assertEqual(start, expected)


class FormatCheckinBlockedMessageTest(SimpleTestCase):
    def test_too_early_message_includes_local_open_time(self):
        event_date = date(2026, 7, 2)
        event = _event(event_date, time(19, 0), time(20, 30))
        tenant = _tenant("UTC")
        opens_at = timezone.make_aware(datetime.combine(event_date, time(18, 55)), timezone.utc)
        message = format_checkin_blocked_message(
            block_reason="checkin_too_early",
            opens_at=opens_at,
            tenant=tenant,
            grace_minutes=5,
        )
        self.assertIn("Check-in opens at 6:55 PM", message)
        self.assertIn("5 minutes before", message)

    def test_after_end_message(self):
        message = format_checkin_blocked_message(
            block_reason="checkin_after_event_end",
            opens_at=timezone.now(),
            tenant=_tenant("UTC"),
            grace_minutes=5,
        )
        self.assertEqual(message, "This session has ended. Check-in is no longer available.")

    def test_payroll_rate_missing_teacher_message(self):
        from app_attendance.payroll_snapshots import payroll_rate_missing_message

        teacher = User(roles=[User.UserRole.TEACHER])
        self.assertIn(
            "inform your school admin",
            payroll_rate_missing_message(teacher).lower(),
        )

    def test_payroll_rate_missing_admin_message(self):
        from app_attendance.payroll_snapshots import payroll_rate_missing_message

        admin = User(roles=[User.UserRole.ADMIN])
        message = payroll_rate_missing_message(admin)
        self.assertIn("profile", message.lower())
        self.assertIn("course assignment", message.lower())


class ResolveCheckoutTimeTest(SimpleTestCase):
    def setUp(self):
        self.event_date = date(2026, 7, 2)
        self.event = _event(self.event_date, time(9, 0), time(10, 0))
        self.tenant = _tenant("UTC")
        self.checkin = timezone.make_aware(
            datetime.combine(self.event_date, time(9, 5)), timezone.utc
        )
        self.event_end = timezone.make_aware(
            datetime.combine(self.event_date, time(10, 0)), timezone.utc
        )

    def test_at_event_end_unchanged(self):
        resolved = resolve_checkout_time(
            checkin_time=self.checkin,
            proposed_checkout=self.event_end,
            event=self.event,
            tenant=self.tenant,
        )
        self.assertEqual(resolved, self.event_end)

    def test_after_event_end_capped(self):
        proposed = timezone.make_aware(
            datetime.combine(self.event_date, time(10, 30)), timezone.utc
        )
        resolved = resolve_checkout_time(
            checkin_time=self.checkin,
            proposed_checkout=proposed,
            event=self.event,
            tenant=self.tenant,
        )
        self.assertEqual(resolved, self.event_end)

    def test_before_checkin_floored(self):
        proposed = timezone.make_aware(
            datetime.combine(self.event_date, time(9, 0)), timezone.utc
        )
        resolved = resolve_checkout_time(
            checkin_time=self.checkin,
            proposed_checkout=proposed,
            event=self.event,
            tenant=self.tenant,
        )
        self.assertEqual(resolved, self.checkin)


class ValidateCheckinCheckoutPairTest(SimpleTestCase):
    def setUp(self):
        self.event_date = date(2026, 7, 2)
        self.event = _event(self.event_date, time(10, 0), time(11, 0))
        self.tenant = _tenant("UTC")

    def test_checkout_before_checkin_rejected(self):
        checkin = timezone.make_aware(datetime.combine(self.event_date, time(10, 0)), timezone.utc)
        checkout = checkin - timedelta(minutes=5)
        ok, code = validate_checkin_checkout_pair(
            checkin_time=checkin,
            checkout_time=checkout,
            event=self.event,
            tenant=self.tenant,
        )
        self.assertFalse(ok)
        self.assertEqual(code, "checkout_before_checkin")

    def test_checkout_after_event_end_rejected(self):
        checkin = timezone.make_aware(datetime.combine(self.event_date, time(10, 0)), timezone.utc)
        checkout = timezone.make_aware(datetime.combine(self.event_date, time(12, 0)), timezone.utc)
        ok, code = validate_checkin_checkout_pair(
            checkin_time=checkin,
            checkout_time=checkout,
            event=self.event,
            tenant=self.tenant,
        )
        self.assertFalse(ok)
        self.assertEqual(code, "checkout_after_event_end")

    def test_valid_pair_allowed(self):
        checkin = timezone.make_aware(datetime.combine(self.event_date, time(10, 0)), timezone.utc)
        checkout = timezone.make_aware(datetime.combine(self.event_date, time(10, 45)), timezone.utc)
        ok, code = validate_checkin_checkout_pair(
            checkin_time=checkin,
            checkout_time=checkout,
            event=self.event,
            tenant=self.tenant,
        )
        self.assertTrue(ok)
        self.assertEqual(code, "")

    @patch("app_attendance.views._get_event_end_utc")
    def test_skips_event_end_check_when_checkout_missing(self, mock_end):
        checkin = timezone.make_aware(datetime.combine(self.event_date, time(10, 0)), timezone.utc)
        ok, code = validate_checkin_checkout_pair(
            checkin_time=checkin,
            checkout_time=None,
            event=self.event,
            tenant=self.tenant,
        )
        self.assertTrue(ok)
        mock_end.assert_not_called()
