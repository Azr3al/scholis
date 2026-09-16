# Traffic Analytics (PostHog) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship PostHog Cloud (US) traffic analytics so platform operators can rank top pages and API routes by volume, latency, DB cost, errors, and payload size — without blocking app requests.

**Architecture:** Django `TrafficAnalyticsMiddleware` measures request metrics on the hot path and enqueues plain dicts into a bounded background queue; a daemon thread is the **only** place that calls `posthog.capture()`. Next.js fires async batched `$pageview` events with normalized paths. PostHog Cloud is the sole UI.

**Tech Stack:** Django 4.2, `posthog` Python SDK, Next.js 15 App Router, `posthog-js`, PostHog Cloud US (`https://us.i.posthog.com`).

**Spec:** `docs/superpowers/specs/2026-07-02-traffic-analytics-posthog-design.md`

**Conventions:**
- Backend tests: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh <target>` (always `--keepdb --noinput`).
- Frontend unit tests: `cd schedjuice-reimagined-fe && pnpm test:unit`.
- Work on the current branch (`dev`); do not create feature branches.
- `POSTHOG_ENABLED` defaults **false** — no events unless explicitly enabled.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `schedjuice-reimagined-be/utilitas/traffic_analytics/__init__.py` | Package export |
| `schedjuice-reimagined-be/utilitas/traffic_analytics/db_metrics.py` | `DbMetricsCollector` via `execute_wrapper` |
| `schedjuice-reimagined-be/utilitas/traffic_analytics/sampling.py` | Deterministic 50% success sampling + always-include rules |
| `schedjuice-reimagined-be/utilitas/traffic_analytics/routes.py` | Route template + skip-path helpers |
| `schedjuice-reimagined-be/utilitas/traffic_analytics/queue.py` | Bounded non-blocking queue + daemon worker |
| `schedjuice-reimagined-be/utilitas/traffic_analytics/client.py` | Lazy PostHog client; worker-only capture |
| `schedjuice-reimagined-be/utilitas/traffic_analytics/middleware.py` | Measure, sample, enqueue |
| `schedjuice-reimagined-be/utilitas/traffic_analytics/apps.py` | AppConfig; start worker; shutdown flush |
| `schedjuice-reimagined-be/utilitas/tests/test_traffic_analytics_*.py` | Unit + middleware tests |
| `schedjuice-reimagined-be/schedjuice_backend/settings.py` | Env flags + middleware registration |
| `schedjuice-reimagined-be/requirements.txt` | Add `posthog` |
| `schedjuice-reimagined-be/.env.example` | PostHog env vars |
| `docs/ops/posthog-traffic-analytics.md` | PostHog Cloud setup + dashboard runbook |
| `schedjuice-reimagined-fe/src/lib/posthog.ts` | Init, normalizePath, shouldTrackPage |
| `schedjuice-reimagined-fe/src/lib/posthog.test.ts` | Path normalization tests |
| `schedjuice-reimagined-fe/src/components/providers/posthog-provider.tsx` | `$pageview` on navigation |
| `schedjuice-reimagined-fe/src/components/providers.tsx` | Mount PostHogProvider |
| `schedjuice-reimagined-fe/.env.example` | Public PostHog keys + dashboard URL |
| `schedjuice-reimagined-fe/src/app/(internal)/debug/page.tsx` | Link card to PostHog dashboard |

---

### Task 1: PostHog Cloud setup + env documentation

> **Note (2026-07):** Originally self-hosted Docker Compose; migrated to **PostHog Cloud US**.
> `infra/posthog/docker-compose.yml` removed. Ops setup is account signup only — see runbook.

**Files:**
- Create: `docs/ops/posthog-traffic-analytics.md`
- Modify: `schedjuice-reimagined-be/.env.example`
- Modify: `schedjuice-reimagined-fe/.env.example`

- [ ] **Step 1: Write ops runbook**

Create `docs/ops/posthog-traffic-analytics.md` with sections:
1. Create PostHog Cloud US account + project `schedjuice-production`
2. Copy API keys; set `POSTHOG_HOST=https://us.i.posthog.com`
3. Env vars for BE/FE staging → prod rollout phases
4. Five saved dashboard definitions
5. Verification via Live events
6. Non-blocking checklist (block ingest or revoke key; app still works)

- [ ] **Step 2: Document backend env vars**

