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
            dedupe_key=dedupe_key,
            status_code=status_code,
            response_ms=response_ms,
            db_query_count=db.query_count,
            sample_rate=sample_rate,
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
                        "environment": getattr(
                            settings, "POSTHOG_ENVIRONMENT", "unknown"
                        ),
                        "sampled": sampled,
                        "sample_rate": sample_rate if sampled else 1.0,
                    },
                }
            )
        except Exception:
            logger.warning("traffic analytics enqueue failed", exc_info=True)

        return response
