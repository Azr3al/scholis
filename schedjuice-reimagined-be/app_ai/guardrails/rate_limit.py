from __future__ import annotations

import time

from django.conf import settings
from django.core.cache import cache


def check_ai_rate_limit(*, schema_name: str, user_id: int) -> tuple[bool, int]:
    limit = int(getattr(settings, "AI_RATE_LIMIT_PER_USER", 30))
    window = int(getattr(settings, "AI_RATE_LIMIT_WINDOW_SECONDS", 3600))
    key = f"ai_query_rate:{schema_name}:{user_id}"
    now = int(time.time())
    window_start = now - window
    existing = cache.get(key) or []
    existing = [t for t in existing if t > window_start]
    if len(existing) >= limit:
        retry_after = int(existing[0]) + window - now
        return False, max(1, retry_after)
    existing.append(now)
    cache.set(key, existing, timeout=window + 60)
    return True, 0
