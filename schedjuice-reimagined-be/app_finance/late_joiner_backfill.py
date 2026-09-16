"""Tenant-wide late-joiner billing anchor backfill and pre-anchor invoice cleanup."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time

from django.db.models import QuerySet
from django.utils import timezone as dj_timezone

from app_course.models import UserCourse
from app_finance.enrollment_anchor import resolve_anchor_for_enrollment
from app_finance.models import UserPayment


@dataclass
class AnchorApplyRow:
    user_id: int
    course_id: int
    course_title: str
    joined_at: datetime
    old_anchor: date | None
    new_anchor: date


@dataclass
class PreJoinDeleteRow:
    payment_id: int
    user_id: int
    course_id: int
    billing_end_date: datetime


@dataclass
class LateJoinerBackfillResult:
    anchors: list[AnchorApplyRow] = field(default_factory=list)
    deleted_payments: list[PreJoinDeleteRow] = field(default_factory=list)
    anchors_updated: int = 0
    payments_deleted: int = 0


def iter_candidate_enrollments(
    *,
    course_id: int | None = None,
    force: bool = False,
) -> QuerySet[UserCourse]:
    qs = UserCourse.objects.filter(
        assigned_as=UserCourse.AssignedAs.STUDENT,
    ).select_related("course", "user")
    if course_id is not None:
        qs = qs.filter(course_id=course_id)
    if not force:
        qs = qs.filter(billing_cycle_anchor_date__isnull=True)
    return qs.order_by("course_id", "user_id")


def _anchor_for_enrollment(enrollment: UserCourse):
    stored = enrollment.billing_cycle_anchor_date
    if stored is not None:
        return stored
    return resolve_anchor_for_enrollment(enrollment)


def apply_anchors(
    enrollments: QuerySet[UserCourse] | list[UserCourse],
    *,
    dry_run: bool,
) -> tuple[list[AnchorApplyRow], int]:
    rows: list[AnchorApplyRow] = []
    updated = 0

    for enrollment in enrollments:
        resolved = resolve_anchor_for_enrollment(enrollment)
        if resolved is None:
            continue
        old_anchor = enrollment.billing_cycle_anchor_date
        if old_anchor == resolved:
            continue

        row = AnchorApplyRow(
            user_id=enrollment.user_id,
            course_id=enrollment.course_id,
            course_title=enrollment.course.title,
            joined_at=enrollment.joined_at,
            old_anchor=old_anchor,
            new_anchor=resolved,
        )
        rows.append(row)

        if not dry_run:
            UserCourse.objects.filter(pk=enrollment.pk).update(
                billing_cycle_anchor_date=resolved
            )
            enrollment.billing_cycle_anchor_date = resolved
        updated += 1

    return rows, updated


def delete_pre_join_pending_invoices(
    enrollments: QuerySet[UserCourse] | list[UserCourse],
    *,
    dry_run: bool,
    course_id: int | None = None,
) -> tuple[list[PreJoinDeleteRow], int]:
    rows: list[PreJoinDeleteRow] = []
    ids_to_delete: list[int] = []

    for enrollment in enrollments:
        anchor = _anchor_for_enrollment(enrollment)
        if anchor is None:
            continue

        target_course_id = course_id if course_id is not None else enrollment.course_id
        anchor_end = dj_timezone.make_aware(
            datetime.combine(anchor, time.max),
            timezone=dj_timezone.utc,
        )
        qs = UserPayment.objects.filter(
            user_id=enrollment.user_id,
            course_id=target_course_id,
            status=UserPayment.Status.PENDING_PAYMENT,
            billing_end_date__lt=anchor_end,
        )
        for payment_id, user_id, cid, billing_end in qs.values_list(
            "id", "user_id", "course_id", "billing_end_date"
        ):
            ids_to_delete.append(payment_id)
            rows.append(
                PreJoinDeleteRow(
                    payment_id=payment_id,
                    user_id=user_id,
                    course_id=cid,
                    billing_end_date=billing_end,
                )
            )

    unique_ids = sorted(set(ids_to_delete))
    if not unique_ids:
        return [], 0

    if dry_run:
        return rows, len(unique_ids)

    deleted, _ = UserPayment.objects.filter(id__in=unique_ids).delete()
    return rows, deleted


def run_late_joiner_backfill(
    *,
    course_id: int | None = None,
    force: bool = False,
    dry_run: bool = True,
) -> LateJoinerBackfillResult:
    enrollments = list(iter_candidate_enrollments(course_id=course_id, force=force))
    anchor_rows, anchors_updated = apply_anchors(enrollments, dry_run=dry_run)

    cleanup_enrollments = enrollments
    if not dry_run and enrollments:
        cleanup_enrollments = list(
            UserCourse.objects.filter(
                pk__in=[e.pk for e in enrollments],
            ).select_related("course", "user")
        )

    delete_rows, payments_deleted = delete_pre_join_pending_invoices(
        cleanup_enrollments,
        dry_run=dry_run,
        course_id=course_id,
    )

    return LateJoinerBackfillResult(
        anchors=anchor_rows,
        deleted_payments=delete_rows,
        anchors_updated=anchors_updated,
        payments_deleted=payments_deleted,
    )