Append to `schedjuice-reimagined-be/.env.example`:

```bash
# Traffic analytics (PostHog Cloud US) — disabled unless POSTHOG_ENABLED=true
POSTHOG_ENABLED=false
POSTHOG_HOST=https://us.i.posthog.com
POSTHOG_API_KEY=
POSTHOG_API_SAMPLE_RATE=0.5
POSTHOG_ENVIRONMENT=development
```

- [ ] **Step 3: Document frontend env vars**

Append to `schedjuice-reimagined-fe/.env.example`:

```bash
# PostHog Cloud US (pageviews; disabled when key unset)
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_DASHBOARD_URL=https://us.posthog.com/project/<project-id>/dashboard/<dashboard-id>
NEXT_PUBLIC_POSTHOG_ENVIRONMENT=development
```

- [ ] **Step 4: Commit**

```bash
git add docs/ops/posthog-traffic-analytics.md \
  schedjuice-reimagined-be/.env.example schedjuice-reimagined-fe/.env.example
git commit -m "docs: add PostHog Cloud traffic analytics runbook and env vars"
```

---

### Task 2: DB metrics collector

**Files:**
- Create: `schedjuice-reimagined-be/utilitas/traffic_analytics/db_metrics.py`
- Create: `schedjuice-reimagined-be/utilitas/tests/test_traffic_analytics_db_metrics.py`

- [ ] **Step 1: Write failing test**

```python
# utilitas/tests/test_traffic_analytics_db_metrics.py
import time
from django.db import connection
from django.test import TestCase

from utilitas.traffic_analytics.db_metrics import DbMetricsCollector


class DbMetricsCollectorTests(TestCase):
    databases = {"default"}

    def test_counts_queries_and_accumulates_time(self):
        collector = DbMetricsCollector()
        with collector.wrap():
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.execute("SELECT 2")
        self.assertEqual(collector.query_count, 2)
        self.assertGreater(collector.query_time_ms, 0.0)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh utilitas.tests.test_traffic_analytics_db_metrics -v
```

Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Implement collector**

```python
# utilitas/traffic_analytics/db_metrics.py
from __future__ import annotations

import time
from contextlib import ContextDecorator
from django.db import connection


class DbMetricsCollector(ContextDecorator):
    """Count ORM/DB queries and cumulative wall time via execute_wrapper."""

    def __init__(self) -> None:
        self.query_count = 0
        self.query_time_ms = 0.0

    def wrap(self):
        return _DbMetricsContext(self)


class _DbMetricsContext:
    def __init__(self, collector: DbMetricsCollector) -> None:
        self._collector = collector
        self._wrapper = None

    def __enter__(self):
        collector = self._collector

        def _execute_wrapper(execute, sql, params, many, context):
            start = time.perf_counter()
            try:
                return execute(sql, params, many, context)
            finally:
                collector.query_count += 1
                collector.query_time_ms += (time.perf_counter() - start) * 1000.0

        self._wrapper = connection.execute_wrapper(_execute_wrapper)
        self._wrapper.__enter__()
        return collector

    def __exit__(self, *exc):
        if self._wrapper is not None:
            self._wrapper.__exit__(*exc)
        return False
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh utilitas.tests.test_traffic_analytics_db_metrics -v
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add utilitas/traffic_analytics/db_metrics.py utilitas/tests/test_traffic_analytics_db_metrics.py
git commit -m "feat: add DB metrics collector for traffic analytics"
```

---

### Task 3: Route helpers + sampling

**Files:**
- Create: `schedjuice-reimagined-be/utilitas/traffic_analytics/routes.py`
- Create: `schedjuice-reimagined-be/utilitas/traffic_analytics/sampling.py`
- Create: `schedjuice-reimagined-be/utilitas/tests/test_traffic_analytics_routes.py`
- Create: `schedjuice-reimagined-be/utilitas/tests/test_traffic_analytics_sampling.py`

- [ ] **Step 1: Write failing route tests**

