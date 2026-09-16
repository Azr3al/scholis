"""Unit tests for chat attachment upload validation."""

from __future__ import annotations

import io

from django.core.exceptions import ValidationError
from django.test import SimpleTestCase

from app_attachment.validation import (
    _detect_mime_from_bytes,
    validate_chat_attachment_upload,
)

def _m4a_sample() -> bytes:
    return (
        b"\x00\x00\x00\x20ftypM4A \x00\x00\x00\x00M4A isom"
        + b"\x00" * 32
    )

def _video_mp4_sample() -> bytes:
    return (
        b"\x00\x00\x00\x20ftypisom\x00\x00\x00\x00isommp42"
        + b"\x00" * 32
    )

def _webm_sample() -> bytes:
    return b"\x1a\x45\xdf\xa3" + b"\x00" * 32

def _heic_sample() -> bytes:
    return (
        b"\x00\x00\x00\x18ftypheic\x00\x00\x00\x00"
        + b"heic"
        + b"\x00" * 32
    )

class DetectMimeFromBytesTests(SimpleTestCase):
    def test_m4a_ftyp_brand_detected_as_audio_mp4(self):
        self.assertEqual(
            _detect_mime_from_bytes(_m4a_sample(), "voice.m4a"),
            "audio/mp4",
        )

    def test_isom_ftyp_brand_detected_as_video_mp4(self):
        self.assertEqual(
            _detect_mime_from_bytes(_video_mp4_sample(), "clip.mp4"),
            "video/mp4",
        )

    def test_webm_signature_detected_as_audio_webm(self):
        self.assertEqual(
            _detect_mime_from_bytes(_webm_sample(), "voice.webm"),
            "audio/webm",
        )

    def test_heic_ftyp_brand_detected_as_image_heic(self):
        self.assertEqual(
            _detect_mime_from_bytes(_heic_sample(), "photo.heic"),
            "image/heic",
        )

    def test_ambiguous_ftyp_uses_m4a_extension(self):
        ambiguous = b"\x00\x00\x00\x20ftypmp42\x00\x00\x00\x00mp42isom"
        self.assertEqual(
            _detect_mime_from_bytes(ambiguous, "voice.m4a"),
            "audio/mp4",
        )

class ValidateChatAttachmentUploadTests(SimpleTestCase):
    def _upload(self, sample: bytes, filename: str):
        stream = io.BytesIO(sample)
        stream.size = len(sample)
        return stream

    def test_rejects_m4a_extension_with_video_mp4_bytes(self):
        upload = self._upload(_video_mp4_sample(), "voice.m4a")
        with self.assertRaises(ValidationError) as ctx:
            validate_chat_attachment_upload(upload, "voice.m4a")
        self.assertIn("does not match MIME", str(ctx.exception))

    def test_rejects_webm_extension_with_pdf_bytes(self):
        upload = self._upload(b"%PDF-1.4", "voice.webm")
        with self.assertRaises(ValidationError) as ctx:
            validate_chat_attachment_upload(upload, "voice.webm")
        message = str(ctx.exception)
        self.assertTrue(
            "MIME type" in message or "does not match MIME" in message,
            message,
        )
