from cryptography.fernet import Fernet
from django.test import SimpleTestCase, override_settings

from app_zoom.crypto import TokenEncryptionError, decrypt_token, encrypt_token

@override_settings(ZOOM_TOKEN_ENCRYPTION_KEY=Fernet.generate_key().decode())
class TokenCryptoTest(SimpleTestCase):

    def test_empty_inputs(self):
        self.assertEqual(encrypt_token(None), "")
        self.assertEqual(decrypt_token(""), "")

class TokenCryptoMissingKeyTest(SimpleTestCase):
    @override_settings(ZOOM_TOKEN_ENCRYPTION_KEY="")
    def test_missing_key_raises(self):
        with self.assertRaises(TokenEncryptionError):
            encrypt_token("x")
