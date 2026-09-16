"""HTTP-only ASGI concurrency ceiling.

Sheds overload with a fast 503 instead of accumulating threads and Postgres
connections until the process is killed. WebSocket scopes are never counted.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, Iterable


SHED_MESSAGE = "Server is busy. Retry shortly."
RETRY_AFTER_SECONDS = "1"


class ConcurrencyLimitedASGIApp:
    """Wrap a downstream ASGI app and bound in-flight HTTP requests.

    The semaphore is created lazily on first use so it binds to the running
    event loop (Daphne) and the wrapper stays constructible in tests.
    """

    def __init__(
        self,
        app,
        *,
        limit: int,
        queue_timeout: float,
        max_queue: int,
        exempt_prefixes: Iterable[str] = (),
    ):
        self.app = app
        self.limit = int(limit)
        self.queue_timeout = float(queue_timeout)
        self.max_queue = int(max_queue)
        self.exempt_prefixes = tuple(exempt_prefixes)
        self._semaphore: asyncio.Semaphore | None = None
        self._waiters = 0

    def _get_semaphore(self) -> asyncio.Semaphore:
        if self._semaphore is None:
            self._semaphore = asyncio.Semaphore(self.limit)
        return self._semaphore

    def _is_exempt(self, path: str) -> bool:
        return any(path.startswith(prefix) for prefix in self.exempt_prefixes)

    async def __call__(self, scope: dict[str, Any], receive, send) -> None:
        if scope.get("type") != "http" or self.limit <= 0:
            await self.app(scope, receive, send)
            return

        path = scope.get("path") or ""
        if self._is_exempt(path):
            await self.app(scope, receive, send)
            return

        sem = self._get_semaphore()
        if sem.locked() and self._waiters >= self.max_queue:
            await self._shed(send)
            return

        self._waiters += 1
        try:
            await asyncio.wait_for(sem.acquire(), timeout=self.queue_timeout)
        except TimeoutError:
            await self._shed(send)
            return
        finally:
            self._waiters -= 1

        try:
            await self.app(scope, receive, send)
        finally:
            sem.release()

    async def _shed(self, send) -> None:
        body = json.dumps(
            {
                "isError": True,
                "message": SHED_MESSAGE,
                "details": {},
            }
        ).encode("utf-8")
        await send(
            {
                "type": "http.response.start",
                "status": 503,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"retry-after", RETRY_AFTER_SECONDS.encode("ascii")),
                    (b"content-length", str(len(body)).encode("ascii")),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})