```python
# utilitas/tests/test_traffic_analytics_routes.py
from django.test import SimpleTestCase
from types import SimpleNamespace

from utilitas.traffic_analytics.routes import (
    resolve_route_template,
    should_track_api_path,
)


class RouteHelperTests(SimpleTestCase):
    def test_should_track_api_v1_only(self):
        self.assertTrue(should_track_api_path("/api/v1/courses"))
        self.assertFalse(should_track_api_path("/api/v1/health"))
        self.assertFalse(should_track_api_path("/admin/"))
        self.assertFalse(should_track_api_path("/silk/"))

    def test_resolve_route_template_from_resolver_match(self):
        request = SimpleNamespace(
            path="/api/v1/courses/42/attendance-marking",
            resolver_match=SimpleNamespace(route="courses/<int:pk>/attendance-marking"),
        )
        self.assertEqual(
            resolve_route_template(request),
            "courses/<int:pk>/attendance-marking",
        )

    def test_fallback_strips_api_prefix(self):
        request = SimpleNamespace(path="/api/v1/unknown-path", resolver_match=None)
        self.assertEqual(resolve_route_template(request), "unknown-path")
```

- [ ] **Step 2: Write failing sampling tests**

```python
# utilitas/tests/test_traffic_analytics_sampling.py
from django.test import SimpleTestCase

from utilitas.traffic_analytics.sampling import should_sample_event


class SamplingTests(SimpleTestCase):
    def test_always_sample_errors(self):
        self.assertTrue(
            should_sample_event(
                dedupe_key="k",
                status_code=500,
                response_ms=10,
                db_query_count=1,
                sample_rate=0.5,
            )
        )

    def test_always_sample_slow(self):
        self.assertTrue(
            should_sample_event(
                dedupe_key="k",
                status_code=200,
                response_ms=1500,
                db_query_count=1,
                sample_rate=0.5,
            )
        )

    def test_always_sample_heavy_db(self):
        self.assertTrue(
            should_sample_event(
                dedupe_key="k",
                status_code=200,
                response_ms=10,
                db_query_count=25,
                sample_rate=0.5,
            )
        )

    def test_success_sampling_is_deterministic(self):
        key = "courses/<int:pk>:abc123"
        first = should_sample_event(key, 200, 10, 1, 0.5)
        second = should_sample_event(key, 200, 10, 1, 0.5)
        self.assertEqual(first, second)

    def test_success_sampling_near_half(self):
        sample_rate = 0.5
        total = 10_000
        sampled = sum(
            1
            for i in range(total)
            if should_sample_event(f"route:{i}", 200, 10, 1, sample_rate)
        )
        self.assertGreater(sampled, total * 0.45)
        self.assertLess(sampled, total * 0.55)
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh \
  utilitas.tests.test_traffic_analytics_routes \
  utilitas.tests.test_traffic_analytics_sampling -v
```

- [ ] **Step 4: Implement routes + sampling**

```python
# utilitas/traffic_analytics/routes.py
from __future__ import annotations

SKIP_API_PREFIXES = (
    "/api/v1/health",
    "/api/v1/admin",
)


def should_track_api_path(path: str, method: str = "GET") -> bool:
    if method == "OPTIONS":
        return False
    if not path.startswith("/api/v1/"):
        return False
    if path.startswith("/silk/"):
        return False
    return not any(path.startswith(p) for p in SKIP_API_PREFIXES)


def resolve_route_template(request) -> str:
    match = getattr(request, "resolver_match", None)
    if match and getattr(match, "route", None):
        return str(match.route)
    path = getattr(request, "path", "") or ""
    if path.startswith("/api/v1/"):
        return path[len("/api/v1/") :].lstrip("/") or "root"
    return path.lstrip("/") or "root"
```

```python
# utilitas/traffic_analytics/sampling.py
from __future__ import annotations

SLOW_MS = 1000
HEAVY_DB_QUERIES = 20


def should_sample_event(
    dedupe_key: str,
    status_code: int,
    response_ms: float,
    db_query_count: int,
    sample_rate: float,
) -> bool:
    if status_code >= 400:
        return True
    if response_ms >= SLOW_MS:
        return True
    if db_query_count >= HEAVY_DB_QUERIES:
        return True
    bucket = hash(dedupe_key) % 10_000
    return bucket < int(sample_rate * 10_000)
```

- [ ] **Step 5: Run tests and commit**

```bash
cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh \
  utilitas.tests.test_traffic_analytics_routes \
  utilitas.tests.test_traffic_analytics_sampling -v
git add utilitas/traffic_analytics/routes.py utilitas/traffic_analytics/sampling.py \
  utilitas/tests/test_traffic_analytics_routes.py utilitas/tests/test_traffic_analytics_sampling.py
git commit -m "feat: add traffic analytics route helpers and sampling"
```

