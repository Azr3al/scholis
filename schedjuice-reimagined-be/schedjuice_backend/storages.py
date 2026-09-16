from urllib.parse import urlsplit, urlunsplit

from django.conf import settings
from storages.backends.s3boto3 import S3Boto3Storage
from tenant_schemas.storage import TenantStorageMixin

from schedjuice_backend.private_media_s3 import (
    presign_private_s3_get_url,
    resolve_existing_private_media_s3_key,
)
from schedjuice_backend.settings import _do_public_url_bucket_prefix


def build_public_cdn_url_for_s3_key(full_key: str) -> str:
    """Build a public CDN URL for an absolute Spaces object key."""
    domain = getattr(settings, "AWS_S3_CUSTOM_DOMAIN", None)
    bucket = settings.AWS_STORAGE_BUCKET_NAME
    path = full_key.lstrip("/")
    if domain:
        bucket_prefix = _do_public_url_bucket_prefix(domain, bucket)
        if bucket_prefix:
            prefix = bucket_prefix.rstrip("/")
            if not path.startswith(f"{prefix}/"):
                path = f"{prefix}/{path}"
        return f"https://{domain}/{path}"
    region = getattr(settings, "AWS_S3_REGION_NAME", "sgp1")
    return f"https://{bucket}.{region}.digitaloceanspaces.com/{path}"


class _DoPublicCdnUrlMixin:
    """Public CDN URLs on a shared DO hostname include the bucket when needed."""

    querystring_auth = False

    @property
    def custom_domain(self):
        return getattr(settings, "AWS_S3_CUSTOM_DOMAIN", None) or False

    def url(self, name, parameters=None, expire=None, http_method=None):
        url = super().url(
            name, parameters=parameters, expire=expire, http_method=http_method
        )
        domain = self.custom_domain
        if not domain:
            return url

        bucket_prefix = _do_public_url_bucket_prefix(
            domain, settings.AWS_STORAGE_BUCKET_NAME
        )
        if not bucket_prefix:
            return url

        bucket_segment = f"/{bucket_prefix.rstrip('/')}"
        split = urlsplit(url)
        if split.path.startswith(f"{bucket_segment}/") or split.path == bucket_segment:
            return url
        return urlunsplit(split._replace(path=f"{bucket_segment}{split.path}"))


class StaticStorage(_DoPublicCdnUrlMixin, S3Boto3Storage):
    location = settings.AWS_STATIC_LOCATION


class PublicMediaStorage(_DoPublicCdnUrlMixin, S3Boto3Storage, TenantStorageMixin):
    default_acl = "public-read"
    location = settings.AWS_PUBLIC_MEDIA_LOCATION
    file_overwrite = False

    def url(self, name, parameters=None, expire=None, http_method=None):
        key = resolve_existing_private_media_s3_key(name, storage=self)
        if key:
            return build_public_cdn_url_for_s3_key(key)
        return super().url(
            name, parameters=parameters, expire=expire, http_method=http_method
        )


class PrivateMediaStorage(S3Boto3Storage, TenantStorageMixin):
    location = settings.AWS_PRIVATE_MEDIA_LOCATION
    default_acl = "private"
    file_overwrite = False
    custom_domain = False
    querystring_auth = True

    def url(self, name, parameters=None, expire=None, http_method=None):
        if expire is None:
            expire = self.querystring_expire
        key = resolve_existing_private_media_s3_key(name, storage=self)
        if not key:
            return super().url(
                name, parameters=parameters, expire=expire, http_method=http_method
            )
        return presign_private_s3_get_url(
            key,
            expires_in=expire,
        )
