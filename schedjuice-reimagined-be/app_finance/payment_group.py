from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

from django.db import transaction
from django.utils import timezone
from djmoney.money import Money

from app_finance.models import UserPayment, UserPaymentGroup
from app_finance.payment_coverage import first_month_instant, sync_user_payment_covered_months
from app_finance.services import mark_receiver_side_screenshots_matched

_STATUS_PRIORITY = [
    UserPayment.Status.DUPLICATED,
    UserPayment.Status.AMOUNT_MISMATCH,
    UserPayment.Status.CANNOT_EXTRACT,
    UserPayment.Status.AWAITING_EXTRACTION,
    UserPayment.Status.AWAITING_METADATA_EXTRACTION,
    UserPayment.Status.PENDING_VERIFICATION,
    UserPayment.Status.PENDING_PAYMENT,
]


def rollup_payment_group_status(statuses: list[str]) -> str:
    if not statuses:
        return UserPayment.Status.PENDING_PAYMENT
    if all(s == UserPayment.Status.VERIFIED for s in statuses):
        return UserPayment.Status.VERIFIED
    for candidate in _STATUS_PRIORITY:
        if candidate in statuses:
            return candidate
    return statuses[0]


def _money_amount(value):
    if value is None:
        return None
    return value.amount


def _report_staff_ref(user) -> dict:
    if user is None:
        return {"name": None, "id": None, "user_signature_url": None}
    sig_url = None
    sig_field = getattr(user, "user_signature", None)
    if sig_field:
        try:
            sig_url = sig_field.url
        except Exception:
            sig_url = None
    return {
        "name": user.name,
        "id": user.id,
        "user_signature_url": sig_url,
    }


def _discount_label(payment: UserPayment) -> str | None:
    from app_finance.payment_discount_apply import joined_discount_label

    return joined_discount_label(payment)


def _discount_lines(payment: UserPayment) -> list[dict]:
    return [
        {
            "enrollment_discount_id": ln.enrollment_discount_id,
            "label": ln.label,
            "amount": str(ln.amount.amount) if ln.amount is not None else None,
        }
        for ln in payment.payment_discounts.all()
    ]


def _course_ref(course) -> dict:
    return {"id": course.id, "title": course.title}


def _shared_screenshot_courses(payment: UserPayment) -> list[dict]:
    """Other courses funded by this row's bank transaction, for a table note."""
    if payment.group_id is None or not payment.transaction_id:
        return []
    siblings = [
        sibling
        for sibling in payment.group.parts.all()
        if sibling.id != payment.id
        and sibling.transaction_id == payment.transaction_id
        and sibling.course_id != payment.course_id
    ]
    seen: set[int] = set()
    refs: list[dict] = []
    for sibling in siblings:
        if sibling.course_id in seen:
            continue
        seen.add(sibling.course_id)
        refs.append(_course_ref(sibling.course))
    return refs


