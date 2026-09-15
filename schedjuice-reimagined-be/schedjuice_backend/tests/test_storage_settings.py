from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase, override_settings
from unittest.mock import patch

from schedjuice_backend.settings import (
    _do_public_url_bucket_prefix,
    _normalize_s3_host,
    _resolve_do_spaces_storage,
)
from schedjuice_backend.storages import PrivateMediaStorage, PublicMediaStorage


class NormalizeS3HostTests(SimpleTestCase):
    def test_strips_https_and_trailing_slash(self):
        self.assertEqual(
            _normalize_s3_host("https://schedjuice-dev.sgp1.cdn.digitaloceanspaces.com/"),
            "schedjuice-dev.sgp1.cdn.digitaloceanspaces.com",
        )

    def test_strips_http(self):
        self.assertEqual(
            _normalize_s3_host("http://example.com"),
            "example.com",
        )

    def test_leaves_bare_hostname(self):
        self.assertEqual(
            _normalize_s3_host("schedjuice-dev.sgp1.digitaloceanspaces.com"),
            "schedjuice-dev.sgp1.digitaloceanspaces.com",
        )


class ResolveDoSpacesStorageTests(SimpleTestCase):
    def test_cdn_domain_sets_custom_domain_and_static_url(self):
        resolved = _resolve_do_spaces_storage(
            endpoint="https://sgp1.digitaloceanspaces.com",
            legacy_custom_domain="https://schedjuice-dev.sgp1.digitaloceanspaces.com",
            cdn_domain="schedjuice-dev.sgp1.cdn.digitaloceanspaces.com",
            static_location="static-dev",
            bucket_name="schedjuice-dev",
        )
        self.assertEqual(
            resolved["AWS_S3_ENDPOINT_URL"],
            "https://sgp1.digitaloceanspaces.com",
        )
        self.assertEqual(
            resolved["AWS_S3_CUSTOM_DOMAIN"],
            "schedjuice-dev.sgp1.cdn.digitaloceanspaces.com",
        )
        self.assertEqual(
            resolved["STATIC_URL"],
            "https://schedjuice-dev.sgp1.cdn.digitaloceanspaces.com/static-dev/",
        )
        self.assertEqual(
            resolved["AWS_S3_BUCKET_ORIGIN_URL"],
            "https://schedjuice-dev.sgp1.digitaloceanspaces.com",
        )

    def test_cdn_domain_includes_bucket_prefix_when_host_differs(self):
        resolved = _resolve_do_spaces_storage(
            endpoint="https://sgp1.digitaloceanspaces.com",
            legacy_custom_domain="",
            cdn_domain="schedjuice-dev.sgp1.cdn.digitaloceanspaces.com",
            static_location="static-prod",
            bucket_name="schedjuice-prod",
        )
        self.assertEqual(
            resolved["STATIC_URL"],
            "https://schedjuice-dev.sgp1.cdn.digitaloceanspaces.com/schedjuice-prod/static-prod/",
        )

    def test_legacy_custom_domain_fallback_for_endpoint(self):
        resolved = _resolve_do_spaces_storage(
            endpoint="",
            legacy_custom_domain="https://schedjuice-dev.sgp1.digitaloceanspaces.com",
            cdn_domain="",
            static_location="static-dev",
            bucket_name="schedjuice-dev",
        )
        self.assertEqual(
            resolved["AWS_S3_ENDPOINT_URL"],
            "https://schedjuice-dev.sgp1.digitaloceanspaces.com",
        )
        self.assertIsNone(resolved["AWS_S3_CUSTOM_DOMAIN"])
        self.assertEqual(
            resolved["STATIC_URL"],
            "https://schedjuice-dev.sgp1.digitaloceanspaces.com/static-dev/",
        )

    def test_requires_endpoint_or_legacy_custom_domain(self):
        with self.assertRaises(ImproperlyConfigured):
            _resolve_do_spaces_storage(
                endpoint="",
                legacy_custom_domain="",
                cdn_domain="",
                static_location="static-dev",
                bucket_name="schedjuice-dev",
            )


