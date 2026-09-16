from __future__ import annotations

import logging
import queue
import threading
import time
from typing import Callable

logger = logging.getLogger(__name__)


class BackgroundEventQueue:
    """Bounded queue + daemon worker. enqueue() never blocks on network I/O."""

    def __init__(
        self,
        handler: Callable[[dict], None],
        maxsize: int = 10_000,
        flush_interval_s: float = 5.0,
        batch_flush: Callable[[], None] | None = None,
    ) -> None:
        self._handler = handler
        self._batch_flush = batch_flush
        self._queue: queue.Queue[dict | None] = queue.Queue(maxsize=maxsize)
        self._flush_interval_s = flush_interval_s
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self.dropped_count = 0

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="posthog-traffic-worker", daemon=True)
        self._thread.start()

    def enqueue(self, event: dict) -> None:
        try:
            self._queue.put_nowait(event)
        except queue.Full:
            self.dropped_count += 1

    def shutdown(self, timeout: float = 2.0) -> None:
        self._stop.set()
        try:
            self._queue.put_nowait(None)
        except queue.Full:
            pass
        if self._thread:
            self._thread.join(timeout=timeout)

    def _run(self) -> None:
        last_flush = time.monotonic()
        while not self._stop.is_set():
            try:
                event = self._queue.get(timeout=0.25)
            except queue.Empty:
                event = None
            if event is None:
                if self._stop.is_set():
                    break
                continue
            try:
                self._handler(event)
            except Exception:
                logger.warning("traffic analytics handler failed", exc_info=True)
            if self._batch_flush and (time.monotonic() - last_flush) >= self._flush_interval_s:
                try:
                    self._batch_flush()
                except Exception:
                    logger.warning("traffic analytics flush failed", exc_info=True)
                last_flush = time.monotonic()
        if self._batch_flush:
            try:
                self._batch_flush()
            except Exception:
                logger.warning("traffic analytics final flush failed", exc_info=True)
