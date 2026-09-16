import logging

from django.conf import settings
from django.db import connection

from utilitas.nplusone_context import clear_context, resolve_run_id, set_context, update_context


class QueryLoggerMiddleware:
    def __init__(self, get_response):
        self.logger = logging.getLogger("django")
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if settings.DEBUG:
            self.logger.info(f"Total number of queries: {len(connection.queries)}")
            for i, j in enumerate(connection.queries):
                self.logger.info(f"{i}:{float(j['time'])*1000}ms| {j['sql']}")
        return response


class NPlusOneContextMiddleware:
    """Attach request metadata to contextvars for nplusone JSONL logging."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        tenant = getattr(request, "tenant", None)
        schema_name = getattr(tenant, "schema_name", None) if tenant else None
        set_context(
            run_id=resolve_run_id(request),
            method=request.method,
            path=request.path,
            schema_name=schema_name,
            view=None,
            expand=None,
            query_count=None,
            status_code=None,
        )
        try:
            response = self.get_response(request)
            expand_value = request.GET.get("expand")
            update_context(
                expand=expand_value,
                status_code=getattr(response, "status_code", None),
                query_count=len(connection.queries) if settings.DEBUG else None,
            )
            return response
        finally:
            clear_context()

    def process_view(self, request, view_func, view_args, view_kwargs):
        view_name = getattr(view_func, "view_class", None)
        if view_name is not None:
            update_context(view=view_name.__name__)
        elif hasattr(view_func, "__name__"):
            update_context(view=view_func.__name__)
        return None
