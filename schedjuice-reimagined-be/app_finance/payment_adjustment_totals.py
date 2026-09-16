"""Aggregate payment adjustment metadata for admin-report and receipt rows."""

from __future__ import annotations

from decimal import Decimal

from app_finance.models import PaymentAdjustment


def collect_payment_ids_from_rows(rows: list[dict]) -> set[int]:
    payment_ids: set[int] = set()

    def collect(row: dict) -> None:
        rid = row.get("id")
        if isinstance(rid, int):
            payment_ids.add(rid)
        for part in row.get("parts") or []:
            collect(part)

    for row in rows:
        collect(row)
    return payment_ids


def compute_adjustment_stats(
    payment_ids: set[int],
) -> dict[int, dict[str, int | Decimal]]:
    stats: dict[int, dict[str, int | Decimal]] = {}
    if not payment_ids:
        return stats

    for adj in PaymentAdjustment.objects.filter(user_payment_id__in=payment_ids):
        entry = stats.setdefault(
            adj.user_payment_id,
            {"adjustment_count": 0, "total_refunded": Decimal("0")},
        )
        entry["adjustment_count"] += 1
        if (
            adj.kind == PaymentAdjustment.Kind.REFUND
            and adj.amount is not None
        ):
            entry["total_refunded"] += Decimal(str(adj.amount.amount))
    return stats


def refund_total_for_payment_ids(
    payment_ids: set[int],
) -> dict[int, Decimal]:
    stats = compute_adjustment_stats(payment_ids)
    return {
        payment_id: entry["total_refunded"]
        for payment_id, entry in stats.items()
        if entry["total_refunded"] > 0
    }


def _default_stats_entry() -> dict[str, int | Decimal]:
    return {"adjustment_count": 0, "total_refunded": Decimal("0")}


def attach_adjustment_metadata(
    rows: list[dict],
    *,
    stats: dict[int, dict[str, int | Decimal]] | None = None,
) -> None:
    """Attach adjustment_count and total_refunded to payment and group rows."""
    if stats is None:
        payment_ids = collect_payment_ids_from_rows(rows)
        stats = compute_adjustment_stats(payment_ids)

    def apply_stats(row: dict) -> None:
        rid = row.get("id")
        if isinstance(rid, int):
            entry = stats.get(rid, _default_stats_entry())
            row["adjustment_count"] = entry["adjustment_count"]
            total_refunded = entry["total_refunded"]
            row["total_refunded"] = (
                str(total_refunded) if total_refunded > 0 else None
            )
            return

        parts = row.get("parts") or []
        if parts:
            total_count = 0
            total_refunded = Decimal("0")
            for part in parts:
                apply_stats(part)
                total_count += int(part.get("adjustment_count") or 0)
                part_refund = part.get("total_refunded")
                if part_refund is not None:
                    total_refunded += Decimal(str(part_refund))
            row["adjustment_count"] = total_count
            row["total_refunded"] = (
                str(total_refunded) if total_refunded > 0 else None
            )
            return

        row["adjustment_count"] = 0
        row["total_refunded"] = None

    for row in rows:
        apply_stats(row)
