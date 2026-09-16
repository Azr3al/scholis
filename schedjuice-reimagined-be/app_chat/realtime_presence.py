from __future__ import annotations

import time
from typing import Any

from django.core.cache import cache

PRESENCE_TTL = 90
TYPING_TTL = 5
TYPING_BROADCAST_MIN_INTERVAL_S = 2.0


def _presence_map_key(schema: str, thread_id: int) -> str:
    return f"chat_presence:{schema}:{thread_id}"


def _typing_map_key(schema: str, thread_id: int) -> str:
    return f"chat_typing:{schema}:{thread_id}"


def _typing_throttle_key(schema: str, thread_id: int, user_id: int) -> str:
    return f"chat_typing_bc:{schema}:{thread_id}:{user_id}"


def _prune_expired(mapping: dict[Any, Any], now: float) -> dict[str, float]:
    if not isinstance(mapping, dict):
        return {}
    out: dict[str, float] = {}
    for uid, exp in mapping.items():
        try:
            exp_f = float(exp)
        except (TypeError, ValueError):
            continue
        if exp_f > now:
            out[str(uid)] = exp_f
    return out


def touch_presence(schema: str, thread_id: int, user_id: int) -> None:
    k = _presence_map_key(schema, thread_id)
    now = time.time()
    data = _prune_expired(cache.get(k) or {}, now)
    data[str(user_id)] = now + PRESENCE_TTL
    cache.set(k, data, timeout=PRESENCE_TTL)


def clear_presence(schema: str, thread_id: int, user_id: int) -> None:
    k = _presence_map_key(schema, thread_id)
    now = time.time()
    data = _prune_expired(cache.get(k) or {}, now)
    data.pop(str(user_id), None)
    if data:
        cache.set(k, data, timeout=PRESENCE_TTL)
    else:
        cache.delete(k)


def online_user_ids(schema: str, thread_id: int) -> list[int]:
    k = _presence_map_key(schema, thread_id)
    now = time.time()
    data = _prune_expired(cache.get(k) or {}, now)
    if data:
        cache.set(k, data, timeout=PRESENCE_TTL)
    out: list[int] = []
    for uid in data:
        try:
            out.append(int(uid))
        except (TypeError, ValueError):
            continue
    return sorted(out)


def set_typing(schema: str, thread_id: int, user_id: int, active: bool) -> None:
    k = _typing_map_key(schema, thread_id)
    now = time.time()
    data = _prune_expired(cache.get(k) or {}, now)
    sk = str(user_id)
    if active:
        data[sk] = now + TYPING_TTL
    else:
        data.pop(sk, None)
    if data:
        cache.set(k, data, timeout=TYPING_TTL + 1)
    else:
        cache.delete(k)


def typing_user_ids(schema: str, thread_id: int) -> list[int]:
    k = _typing_map_key(schema, thread_id)
    now = time.time()
    data = _prune_expired(cache.get(k) or {}, now)
    if data:
        cache.set(k, data, timeout=TYPING_TTL + 1)
    out: list[int] = []
    for uid in data:
        try:
            out.append(int(uid))
        except (TypeError, ValueError):
            continue
    return sorted(out)


def should_broadcast_typing_event(schema: str, thread_id: int, user_id: int) -> bool:
    """Rate-limit typing WS fanout per user in a room."""
    key = _typing_throttle_key(schema, thread_id, user_id)
    now = time.time()
    last = cache.get(key)
    if last is not None:
        try:
            if now - float(last) < TYPING_BROADCAST_MIN_INTERVAL_S:
                return False
        except (TypeError, ValueError):
            pass
    cache.set(key, now, timeout=30)
    return True
