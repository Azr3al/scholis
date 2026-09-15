"""
The transport contract: what a failure from Scholis becomes here.

Getting these wrong is not cosmetic. Every one of these exception types drives a
caller's decision -- retry, report to a teacher, or give up. A 404 turned into a
retryable error loops forever; a 400 turned retryable wastes the retry budget on
a request that will never succeed.
"""
from __future__ import annotations

import json
from unittest import mock

import requests
from django.test import SimpleTestCase, override_settings

from app_scholis.client import ScholisClient
from app_scholis.errors import (
    ScholisConflictError,
    ScholisError,
    ScholisNotConfiguredError,
    ScholisNotFoundError,
    ScholisResponseError,
    ScholisUnauthorizedError,
    ScholisUnavailableError,
)

TOKEN = "sch_live_key123.super-secret-value"
BASE = "https://scholis.test"


def _envelope(code: str, message: str) -> dict:
    """Scholis's error body, exactly as apps/api/lib/http.ts writes it."""
    return {"error": {"code": code, "message": message}}


def _response(status: int, body) -> requests.Response:
    response = requests.Response()
    response.status_code = status
    response._content = json.dumps(body).encode("utf-8")
    return response


@override_settings(
    SCHOLIS_API_BASE=BASE,
    SCHOLIS_PLATFORM_KEY="sch_live_platform.dummy-local-key",
    SCHOLIS_TOKEN_ENCRYPTION_KEY="x" * 44,
    SCHOLIS_REQUEST_TIMEOUT=5.0,
)
class ScholisClientTest(SimpleTestCase):
    def setUp(self):
        self.client = ScholisClient(token=TOKEN)

    def _call(self, response=None, exception=None):
        """Issue one request with the transport replaced."""
        target = mock.Mock()
        if exception is not None:
            target.side_effect = exception
        else:
            target.return_value = response
        patcher = mock.patch("app_scholis.client.requests.request", target)
        patcher.start()
        self.addCleanup(patcher.stop)
        return target

    # -- the request we send ------------------------------------------------

    def test_calls_the_integration_prefix_with_the_bearer_token(self):
        transport = self._call(_response(200, {"orgId": "o1"}))
        self.client.provision_org(external_ref="org-7", name="Test School")

        method, url = transport.call_args.args[:2]
        self.assertEqual(method, "POST")
        self.assertEqual(url, f"{BASE}/api/integration/orgs")
        self.assertEqual(
            transport.call_args.kwargs["headers"]["Authorization"], f"Bearer {TOKEN}"
        )
        self.assertEqual(
            transport.call_args.kwargs["json"],
            {"externalRef": "org-7", "name": "Test School"},
        )

    def test_a_trailing_slash_in_the_base_url_does_not_double_up(self):
        client = ScholisClient(token=TOKEN, base_url=f"{BASE}/")
        self.assertEqual(client._url("/scores"), f"{BASE}/api/integration/scores")

    def test_no_token_at_all_is_a_configuration_error_not_an_auth_error(self):
        # An empty token would produce "Authorization: Bearer " and a confusing
        # 401 from Scholis. Failing here says what is actually wrong.
        with self.assertRaises(ScholisNotConfiguredError):
            ScholisClient(token="")

    # -- what each status becomes -------------------------------------------

    def test_status_to_exception_mapping(self):
        # The first five pairs are Scholis's own STATUS_BY_CODE table
        # (apps/api/lib/http.ts), so this is their contract and not ours.
        cases = [
            (400, "validation_failed", ScholisConflictError),
            (401, "unauthorized", ScholisUnauthorizedError),
            (403, "forbidden", ScholisUnauthorizedError),
            (404, "not_found", ScholisNotFoundError),
            (409, "conflict", ScholisConflictError),
            (422, "invalid_state", ScholisConflictError),
            (418, "teapot", ScholisResponseError),
            (500, "internal_error", ScholisUnavailableError),
            (502, "bad_gateway", ScholisUnavailableError),
            (503, "unavailable", ScholisUnavailableError),
        ]
        for status, code, expected in cases:
            with self.subTest(status=status):
                self._call(_response(status, _envelope(code, f"failed with {status}")))
                with self.assertRaises(expected) as ctx:
                    self.client.provision_org(external_ref="org-7", name="Test School")
                self.assertEqual(ctx.exception.status, status)
                self.assertEqual(ctx.exception.code, code)

    def test_scholis_own_message_is_passed_through_to_the_teacher(self):
        # Their messages are written for a human ("That paper has closed.").
        # Replacing them with a generic string throws away the only useful part.
        self._call(_response(404, _envelope("not_found", "That paper has closed.")))
        with self.assertRaises(ScholisNotFoundError) as ctx:
            self.client.provision_org(external_ref="org-7", name="Test School")
        self.assertEqual(str(ctx.exception), "That paper has closed.")

    def test_an_error_code_is_preserved_when_scholis_sends_one(self):
        # The envelope shape comes from toHttpResponse in apps/api/lib/http.ts.
        self._call(_response(403, _envelope("forbidden", "That key was revoked.")))
        with self.assertRaises(ScholisUnauthorizedError) as ctx:
            self.client.provision_org(external_ref="org-7", name="Test School")
        self.assertEqual(ctx.exception.code, "forbidden")

    def test_a_flat_message_body_is_also_understood(self):
        # Not what Scholis sends today, but a proxy or a middleware might. Reading
        # it costs nothing and turns a useless generic string into a real one.
        self._call(_response(404, {"message": "no such org"}))
        with self.assertRaises(ScholisNotFoundError) as ctx:
            self.client.provision_org(external_ref="org-7", name="Test School")
        self.assertEqual(str(ctx.exception), "no such org")

    def test_a_non_json_error_body_still_produces_a_scholis_error(self):
        # An HTML 502 from a proxy in front of Scholis. Must not become an
        # unhandled JSONDecodeError.
        response = requests.Response()
        response.status_code = 502
        response._content = b"<html><body>Bad Gateway</body></html>"
        self._call(response)
        with self.assertRaises(ScholisUnavailableError):
            self.client.provision_org(external_ref="org-7", name="Test School")

    def test_a_successful_call_with_an_empty_body_returns_none(self):
        response = requests.Response()
        response.status_code = 204
        response._content = b""
        self._call(response)
        self.assertIsNone(self.client.remove_webhook(endpoint_id="e1"))

    # -- transport failures --------------------------------------------------

    def test_timeouts_become_unavailable_so_a_caller_can_retry(self):
        self._call(exception=requests.Timeout("read timed out"))
        with self.assertRaises(ScholisUnavailableError):
            self.client.provision_org(external_ref="org-7", name="Test School")

    def test_connection_failures_become_unavailable(self):
        self._call(exception=requests.ConnectionError("connection refused"))
        with self.assertRaises(ScholisUnavailableError):
            self.client.provision_org(external_ref="org-7", name="Test School")

    def test_every_transport_and_http_failure_is_a_scholis_error(self):
        # Callers catch ScholisError, so nothing may escape that shape.
        failures = [
            requests.Timeout("t"),
            requests.ConnectionError("c"),
            requests.RequestException("r"),
        ]
        for exception in failures:
            with self.subTest(exception=type(exception).__name__):
                self._call(exception=exception)
                with self.assertRaises(ScholisError):
                    self.client.provision_org(external_ref="org-7", name="Test School")

    # -- secret hygiene ------------------------------------------------------

    def test_a_failed_call_never_logs_the_token(self):
        # The token is a bearer credential. Logging it puts it in every log
        # aggregator, backup, and support ticket that follows.
        self._call(exception=requests.Timeout("read timed out"))
        with self.assertLogs("app_scholis.client", level="DEBUG") as logs:
            with self.assertRaises(ScholisUnavailableError):
                self.client.provision_org(external_ref="org-7", name="Test School")
        joined = "\n".join(logs.output)
        self.assertNotIn(TOKEN, joined)
        self.assertNotIn(TOKEN.split(".", 1)[1], joined)

    def test_an_http_error_never_logs_the_token(self):
        self._call(_response(403, _envelope("forbidden", "nope")))
        with self.assertLogs("app_scholis.client", level="DEBUG") as logs:
            with self.assertRaises(ScholisUnauthorizedError):
                self.client.provision_org(external_ref="org-7", name="Test School")
        self.assertNotIn(TOKEN, "\n".join(logs.output))

    # -- the platform tier ---------------------------------------------------

    def test_for_platform_uses_the_deployment_key_not_a_tenant_row(self):
        transport = self._call(_response(200, {}))
        ScholisClient.for_platform().provision_org(external_ref="o", name="N")
        header = transport.call_args.kwargs["headers"]["Authorization"]
        self.assertEqual(header, "Bearer sch_live_platform.dummy-local-key")

    def test_provisioning_reports_whether_the_org_already_existed(self):
        # Idempotent on externalRef: the key comes back only the first time, so
        # `created` is the only signal that we now hold a secret we did not have.
        self._call(
            _response(
                200,
                {"orgId": "o1", "created": False, "key": None},
            )
        )
        result = self.client.provision_org(external_ref="org-7", name="Test School")
        self.assertFalse(result["created"])
        self.assertIsNone(result["key"])
