from cryptography.fernet import Fernet
from django.test import SimpleTestCase, override_settings

from app_google.crypto import TokenEncryptionError, decrypt_token, encrypt_token


@override_settings(GOOGLE_TOKEN_ENCRYPTION_KEY=Fernet.generate_key().decode())
class GoogleCryptoTests(SimpleTestCase):
    def test_round_trip(self):
        ct = encrypt_token("refresh-secret")
        self.assertNotEqual(ct, "refresh-secret")
        self.assertEqual(decrypt_token(ct), "refresh-secret")

    def test_empty_values(self):
        self.assertEqual(encrypt_token(None), "")
        self.assertEqual(decrypt_token(""), "")

    @override_settings(GOOGLE_TOKEN_ENCRYPTION_KEY="")
    def test_missing_key_raises(self):
        with self.assertRaises(TokenEncryptionError):
            encrypt_token("x")
