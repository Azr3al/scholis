from __future__ import annotations

from django.db import connection

from app_demo.config import ResolvedDemoConfig
from app_organization.models import Organization

ALLOWED_ORG_TOGGLE_KEYS = {
    "is_wd_we_course_types_enabled",
    "is_exam_board_in_course_enabled",
    "is_library_disabled",
    "is_homepage_disabled",
    "is_student_login_disabled",
    "can_teacher_create_course",
    "transaction_screenshot_strategy",
    "timezone",
    "currency_fullname",
    "currency_symbol",
    "currency_iso4217",
    "is_building_checkin_enabled",
    "use_teacher_session_checkin",
    "allow_teacher_checkin_history_correction",
    "allow_teacher_checkin_cancellation",
    "campus_checkin_verification_mode",
    "checkin_grace_period_minute",
    "auto_assign_creator_as_main_teacher",
    "is_course_role_enabled",
    "is_discount_eligibility_enabled",
    "is_crm_enabled",
}


def apply_org_toggles(org: Organization, config: ResolvedDemoConfig) -> Organization:
    connection.set_schema_to_public()

    for key, value in config.org_toggles.items():
        if key in ALLOWED_ORG_TOGGLE_KEYS:
            setattr(org, key, value)

    org.name = config.school_name
    org.is_demo = True
    org.save()
    return org
