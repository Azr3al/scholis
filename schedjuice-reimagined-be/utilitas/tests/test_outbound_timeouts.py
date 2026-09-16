"""Fail any first-party requests.* HTTP call that omits timeout=.

Use utilitas.http_client for new outbound calls so a timeout is mandatory.
"""

from __future__ import annotations

import ast
from pathlib import Path

from django.test import SimpleTestCase

HTTP_METHODS = frozenset({"get", "post", "put", "patch", "delete", "head", "request"})

# Visible in review. Only the shared wrapper, scripts, venv, and tests may omit
# a timeout keyword on requests.* calls (tests mock; the wrapper enforces it).
ALLOWLIST_PATH_PREFIXES = frozenset(
    {
        "utilitas/http_client.py",
        "scripts/",
        "env/",
    }
)

REPO_ROOT = Path(__file__).resolve().parents[2]


def _is_allowlisted(relative: str) -> bool:
    if relative.startswith("utilitas/tests/") or relative.endswith("_test.py"):
        return True
    name = Path(relative).name
    if name.startswith("test_") and name.endswith(".py"):
        return True
    return any(relative == prefix or relative.startswith(prefix) for prefix in ALLOWLIST_PATH_PREFIXES)


def _is_requests_http_call(node: ast.Call) -> bool:
    func = node.func
    return (
        isinstance(func, ast.Attribute)
        and func.attr in HTTP_METHODS
        and isinstance(func.value, ast.Name)
        and func.value.id == "requests"
    )


def _has_timeout_keyword(node: ast.Call) -> bool:
    return any(kw.arg == "timeout" for kw in node.keywords)


def _iter_first_party_py_files():
    for path in REPO_ROOT.rglob("*.py"):
        relative = path.relative_to(REPO_ROOT).as_posix()
        if relative.startswith("env/") or "/__pycache__/" in relative:
            continue
        yield path, relative


class OutboundTimeoutEnforcementTests(SimpleTestCase):
    def test_every_requests_http_call_passes_timeout(self):
        violations = []
        for path, relative in _iter_first_party_py_files():
            if _is_allowlisted(relative):
                continue
            source = path.read_text(encoding="utf-8")
            try:
                tree = ast.parse(source, filename=relative)
            except SyntaxError:
                continue
            for node in ast.walk(tree):
                if not isinstance(node, ast.Call) or not _is_requests_http_call(node):
                    continue
                if _has_timeout_keyword(node):
                    continue
                violations.append(
                    f"{relative}:{node.lineno} requests.{node.func.attr}(...) has no timeout=. "
                    "Pass timeout= or use utilitas.http_client."
                )
        self.assertEqual(violations, [], "\n".join(violations))
