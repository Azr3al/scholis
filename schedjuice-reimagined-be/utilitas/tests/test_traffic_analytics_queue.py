import threading
import time

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
