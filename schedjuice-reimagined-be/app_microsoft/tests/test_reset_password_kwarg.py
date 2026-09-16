from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from app_microsoft.graph_wrapper.user import MSUser


def _response(status_code, json_data=None, headers=None):
    response = MagicMock()
    response.status_code = status_code
    response.headers = headers or {}
    if json_data is not None:
        response.json.return_value = json_data
    return response


class ResetPasswordKwargTests(SimpleTestCase):
    @patch.object(MSUser, "post")
    @patch.object(MSUser, "get_token")
    def test_uses_provided_password(self, _mock_token, mock_post):
        mock_post.return_value = MagicMock(status_code=200)
        tenant = MagicMock()
        ms = MSUser.__new__(MSUser)

        result = ms.reset_password("ms-id-1", tenant, password="Password123$")

        self.assertEqual(result["new_password"], "Password123$")
        self.assertEqual(result["status"], 200)
        payload = mock_post.call_args[0][1]
        self.assertIn("Password123$", payload)

    @patch.object(MSUser, "post")
    @patch.object(MSUser, "get_token")
    @patch.object(MSUser, "_generate_password", return_value="Random1!")
    def test_defaults_to_generated_password(self, _mock_gen, _mock_token, mock_post):
        mock_post.return_value = MagicMock(status_code=200)
        tenant = MagicMock()
        ms = MSUser.__new__(MSUser)

        result = ms.reset_password("ms-id-1", tenant)

        self.assertEqual(result["new_password"], "Random1!")

    @patch("app_microsoft.graph_wrapper.user.time.sleep")
    @patch.object(MSUser, "get")
    @patch.object(MSUser, "post")
    @patch.object(MSUser, "get_token")
    def test_202_with_succeeded_operation_reports_success(
        self, _mock_token, mock_post, mock_get, _mock_sleep
    ):
        mock_post.return_value = _response(
            202, headers={"Location": "https://graph.microsoft.com/beta/operations/1"}
        )
        mock_get.return_value = _response(200, {"status": "succeeded"})
        tenant = MagicMock()
        ms = MSUser.__new__(MSUser)

        result = ms.reset_password("ms-id-1", tenant, password="Password123$")

        self.assertEqual(result["status"], 204)
        self.assertIsNone(result["reason"])
        mock_get.assert_called_once_with(
            "https://graph.microsoft.com/beta/operations/1"
        )

    @patch("app_microsoft.graph_wrapper.user.time.sleep")
    @patch.object(MSUser, "get")
    @patch.object(MSUser, "post")
    @patch.object(MSUser, "get_token")
    def test_202_with_failed_operation_reports_failure_reason(
        self, _mock_token, mock_post, mock_get, _mock_sleep
    ):
        mock_post.return_value = _response(
            202, headers={"Location": "https://graph.microsoft.com/beta/operations/2"}
        )
        mock_get.return_value = _response(
            200,
            {"status": "failed", "error": {"message": "banned password"}},
        )
        tenant = MagicMock()
        ms = MSUser.__new__(MSUser)

        result = ms.reset_password("ms-id-1", tenant, password="Password123$")

        self.assertEqual(result["status"], 400)
        self.assertIn("banned password", result["reason"])

    @patch("app_microsoft.graph_wrapper.user.time.sleep")
    @patch.object(MSUser, "get")
    @patch.object(MSUser, "post")
    @patch.object(MSUser, "get_token")
    def test_202_pending_forever_times_out(
        self, _mock_token, mock_post, mock_get, _mock_sleep
    ):
        mock_post.return_value = _response(
            202, headers={"Location": "https://graph.microsoft.com/beta/operations/3"}
        )
        mock_get.return_value = _response(200, {"status": "inProgress"})
        tenant = MagicMock()
        ms = MSUser.__new__(MSUser)

        result = ms.reset_password("ms-id-1", tenant, password="Password123$")

        self.assertEqual(result["status"], 504)
        self.assertIn("did not complete", result["reason"])
        self.assertEqual(
            result["operation_url"],
            "https://graph.microsoft.com/beta/operations/3",
        )

    @patch.object(MSUser, "get")
    @patch.object(MSUser, "post")
    @patch.object(MSUser, "get_token")
    def test_202_without_location_reports_failure(
        self, _mock_token, mock_post, _mock_get
    ):
        mock_post.return_value = _response(202)
        tenant = MagicMock()
        ms = MSUser.__new__(MSUser)

        result = ms.reset_password("ms-id-1", tenant, password="Password123$")

        self.assertEqual(result["status"], 400)
        self.assertIn("without an operation status URL", result["reason"])
        self.assertNotIn("operation_url", result)


class CheckResetOperationTests(SimpleTestCase):
    @patch.object(MSUser, "get")
    def test_succeeded_operation_maps_to_204(self, mock_get):
        mock_get.return_value = _response(200, {"status": "succeeded"})
        ms = MSUser.__new__(MSUser)

        status_code, reason = ms.check_reset_operation("https://op/1")

        self.assertEqual(status_code, 204)
        self.assertIsNone(reason)

    @patch.object(MSUser, "get")
    def test_failed_operation_maps_to_400_with_reason(self, mock_get):
        mock_get.return_value = _response(
            200, {"status": "failed", "error": {"message": "banned password"}}
        )
        ms = MSUser.__new__(MSUser)

        status_code, reason = ms.check_reset_operation("https://op/2")

        self.assertEqual(status_code, 400)
        self.assertIn("banned password", reason)

    @patch.object(MSUser, "get")
    def test_in_progress_operation_maps_to_504(self, mock_get):
        mock_get.return_value = _response(200, {"status": "inProgress"})
        ms = MSUser.__new__(MSUser)

        status_code, reason = ms.check_reset_operation("https://op/3")

        self.assertEqual(status_code, 504)
        self.assertIn("pending", reason)

    @patch.object(MSUser, "get")
    def test_unavailable_operation_status_maps_to_504(self, mock_get):
        mock_get.return_value = _response(503)
        ms = MSUser.__new__(MSUser)

        status_code, reason = ms.check_reset_operation("https://op/4")

        self.assertEqual(status_code, 504)
        self.assertIn("unavailable", reason)
