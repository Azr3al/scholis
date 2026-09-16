"""Wrap view calls in quiz_take_attempt_result tests."""

from __future__ import annotations

from tenant_schemas.utils import schema_context


def call_view_in_schema(schema_name: str, view, method: str, request, **kwargs):
    with schema_context(schema_name):
        view.request = request
        view.format_kwarg = None
        return getattr(view, method)(request, **kwargs)
