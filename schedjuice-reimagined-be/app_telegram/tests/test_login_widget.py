import hashlib
import hmac
import time

from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError

from app_telegram.login_widget import verify_telegram_login_widget


def _sign_payload(bot_token: str, fields: dict[str, str]) -> dict[str, str]:
    check_string = "\n".join(f"{k}={fields[k]}" for k in sorted(fields.keys()))
    secret_key = hashlib.sha256(bot_token.encode("utf-8")).digest()
    signed = dict(fields)
    signed["hash"] = hmac.new(
        secret_key, check_string.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    return signed


class TelegramLoginWidgetVerifyTests(SimpleTestCase):
    def test_valid_payload(self):
        bot_token = "123456:ABC-DEF"
        fields = {
            "auth_date": str(int(time.time())),
            "first_name": "Ada",
            "id": "424242",
        }
        payload = _sign_payload(bot_token, fields)
        result = verify_telegram_login_widget(payload, bot_token=bot_token)
        self.assertEqual(result["telegram_user_id"], 424242)

    def test_rejects_bad_hash(self):
        bot_token = "123456:ABC-DEF"
        payload = {
            "id": "1",
            "auth_date": str(int(time.time())),
            "hash": "deadbeef",
        }
        with self.assertRaises(ValidationError) as ctx:
            verify_telegram_login_widget(payload, bot_token=bot_token)
        self.assertEqual(ctx.exception.detail["message"], "telegram_auth_invalid")

    def test_rejects_expired_auth_date(self):
        bot_token = "123456:ABC-DEF"
        fields = {
            "auth_date": str(int(time.time()) - 90000),
            "id": "99",
        }
        payload = _sign_payload(bot_token, fields)
        with self.assertRaises(ValidationError) as ctx:
            verify_telegram_login_widget(payload, bot_token=bot_token)
        self.assertEqual(ctx.exception.detail["message"], "telegram_auth_expired")
