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
