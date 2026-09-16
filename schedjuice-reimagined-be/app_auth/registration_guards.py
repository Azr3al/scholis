from datetime import timedelta

import pytz
from django.utils import timezone

from app_auth.models import VerificationCode

REGISTRATION_OTP_MAX_AGE_MINUTES = 30


def assert_recent_email_verification(email: str) -> bool:
    cutoff = timezone.now() - timedelta(minutes=REGISTRATION_OTP_MAX_AGE_MINUTES)
    return VerificationCode.objects.filter(
        email__iexact=email.strip(),
        source=VerificationCode.Source.EMAIL_VERIFICATION,
        is_used=True,
        updated_at__gte=cutoff,
    ).exists()
