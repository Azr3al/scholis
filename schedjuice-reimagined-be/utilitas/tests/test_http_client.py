from unittest.mock import patch

from django.test import SimpleTestCase

from utilitas import http_client
from utilitas.http_client import DEFAULT_TIMEOUT, request


class HttpClientTests(SimpleTestCase):
    @patch("utilitas.http_client.requests.request")
    def test_request_uses_default_timeout_when_omitted(self, mock_request):
        mock_request.return_value = "ok"
        result = request("GET", "https://example.test/x")
        self.assertEqual(result, "ok")
        mock_request.assert_called_once_with(
            "GET",
            "https://example.test/x",
            timeout=DEFAULT_TIMEOUT,
        )

    @patch("utilitas.http_client.requests.request")
    def test_request_passes_explicit_timeout(self, mock_request):
        mock_request.return_value = "ok"
        request("POST", "https://example.test/x", timeout=(2, 8), json={"a": 1})
        mock_request.assert_called_once_with(
            "POST",
            "https://example.test/x",
            timeout=(2, 8),
            json={"a": 1},
        )

    def test_explicit_none_timeout_is_rejected(self):
        with self.assertRaises(ValueError) as ctx:
            request("GET", "https://example.test/x", timeout=None)
        self.assertIn("timeout", str(ctx.exception).lower())

    @patch("utilitas.http_client.requests.request")
    def test_verb_wrappers_delegate_to_request(self, mock_request):
        mock_request.return_value = "ok"
        http_client.get("https://example.test/g")
        http_client.post("https://example.test/p", json={})
        http_client.put("https://example.test/u")
        http_client.patch("https://example.test/h")
        http_client.delete("https://example.test/d")
        methods = [call.args[0] for call in mock_request.call_args_list]
        self.assertEqual(methods, ["GET", "POST", "PUT", "PATCH", "DELETE"])
        for call in mock_request.call_args_list:
            self.assertEqual(call.kwargs["timeout"], DEFAULT_TIMEOUT)