def admin_report_payment_row(payment: UserPayment) -> dict:
    cms = [
        {"year": cm.year, "month_index": cm.month_index}
        for cm in payment.covered_months.all()
    ]
    return {
        "id": payment.id,
        "kind": "payment",
        "group_id": payment.group_id,
        "group_kind": payment.group.group_kind if payment.group_id else None,
        "shared_screenshot_courses": _shared_screenshot_courses(payment),
        "user": {
            "id": payment.user.id,
            "name": payment.user.name,
            "email": payment.user.email,
        },
        "course": {
            "id": payment.course.id,
            "title": payment.course.title,
            "start_date": payment.course.start_date.isoformat()
            if payment.course.start_date
            else None,
            "end_date": payment.course.end_date.isoformat()
            if payment.course.end_date
            else None,
        },
        "issued_at": payment.issued_at.isoformat() if payment.issued_at else None,
        "payment_date": payment.payment_date.isoformat() if payment.payment_date else None,
        "created_at": payment.created_at.isoformat() if payment.created_at else None,
        "covered_months": cms,
        "microsoft_submission_id": payment.microsoft_submission_id,
        "transaction_id": payment.transaction_id,
        "status": payment.status,
        "receipt_number": payment.receipt.number if payment.receipt_id else None,
        "description": payment.description,
        "remarks": payment.remarks,
        "created_by": _report_staff_ref(getattr(payment, "created_by", None)),
        "verified_by": _report_staff_ref(getattr(payment, "verified_by", None)),
        "billing_start_date": payment.billing_start_date,
        "billing_end_date": payment.billing_end_date,
        "date_on_screenshot": payment.date_on_screenshot,
        "payment_method": {
            "id": payment.payment_method_id,
            "name": payment.payment_method.name
            if getattr(payment, "payment_method")
            else None,
        },
        "parsed_amount": payment.parsed_amount.amount
        if getattr(payment, "parsed_amount")
        else None,
        "base_amount": _money_amount(getattr(payment, "base_amount", None)),
        "discount_amount": _money_amount(getattr(payment, "discount_amount", None)),
        "invoiced_amount": _money_amount(getattr(payment, "invoiced_amount", None)),
        "actual_amount": _money_amount(getattr(payment, "actual_amount", None)),
        "discount_label": _discount_label(payment),
        "discount_lines": _discount_lines(payment),
        "screenshot": payment.screenshot.url
        if getattr(payment, "screenshot")
        else None,
        "is_installment": payment.is_installment,
        "installment_percent": (
            str(payment.installment_percent)
            if payment.installment_percent is not None
            else None
        ),
    }


def _group_receipt_number(parts: list[UserPayment]) -> int | None:
    numbers = {part.receipt.number for part in parts if part.receipt_id}
    if len(numbers) != 1:
        return None
    return next(iter(numbers))


