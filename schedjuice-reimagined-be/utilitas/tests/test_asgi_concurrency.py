import asyncio
import json
import time
from unittest import IsolatedAsyncioTestCase

from utilitas.asgi_concurrency import ConcurrencyLimitedASGIApp


def _http_scope(path="/api/v1/courses"):
    return {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "headers": [],
        "client": ("127.0.0.1", 12345),
        "server": ("testserver", 80),
    }


def _websocket_scope():
    return {
        "type": "websocket",
        "asgi": {"version": "3.0"},
        "path": "/ws/chat/threads/1/",
        "headers": [],
    }


async def _receive():
    return {"type": "http.request", "body": b"", "more_body": False}


async def _noop_send(_message):
    return None


async def _ws_receive():
    return {"type": "websocket.disconnect", "code": 1000}


async def _ok_app(scope, receive, send):
    await send(
        {
            "type": "http.response.start",
            "status": 200,
            "headers": [(b"content-type", b"application/json")],
        }
    )
    await send({"type": "http.response.body", "body": b'{"ok":true}'})


async def _ok_websocket_app(scope, receive, send):
    await send({"type": "websocket.accept"})


def _status_and_body(messages):
    start = next(m for m in messages if m["type"] in {"http.response.start", "websocket.accept"})
    body = b"".join(
        m.get("body", b"") for m in messages if m["type"] == "http.response.body"
    )
    headers = {
        k.decode().lower(): v.decode()
        for k, v in start.get("headers", [])
    }
    return start.get("status"), body, headers


