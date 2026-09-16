"""Resolve and presign private DigitalOcean Spaces / S3 object keys.

Single-space layout: one physical DO Space (e.g. schedjuice-dev) with env isolation
in the object key prefix (e.g. schedjuice-prod/media-prod/private/{schema}/...).
Presign uses virtual-hosted addressing against the regional API endpoint
(https://sgp1.digitaloceanspaces.com), not the bucket-origin URL — using both
virtual style and bucket origin doubles the bucket in the hostname
(schedjuice-dev.schedjuice-dev.sgp1...).
"""

from __future__ import annotations

import os
from urllib.parse import urlparse

import boto3
from botocore.config import Config as BotoConfig
from botocore.exceptions import ClientError
from django.conf import settings
from storages.utils import clean_name

_S3_ENV_KEY_PREFIXES = ("schedjuice-prod/", "schedjuice-dev/")


def strip_bucket_prefix_from_s3_key(path: str, bucket_name: str | None = None) -> str:
    """Drop path-style physical bucket segment from an object key path."""
    path = (path or "").lstrip("/")
    bucket = bucket_name or settings.AWS_STORAGE_BUCKET_NAME
    prefix = f"{bucket}/"
    if path.startswith(prefix):
        path = path[len(prefix) :]
    return path


def private_media_key_candidates(primary_key: str) -> list[str]:
    """
    Prefer canonical key; fall back to legacy layouts in the same Space.

    Legacy includes media at Space root (without env prefix) and keys without
    the /private/ segment.
    """
    candidates: list[str] = []
    seen: set[str] = set()

    def add(key: str) -> None:
        if key and key not in seen:
            seen.add(key)
            candidates.append(key)

    add(primary_key)

    for env_prefix in _S3_ENV_KEY_PREFIXES:
        if primary_key.startswith(env_prefix):
            add(primary_key[len(env_prefix) :])
            break

    marker = "/private/"
    if marker in primary_key:
        legacy = primary_key.replace(marker, "/", 1)
        add(legacy)
        for env_prefix in _S3_ENV_KEY_PREFIXES:
            if legacy.startswith(env_prefix):
                add(legacy[len(env_prefix) :])
                break

    return candidates


def resolve_private_media_s3_key_from_raw(raw_value: str, *, storage) -> str | None:
    raw = str(raw_value).split("?")[0].strip()
    if not raw:
        return None
    if raw.lower().startswith("http"):
        path = strip_bucket_prefix_from_s3_key(urlparse(raw).path)
        return path or None
    return storage._normalize_name(clean_name(raw))


def s3_object_exists(*, bucket: str, key: str, client) -> bool:
    try:
        client.head_object(Bucket=bucket, Key=key)
        return True
    except ClientError as exc:
        status = exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
        if status in (403, 404):
            return False
        raise


def resolve_existing_private_media_s3_key(raw_value: str, *, storage) -> str | None:
    primary = resolve_private_media_s3_key_from_raw(raw_value, storage=storage)
    if not primary:
        return None

    client = storage.connection.meta.client
    bucket = storage.bucket_name
    for key in private_media_key_candidates(primary):
        if s3_object_exists(bucket=bucket, key=key, client=client):
            return key
    return primary


def build_private_presign_s3_client():
    """
    S3 client for private GET presigning.

    Virtual-hosted presign must use the regional endpoint (e.g.
    https://sgp1.digitaloceanspaces.com) so boto builds
    https://{bucket}.sgp1.digitaloceanspaces.com/{key}. Pointing virtual style
    at the bucket-origin URL doubles the bucket in the hostname.
    """
    region = getattr(
        settings, "AWS_S3_REGION_NAME", os.environ.get("AWS_REGION", "us-east-1")
    )
    boto_config_kwargs: dict = {
        "signature_version": "s3v4",
        "connect_timeout": 5,
        "read_timeout": 30,
    }

    addressing_style = getattr(
        settings, "AWS_S3_PRIVATE_PRESIGN_ADDRESSING_STYLE", "virtual"
    )
    regional_endpoint = getattr(settings, "AWS_S3_ENDPOINT_URL", None)
    bucket_origin = getattr(settings, "AWS_S3_BUCKET_ORIGIN_URL", None)

    if addressing_style == "virtual" and regional_endpoint:
        endpoint_url = regional_endpoint
    elif bucket_origin:
        endpoint_url = bucket_origin.rstrip("/")
        if addressing_style == "virtual":
            addressing_style = "path"
    elif regional_endpoint:
        endpoint_url = regional_endpoint
    else:
        endpoint_url = f"https://s3.{region}.amazonaws.com"
        addressing_style = None

    if addressing_style:
        boto_config_kwargs["s3"] = {"addressing_style": addressing_style}

    return boto3.client(
        "s3",
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        region_name=region,
        endpoint_url=endpoint_url,
        config=BotoConfig(**boto_config_kwargs),
    )


def presign_private_s3_get_url(
    key: str,
    *,
    expires_in: int,
    file_type: str | None = None,
    client=None,
) -> str:
    s3_client = client or build_private_presign_s3_client()
    params: dict[str, str] = {
        "Bucket": settings.AWS_STORAGE_BUCKET_NAME,
        "Key": key,
    }
    if file_type:
        params["ResponseContentDisposition"] = "inline"
        params["ResponseContentType"] = file_type
    return s3_client.generate_presigned_url(
        "get_object",
        Params=params,
        ExpiresIn=expires_in,
    )
