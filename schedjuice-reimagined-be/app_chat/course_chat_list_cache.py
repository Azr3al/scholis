"""
Invalidate helpers for the retired course-chat HTTP list cache.

List get/set was removed with the unified thread message API; callers still bump
generation / delete_pattern on writes so any leftover Redis keys expire cleanly.
"""
from __future__ import annotations

import logging

from django.core.cache import cache

logger = logging.getLogger(__name__)

CACHE_KEY_PREFIX = "course_chat:list:v1"


def _list_cache_generation_key(schema_name: str, course_id: int) -> str:
    return f"course_chat:list_gen:v1:{schema_name}:{course_id}"


def bump_list_cache_generation(schema_name: str, course_id: int) -> int:
    """
    Invalidate all HTTP list cache entries for this course without delete_pattern
    (LocMem and some Redis clients lack it). Bump generation so cache keys change.
    """
    k = _list_cache_generation_key(schema_name, course_id)
    try:
        cur = cache.get(k)
        n = (int(cur) if cur is not None else 0) + 1
        cache.set(k, n, timeout=365 * 24 * 3600)
        return n
    except (TypeError, ValueError) as e:
        logger.warning("course_chat_list_cache: bump generation failed: %s", e)
        try:
            cache.set(k, 1, timeout=365 * 24 * 3600)
        except Exception:
            logger.exception("course_chat_list_cache: bump fallback set failed")
            return 0
        return 1
    except Exception:
        logger.exception(
            "course_chat_list_cache: bump generation failed schema=%s course=%s",
            schema_name,
            course_id,
        )
        return 0


def invalidate_course_chat_list_cache(schema_name: str, course_id: int) -> None:
    """
    Invalidate all cached list responses for this course.

    Primary mechanism: bump per-course generation (works with LocMem; no delete_pattern).
    Optional: delete_pattern on django-redis to reclaim memory sooner.

    Never raises: chat writes (including post_save) must not fail if cache/redis is down.
    """
    try:
        bump_list_cache_generation(schema_name, course_id)
        try:
            if hasattr(cache, "delete_pattern"):
                pattern = f"*{CACHE_KEY_PREFIX}:{schema_name}:{course_id}:*"
                cache.delete_pattern(pattern)
        except Exception:
            logger.debug(
                "course_chat_list_cache: optional delete_pattern failed schema=%s course=%s",
                schema_name,
                course_id,
                exc_info=True,
            )
    except Exception:
        logger.exception(
            "course_chat_list_cache: invalidate failed schema=%s course=%s",
            schema_name,
            course_id,
        )
