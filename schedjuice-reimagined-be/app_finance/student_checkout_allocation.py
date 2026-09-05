from decimal import ROUND_HALF_UP, Decimal
from typing import Any


def _quantize(amount: Decimal) -> Decimal:
    return amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def infer_checkout_allocations(
    *,
    payments: list[dict[str, Any]],
    screenshots: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if not payments or not screenshots:
        return []

    if len(payments) == 1 and len(screenshots) > 1:
        payment = payments[0]
        share_count = len(screenshots)
        default_share = _quantize(payment["invoiced_amount"] / share_count)
        allocs: list[dict[str, Any]] = []
        running = Decimal("0")
        for i, shot in enumerate(screenshots):
            if i == share_count - 1:
                amount = _quantize(payment["invoiced_amount"] - running)
            else:
                amount = (
                    _quantize(shot["parsed_amount"])
                    if shot.get("parsed_amount") is not None
                    else default_share
                )
                running += amount
            allocs.append(
                {
                    "screenshot_index": shot["index"],
                    "payment_id": payment["id"],
                    "amount": amount,
                }
            )
        return allocs

    if len(screenshots) == 1:
        total_invoiced = sum(p["invoiced_amount"] for p in payments)
        ocr_total = screenshots[0].get("parsed_amount")
        target = ocr_total if ocr_total is not None else total_invoiced
        if total_invoiced <= 0:
            share = _quantize(target / len(payments))
            return [
                {
                    "screenshot_index": 0,
                    "payment_id": p["id"],
                    "amount": share,
                }
                for p in payments
            ]
        allocs: list[dict[str, Any]] = []
        running = Decimal("0")
        for i, payment in enumerate(payments):
            if i == len(payments) - 1:
                amount = _quantize(target - running)
            else:
                amount = _quantize(
                    target * (payment["invoiced_amount"] / total_invoiced)
                )
                running += amount
            allocs.append(
                {
                    "screenshot_index": 0,
                    "payment_id": payment["id"],
                    "amount": amount,
                }
            )
        return allocs

    remaining = {p["id"]: p["invoiced_amount"] for p in payments}
    allocs: list[dict[str, Any]] = []
    tolerance = Decimal("1")

    for shot in screenshots:
        idx = shot["index"]
        amt = shot.get("parsed_amount")
        if amt is None:
            continue
        match_pid = None
        for pid, invoiced in remaining.items():
            if abs(invoiced - amt) <= tolerance:
                match_pid = pid
                break
        if match_pid is not None:
            allocs.append(
                {"screenshot_index": idx, "payment_id": match_pid, "amount": amt}
            )
            del remaining[match_pid]

    if remaining:
        fallback_payments = [p for p in payments if p["id"] in remaining]
        used_shot_indexes = {a["screenshot_index"] for a in allocs}
        fallback_shots = [
            s for s in screenshots if s["index"] not in used_shot_indexes
        ]
        if fallback_shots:
            nested = infer_checkout_allocations(
                payments=fallback_payments,
                screenshots=fallback_shots,
            )
            allocs.extend(nested)
        else:
            last_idx = screenshots[-1]["index"]
            for payment in fallback_payments:
                allocs.append(
                    {
                        "screenshot_index": last_idx,
                        "payment_id": payment["id"],
                        "amount": payment["invoiced_amount"],
                    }
                )
    return allocs