def _admin_report_group_row(group: UserPaymentGroup, parts: list[UserPayment]) -> dict:
    ordered_parts = sorted(parts, key=lambda part: part.id)
    first_part = ordered_parts[0]
    part_rows = [admin_report_payment_row(part) for part in ordered_parts]

    course_refs: list[dict] = []
    seen_course_ids: set[int] = set()
    for part in ordered_parts:
        if part.course_id in seen_course_ids:
            continue
        seen_course_ids.add(part.course_id)
        course_refs.append(_course_ref(part.course))
    is_multi_course = len(course_refs) > 1

    amount = Decimal("0")
    has_amount = False
    for part in ordered_parts:
        if part.parsed_amount is not None:
            amount += part.parsed_amount.amount
            has_amount = True

    def _sum_amounts(attr: str):
        total = Decimal("0")
        has = False
        for part in ordered_parts:
            money = getattr(part, attr, None)
            if money is not None:
                total += money.amount
                has = True
        return total if has else None

    labels = [p.get("discount_label") for p in part_rows]
    nonzero_labels = [x for x in labels if x]
    if not nonzero_labels:
        discount_label = None
    elif len(set(nonzero_labels)) == 1 and not is_multi_course:
        discount_label = nonzero_labels[0]
    else:
        discount_label = "Multiple"

    if is_multi_course:
        group_discount_lines = [
            {
                "enrollment_discount_id": line["enrollment_discount_id"],
                "label": f"{part.course.title} - {line['label']}",
                "amount": line["amount"],
            }
            for part, part_row in zip(ordered_parts, part_rows)
            for line in (part_row.get("discount_lines") or [])
        ]
    else:
        part_line_lists = [p.get("discount_lines") or [] for p in part_rows]
        if (
            discount_label != "Multiple"
            and part_line_lists
            and all(lines == part_line_lists[0] for lines in part_line_lists)
        ):
            group_discount_lines = part_line_lists[0]
        else:
            group_discount_lines = None

    payment_method_ids = {part.payment_method_id for part in ordered_parts}
    if len(payment_method_ids) == 1:
        payment_method = part_rows[0]["payment_method"]
    else:
        payment_method = {"id": None, "name": "Multiple"}

    tids = {
        part.transaction_id for part in ordered_parts if part.transaction_id
    }

    part_dates = [p.payment_date for p in ordered_parts if p.payment_date]
    payment_date = min(part_dates).isoformat() if part_dates else None

    verified_refs = [
        p.get("verified_by") for p in part_rows if p.get("verified_by", {}).get("name")
    ]
    if not verified_refs:
        verified_by = _report_staff_ref(None)
    elif len({ref["name"] for ref in verified_refs}) == 1:
        verified_by = verified_refs[0]
    else:
        verified_by = {
            "name": "Multiple",
            "id": None,
            "user_signature_url": None,
        }

    shared_screenshot_courses: list[dict] = []
    seen_shared_course_ids: set[int] = set(seen_course_ids)
    for part_row in part_rows:
        for ref in part_row.get("shared_screenshot_courses") or []:
            cid = ref.get("id")
            if cid is None or cid in seen_shared_course_ids:
                continue
            seen_shared_course_ids.add(cid)
            shared_screenshot_courses.append(ref)

    return {
        "id": f"group-{group.id}",
        "kind": "group",
        "group_id": group.id,
        "group_kind": group.group_kind,
        "part_count": len(ordered_parts),
        "parts": part_rows,
        "user": {
            "id": first_part.user.id,
            "name": first_part.user.name,
        },
        "courses": course_refs if is_multi_course else [],
        "shared_screenshot_courses": shared_screenshot_courses,
        "course": (
            {"id": None, "title": "Multiple"}
            if is_multi_course
            else {
                "id": first_part.course.id,
                "title": first_part.course.title,
                "start_date": first_part.course.start_date.isoformat()
                if first_part.course.start_date
                else None,
                "end_date": first_part.course.end_date.isoformat()
                if first_part.course.end_date
                else None,
            }
        ),
        "issued_at": group.issued_at.isoformat() if group.issued_at else None,
        "payment_date": payment_date,
        "covered_months": part_rows[0]["covered_months"],
        "microsoft_submission_id": None,
        "transaction_id": next(iter(tids)) if len(tids) == 1 else None,
        "status": rollup_payment_group_status([part.status for part in ordered_parts]),
        "receipt_number": _group_receipt_number(ordered_parts),
        "description": first_part.description,
        "remarks": first_part.remarks,
        "created_by": _report_staff_ref(getattr(group, "created_by", None)),
        "verified_by": verified_by,
        "billing_start_date": group.billing_start_date,
        "billing_end_date": group.billing_end_date,
        "date_on_screenshot": None,
        "payment_method": payment_method,
        "parsed_amount": amount if has_amount else None,
        "base_amount": _sum_amounts("base_amount"),
        "discount_amount": _sum_amounts("discount_amount"),
        "invoiced_amount": _sum_amounts("invoiced_amount"),
        "actual_amount": _sum_amounts("actual_amount"),
        "discount_label": discount_label,
        "discount_lines": group_discount_lines,
        "screenshot": None,
        "is_installment": group.is_installment,
        "installment_percent": (
            str(group.installment_percent)
            if group.installment_percent is not None
            else None
        ),
    }


def project_admin_report_rows(payments: list[UserPayment]) -> list[dict]:
    rows: list[dict] = []
    grouped: dict[int, list[UserPayment]] = {}

    for payment in payments:
        if payment.group_id is None:
            rows.append(admin_report_payment_row(payment))
        else:
            grouped.setdefault(payment.group_id, []).append(payment)

    for parts in grouped.values():
        rows.append(_admin_report_group_row(parts[0].group, parts))

    return rows


