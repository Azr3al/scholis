from django.test import SimpleTestCase
from unittest.mock import patch

from app_auth.qualifications_media import resolve_qualifications_media_urls


class QualificationsMediaTests(SimpleTestCase):
    @patch("app_auth.qualifications_media._presign_attachment")
    def test_resolves_attachment_id_in_image_node(self, presign):
        presign.return_value = "https://signed.example/img.png"
        doc = {
            "type": "doc",
            "content": [
                {
                    "type": "image",
                    "attrs": {"attachmentId": 42, "src": "blob:pending"},
                }
            ],
        }
        out = resolve_qualifications_media_urls(doc)
        self.assertEqual(
            out["content"][0]["attrs"]["src"],
            "https://signed.example/img.png",
        )
