from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from schedjuice_backend.private_media_s3 import (
    build_private_presign_s3_client,
    private_media_key_candidates,
    presign_private_s3_get_url,
    resolve_private_media_s3_key_from_raw,
    strip_bucket_prefix_from_s3_key,
)


class StripBucketPrefixTests(SimpleTestCase):
    def test_strips_path_style_bucket_segment(self):
        self.assertEqual(
            strip_bucket_prefix_from_s3_key(
                "schedjuice-dev/media-dev/private/xschedjuice/payment_screenshots/a.png",
                bucket_name="schedjuice-dev",
            ),
            "media-dev/private/xschedjuice/payment_screenshots/a.png",
        )

    def test_leaves_virtual_hosted_key_unchanged(self):
        self.assertEqual(
            strip_bucket_prefix_from_s3_key(
                "media-dev/private/xschedjuice/payment_screenshots/a.png",
                bucket_name="schedjuice-dev",
            ),
            "media-dev/private/xschedjuice/payment_screenshots/a.png",
        )

    def test_strips_physical_bucket_leaving_env_prefixed_key(self):
        self.assertEqual(
            strip_bucket_prefix_from_s3_key(
                "schedjuice-dev/schedjuice-prod/media-prod/private/x/file.jpg",
                bucket_name="schedjuice-dev",
            ),
            "schedjuice-prod/media-prod/private/x/file.jpg",
        )


class PrivateMediaKeyCandidateTests(SimpleTestCase):
    def test_adds_legacy_key_without_private_segment(self):
        self.assertEqual(
            private_media_key_candidates(
                "media-dev/private/xschedjuice/payment_screenshots/a.png"
            ),
            [
                "media-dev/private/xschedjuice/payment_screenshots/a.png",
                "media-dev/xschedjuice/payment_screenshots/a.png",
            ],
        )

    def test_adds_root_level_key_when_canonical_has_env_prefix(self):
        self.assertEqual(
            private_media_key_candidates(
                "schedjuice-prod/media-prod/private/xschedjuice/payment_screenshots/a.png"
            ),
            [
                "schedjuice-prod/media-prod/private/xschedjuice/payment_screenshots/a.png",
                "media-prod/private/xschedjuice/payment_screenshots/a.png",
                "schedjuice-prod/media-prod/xschedjuice/payment_screenshots/a.png",
                "media-prod/xschedjuice/payment_screenshots/a.png",
            ],
        )


