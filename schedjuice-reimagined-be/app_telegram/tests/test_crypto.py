from django.test import TestCase, override_settings
from cryptography.fernet import Fernet

from app_telegram.crypto import TokenEncryptionError, decrypt_token, encrypt_token

KEY = Fernet.generate_key().decode()

@override_settings(TELEGRAM_TOKEN_ENCRYPTION_KEY=KEY)
class TelegramCryptoTests(TestCase):

    def test_empty_inputs(self):
        self.assertEqual(encrypt_token(None), "")
        self.assertEqual(decrypt_token(""), "")
        self.assertEqual(decrypt_token(None), "")

    @override_settings(TELEGRAM_TOKEN_ENCRYPTION_KEY="")
    def test_missing_key_raises(self):
        with self.assertRaises(TokenEncryptionError):
            encrypt_token("x")
