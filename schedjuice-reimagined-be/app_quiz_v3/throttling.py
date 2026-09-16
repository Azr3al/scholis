"""Per-quiz, per-user rate limits for quiz take endpoints."""

import time
from typing import Any

from django.core.cache import cache
from rest_framework.throttling import SimpleRateThrottle


class QuizTakeUserThrottle(SimpleRateThrottle):
    """
    Scoped bucket ``quiz_take_{quiz_id}_{user_or_ip}``.

    ``allow_request`` re-parses the rate from the view's
    ``_quiz_take_requests_per_minute`` (default 30).
    """

    cache = cache
    timer = time.time

    def __init__(self):
        self.rate = "30/minute"
        self.num_requests, self.duration = self.parse_rate(self.rate)

    def get_cache_key(self, request: Any, view: Any) -> str | None:
        quiz_id = getattr(view, "_quiz_take_throttle_quiz_id", None)
        if quiz_id is None:
            quiz_id = 0
        if request.user and getattr(request.user, "is_authenticated", False):
            ident = (
                getattr(request.user, "pk", None)
                or getattr(request.user, "id", None)
                or str(request.user)
            )
        else:
            ident = self.get_ident(request)
        return f"quiz_take_throttle_{quiz_id}_{ident}"

    def allow_request(self, request: Any, view: Any) -> bool:
        rpm = getattr(view, "_quiz_take_requests_per_minute", None)
        if rpm is None:
            rpm = 30
        self.num_requests, self.duration = self.parse_rate(f"{rpm}/minute")
        return super().allow_request(request, view)
