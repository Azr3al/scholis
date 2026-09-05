"""Shared OCR.space client with datacenter failover, logging, and Discord alerts."""

from __future__ import annotations

import logging
import io
from typing import Any

import requests
from django.conf import settings

from app_utils.ops_discord import notify_discord_ops

logger = logging.getLogger(__name__)


class OcrError(Exception):
    """Raised when all configured OCR endpoints fail."""

    def __init__(self, message: str, failures: list[str] | None = None):
        super().__init__(message)
        self.failures = failures or []


def _validate_response(data: Any) -> tuple[bool, str]:
    if not isinstance(data, dict):
        return False, "response is not a dict"
    if data.get("IsErroredOnProcessing"):
        error_msg = (
            data.get("ErrorMessage") or data.get("ErrorDetails") or "processing error"
        )
        return False, str(error_msg)
    exit_code = data.get("OCRExitCode")
    if exit_code not in (1,):
        return False, f"OCRExitCode={exit_code!r}"
    parsed = data.get("ParsedResults")
    if not parsed or not isinstance(parsed, list):
        return False, "missing or empty ParsedResults"
    return True, ""


def _post_with_failover(payload: dict) -> dict:
    endpoints = list(getattr(settings, "OCR_ENDPOINTS", None) or [])
    api_key = getattr(settings, "OCR_API_KEY", None)
    timeout = getattr(settings, "OCR_TIMEOUT", 30)

    if not endpoints:
        raise OcrError("No OCR endpoints configured")
    if not api_key:
        raise OcrError("OCR_API_KEY is not configured")

    failures: list[str] = []
    for endpoint in endpoints:
        try:
            res = requests.post(
                endpoint,
                data=payload,
                headers={"apikey": api_key},
                timeout=timeout,
            )
            if not res.ok:
                reason = f"HTTP {res.status_code}"
                logger.warning("OCR endpoint %s failed: %s", endpoint, reason)
                failures.append(f"{endpoint}: {reason}")
                continue

            try:
                data = res.json()
            except ValueError as exc:
                reason = f"invalid JSON: {exc}"
                logger.warning("OCR endpoint %s failed: %s", endpoint, reason)
                failures.append(f"{endpoint}: {reason}")
                continue

            ok, reason = _validate_response(data)
            if not ok:
                logger.warning("OCR endpoint %s failed: %s", endpoint, reason)
                failures.append(f"{endpoint}: {reason}")
                continue

            logger.info("OCR succeeded via %s", endpoint)
            return data

        except requests.RequestException as exc:
            reason = str(exc)
            logger.warning("OCR endpoint %s failed: %s", endpoint, reason)
            failures.append(f"{endpoint}: {reason}")

    msg = "OCR failure: all datacenters failed"
    detail = "; ".join(failures)
    notify_discord_ops(f"{msg}\n{detail}")
    logger.error("%s: %s", msg, detail)
    raise OcrError(f"{msg}: {detail}", failures=failures)


def _post_file_with_failover(raw: bytes, filename: str) -> dict:
    endpoints = list(getattr(settings, "OCR_ENDPOINTS", None) or [])
    api_key = getattr(settings, "OCR_API_KEY", None)
    timeout = getattr(settings, "OCR_TIMEOUT", 30)

    if not endpoints:
        raise OcrError("No OCR endpoints configured")
    if not api_key:
        raise OcrError("OCR_API_KEY is not configured")

    failures: list[str] = []
    for endpoint in endpoints:
        try:
            res = requests.post(
                endpoint,
                files={"file": (filename, io.BytesIO(raw), "image/jpeg")},
                data={
                    "isOverlayRequired": True,
                    "detectOrientation": True,
                    "OCREngine": 2,
                },
                headers={"apikey": api_key},
                timeout=timeout,
            )
            if not res.ok:
                reason = f"HTTP {res.status_code}"
                logger.warning("OCR endpoint %s failed: %s", endpoint, reason)
                failures.append(f"{endpoint}: {reason}")
                continue

            try:
                data = res.json()
            except ValueError as exc:
                reason = f"invalid JSON: {exc}"
                logger.warning("OCR endpoint %s failed: %s", endpoint, reason)
                failures.append(f"{endpoint}: {reason}")
                continue

            ok, reason = _validate_response(data)
            if not ok:
                logger.warning("OCR endpoint %s failed: %s", endpoint, reason)
                failures.append(f"{endpoint}: {reason}")
                continue

            logger.info("OCR succeeded via %s", endpoint)
            return data

        except requests.RequestException as exc:
            reason = str(exc)
            logger.warning("OCR endpoint %s failed: %s", endpoint, reason)
            failures.append(f"{endpoint}: {reason}")

    msg = "OCR failure: all datacenters failed"
    detail = "; ".join(failures)
    notify_discord_ops(f"{msg}\n{detail}")
    logger.error("%s: %s", msg, detail)
    raise OcrError(f"{msg}: {detail}", failures=failures)


def image_to_text(image: str) -> dict:
    """Convert image to text with overlay data (receiver-side extraction)."""
    logger.info("Converting image to text: %s", image)
    return _post_with_failover(
        {
            "url": image,
            "isOverlayRequired": True,
            "detectOrientation": True,
            "filetype": "JPG",
            "OCREngine": 2,
        }
    )


def image_file_to_text(file_obj, filename: str = "screenshot.jpg") -> dict:
    """Convert an uploaded image file to text with overlay data."""
    raw = file_obj.read()
    if hasattr(file_obj, "seek"):
        file_obj.seek(0)
    return _post_file_with_failover(raw, filename)


def image_to_text_v2(image: str) -> dict:
    """Convert image to text without overlay (plain text extraction)."""
    logger.info("Using image to text v2: %s", image)
    return _post_with_failover(
        {
            "url": image,
            "isOverlayRequired": False,
            "detectOrientation": True,
            "filetype": "JPG",
            "OCREngine": 2,
        }
    )