class ResolvePrivateMediaKeyFromRawTests(SimpleTestCase):
    def test_parses_virtual_hosted_url_with_env_prefix_in_path(self):
        storage = MagicMock()
        storage._normalize_name.side_effect = lambda name: (
            f"schedjuice-prod/media-prod/private/{name}"
        )

        key = resolve_private_media_s3_key_from_raw(
            "https://schedjuice-dev.sgp1.digitaloceanspaces.com/"
            "schedjuice-prod/media-prod/private/xschedjuice/payment_screenshots/a.png",
            storage=storage,
        )
        self.assertEqual(
            key,
            "schedjuice-prod/media-prod/private/xschedjuice/payment_screenshots/a.png",
        )

    def test_parses_path_style_url_without_bucket_in_key(self):
        storage = MagicMock()
        storage._normalize_name.side_effect = lambda name: f"media-dev/private/{name}"

        key = resolve_private_media_s3_key_from_raw(
            "https://sgp1.digitaloceanspaces.com/schedjuice-dev/"
            "media-dev/xschedjuice/payment_screenshots/a.png",
            storage=storage,
        )
        self.assertEqual(
            key,
            "media-dev/xschedjuice/payment_screenshots/a.png",
        )

    @patch("schedjuice_backend.private_media_s3.s3_object_exists")
    def test_resolve_existing_prefers_legacy_key_when_canonical_missing(self, exists):
        from schedjuice_backend.private_media_s3 import (
            resolve_existing_private_media_s3_key,
        )

        storage = MagicMock()
        storage.bucket_name = "schedjuice-dev"
        storage.connection.meta.client = MagicMock()
        storage._normalize_name.side_effect = lambda name: (
            f"schedjuice-prod/media-prod/private/{name}"
        )

        def _exists(*, bucket, key, client):
            return key == "media-prod/xschedjuice/payment_screenshots/a.png"

        exists.side_effect = _exists

        key = resolve_existing_private_media_s3_key(
            "xschedjuice/payment_screenshots/a.png",
            storage=storage,
        )
        self.assertEqual(key, "media-prod/xschedjuice/payment_screenshots/a.png")

    @patch("schedjuice_backend.private_media_s3.s3_object_exists")
    def test_resolve_existing_falls_back_to_root_media_prod_private(self, exists):
        from schedjuice_backend.private_media_s3 import (
            resolve_existing_private_media_s3_key,
        )

        storage = MagicMock()
        storage.bucket_name = "schedjuice-dev"
        storage.connection.meta.client = MagicMock()
        storage._normalize_name.side_effect = lambda name: (
            f"schedjuice-prod/media-prod/private/{name}"
        )

        def _exists(*, bucket, key, client):
            return key == "media-prod/private/xschedjuice/payment_screenshots/a.png"

        exists.side_effect = _exists

        key = resolve_existing_private_media_s3_key(
            "xschedjuice/payment_screenshots/a.png",
            storage=storage,
        )
        self.assertEqual(
            key,
            "media-prod/private/xschedjuice/payment_screenshots/a.png",
        )


class PresignClientTests(SimpleTestCase):
    @patch("schedjuice_backend.private_media_s3.boto3.client")
    def test_build_private_presign_uses_regional_endpoint_with_virtual_style(
        self, mock_boto_client,
    ):
        from django.test import override_settings

        with override_settings(
            AWS_ACCESS_KEY_ID="test-key",
            AWS_SECRET_ACCESS_KEY="test-secret",
            AWS_S3_ENDPOINT_URL="https://sgp1.digitaloceanspaces.com",
            AWS_S3_BUCKET_ORIGIN_URL="https://schedjuice-dev.sgp1.digitaloceanspaces.com",
            AWS_S3_REGION_NAME="sgp1",
            AWS_S3_PRIVATE_PRESIGN_ADDRESSING_STYLE="virtual",
        ):
            build_private_presign_s3_client()
        mock_boto_client.assert_called_once()
        self.assertEqual(
            mock_boto_client.call_args.kwargs["endpoint_url"],
            "https://sgp1.digitaloceanspaces.com",
        )
        config = mock_boto_client.call_args.kwargs["config"]
        self.assertEqual(config.s3["addressing_style"], "virtual")
        self.assertEqual(config.connect_timeout, 5)
        self.assertEqual(config.read_timeout, 30)

    @patch("schedjuice_backend.private_media_s3.build_private_presign_s3_client")
    def test_presign_uses_physical_bucket_and_full_key(self, mock_build_client):
        from django.test import override_settings

        mock_client = MagicMock()
        mock_client.generate_presigned_url.return_value = (
            "https://schedjuice-dev.sgp1.digitaloceanspaces.com/"
            "schedjuice-prod/media-prod/private/x/file.jpg?sig=1"
        )
        mock_build_client.return_value = mock_client

        with override_settings(AWS_STORAGE_BUCKET_NAME="schedjuice-dev"):
            presign_private_s3_get_url(
                "schedjuice-prod/media-prod/private/x/file.jpg",
                expires_in=3600,
                client=mock_client,
            )

        mock_client.generate_presigned_url.assert_called_once()
        params = mock_client.generate_presigned_url.call_args.kwargs["Params"]
        self.assertEqual(params["Bucket"], "schedjuice-dev")
        self.assertEqual(
            params["Key"],
            "schedjuice-prod/media-prod/private/x/file.jpg",
        )
