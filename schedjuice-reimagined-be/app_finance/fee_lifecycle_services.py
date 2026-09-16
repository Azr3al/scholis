"""Fee-lifecycle Sankey aggregates (homepage pie payment set, not coverage months)."""
from __future__ import annotations

from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from app_course.models import Course, Intake, Program
from app_finance.homepage_services import _pie_payments_qs, resolve_period_bounds
from app_finance.models import PaymentAdjustment, UserPayment
from app_reports.analytics_services import _as_org_day_bounds, _tz_for_tenant

VALID_BREAKDOWNS = frozenset({"none", "payment_method", "bank"})

SETTLEMENT_BAND_BY_STATUS = {
    UserPayment.Status.VERIFIED: "collected",
    UserPayment.Status.PENDING_VERIFICATION: "in_verification",
    UserPayment.Status.AWAITING_EXTRACTION: "in_verification",
    UserPayment.Status.AWAITING_METADATA_EXTRACTION: "in_verification",
    UserPayment.Status.PENDING_PAYMENT: "awaiting_payment",
    UserPayment.Status.AMOUNT_MISMATCH: "stuck",
    UserPayment.Status.DUPLICATED: "stuck",
    UserPayment.Status.CANNOT_EXTRACT: "stuck",
}


def _money_str(value: Decimal) -> str:
    return str(value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def money_of(value) -> Decimal:
    if value is None:
        return Decimal("0")
    if hasattr(value, "amount"):
        return Decimal(str(value.amount))
    return Decimal(str(value))


def cash_of(row: dict) -> Decimal:
    cash = money_of(row.get("actual_amount"))
    if cash == 0:
        cash = money_of(row.get("parsed_amount"))
    return cash


def ledger_amount(row: dict) -> Decimal:
    """Invoice when present; otherwise bank/OCR cash (admin-upload, no plan)."""
    invoiced = money_of(row.get("invoiced_amount"))
    if invoiced > 0:
        return invoiced
    return cash_of(row)


def resolve_lifecycle_course_ids(*, program_id: int, intake_id: int | None) -> list[int]:
    qs = Course.objects.filter(program_id=program_id)
    if intake_id is not None:
        qs = qs.filter(intake_id=intake_id)
    return list(qs.values_list("id", flat=True))


def aggregate_recorded_buckets(payments) -> dict:
    billed_base = billed_discount = billed_invoiced = Decimal("0")
    cash_received = Decimal("0")
    settlement = {
        "collected": Decimal("0"),
        "in_verification": Decimal("0"),
        "awaiting_payment": Decimal("0"),
        "stuck": Decimal("0"),
    }
    counts = {k: {"payments": 0, "students": set()} for k in settlement}
    billed_students: set = set()
    billed_payments = 0
    rows = payments.values(
        "id",
        "user_id",
        "status",
        "base_amount",
        "discount_amount",
        "invoiced_amount",
        "actual_amount",
        "parsed_amount",
    )
    payment_ids = []
    for row in rows:
        payment_ids.append(row["id"])
        stored_invoiced = money_of(row["invoiced_amount"])
        invoiced = ledger_amount(row)
        if stored_invoiced > 0:
            base = (
                money_of(row["base_amount"])
                if row["base_amount"] is not None
                else invoiced
            )
            discount = money_of(row["discount_amount"])
        else:
            base = invoiced
            discount = Decimal("0")
        billed_base += base
        billed_discount += discount
        billed_invoiced += invoiced
        billed_payments += 1
        if row["user_id"] is not None:
            billed_students.add(row["user_id"])
        band = SETTLEMENT_BAND_BY_STATUS[row["status"]]
        settlement[band] += invoiced
        counts[band]["payments"] += 1
        if row["user_id"] is not None:
            counts[band]["students"].add(row["user_id"])
        if row["status"] == UserPayment.Status.VERIFIED:
            cash = money_of(row["actual_amount"])
            if cash == 0:
                cash = money_of(row["parsed_amount"])
            cash_received += cash
    return {
        "billed": {
            "base": billed_base,
            "discount": billed_discount,
            "invoiced": billed_invoiced,
            "payment_count": billed_payments,
            "student_count": len(billed_students),
        },
        "settlement": settlement,
        "counts": {
            k: {
                "payment_count": v["payments"],
                "student_count": len(v["students"]),
            }
            for k, v in counts.items()
        },
        "cash_received": cash_received,
        "payment_ids": payment_ids,
    }


def aggregate_refunds(payment_ids: list[int], collected: Decimal) -> dict:
    per_payment_retained: dict[int, Decimal] = {}
    if not payment_ids:
        return {
            "refunded": Decimal("0"),
            "retained": collected,
            "refund_clamped": False,
            "per_payment_retained": per_payment_retained,
        }
    verified_ids = set(
        UserPayment.objects.filter(
            id__in=payment_ids, status=UserPayment.Status.VERIFIED
        ).values_list("id", flat=True)
    )
    invoiced_by_id = {
        row["id"]: ledger_amount(row)
        for row in UserPayment.objects.filter(id__in=verified_ids).values(
            "id", "invoiced_amount", "actual_amount", "parsed_amount"
        )
    }
    raw_refunds: dict[int, Decimal] = {pid: Decimal("0") for pid in verified_ids}
    for row in PaymentAdjustment.objects.filter(
        user_payment_id__in=verified_ids,
        kind=PaymentAdjustment.Kind.REFUND,
    ).values("user_payment_id", "amount"):
        raw_refunds[row["user_payment_id"]] += money_of(row["amount"])

    refunded = Decimal("0")
    refund_clamped = False
    for pid, invoiced in invoiced_by_id.items():
        raw = raw_refunds.get(pid, Decimal("0"))
        clamped = min(raw, invoiced)
        if clamped < raw:
            refund_clamped = True
        refunded += clamped
        per_payment_retained[pid] = invoiced - clamped
    return {
        "refunded": refunded,
        "retained": collected - refunded,
        "refund_clamped": refund_clamped,
        "per_payment_retained": per_payment_retained,
    }


def aggregate_unattributed(*, course_ids: list[int]) -> dict:
    if not course_ids:
        return {"amount": Decimal("0"), "payment_count": 0}
    qs = UserPayment.objects.filter(
        course_id__in=course_ids,
        issued_at__isnull=True,
        verified_at__isnull=True,
    )
    amount = Decimal("0")
    count = 0
    for row in qs.values("invoiced_amount", "actual_amount", "parsed_amount"):
        amount += ledger_amount(row)
        count += 1
    return {"amount": amount, "payment_count": count}


NODE_LABELS = {
    "billed": "Billed",
    "discounts_given": "Discounts given",
    "net_invoiced": "Net invoiced",
    "collected": "Collected",
    "in_verification": "In verification",
    "awaiting_payment": "Awaiting payment",
    "stuck": "Stuck",
    "refunded": "Refunded",
    "retained": "Retained",
}


def _empty_payload(*, period_label: str, date_from: date | None = None, date_to: date | None = None) -> dict:
    return {
        "nodes": [],
        "links": [],
        "unattributed": {"amount": _money_str(Decimal("0")), "payment_count": 0},
        "meta": {
            "period_label": period_label,
            "date_from": date_from.isoformat() if date_from else None,
            "date_to": date_to.isoformat() if date_to else None,
            "cash_received": _money_str(Decimal("0")),
            "refund_clamped": False,
        },
    }


def _link(
    source: str,
    target: str,
    amount: Decimal,
    *,
    payment_count: int = 0,
    student_count: int = 0,
    is_estimated: bool = False,
) -> dict | None:
    if amount <= 0:
        return None
    return {
        "source": source,
        "target": target,
        "amount": _money_str(amount),
        "payment_count": payment_count,
        "student_count": student_count,
        "is_estimated": is_estimated,
    }


def _node(key: str, amount: Decimal, *, is_estimated: bool = False, label: str | None = None) -> dict:
    return {
        "key": key,
        "label": label or NODE_LABELS.get(key, key),
        "amount": _money_str(amount),
        "is_estimated": is_estimated,
    }


def _breakdown_from_retained(
    breakdown: str, per_payment_retained: dict[int, Decimal]
) -> tuple[list[dict], list[dict]]:
    if breakdown == "none" or not per_payment_retained:
        return [], []
    ids = [pid for pid, amt in per_payment_retained.items() if amt > 0]
    if not ids:
        return [], []
    rows = UserPayment.objects.filter(id__in=ids).values(
        "id",
        "user_id",
        "payment_method_id",
        "payment_method__name",
        "payment_method__payment_bank",
    )
    groups: dict[str, dict] = {}
    for row in rows:
        retained = per_payment_retained.get(row["id"], Decimal("0"))
        if retained <= 0:
            continue
        if breakdown == "payment_method":
            pmid = row["payment_method_id"]
            key = f"method:{pmid}" if pmid is not None else "method:none"
            label = row["payment_method__name"] or "No method"
        else:
            bank = row["payment_method__payment_bank"]
            key = f"bank:{bank}" if bank else "bank:unknown"
            label = bank or "Unknown"
        group = groups.setdefault(
            key,
            {
                "label": label,
                "amount": Decimal("0"),
                "payments": 0,
                "students": set(),
            },
        )
        group["amount"] += retained
        group["payments"] += 1
        if row["user_id"] is not None:
            group["students"].add(row["user_id"])

    nodes = []
    links = []
    for key, group in groups.items():
        if group["amount"] <= 0:
            continue
        nodes.append(
            _node(key, group["amount"], label=group["label"])
        )
        link = _link(
            "retained",
            key,
            group["amount"],
            payment_count=group["payments"],
            student_count=len(group["students"]),
        )
        if link:
            links.append(link)
    return nodes, links


def build_fee_lifecycle_payload(
    *,
    program_id: int,
    intake_id: int | None,
    period: str,
    date_from: date | None,
    date_to: date | None,
    breakdown: str,
    org,
) -> dict:
    program = Program.objects.filter(id=program_id).first()
    if program is None:
        raise ValueError("Program not found")

    intake = None
    if intake_id is not None:
        intake = Intake.objects.filter(id=intake_id, program_id=program_id).first()
        if intake is None:
            raise ValueError("Intake not found for program")

    course_ids = resolve_lifecycle_course_ids(
        program_id=program_id, intake_id=intake_id
    )
    if not course_ids:
        return _empty_payload(period_label="No courses")

    bounds = resolve_period_bounds(
        period=period,
        date_from=date_from,
        date_to=date_to,
        intake=intake,
        org=org,
        course_ids=course_ids,
    )
    tz = _tz_for_tenant(org)
    start_dt, end_dt = _as_org_day_bounds(
        bounds.date_from, bounds.date_to, tz
    )
    is_intake_range = intake is not None and period == "intake_range"
    collection_start_dt = None if is_intake_range else start_dt
    payments = _pie_payments_qs(
        course_ids=course_ids,
        start_dt=collection_start_dt,
        end_dt=end_dt,
    )
    buckets = aggregate_recorded_buckets(payments)
    refunds = aggregate_refunds(
        buckets["payment_ids"], buckets["settlement"]["collected"]
    )
    unattr = aggregate_unattributed(course_ids=course_ids)

    billed = buckets["billed"]
    settlement = buckets["settlement"]
    counts = buckets["counts"]

    raw_links = [
        _link(
            "billed",
            "discounts_given",
            billed["discount"],
            payment_count=billed["payment_count"],
            student_count=billed["student_count"],
        ),
        _link(
            "billed",
            "net_invoiced",
            billed["invoiced"],
            payment_count=billed["payment_count"],
            student_count=billed["student_count"],
        ),
        _link(
            "net_invoiced",
            "collected",
            settlement["collected"],
            payment_count=counts["collected"]["payment_count"],
            student_count=counts["collected"]["student_count"],
        ),
        _link(
            "net_invoiced",
            "in_verification",
            settlement["in_verification"],
            payment_count=counts["in_verification"]["payment_count"],
            student_count=counts["in_verification"]["student_count"],
        ),
        _link(
            "net_invoiced",
            "awaiting_payment",
            settlement["awaiting_payment"],
            payment_count=counts["awaiting_payment"]["payment_count"],
            student_count=counts["awaiting_payment"]["student_count"],
        ),
        _link(
            "net_invoiced",
            "stuck",
            settlement["stuck"],
            payment_count=counts["stuck"]["payment_count"],
            student_count=counts["stuck"]["student_count"],
        ),
        _link(
            "collected",
            "refunded",
            refunds["refunded"],
            payment_count=counts["collected"]["payment_count"],
            student_count=counts["collected"]["student_count"],
        ),
        _link(
            "collected",
            "retained",
            refunds["retained"],
            payment_count=counts["collected"]["payment_count"],
            student_count=counts["collected"]["student_count"],
        ),
    ]
    links = [link for link in raw_links if link is not None]

    node_amounts = {
        "billed": billed["base"],
        "discounts_given": billed["discount"],
        "net_invoiced": billed["invoiced"],
        "collected": settlement["collected"],
        "in_verification": settlement["in_verification"],
        "awaiting_payment": settlement["awaiting_payment"],
        "stuck": settlement["stuck"],
        "refunded": refunds["refunded"],
        "retained": refunds["retained"],
    }
    used_keys = {link["source"] for link in links} | {link["target"] for link in links}
    nodes = [
        _node(key, node_amounts[key])
        for key in node_amounts
        if key in used_keys and node_amounts[key] > 0
    ]

    extra_nodes, extra_links = _breakdown_from_retained(
        breakdown, refunds["per_payment_retained"]
    )
    nodes.extend(extra_nodes)
    links.extend(extra_links)

    return {
        "nodes": nodes,
        "links": links,
        "unattributed": {
            "amount": _money_str(unattr["amount"]),
            "payment_count": unattr["payment_count"],
        },
        "meta": {
            "period_label": bounds.label,
            "date_from": bounds.date_from.isoformat(),
            "date_to": bounds.date_to.isoformat(),
            "cash_received": _money_str(buckets["cash_received"]),
            "refund_clamped": refunds["refund_clamped"],
        },
    }
