"""OCR analytics aggregates and OCR.space vendor quota."""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone as dt_timezone

import requests
from django.conf import settings
from django.core.cache import cache
from django.db.models import Count, Q
from django.db.models.functions import TruncDate
from django.utils import timezone
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.models import OcrExtractionEvent

logger = logging.getLogger(__name__)

OCR_SPACE_CONVERSIONS_CACHE_KEY = "ocr_space_conversions:v1"
OCR_SPACE_CONVERSIONS_TTL = 3600


def month_bounds(month: date) -> tuple[datetime, datetime]:
    start = datetime(month.year, month.month, 1, tzinfo=dt_timezone.utc)
    if month.month == 12:
        end = datetime(month.year + 1, 1, 1, tzinfo=dt_timezone.utc)
    else:
        end = datetime(month.year, month.month + 1, 1, tzinfo=dt_timezone.utc)
    return start, end


def parse_month_param(raw: str | None) -> date:
    if not raw:
        today = timezone.now().date()
        return date(today.year, today.month, 1)
    parsed = date.fromisoformat(f"{raw}-01" if len(raw) == 7 else raw)
    return date(parsed.year, parsed.month, 1)


def fetch_ocr_space_conversions(*, last_month: bool = False) -> dict:
    api_key = getattr(settings, "OCR_API_KEY", None)
    if not api_key:
        return {"available": False, "error": "OCR_API_KEY is not configured"}

    payload = {}
    if last_month:
        payload["startDate"] = "lastMonth"

    try:
        res = requests.post(
            "https://myapi.ocr.space/conversions",
            data=payload,
            headers={"apikey": api_key},
            timeout=15,
        )
        res.raise_for_status()
        body = res.json()
    except Exception as exc:
        logger.warning("ocr_space_conversions_fetch_failed: %s", exc)
        return {"available": False, "error": str(exc)}

    engine1 = int(body.get("Engine1") or body.get("engine1") or 0)
    engine2 = int(body.get("Engine2") or body.get("engine2") or 0)
    total = int(body.get("Total") or body.get("total") or engine1 + engine2)
    quota = getattr(settings, "OCR_MONTHLY_QUOTA", None)
    quota_percent = None
    if quota and quota > 0:
        quota_percent = round((total / quota) * 100, 1)

    return {
        "available": True,
        "engine1": engine1,
        "engine2": engine2,
        "total": total,
        "quota": quota,
        "quota_percent": quota_percent,
        "period_through": (timezone.now().date() - timedelta(days=1)).isoformat(),
        "cached_at": timezone.now().isoformat(),
    }


def get_cached_ocr_space_conversions(*, refresh: bool = False) -> dict:
    if not refresh:
        cached = cache.get(OCR_SPACE_CONVERSIONS_CACHE_KEY)
        if cached is not None:
            return cached
    payload = fetch_ocr_space_conversions()
    if payload.get("available"):
        cache.set(OCR_SPACE_CONVERSIONS_CACHE_KEY, payload, OCR_SPACE_CONVERSIONS_TTL)
    return payload


def build_ocr_analytics(*, month: date, refresh_vendor: bool = False) -> dict:
    start, end = month_bounds(month)
    with schema_context(get_public_schema_name()):
        qs = OcrExtractionEvent.objects.filter(
            created_at__gte=start, created_at__lt=end
        )
        summary = qs.aggregate(
            total=Count("id"),
            errors=Count("id", filter=Q(outcome=OcrExtractionEvent.Outcome.ERROR)),
            correct=Count(
                "id", filter=Q(correctness=OcrExtractionEvent.Correctness.CORRECT)
            ),
            corrected=Count(
                "id", filter=Q(correctness=OcrExtractionEvent.Correctness.CORRECTED)
            ),
            pending=Count(
                "id", filter=Q(correctness=OcrExtractionEvent.Correctness.PENDING)
            ),
            failed_extraction=Count(
                "id",
                filter=Q(correctness=OcrExtractionEvent.Correctness.FAILED_EXTRACTION),
            ),
        )
        by_source = list(
            qs.values("source")
            .annotate(
                total=Count("id"),
                correct=Count(
                    "id",
                    filter=Q(correctness=OcrExtractionEvent.Correctness.CORRECT),
                ),
                corrected=Count(
                    "id",
                    filter=Q(correctness=OcrExtractionEvent.Correctness.CORRECTED),
                ),
                errors=Count("id", filter=Q(outcome=OcrExtractionEvent.Outcome.ERROR)),
            )
            .order_by("source")
        )
        by_tenant = list(
            qs.values("tenant_id", "tenant__name")
            .annotate(
                total=Count("id"),
                correct=Count(
                    "id",
                    filter=Q(correctness=OcrExtractionEvent.Correctness.CORRECT),
                ),
            )
            .order_by("-total")[:50]
        )
        daily = list(
            qs.annotate(day=TruncDate("created_at"))
            .values("day")
            .annotate(total=Count("id"))
            .order_by("day")
        )

    vendor = get_cached_ocr_space_conversions(refresh=refresh_vendor)
    return {
        "month": month.strftime("%Y-%m"),
        "vendor": vendor,
        "summary": summary,
        "by_source": by_source,
        "by_tenant": by_tenant,
        "daily": daily,
    }
