from __future__ import annotations

from datetime import datetime

from django.db.models import F, Sum
from tenant_schemas.utils import schema_context

from app_finance import models, serializers


def parse_billing_date_param(date_str: str | None) -> tuple[datetime | None, str | None]:
    """
    Parse YYYY-MM-DD billing date query param.
    Returns (parsed_date, error_message); error_message is set when parsing fails.
    """
    if not date_str:
        return None, "date query param is required (YYYY-MM-DD)"
    try:
        return datetime.strptime(date_str, "%Y-%m-%d"), None
    except ValueError:
        return None, "Invalid date format. Expected YYYY-MM-DD"


def build_monthly_billing_payload(
    schema_name: str,
    parsed_date: datetime,
    date_str: str,
    request,
) -> dict:
    with schema_context(schema_name):
        billings = models.Billing.objects.filter(
            billing_date__year=parsed_date.year,
            billing_date__month=parsed_date.month,
        ).order_by("billing_date", "id")
        total_payment = billings.aggregate(
            total=Sum(F("active_user_count") * F("cost_per_account_at_creation"))
        )["total"] or 0

        serialized = serializers.BillingSerializer(
            billings,
            many=True,
            context={"request": request, "model": models.Billing},
        )
        return {
            "date": date_str,
            "year": parsed_date.year,
            "month": parsed_date.month,
            "total_payment": total_payment,
            "data": serialized.data,
        }