class DoPublicUrlBucketPrefixTests(SimpleTestCase):
    def test_no_prefix_when_cdn_host_matches_bucket(self):
        self.assertEqual(
            _do_public_url_bucket_prefix(
                "schedjuice-dev.sgp1.cdn.digitaloceanspaces.com",
                "schedjuice-dev",
            ),
            "",
        )

    def test_prefix_when_cdn_host_differs_from_bucket(self):
        self.assertEqual(
            _do_public_url_bucket_prefix(
                "schedjuice-dev.sgp1.cdn.digitaloceanspaces.com",
                "schedjuice-prod",
            ),
            "schedjuice-prod/",
        )


@override_settings(
    AWS_S3_CUSTOM_DOMAIN="schedjuice-dev.sgp1.cdn.digitaloceanspaces.com",
    AWS_STORAGE_BUCKET_NAME="schedjuice-prod",
    AWS_PUBLIC_MEDIA_LOCATION="media-prod/public",
    AWS_S3_ENDPOINT_URL="https://sgp1.digitaloceanspaces.com",
)
class PublicMediaStorageMultiBucketUrlTests(SimpleTestCase):
    """Separate physical buckets sharing one CDN hostname."""

    @patch(
        "schedjuice_backend.storages.resolve_existing_private_media_s3_key",
        return_value=(
            "schedjuice-prod/media-prod/public/"
            "xexcellentchoiceschedjuicecom/logos/"
            "326744163_857166358886230_4313807981391918603_n.png"
        ),
    )
    def test_public_logo_url_includes_bucket_on_shared_cdn_host(self, _resolve_key):
        storage = PublicMediaStorage()
        url = storage.url(
            "xexcellentchoiceschedjuicecom/logos/"
            "326744163_857166358886230_4313807981391918603_n.png"
        )
        self.assertEqual(
            url,
            "https://schedjuice-dev.sgp1.cdn.digitaloceanspaces.com/"
            "schedjuice-prod/media-prod/public/"
            "xexcellentchoiceschedjuicecom/logos/"
            "326744163_857166358886230_4313807981391918603_n.png",
        )


@override_settings(
    AWS_S3_CUSTOM_DOMAIN="schedjuice-dev.sgp1.cdn.digitaloceanspaces.com",
    AWS_STORAGE_BUCKET_NAME="schedjuice-dev",
    AWS_PUBLIC_MEDIA_LOCATION="schedjuice-prod/media-prod/public",
    AWS_S3_ENDPOINT_URL="https://sgp1.digitaloceanspaces.com",
)
class PublicMediaStorageSingleSpaceUrlTests(SimpleTestCase):
    """One DO Space; env prefix lives in AWS_PUBLIC_MEDIA_LOCATION."""

    @patch(
        "schedjuice_backend.storages.resolve_existing_private_media_s3_key",
        return_value=(
            "schedjuice-prod/media-prod/public/xschedjuice/logos/"
            "326744163_857166358886230_4313807981391918603_n.png"
        ),
    )
    def test_public_logo_url_without_duplicate_env_prefix(self, _resolve_key):
        storage = PublicMediaStorage()
        url = storage.url(
            "xschedjuice/logos/"
            "326744163_857166358886230_4313807981391918603_n.png"
        )
        self.assertEqual(
            url,
            "https://schedjuice-dev.sgp1.cdn.digitaloceanspaces.com/"
            "schedjuice-prod/media-prod/public/xschedjuice/logos/"
            "326744163_857166358886230_4313807981391918603_n.png",
        )