---

### Task 4: Non-blocking background queue (hard requirement)

**Files:**
- Create: `schedjuice-reimagined-be/utilitas/traffic_analytics/queue.py`
- Create: `schedjuice-reimagined-be/utilitas/tests/test_traffic_analytics_queue.py`

- [ ] **Step 1: Write failing tests**

```python
# utilitas/tests/test_traffic_analytics_queue.py
import threading
import time
from unittest.mock import MagicMock

from django.test import SimpleTestCase

from utilitas.traffic_analytics.queue import BackgroundEventQueue


class BackgroundEventQueueTests(SimpleTestCase):
    def test_enqueue_returns_immediately_before_worker_runs(self):
        started = threading.Event()
        release = threading.Event()
        processed = []

        def slow_handler(event):
            started.set()
            release.wait(timeout=2)
            processed.append(event)

        q = BackgroundEventQueue(maxsize=10, handler=slow_handler, flush_interval_s=60)
        q.start()
        try:
            q.enqueue({"id": 1})
            # Handler blocked — event not processed yet
            self.assertFalse(processed)
            release.set()
            deadline = time.time() + 2
            while time.time() < deadline and not processed:
                time.sleep(0.01)
            self.assertEqual(processed, [{"id": 1}])
        finally:
            q.shutdown(timeout=1)

    def test_full_queue_drops_without_blocking(self):
        blocker = threading.Event()
        processed = []

        def handler(event):
            blocker.wait(timeout=2)
            processed.append(event)

        q = BackgroundEventQueue(maxsize=1, handler=handler, flush_interval_s=60)
        q.start()
        try:
            q.enqueue({"id": 1})  # fills queue while handler blocked
            t0 = time.perf_counter()
            q.enqueue({"id": 2})  # should drop instantly
            elapsed = time.perf_counter() - t0
            self.assertLess(elapsed, 0.05)
            self.assertEqual(q.dropped_count, 1)
        finally:
            blocker.set()
            q.shutdown(timeout=2)

    def test_handler_exception_does_not_crash_worker(self):
        calls = {"n": 0}

        def handler(event):
            calls["n"] += 1
            if event["fail"]:
                raise RuntimeError("posthog down")

        q = BackgroundEventQueue(maxsize=10, handler=handler, flush_interval_s=60)
        q.start()
        try:
            q.enqueue({"fail": True})
            q.enqueue({"fail": False})
            deadline = time.time() + 2
            while time.time() < deadline and calls["n"] < 2:
                time.sleep(0.01)
            self.assertEqual(calls["n"], 2)
        finally:
            q.shutdown(timeout=1)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh utilitas.tests.test_traffic_analytics_queue -v
```

- [ ] **Step 3: Implement queue**

```python
# utilitas/traffic_analytics/queue.py
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh utilitas.tests.test_traffic_analytics_queue -v
```

- [ ] **Step 5: Commit**

```bash
git add utilitas/traffic_analytics/queue.py utilitas/tests/test_traffic_analytics_queue.py
git commit -m "feat: add non-blocking background queue for PostHog events"
```

---

### Task 5: PostHog client + middleware + settings wiring

**Files:**
- Create: `schedjuice-reimagined-be/utilitas/traffic_analytics/client.py`
- Create: `schedjuice-reimagined-be/utilitas/traffic_analytics/middleware.py`
- Create: `schedjuice-reimagined-be/utilitas/traffic_analytics/apps.py`
- Create: `schedjuice-reimagined-be/utilitas/traffic_analytics/__init__.py`
- Create: `schedjuice-reimagined-be/utilitas/tests/test_traffic_analytics_middleware.py`
- Modify: `schedjuice-reimagined-be/requirements.txt`
- Modify: `schedjuice-reimagined-be/schedjuice_backend/settings.py`

- [ ] **Step 1: Add dependency**

Append to `requirements.txt`:

```
posthog==3.7.4
```

Install locally: `cd schedjuice-reimagined-be && ./env/bin/pip install posthog==3.7.4`

- [ ] **Step 2: Write failing middleware tests**

