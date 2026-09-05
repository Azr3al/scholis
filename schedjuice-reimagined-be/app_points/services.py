from __future__ import annotations

from django.db import transaction
from django.db.models import Sum
from rest_framework.exceptions import ValidationError

from app_auth.models import User
from app_points import models

MIN_NOTE_LEN = 3


def is_staff_user(user: User) -> bool:
    return bool(set(user.roles or []) - {User.UserRole.STUDENT})


def validate_note(note: str) -> str:
    cleaned = (note or "").strip()
    if len(cleaned) < MIN_NOTE_LEN:
        raise ValidationError({"note": f"Note must be at least {MIN_NOTE_LEN} characters."})
    return cleaned


def get_balances(subject: User) -> dict[int, int]:
    """Return {point_type_id: balance} for active types (0) and any non-zero inactive."""
    active_ids = set(
        models.PointType.objects.filter(is_active=True).values_list("id", flat=True)
    )
    sums = (
        models.PointTransaction.objects.filter(subject=subject)
        .values("point_type_id")
        .annotate(total=Sum("delta"))
    )
    out: dict[int, int] = {pid: 0 for pid in active_ids}
    for row in sums:
        pid = row["point_type_id"]
        total = int(row["total"] or 0)
        if total != 0 or pid in active_ids:
            out[pid] = total
    return out


@transaction.atomic
def post_transaction(
    *,
    subject: User,
    actor: User,
    point_type: models.PointType,
    delta: int,
    note: str,
) -> models.PointTransaction:
    if not is_staff_user(subject):
        raise ValidationError({"subject": "Points apply to staff users only."})
    if delta == 0:
        raise ValidationError({"delta": "Delta must be non-zero."})
    if not point_type.is_active:
        raise ValidationError({"point_type": "This point type is inactive."})
    cleaned_note = validate_note(note)
    return models.PointTransaction.objects.create(
        subject=subject,
        point_type=point_type,
        delta=delta,
        note=cleaned_note,
        actor=actor,
    )


def get_staff_sheet_rows(request=None) -> list[dict]:
    from app_auth.user_search import STAFF_DATA_SHEET_SEARCH_KEY, get_search_q
    from utilitas.search import apply_entity_search

    staff_qs = (
        User.objects.filter(is_active=True)
        .exclude(roles__contains=[User.UserRole.STUDENT])
        .only("id", "name", "communication_email", "roles", "code")
    )
    q = get_search_q(request)
    if q:
        staff_qs, _ = apply_entity_search(STAFF_DATA_SHEET_SEARCH_KEY, staff_qs, q)
    else:
        staff_qs = staff_qs.order_by("name")

    staff_list = list(staff_qs)
    staff_ids = [u.id for u in staff_list]
    balance_rows = (
        models.PointTransaction.objects.filter(subject_id__in=staff_ids)
        .values("subject_id", "point_type_id")
        .annotate(total=Sum("delta"))
    )
    by_user: dict[int, dict[str, int]] = {}
    for row in balance_rows:
        uid = row["subject_id"]
        by_user.setdefault(uid, {})[str(row["point_type_id"])] = int(row["total"] or 0)

    out = []
    for u in staff_list:
        out.append(
            {
                "id": u.id,
                "name": u.name,
                "email": u.communication_email or "",
                "roles": list(u.roles or []),
                "balances": by_user.get(u.id, {}),
            }
        )
    return out
