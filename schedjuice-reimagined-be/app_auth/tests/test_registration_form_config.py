from unittest import mock

from django.test import SimpleTestCase

from app_auth.views import RegistrationFormConfigView

class RegistrationFormConfigViewTests(SimpleTestCase):
    def test_disabled_tenant_returns_400(self):
        request = mock.Mock()
        request.tenant = mock.Mock(is_student_login_disabled=True)
        response = RegistrationFormConfigView().get(request)
        self.assertEqual(response.status_code, 400)
        self.assertTrue(response.data["isError"])