```python
# utilitas/tests/test_traffic_analytics_middleware.py
import time
from unittest.mock import patch

from django.http import HttpResponse
from django.test import RequestFactory, SimpleTestCase, override_settings

from utilitas.traffic_analytics.middleware import TrafficAnalyticsMiddleware


class TrafficAnalyticsMiddlewareTests(SimpleTestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.queue_mock = patch("utilitas.traffic_analytics.middleware.get_event_queue").start()
        self.queue = self.queue_mock.return_value
        self.addCleanup(patch.stopall)

    @override_settings(
        POSTHOG_ENABLED=True,
        POSTHOG_API_SAMPLE_RATE=1.0,
        POSTHOG_ENVIRONMENT="test",
    )
    def test_enqueues_api_request_with_metrics(self):
        def get_response(request):
            return HttpResponse('{"ok":true}', content_type="application/json", status=200)

        request = self.factory.get("/api/v1/courses/1")
        request.resolver_match = type("M", (), {"route": "courses/<int:pk>"})()

        mw = TrafficAnalyticsMiddleware(get_response)
        response = mw(request)

        self.assertEqual(response.status_code, 200)
        self.queue.enqueue.assert_called_once()
        event = self.queue.enqueue.call_args[0][0]
        self.assertEqual(event["event"], "api_request")
        self.assertEqual(event["properties"]["route_template"], "courses/<int:pk>")
        self.assertEqual(event["properties"]["status_code"], 200)
        self.assertIn("response_ms", event["properties"])
        self.assertIn("db_query_count", event["properties"])

    @override_settings(POSTHOG_ENABLED=True, POSTHOG_API_SAMPLE_RATE=1.0)
    def test_skips_non_api_paths(self):
        mw = TrafficAnalyticsMiddleware(lambda r: HttpResponse("ok"))
        mw(self.factory.get("/admin/"))
        self.queue.enqueue.assert_not_called()

    @override_settings(POSTHOG_ENABLED=True, POSTHOG_API_SAMPLE_RATE=1.0)
    def test_enqueue_failure_does_not_break_response(self):
        self.queue.enqueue.side_effect = RuntimeError("boom")

        mw = TrafficAnalyticsMiddleware(lambda r: HttpResponse("ok"))
        request = self.factory.get("/api/v1/home")
        request.resolver_match = type("M", (), {"route": "home"})()
        response = mw(request)
        self.assertEqual(response.status_code, 200)

    @override_settings(POSTHOG_ENABLED=False)
    def test_disabled_via_settings(self):
        mw = TrafficAnalyticsMiddleware(lambda r: HttpResponse("ok"))
        request = self.factory.get("/api/v1/home")
        request.resolver_match = type("M", (), {"route": "home"})()
        mw(request)
        self.queue.enqueue.assert_not_called()
```

- [ ] **Step 3: Implement client + middleware + app config**

`client.py` — lazy singleton PostHog client; `capture_event(event_dict)` called **only** from queue worker:

```python
# utilitas/traffic_analytics/client.py
from __future__ import annotations

import atexit
import threading

from django.conf import settings

_client = None
_lock = threading.Lock()
_queue = None


def get_event_queue():
    global _queue
    if _queue is None:
        from utilitas.traffic_analytics.queue import BackgroundEventQueue

        _queue = BackgroundEventQueue(handler=_capture_from_worker, batch_flush=_flush_client)
        _queue.start()
        atexit.register(lambda: _queue.shutdown(timeout=2.0))
    return _queue


def _get_client():
    global _client
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
```

`middleware.py`:

```python
# utilitas/traffic_analytics/middleware.py
from __future__ import annotations

import logging
import time
import uuid

from django.conf import settings
from django.db import connection

from utilitas.traffic_analytics.client import get_event_queue
from utilitas.traffic_analytics.db_metrics import DbMetricsCollector
from utilitas.traffic_analytics.routes import resolve_route_template, should_track_api_path
from utilitas.traffic_analytics.sampling import should_sample_event

logger = logging.getLogger(__name__)


class TrafficAnalyticsMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if not getattr(settings, "POSTHOG_ENABLED", False):
            return self.get_response(request)
        if not should_track_api_path(request.path, request.method):
            return self.get_response(request)

        started = time.perf_counter()
        request_id = request.META.get("HTTP_X_REQUEST_ID") or str(uuid.uuid4())
        db = DbMetricsCollector()

        with db.wrap():
            response = self.get_response(request)

        response_ms = (time.perf_counter() - started) * 1000.0
        route_template = resolve_route_template(request)
        status_code = response.status_code
        sample_rate = float(getattr(settings, "POSTHOG_API_SAMPLE_RATE", 0.5))

        dedupe_key = f"{route_template}:{request_id}"
        if not should_sample_event(
            dedupe_key, status_code, response_ms, db.query_count, sample_rate
        ):
            return response

        tenant = getattr(connection, "tenant", None)
        tenant_schema = getattr(connection, "schema_name", None) or "unknown"
        org_id = getattr(tenant, "id", None)

        try:
            response_bytes = len(response.content) if hasattr(response, "content") else 0
        except Exception:
            response_bytes = 0

        sampled = status_code < 400 and sample_rate < 1.0
        try:
            get_event_queue().enqueue(
                {
                    "distinct_id": f"api:{tenant_schema}",
                    "event": "api_request",
                    "properties": {
                        "route_template": route_template,
                        "method": request.method,
                        "status_code": status_code,
                        "response_ms": round(response_ms, 2),
                        "db_query_count": db.query_count,
                        "db_time_ms": round(db.query_time_ms, 2),
                        "response_bytes": response_bytes,
                        "tenant_schema": tenant_schema,
                        "org_id": org_id,
                        "environment": getattr(settings, "POSTHOG_ENVIRONMENT", "unknown"),
                        "sampled": sampled,
                        "sample_rate": sample_rate if sampled else 1.0,
                    },
                }
            )
        except Exception:
            logger.warning("traffic analytics enqueue failed", exc_info=True)

        return response
```

`apps.py`:

```python
# utilitas/traffic_analytics/apps.py
from django.apps import AppConfig


class TrafficAnalyticsConfig(AppConfig):
    name = "utilitas.traffic_analytics"
    label = "traffic_analytics"

    def ready(self):
        from django.conf import settings

        if getattr(settings, "POSTHOG_ENABLED", False):
            from utilitas.traffic_analytics.client import get_event_queue

            get_event_queue().start()
```

Add empty `__init__.py` in `utilitas/traffic_analytics/`.

- [ ] **Step 4: Wire settings**

In `schedjuice_backend/settings.py` add near other feature flags:

```python
POSTHOG_ENABLED = config("POSTHOG_ENABLED", default=False, cast=bool)
POSTHOG_HOST = config("POSTHOG_HOST", default="")
POSTHOG_API_KEY = config("POSTHOG_API_KEY", default="")
POSTHOG_API_SAMPLE_RATE = config("POSTHOG_API_SAMPLE_RATE", default=0.5, cast=float)
POSTHOG_ENVIRONMENT = config("POSTHOG_ENVIRONMENT", default="development")
```