class ConcurrencyLimitedASGIAppTests(IsolatedAsyncioTestCase):
    async def test_slot_is_released_when_downstream_app_raises(self):
        async def exploding_app(scope, receive, send):
            raise RuntimeError("boom")

        limiter = ConcurrencyLimitedASGIApp(
            exploding_app,
            limit=1,
            queue_timeout=1.0,
            max_queue=0,
        )
        with self.assertRaises(RuntimeError):
            await limiter(_http_scope(), _receive, _noop_send)

        messages = []

        async def collect(message):
            messages.append(message)

        limiter.app = _ok_app
        await limiter(_http_scope(), _receive, collect)
        status, _body, _headers = _status_and_body(messages)
        self.assertEqual(status, 200)

    async def test_over_limit_returns_503_after_queue_timeout(self):
        release = asyncio.Event()
        held = asyncio.Event()

        async def blocking_app(scope, receive, send):
            held.set()
            await release.wait()
            await _ok_app(scope, receive, send)

        limiter = ConcurrencyLimitedASGIApp(
            blocking_app,
            limit=1,
            queue_timeout=0.05,
            max_queue=8,
        )
        in_flight = asyncio.create_task(
            limiter(_http_scope(), _receive, _noop_send)
        )
        await asyncio.wait_for(held.wait(), timeout=1)

        messages = []

        async def collect(message):
            messages.append(message)

        started = time.monotonic()
        await limiter(_http_scope("/api/v1/users"), _receive, collect)
        elapsed = time.monotonic() - started

        status, body, headers = _status_and_body(messages)
        payload = json.loads(body.decode())
        self.assertEqual(status, 503)
        self.assertEqual(headers.get("retry-after"), "1")
        self.assertTrue(payload["isError"])
        self.assertIn("message", payload)
        self.assertGreaterEqual(elapsed, 0.04)
        self.assertLess(elapsed, 1.0)

        release.set()
        await in_flight

    async def test_full_waiter_queue_sheds_immediately(self):
        release = asyncio.Event()
        held = asyncio.Event()

        async def blocking_app(scope, receive, send):
            held.set()
            await release.wait()
            await _ok_app(scope, receive, send)

        limiter = ConcurrencyLimitedASGIApp(
            blocking_app,
            limit=1,
            queue_timeout=5.0,
            max_queue=1,
        )
        in_flight = asyncio.create_task(
            limiter(_http_scope(), _receive, _noop_send)
        )
        await asyncio.wait_for(held.wait(), timeout=1)

        waiter_started = asyncio.Event()

        async def queued_call():
            waiter_started.set()
            await limiter(_http_scope("/queued"), _receive, _noop_send)

        queued = asyncio.create_task(queued_call())
        await asyncio.wait_for(waiter_started.wait(), timeout=1)
        await asyncio.sleep(0.02)

        messages = []

        async def collect(message):
            messages.append(message)

        started = time.monotonic()
        await limiter(_http_scope("/shed"), _receive, collect)
        elapsed = time.monotonic() - started

        status, body, headers = _status_and_body(messages)
        self.assertEqual(status, 503)
        self.assertEqual(headers.get("retry-after"), "1")
        self.assertLess(elapsed, 0.5)
        self.assertTrue(json.loads(body.decode())["isError"])

        release.set()
        await in_flight
        await queued

    async def test_websocket_scope_bypasses_limiter_when_http_slots_held(self):
        release = asyncio.Event()
        held = asyncio.Event()

        async def mixed_app(scope, receive, send):
            if scope["type"] == "websocket":
                await _ok_websocket_app(scope, receive, send)
                return
            held.set()
            await release.wait()
            await _ok_app(scope, receive, send)

        limiter = ConcurrencyLimitedASGIApp(
            mixed_app,
            limit=1,
            queue_timeout=0.05,
            max_queue=0,
        )
        in_flight = asyncio.create_task(
            limiter(_http_scope(), _receive, _noop_send)
        )
        await asyncio.wait_for(held.wait(), timeout=1)

        messages = []

        async def collect(message):
            messages.append(message)

        await limiter(_websocket_scope(), _ws_receive, collect)
        self.assertEqual(messages[0]["type"], "websocket.accept")

        release.set()
        await in_flight

    async def test_exempt_path_is_served_while_at_limit(self):
        release = asyncio.Event()
        held = asyncio.Event()

        async def blocking_app(scope, receive, send):
            if scope.get("path") == "/api/v1/health":
                await _ok_app(scope, receive, send)
                return
            held.set()
            await release.wait()
            await _ok_app(scope, receive, send)

        limiter = ConcurrencyLimitedASGIApp(
            blocking_app,
            limit=1,
            queue_timeout=0.05,
            max_queue=0,
            exempt_prefixes=("/api/v1/health",),
        )
        in_flight = asyncio.create_task(
            limiter(_http_scope(), _receive, _noop_send)
        )
        await asyncio.wait_for(held.wait(), timeout=1)

        messages = []

        async def collect(message):
            messages.append(message)

        await limiter(_http_scope("/api/v1/health"), _receive, collect)
        status, _body, _headers = _status_and_body(messages)
        self.assertEqual(status, 200)

        release.set()
        await in_flight

    async def test_limit_zero_disables_limiter(self):
        in_flight = 0
        max_in_flight = 0
        release = asyncio.Event()
        entered = asyncio.Event()

        async def counting_app(scope, receive, send):
            nonlocal in_flight, max_in_flight
            in_flight += 1
            max_in_flight = max(max_in_flight, in_flight)
            entered.set()
            await release.wait()
            in_flight -= 1
            await _ok_app(scope, receive, send)

        limiter = ConcurrencyLimitedASGIApp(
            counting_app,
            limit=0,
            queue_timeout=0.05,
            max_queue=0,
        )
        t1 = asyncio.create_task(limiter(_http_scope(), _receive, _noop_send))
        t2 = asyncio.create_task(limiter(_http_scope(), _receive, _noop_send))
        await asyncio.wait_for(entered.wait(), timeout=1)
        await asyncio.sleep(0.02)
        self.assertGreaterEqual(max_in_flight, 2)
        release.set()
        await asyncio.gather(t1, t2)