def _last_month_end_instant(year: int, month: int):
    from calendar import monthrange
    from datetime import datetime

    last_day = monthrange(year, month)[1]
    naive = datetime(year, month, last_day, 23, 59, 59)
    return timezone.make_aware(naive, timezone.get_current_timezone())


def build_row_plan_fields_from_course_spec(
    *,
    base_plan_fields: dict,
    coverage: list[dict] | None,
    is_installment: bool = False,
    installment_percent=None,
) -> dict:
    row_fields = dict(base_plan_fields)
    if is_installment:
        row_fields["is_installment"] = True
        if installment_percent is not None:
            row_fields["installment_percent"] = installment_percent
    if coverage:
        first_y, first_m = int(coverage[0]["year"]), int(coverage[0]["month_index"])
        last_y, last_m = int(coverage[-1]["year"]), int(coverage[-1]["month_index"])
        issued = first_month_instant(first_y, first_m)
        row_fields["issued_at"] = issued
        row_fields["billing_start_date"] = issued
        row_fields["billing_end_date"] = _last_month_end_instant(last_y, last_m)
    return row_fields


def rollup_multi_course_group_plan_fields(group: UserPaymentGroup) -> None:
    parts = list(group.parts.all())
    if not parts:
        return
    issued_dates = [p.issued_at for p in parts if p.issued_at is not None]
    if issued_dates:
        group.issued_at = min(issued_dates)
    group.is_installment = all(p.is_installment for p in parts)
    percents = {p.installment_percent for p in parts if p.installment_percent is not None}
    group.installment_percent = (
        percents.pop() if group.is_installment and len(percents) == 1 else None
    )
    group.save(update_fields=["issued_at", "is_installment", "installment_percent"])


def _exclude_duplicate_transaction_peers(
    clash,
    *,
    group: UserPaymentGroup | None = None,
) -> object:
    """Exclude payments that legitimately share a transaction id with this row."""
    if group is not None:
        clash = clash.exclude(group=group)
        batch_key = group.shared_transaction_key
        if batch_key:
            clash = clash.exclude(group__shared_transaction_key=batch_key)
    return clash


def _initial_status_for_part(part: dict, *, group: UserPaymentGroup | None = None) -> str:
    transaction_id = part.get("transaction_id")
    if transaction_id:
        clash = UserPayment.objects.filter(transaction_id=transaction_id)
        clash = _exclude_duplicate_transaction_peers(clash, group=group)
        if clash.exists():
            return UserPayment.Status.DUPLICATED
    if part.get("parsed_amount") is not None:
        return UserPayment.Status.PENDING_VERIFICATION
    if part.get("screenshot"):
        return UserPayment.Status.AWAITING_EXTRACTION
    return UserPayment.Status.PENDING_PAYMENT


def _create_group_payment_row(
    *,
    group: UserPaymentGroup,
    user,
    course,
    actor,
    row: dict,
    plan_fields: dict,
    amount_fields: dict,
    discount_lines,
    discount_ids_set_on_create,
    coverage: list[dict] | None,
    seen_transaction_ids: set[str],
    row_plan_fields: dict | None = None,
) -> UserPayment:
    parsed_amount = row.get("parsed_amount")
    if parsed_amount is not None and not isinstance(parsed_amount, Money):
        parsed_amount = Money(parsed_amount, "USD")

    extra = dict(amount_fields)
    if discount_ids_set_on_create is not None:
        extra["discount_ids_set_on_create"] = discount_ids_set_on_create

    effective_plan = {**plan_fields, **(row_plan_fields or {})}

    user_payment = UserPayment.objects.create(
        group=group,
        user=user,
        course=course,
        created_by=actor,
        screenshot=row.get("screenshot"),
        parsed_amount=parsed_amount,
        payment_method=row.get("payment_method"),
        transaction_id=row.get("transaction_id") or None,
        date_on_screenshot=row.get("date_on_screenshot") or None,
        payment_date=row.get("payment_date") or timezone.now(),
        description=row.get("description") or None,
        remarks=row.get("remarks") or None,
        issued_at=effective_plan.get("issued_at"),
        billing_start_date=effective_plan.get("billing_start_date"),
        billing_end_date=effective_plan.get("billing_end_date"),
        is_installment=effective_plan.get("is_installment", False),
        installment_percent=effective_plan.get("installment_percent"),
        status=_initial_status_for_part(row, group=group),
        **extra,
    )
    if discount_lines:
        from app_finance.payment_discount_apply import persist_payment_discount_lines

        persist_payment_discount_lines(user_payment=user_payment, lines=discount_lines)
    if coverage is not None:
        sync_user_payment_covered_months(user_payment, coverage)
    tid = user_payment.transaction_id
    if tid and tid not in seen_transaction_ids:
        # One ReceiverSideScreenshot link per bank transaction, not per row.
        seen_transaction_ids.add(tid)
        mark_receiver_side_screenshots_matched(tid, user_payment, actor=actor)
    return user_payment