Append to `INSTALLED_APPS` (shared utilitas area — add string `"utilitas.traffic_analytics.apps.TrafficAnalyticsConfig"` near other utilitas apps or at end of TENANT_APPS if that's where utilitas lives; prefer **one** registration in the app list that loads on all workers).

Append middleware **after** tenant middleware, **before** response returns:

```python
if POSTHOG_ENABLED:
    MIDDLEWARE.append("utilitas.traffic_analytics.middleware.TrafficAnalyticsMiddleware")
```

- [ ] **Step 5: Run tests and commit**

```bash
cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh utilitas.tests.test_traffic_analytics_middleware -v
git add requirements.txt utilitas/traffic_analytics/ utilitas/tests/test_traffic_analytics_middleware.py \
  schedjuice_backend/settings.py
git commit -m "feat: add non-blocking PostHog API traffic middleware"
```

---

### Task 6: Frontend PostHog lib + unit tests

**Files:**
- Create: `schedjuice-reimagined-fe/src/lib/posthog.ts`
- Create: `schedjuice-reimagined-fe/src/lib/posthog.test.ts`

- [ ] **Step 1: Install dependency**

```bash
cd schedjuice-reimagined-fe && pnpm add posthog-js
```

- [ ] **Step 2: Write failing tests**

```typescript
// src/lib/posthog.test.ts
import { describe, expect, it } from "vitest";
import { normalizePath, shouldTrackPage } from "./posthog";

describe("normalizePath", () => {
  it("replaces numeric segments with :id", () => {
    expect(normalizePath("/courses/42/attendance/marking/3")).toBe(
      "/courses/:id/attendance/marking/:id",
    );
  });

  it("preserves static segments", () => {
    expect(normalizePath("/finances/student-payments")).toBe(
      "/finances/student-payments",
    );
  });
});

describe("shouldTrackPage", () => {
  it("includes help and platform docs", () => {
    expect(shouldTrackPage("/help/getting-started")).toBe(true);
    expect(shouldTrackPage("/platform/docs/abc")).toBe(true);
  });

  it("includes internal routes", () => {
    expect(shouldTrackPage("/courses/1/attendance")).toBe(true);
  });

  it("excludes debug and auth public routes", () => {
    expect(shouldTrackPage("/debug/cron-jobs")).toBe(false);
    expect(shouldTrackPage("/components/type")).toBe(false);
    expect(shouldTrackPage("/login")).toBe(false);
    expect(shouldTrackPage("/register")).toBe(false);
    expect(shouldTrackPage("/verify/token")).toBe(false);
    expect(shouldTrackPage("/join-course/abc")).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd schedjuice-reimagined-fe && pnpm test:unit src/lib/posthog.test.ts
```

- [ ] **Step 4: Implement lib**

```typescript
// src/lib/posthog.ts
import posthog from "posthog-js";

const EXCLUDED_PREFIXES = [
  "/debug",
  "/components",
  "/login",
  "/register",
  "/verify",
  "/join-course",
];

export function normalizePath(pathname: string): string {
  return pathname
    .split("/")
    .map((segment) => {
      if (!segment) return segment;
      if (/^\d+$/.test(segment)) return ":id";
      if (/^[0-9a-f-]{36}$/i.test(segment)) return ":id";
      return segment;
    })
    .join("/");
}

export function shouldTrackPage(pathname: string): boolean {
  if (EXCLUDED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return false;
  }
  if (pathname.startsWith("/help") || pathname.startsWith("/platform/docs")) {
    return true;
  }
  // Authenticated app surfaces (internal route group pages resolve without group prefix)
  return !pathname.startsWith("/public");
}

export function initPostHog(): typeof posthog | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  if (!key || !host) return null;
  if (posthog.__loaded) return posthog;
  posthog.init(key, {
    api_host: host,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    persistence: "localStorage+cookie",
    batch_events: true,
  });
  return posthog;
}

export function capturePageview(pathname: string, properties: Record<string, unknown>) {
  const client = initPostHog();
  if (!client || !shouldTrackPage(pathname)) return;
  client.capture("$pageview", {
    normalized_path: normalizePath(pathname),
    ...properties,
  });
}
```

- [ ] **Step 5: Run tests and commit**

```bash
cd schedjuice-reimagined-fe && pnpm test:unit src/lib/posthog.test.ts
git add src/lib/posthog.ts src/lib/posthog.test.ts package.json pnpm-lock.yaml
git commit -m "feat: add PostHog pageview helpers with path normalization"
```

---

### Task 7: PostHog provider + debug link

**Files:**
- Create: `schedjuice-reimagined-fe/src/components/providers/posthog-provider.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/providers.tsx`
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/debug/page.tsx`

- [ ] **Step 1: Create provider (lazy init after paint)**

```tsx
// src/components/providers/posthog-provider.tsx
"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useUser } from "@/hooks/useUser";
import { useTenant } from "@/hooks/useTenant";
import { capturePageview, initPostHog } from "@/lib/posthog";
import { isStudent, isSuperAdmin, isAdmin } from "@/helpers/authorization";

function roleBucket(user: ReturnType<typeof useUser>["user"]) {
  if (!user) return "anonymous";
  if (isSuperAdmin(user)) return "superadmin";
  if (isAdmin(user)) return "admin";
  if (isStudent(user)) return "student";
  return "staff";
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useUser();
  const { tenant } = useTenant();
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const run = () => initPostHog();
    if (typeof requestIdleCallback !== "undefined") {
      requestIdleCallback(run);
    } else {
      setTimeout(run, 0);
    }
  }, []);

  useEffect(() => {
    if (!pathname) return;
    capturePageview(pathname, {
      tenant_schema: tenant?.schema_name ?? null,
      org_id: tenant?.id ?? null,
      role_bucket: roleBucket(user),
      environment: process.env.NEXT_PUBLIC_POSTHOG_ENVIRONMENT ?? "development",
    });
  }, [pathname, tenant?.schema_name, tenant?.id, user]);

  return <>{children}</>;
}
```

- [ ] **Step 2: Mount in AppProviders**

```tsx
// src/components/providers.tsx
"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query";
import { PostHogProvider } from "@/components/providers/posthog-provider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <PostHogProvider>{children}</PostHogProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 3: Add debug link card**

