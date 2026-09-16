"""Pure planner for the one-receipt-per-unit backfill.

Imports nothing from Django so a migration can call it and so it keeps working
after UserPayment.receipt_number is dropped.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class PlannedReceipt:
    number: int
    receipt_date: datetime
    authorized_by_id: int | None
    payment_ids: tuple[int, ...]


@dataclass(frozen=True)
class PlannedVoid:
    number: int
    receipt_date: datetime
    void_reason: str


@dataclass(frozen=True)
class BackfillPlan:
    receipts: tuple[PlannedReceipt, ...]
    voids: tuple[PlannedVoid, ...]
    next_sequence: int


def _unit_key(row: dict) -> tuple[str, int]:
    if row["group_id"] is not None:
        return ("group", row["group_id"])
    return ("payment", row["id"])


def _row_date(row: dict):
    return row["payment_date"] or row["created_at"]


def plan_receipt_backfill(
    payments: list[dict], *, fallback_date: datetime
) -> BackfillPlan:
    units: dict[tuple[str, int], list[dict]] = {}
    for row in payments:
        units.setdefault(_unit_key(row), []).append(row)

    receipts: list[PlannedReceipt] = []
    voids: list[PlannedVoid] = []
    highest = 0

    for key in sorted(units):
        rows = units[key]
        numbered = [r for r in rows if r["receipt_number"] is not None]
        if not numbered:
            continue
        numbers = sorted(r["receipt_number"] for r in numbered)
        primary = numbers[0]

        dates = [d for d in (_row_date(r) for r in rows) if d is not None]
        receipt_date = min(dates) if dates else fallback_date

        completer = max(
            (r for r in numbered if r["verified_at"] is not None),
            key=lambda r: (r["verified_at"], r["id"]),
            default=None,
        )
        authorized_by_id = (completer or numbered[-1])["verified_by_id"]

        receipts.append(
            PlannedReceipt(
                number=primary,
                receipt_date=receipt_date,
                authorized_by_id=authorized_by_id,
                payment_ids=tuple(sorted(r["id"] for r in numbered)),
            )
        )
        for surplus in numbers[1:]:
            voids.append(
                PlannedVoid(
                    number=surplus,
                    receipt_date=receipt_date,
                    void_reason=f"superseded by receipt {primary}",
                )
            )
        highest = max(highest, numbers[-1])

    return BackfillPlan(
        receipts=tuple(receipts),
        voids=tuple(voids),
        next_sequence=highest + 1,
    )