@override_settings(
    AWS_S3_CUSTOM_DOMAIN="schedjuice-dev.sgp1.cdn.digitaloceanspaces.com",
    AWS_STORAGE_BUCKET_NAME="schedjuice-dev",
    AWS_PUBLIC_MEDIA_LOCATION="schedjuice-dev/media-dev/public",
    AWS_S3_ENDPOINT_URL="https://sgp1.digitaloceanspaces.com",
    AWS_ACCESS_KEY_ID="test-key",
    AWS_SECRET_ACCESS_KEY="test-secret",
)
class PublicMediaStorageLegacyKeyUrlTests(SimpleTestCase):
    @patch("schedjuice_backend.private_media_s3.s3_object_exists")
    def test_public_logo_url_falls_back_to_legacy_key_without_env_prefix(self, exists):
        def _exists(*, bucket, key, client):
            return key == "media-dev/public/xschedjuice/logos/logo.png"

        exists.side_effect = _exists

        storage = PublicMediaStorage()
        url = storage.url("xschedjuice/logos/logo.png")
        self.assertEqual(
            url,
            "https://schedjuice-dev.sgp1.cdn.digitaloceanspaces.com/"
            "media-dev/public/xschedjuice/logos/logo.png",
        )


@override_settings(
    AWS_S3_CUSTOM_DOMAIN="schedjuice-dev.sgp1.cdn.digitaloceanspaces.com",
    AWS_STORAGE_BUCKET_NAME="schedjuice-dev",
    AWS_PUBLIC_MEDIA_LOCATION="schedjuice-dev/media-dev/public",
    AWS_S3_ENDPOINT_URL="https://sgp1.digitaloceanspaces.com",
    AWS_ACCESS_KEY_ID="test-key",
    AWS_SECRET_ACCESS_KEY="test-secret",
)
class PublicMediaStorageLegacyKeyUrlTests(SimpleTestCase):
    @patch("schedjuice_backend.private_media_s3.s3_object_exists")
    def test_public_logo_url_falls_back_to_legacy_key_without_env_prefix(self, exists):
        def _exists(*, bucket, key, client):
            return key == "media-dev/public/xschedjuice/logos/logo.png"

        exists.side_effect = _exists

        storage = PublicMediaStorage()
        url = storage.url("xschedjuice/logos/logo.png")
        self.assertEqual(
            url,
            "https://schedjuice-dev.sgp1.cdn.digitaloceanspaces.com/"
            "media-dev/public/xschedjuice/logos/logo.png",
        )


@override_settings(
    AWS_S3_CUSTOM_DOMAIN="schedjuice-dev.sgp1.cdn.digitaloceanspaces.com",
    AWS_STORAGE_BUCKET_NAME="schedjuice-dev",
    AWS_PUBLIC_MEDIA_LOCATION="schedjuice-dev/media-dev/public",
    AWS_S3_ENDPOINT_URL="https://sgp1.digitaloceanspaces.com",
    AWS_ACCESS_KEY_ID="test-key",
    AWS_SECRET_ACCESS_KEY="test-secret",
)
class PublicMediaStorageLegacyKeyUrlTests(SimpleTestCase):
    @patch("schedjuice_backend.private_media_s3.s3_object_exists")
    def test_public_logo_url_falls_back_to_legacy_key_without_env_prefix(self, exists):
        def _exists(*, bucket, key, client):
            return key == "media-dev/public/xschedjuice/logos/logo.png"

        exists.side_effect = _exists

        storage = PublicMediaStorage()
        url = storage.url("xschedjuice/logos/logo.png")
        self.assertEqual(
            url,
            "https://schedjuice-dev.sgp1.cdn.digitaloceanspaces.com/"
            "media-dev/public/xschedjuice/logos/logo.png",
        )