In `src/app/(internal)/debug/page.tsx`, add to `LINKS`:

```typescript
{
  href: process.env.NEXT_PUBLIC_POSTHOG_DASHBOARD_URL || "https://us.posthog.com",
  title: "Traffic analytics",
  description:
    "PostHog dashboards — top pages, API routes, optimization priority (opens in new tab).",
  external: true,
} as const,
```

Update the list render to use `target="_blank" rel="noopener noreferrer"` when `external: true`.

- [ ] **Step 4: Run frontend tests + lint**

```bash
cd schedjuice-reimagined-fe && pnpm test:unit src/lib/posthog.test.ts && pnpm lint
```

- [ ] **Step 5: Commit**

```bash
git add src/components/providers/posthog-provider.tsx src/components/providers.tsx \
  src/app/(internal)/debug/page.tsx
git commit -m "feat: add PostHog pageview provider and debug dashboard link"
```

---

### Task 8: Ops dashboards + staging smoke verification

**Files:**
- Modify: `docs/ops/posthog-traffic-analytics.md`

- [ ] **Step 1: Complete dashboard recipes in runbook**

For each dashboard in the spec, document exact PostHog insight setup:
- Event names: `$pageview`, `api_request`
- Breakdown property keys: `normalized_path`, `route_template`
- Sample-adjusted volume formula: `count / sample_rate` where `sampled = true`
- Optimization score formula: `adjusted_count * p95(response_ms) * avg(db_query_count)`

- [ ] **Step 2: Staging smoke — backend**

1. Set `POSTHOG_ENABLED=true` on staging BE; `POSTHOG_HOST=https://us.i.posthog.com`.
2. Hit `GET /api/v1/...` (any authenticated endpoint).
3. Confirm `api_request` appears in PostHog Live events within ~10 s.
4. Block ingest to `us.i.posthog.com` or revoke API key; repeat API call → must still return 200.

- [ ] **Step 3: Staging smoke — frontend**

1. Set `NEXT_PUBLIC_POSTHOG_KEY` + host on staging FE.
2. Navigate to `/courses/.../attendance/marking/...`.
3. Confirm `$pageview` with `normalized_path` containing `:id` segments.
4. Visit `/debug/cron-jobs` → **no** pageview event.

- [ ] **Step 4: Run full backend test suite for traffic analytics module**

```bash
cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh utilitas.tests.test_traffic_analytics_db_metrics \
  utilitas.tests.test_traffic_analytics_routes \
  utilitas.tests.test_traffic_analytics_sampling \
  utilitas.tests.test_traffic_analytics_queue \
  utilitas.tests.test_traffic_analytics_middleware -v
```

Expected: all PASS

- [ ] **Step 5: Commit runbook updates**

```bash
git add docs/ops/posthog-traffic-analytics.md
git commit -m "docs: complete PostHog traffic analytics dashboards and smoke checklist"
```

---

## Spec Coverage Self-Review

| Spec requirement | Task |
|------------------|------|
| Self-hosted PostHog | Task 1 |
| Platform operators only | Task 7 (debug link); PostHog access ops-side |
| Full-stack API metrics | Task 2, 5 |
| 50% success sampling | Task 3 |
| 100% errors/slow/heavy DB | Task 3 |
| Non-blocking (hard req) | Task 4, 5 (queue + tests) |
| Frontend internal + help/docs | Task 6, 7 |
| Exclude debug/components/auth public | Task 6 |
| No session replay | Task 6 (`disable_session_recording: true`) |
| PostHog-only UI | Tasks 1, 8 (no in-app charts) |
| Privacy (no bodies/PII) | Task 5 properties; Task 6 role_bucket only |
| `/debug` link card | Task 7 |
| Rollout phases | Task 8 runbook |

No placeholders remain. Type/property names consistent across tasks (`route_template`, `normalized_path`, `sample_rate`, `api_request`).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-02-traffic-analytics-posthog.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — implement tasks in this session with checkpoints

Which approach?