@transaction.atomic
def create_user_payment_group_with_parts(
    *,
    actor,
    user,
    course,
    plan_fields: dict,
    coverage: list[dict] | None,
    parts: list[dict],
    amount_fields: dict | None = None,
) -> UserPaymentGroup:
    if len(parts) < 2:
        raise ValueError("group requires at least 2 parts")

    transaction_ids = [
        part.get("transaction_id") for part in parts if part.get("transaction_id")
    ]
    if len(transaction_ids) != len(set(transaction_ids)):
        raise ValueError("duplicate transaction_id within parts")

    group = UserPaymentGroup.objects.create(
        user=user,
        course=course,
        created_by=actor,
        issued_at=plan_fields.get("issued_at"),
        billing_start_date=plan_fields.get("billing_start_date"),
        billing_end_date=plan_fields.get("billing_end_date"),
        is_installment=plan_fields.get("is_installment", False),
        installment_percent=plan_fields.get("installment_percent"),
    )

    amount_fields = amount_fields or {}
    discount_lines = amount_fields.pop("_discount_lines", ())
    discount_ids_set_on_create = amount_fields.pop("_discount_ids_set_on_create", None)
    amount_fields.pop("_period_indices", None)
    seen_transaction_ids: set[str] = set()
    for index, part in enumerate(parts):
        # Pricing on the first part only to avoid double-counting one course.
        _create_group_payment_row(
            group=group,
            user=user,
            course=course,
            actor=actor,
            row=part,
            plan_fields=plan_fields,
            amount_fields=amount_fields if index == 0 else {},
            discount_lines=discount_lines if index == 0 else (),
            discount_ids_set_on_create=(
                discount_ids_set_on_create if index == 0 else None
            ),
            coverage=coverage,
            seen_transaction_ids=seen_transaction_ids,
        )

    return group


