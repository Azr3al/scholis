from __future__ import annotations

import atexit
import threading

from django.conf import settings

from utilitas.traffic_analytics.queue import BackgroundEventQueue

_client = None
_queue = None
_lock = threading.Lock()


def get_event_queue() -> BackgroundEventQueue:
    global _queue
    if _queue is not None:
        return _queue

    with _lock:
        if _queue is None:
            _queue = BackgroundEventQueue(
                handler=_capture_from_worker,
                batch_flush=_flush_client,
            )
            _queue.start()
            atexit.register(_shutdown_queue)
    return _queue


def _shutdown_queue() -> None:
    global _queue
    if _queue is not None:
        _queue.shutdown(timeout=2.0)


def _get_client():
    global _client
    if _client is not None:
        return _client

    with _lock:
        if _client is None:
            import posthog

            posthog.project_api_key = settings.POSTHOG_API_KEY
            posthog.host = settings.POSTHOG_HOST
            posthog.sync_mode = False
            _client = posthog
    return _client


def _capture_from_worker(event: dict) -> None:
    client = _get_client()
    client.capture(
        distinct_id=event.get("distinct_id", "schedjuice-api"),
        event=event["event"],
        properties=event.get("properties") or {},
    )


def _flush_client() -> None:
    client = _get_client()
    client.flush()
