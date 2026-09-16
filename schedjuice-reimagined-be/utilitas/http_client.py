"""Shared outbound HTTP helper that refuses to run without a timeout."""

from __future__ import annotations

from typing import Any

import requests

DEFAULT_TIMEOUT = (5, 30)


def _resolve_timeout(timeout: Any) -> Any:
    if timeout is None:
        raise ValueError(
            "timeout=None is not allowed; pass a (connect, read) pair or use "
            "DEFAULT_TIMEOUT. Unbounded outbound calls hang Daphne threads."
        )
    return timeout


def request(method: str, url: str, *, timeout=DEFAULT_TIMEOUT, **kwargs):
    timeout = _resolve_timeout(timeout)
    return requests.request(method, url, timeout=timeout, **kwargs)


def get(url: str, *, timeout=DEFAULT_TIMEOUT, **kwargs):
    return request("GET", url, timeout=timeout, **kwargs)


def post(url: str, *, timeout=DEFAULT_TIMEOUT, **kwargs):
    return request("POST", url, timeout=timeout, **kwargs)


def put(url: str, *, timeout=DEFAULT_TIMEOUT, **kwargs):
    return request("PUT", url, timeout=timeout, **kwargs)


def patch(url: str, *, timeout=DEFAULT_TIMEOUT, **kwargs):
    return request("PATCH", url, timeout=timeout, **kwargs)


def delete(url: str, *, timeout=DEFAULT_TIMEOUT, **kwargs):
    return request("DELETE", url, timeout=timeout, **kwargs)
