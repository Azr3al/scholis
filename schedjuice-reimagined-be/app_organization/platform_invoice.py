from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_ai.reporting import build_org_usage_summary
from app_finance.billing_api import build_monthly_billing_payload
from app_organization.models import Organization, PlatformInvoice, PlatformInvoiceCounter


class PlatformInvoiceError(Exception):
    pass


class PlatformInvoiceValidationError(PlatformInvoiceError):
    pass


def _month_label(year: int, month: int) -> str:
    return datetime(year, month, 1).strftime("%B %Y")


def _validate_org_for_invoice(org: Organization) -> None:
    if org.is_demo:
        raise PlatformInvoiceValidationError("Demo tenants are excluded from billing.")


def _validate_period(year: int, month: int) -> None:
    if month < 1 or month > 12:
        raise PlatformInvoiceValidationError("Invalid month.")
    if year < 2000 or year > 2100:
        raise PlatformInvoiceValidationError("Invalid year.")


@transaction.atomic
def allocate_platform_invoice_number() -> int:
    with schema_context(get_public_schema_name()):
        counter, _ = PlatformInvoiceCounter.objects.select_for_update().get_or_create(
            pk=1,
            defaults={"next_sequence": 1},
        )
        number = counter.next_sequence
        counter.next_sequence = number + 1
        counter.save(update_fields=["next_sequence", "updated_at"])
        return number


def build_platform_invoice_snapshot(
    org: Organization,
    year: int,
    month: int,
    *,
    request=None,
) -> dict:
    _validate_org_for_invoice(org)
    _validate_period(year, month)

    date_str = f"{year}-{month:02d}-01"
    billing_payload = build_monthly_billing_payload(
        org.schema_name,
        datetime(year, month, 1),
        date_str,
        request,
    )
    billing_rows = billing_payload.get("data") or []
    platform_subtotal = int(billing_payload.get("total_payment") or 0)
    flat_rate_subtotal = int(org.platform_monthly_flat_rate or 0)

    line_items: list[dict] = []
    if flat_rate_subtotal > 0:
        line_items.append(
            {
                "kind": "platform_flat_rate",
                "label": f"Platform subscription ({_month_label(year, month)})",
                "amount": flat_rate_subtotal,
                "currency": org.currency_iso4217,
            }
        )
    elif billing_rows:
        total_user_days = sum(int(row["active_user_count"]) for row in billing_rows)
        billing_row_count = len(billing_rows)
        avg_active_users = (
            round(total_user_days / billing_row_count) if billing_row_count else 0
        )
        typical_unit_amount = int(billing_rows[0]["cost_per_account_at_creation"])
        line_items.append(
            {
                "kind": "platform_seats",
                "label": f"Platform usage ({_month_label(year, month)})",
                "quantity": total_user_days,
                "unit_label": "user-days",
                "unit_amount": typical_unit_amount,
                "amount": platform_subtotal,
                "currency": org.currency_iso4217,
                "meta": {
                    "avg_active_users": avg_active_users,
                    "billing_row_count": billing_row_count,
                },
            }
        )

    ai_subtotal_usd: str | None = None
    if org.is_ai_enabled:
        ai_summary = build_org_usage_summary(org, year, month)
        month_summary = ai_summary["month_summary"]
        total_cost_usd = Decimal(month_summary["total_cost_usd"])
        if total_cost_usd > 0:
            ai_subtotal_usd = str(total_cost_usd)
            line_items.append(
                {
                    "kind": "ai_usage",
                    "label": f"AI usage ({_month_label(year, month)})",
                    "amount_usd": ai_subtotal_usd,
                    "currency": "USD",
                    "meta": {
                        "total_tokens": month_summary["total_tokens"],
                        "request_count": month_summary["request_count"],
                    },
                }
            )

    if (
        flat_rate_subtotal == 0
        and platform_subtotal == 0
        and ai_subtotal_usd is None
    ):
        raise PlatformInvoiceValidationError(
            "No billable usage for this period."
        )

    totals = {
        "platform_subtotal": 0 if flat_rate_subtotal > 0 else platform_subtotal,
        "currency_symbol": org.currency_symbol,
        "currency_iso4217": org.currency_iso4217,
    }
    if flat_rate_subtotal > 0:
        totals["flat_rate_subtotal"] = flat_rate_subtotal
    if ai_subtotal_usd is not None:
        totals["ai_subtotal_usd"] = ai_subtotal_usd

    return {
        "billing_year": year,
        "billing_month": month,
        "line_items": line_items,
        "totals": totals,
        "organization": {
            "id": org.id,
            "name": org.name,
            "schema_name": org.schema_name,
            "available_domains": list(org.available_domains or []),
        },
    }


def _existing_invoice(
    org: Organization, year: int, month: int
) -> PlatformInvoice | None:
    with schema_context(get_public_schema_name()):
        return (
            PlatformInvoice.objects.filter(
                organization=org,
                billing_year=year,
                billing_month=month,
            )
            .first()
        )


def _actor_fields(
    generated_by,
    *,
    generated_by_email: str | None = None,
) -> tuple[int | None, str, str]:
    generated_by_user_id = None
    generated_by_name = ""
    resolved_email = generated_by_email or ""
    if generated_by is not None:
        pk = getattr(generated_by, "pk", None)
        if isinstance(pk, int):
            generated_by_user_id = pk
        generated_by_name = getattr(generated_by, "name", "") or ""
        resolved_email = getattr(generated_by, "email", "") or resolved_email
    return generated_by_user_id, generated_by_name, resolved_email


@transaction.atomic
def create_platform_invoice(
    org: Organization,
    year: int,
    month: int,
    *,
    generated_by=None,
    generated_by_email: str | None = None,
    request=None,
) -> tuple[PlatformInvoice, bool]:
    """
    Create or replace the invoice for this org and billing period.
    Returns (invoice, created) where created is False when an existing row was updated.
    """
    snapshot = build_platform_invoice_snapshot(org, year, month, request=request)
    generated_at = timezone.now()
    generated_by_user_id, generated_by_name, resolved_email = _actor_fields(
        generated_by,
        generated_by_email=generated_by_email,
    )

    existing = _existing_invoice(org, year, month)
    with schema_context(get_public_schema_name()):
        if existing is not None:
            existing.line_items = snapshot["line_items"]
            existing.totals = snapshot["totals"]
            existing.generated_by_user_id = generated_by_user_id
            existing.generated_by_name = generated_by_name
            existing.generated_by_email = resolved_email
            existing.generated_at = generated_at
            existing.status = PlatformInvoice.Status.ISSUED
            existing.save(
                update_fields=[
                    "line_items",
                    "totals",
                    "generated_by_user_id",
                    "generated_by_name",
                    "generated_by_email",
                    "generated_at",
                    "status",
                    "updated_at",
                ]
            )
            return existing, False

        invoice = PlatformInvoice.objects.create(
            organization=org,
            invoice_number=allocate_platform_invoice_number(),
            billing_year=year,
            billing_month=month,
            status=PlatformInvoice.Status.ISSUED,
            line_items=snapshot["line_items"],
            totals=snapshot["totals"],
            generated_by_user_id=generated_by_user_id,
            generated_by_name=generated_by_name,
            generated_by_email=resolved_email,
            generated_at=generated_at,
        )
        return invoice, True