@transaction.atomic
def create_multi_course_payment_group(
    *,
    actor,
    user,
    plan_fields: dict,
    allocations: list[dict],
    coverage_by_course: dict[tuple[int, int], list[dict] | None],
    amount_fields_by_course: dict[tuple[int, int], dict],
    plan_fields_by_course: dict[tuple[int, int], dict] | None = None,
    shared_transaction_key: str | None = None,
    stored_screenshots: dict[int, str] | None = None,
    seen_transaction_ids: set[str] | None = None,
) -> UserPaymentGroup:
    """One bank transaction (or several) spread across several courses.

    Each allocation becomes one UserPayment row carrying its allocated share of
    a screenshot. Pricing goes on the first row of each course.
    """
    if len(allocations) < 2 and not shared_transaction_key:
        raise ValueError("multi-course group requires at least 2 allocations")

    seen_course_txn: set[tuple[int, str]] = set()
    for alloc in allocations:
        tid = alloc.get("transaction_id")
        if not tid:
            continue
        key = (alloc["course"].id, tid)
        if key in seen_course_txn:
            raise ValueError("duplicate transaction_id for the same course")
        seen_course_txn.add(key)

    group = UserPaymentGroup.objects.create(
        user=user,
        course=None,
        group_kind=UserPaymentGroup.GroupKind.MULTI_COURSE,
        created_by=actor,
        issued_at=plan_fields.get("issued_at"),
        billing_start_date=plan_fields.get("billing_start_date"),
        billing_end_date=plan_fields.get("billing_end_date"),
        is_installment=plan_fields.get("is_installment", False),
        installment_percent=plan_fields.get("installment_percent"),
        shared_transaction_key=shared_transaction_key,
    )

    priced_courses: set[tuple[int, int]] = set()
    if stored_screenshots is None:
        stored_screenshots = {}
    if seen_transaction_ids is None:
        seen_transaction_ids = set()

    for alloc in allocations:
        course = alloc["course"]
        screenshot_index = alloc.get("screenshot_index")
        course_key = (user.id, course.id)

        row = dict(alloc)
        # Upload the file once; siblings reference the stored name so the same
        # image is not written to storage per course.
        if screenshot_index is not None and screenshot_index in stored_screenshots:
            row["screenshot"] = stored_screenshots[screenshot_index]

        amount_fields = dict(amount_fields_by_course.get(course_key) or {})
        discount_lines = amount_fields.pop("_discount_lines", ())
        discount_ids_set_on_create = amount_fields.pop(
            "_discount_ids_set_on_create", None
        )
        amount_fields.pop("_period_indices", None)
        if course_key in priced_courses:
            amount_fields = {}
            discount_lines = ()
            discount_ids_set_on_create = None
        else:
            priced_courses.add(course_key)

        user_payment = _create_group_payment_row(
            group=group,
            user=user,
            course=course,
            actor=actor,
            row=row,
            plan_fields=plan_fields,
            row_plan_fields=(plan_fields_by_course or {}).get(course_key),
            amount_fields=amount_fields,
            discount_lines=discount_lines,
            discount_ids_set_on_create=discount_ids_set_on_create,
            coverage=coverage_by_course.get(course_key),
            seen_transaction_ids=seen_transaction_ids,
        )

        if (
            screenshot_index is not None
            and screenshot_index not in stored_screenshots
            and user_payment.screenshot
        ):
            stored_screenshots[screenshot_index] = user_payment.screenshot.name

    rollup_multi_course_group_plan_fields(group)
    return group


@transaction.atomic
def create_shared_transaction_payment_groups(
    *,
    actor,
    plan_fields: dict,
    student_allocations: list[dict],
    coverage_by_course: dict[tuple[int, int], list[dict] | None],
    amount_fields_by_course: dict[tuple[int, int], dict],
    plan_fields_by_course: dict[tuple[int, int], dict] | None = None,
) -> list[UserPaymentGroup]:
    """Create one multi_course group per student from one shared bank transfer.

    Each item in student_allocations: {user, allocations}.
  """
    if not student_allocations:
        raise ValueError("student_allocations is required")

    batch_key = uuid4().hex
    stored_screenshots: dict[int, str] = {}
    seen_transaction_ids: set[str] = set()
    groups: list[UserPaymentGroup] = []

    for student_row in student_allocations:
        user = student_row["user"]
        allocations = student_row["allocations"]
        if not allocations:
            raise ValueError("each student needs at least one allocation")

        group = create_multi_course_payment_group(
            actor=actor,
            user=user,
            plan_fields=plan_fields,
            allocations=allocations,
            coverage_by_course=coverage_by_course,
            amount_fields_by_course=amount_fields_by_course,
            plan_fields_by_course=plan_fields_by_course,
            shared_transaction_key=batch_key,
            stored_screenshots=stored_screenshots,
            seen_transaction_ids=seen_transaction_ids,
        )
        groups.append(group)

    return groups
