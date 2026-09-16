from __future__ import annotations

from typing import TYPE_CHECKING

from app_consultation.constants import WEEKDAY_KEYS
from app_consultation.models import ConsultationWeeklyWhitelist

if TYPE_CHECKING:
    from app_auth.models import User

LWTP_WINDOW = {"start": "18:00", "end": "20:00"}


def lwtp_schedule_payload() -> dict:
    return {
        day: {"enabled": True, "windows": [dict(LWTP_WINDOW)]}
        for day in WEEKDAY_KEYS
    }


def apply_lwtp_preset(consultant: User) -> ConsultationWeeklyWhitelist:
    whitelist, _created = ConsultationWeeklyWhitelist.objects.update_or_create(
        consultant=consultant,
        defaults={"schedule": lwtp_schedule_payload()},
    )
    return whitelist