@override_settings(
    AWS_ACCESS_KEY_ID="test-key",
    AWS_SECRET_ACCESS_KEY="test-secret",
    AWS_STORAGE_BUCKET_NAME="schedjuice-dev",
    AWS_PRIVATE_MEDIA_LOCATION="schedjuice-dev/media-dev/private",
    AWS_S3_ENDPOINT_URL="https://sgp1.digitaloceanspaces.com",
    AWS_S3_BUCKET_ORIGIN_URL="https://schedjuice-dev.sgp1.digitaloceanspaces.com",
    AWS_S3_REGION_NAME="sgp1",
    AWS_S3_PRIVATE_PRESIGN_ADDRESSING_STYLE="virtual",
    AWS_QUERYSTRING_AUTH=False,
)
class PrivateMediaStorageUrlTests(SimpleTestCase):
    @patch(
        "schedjuice_backend.storages.resolve_existing_private_media_s3_key",
        return_value="schedjuice-dev/media-dev/private/xschedjuice/payment_screenshots/ios-dark.png",
    )
    def test_private_url_uses_virtual_hosted_presign_shape(self, _resolve_key):
        storage = PrivateMediaStorage()
        self.assertTrue(storage.querystring_auth)
        url = storage.url("xschedjuice/payment_screenshots/ios-dark.png")
        self.assertIn("X-Amz-Signature=", url)
        self.assertIn(
            "https://schedjuice-dev.sgp1.digitaloceanspaces.com/"
            "schedjuice-dev/media-dev/private/xschedjuice/payment_screenshots/ios-dark.png",
            url.split("?")[0],
        )
        self.assertNotIn(
            "schedjuice-dev.schedjuice-dev.",
            url.split("?")[0],
        )


@override_settings(
    AWS_ACCESS_KEY_ID="test-key",
    AWS_SECRET_ACCESS_KEY="test-secret",
    AWS_STORAGE_BUCKET_NAME="schedjuice-dev",
    AWS_PRIVATE_MEDIA_LOCATION="schedjuice-prod/media-prod/private",
    AWS_S3_ENDPOINT_URL="https://sgp1.digitaloceanspaces.com",
    AWS_S3_BUCKET_ORIGIN_URL="https://schedjuice-dev.sgp1.digitaloceanspaces.com",
    AWS_S3_REGION_NAME="sgp1",
    AWS_S3_PRIVATE_PRESIGN_ADDRESSING_STYLE="virtual",
)
class GetPresignedUrlTests(SimpleTestCase):
    @patch(
        "app_attachment.views.resolve_existing_private_media_s3_key",
        return_value="schedjuice-dev/media-dev/private/xschedjuice/payment_screenshots/ios-dark.png",
    )
    def test_attachment_presign_dev_virtual_hosted_shape(self, _resolve_key):
        from app_attachment.views import get_presigned_url

        url = get_presigned_url(
            "xschedjuice/payment_screenshots/ios-dark.png",
            "ios-dark.png",
            "image/png",
        )
        self.assertIn("X-Amz-Signature=", url)
        self.assertIn(
            "https://schedjuice-dev.sgp1.digitaloceanspaces.com/"
            "schedjuice-dev/media-dev/private/xschedjuice/payment_screenshots/ios-dark.png",
            url.split("?")[0],
        )

    @patch(
        "app_attachment.views.resolve_existing_private_media_s3_key",
        return_value="schedjuice-prod/media-prod/private/xschedjuice/payment_screenshots/ios-dark.png",
    )
    def test_attachment_presign_prod_virtual_hosted_shape(self, _resolve_key):
        from app_attachment.views import get_presigned_url

        url = get_presigned_url(
            "xschedjuice/payment_screenshots/ios-dark.png",
            "ios-dark.png",
            "image/png",
        )
        self.assertIn("X-Amz-Signature=", url)
        self.assertIn(
            "https://schedjuice-dev.sgp1.digitaloceanspaces.com/"
            "schedjuice-prod/media-prod/private/xschedjuice/payment_screenshots/ios-dark.png",
            url.split("?")[0],
        )
        self.assertNotIn(
            "schedjuice-dev.schedjuice-dev.",
            url.split("?")[0],
        )
