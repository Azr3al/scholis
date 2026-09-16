"""Preview and apply student account merges for user insights."""
from __future__ import annotations

import logging
from dataclasses import dataclass

from django.apps import apps
from django.db import transaction

from app_attendance.models import UserEvent
from app_auth.models import User
from app_auth.user_insights_services import (
    DuplicateClusterFilters,
    build_duplicate_clusters,
    load_student_rows,
)
from app_course.models import CourseJoinRequest, CourseMembershipEvent, UserCourse
from app_finance.models import EnrollmentDiscount, UserPayment

logger = logging.getLogger(__name__)

SCALAR_BACKFILL_FIELDS = (
    "phone_number",
    "communication_email",
    "emergency_contact_name",
    "emergency_contact_phone_number",
    "emergency_contact_relationship",
    "alternative_name",
    "date_of_birth",
    "gender",
    "nrc_passport",
    "delivery_address",
)


@dataclass
class MergeRequest:
    cluster_id: str
    survivor_user_id: int
    primary_email: str
    microsoft_id: str | None
    absorbed_user_ids: list[int]


class MergeValidationError(ValueError):
    pass


def _find_cluster(cluster_id: str, include_inactive: bool = True) -> dict | None:
    users = load_student_rows(include_inactive=include_inactive)
    _, clusters, _ = build_duplicate_clusters(
        users, DuplicateClusterFilters(include_inactive=include_inactive, size=10_000)
    )
    for cluster in clusters:
        if cluster["cluster_id"] == cluster_id:
            return cluster
    return None


def validate_merge_request(body: dict) -> tuple[MergeRequest, dict, User, list[User]]:
    cluster_id = str(body.get("cluster_id") or "")
    survivor_user_id = int(body.get("survivor_user_id"))
    primary_email = str(body.get("primary_email") or "").strip().lower()
    microsoft_id = body.get("microsoft_id")
    if microsoft_id is not None:
        microsoft_id = str(microsoft_id).strip() or None
    absorbed_user_ids = [int(i) for i in (body.get("absorbed_user_ids") or [])]

    cluster = _find_cluster(cluster_id)
    if cluster is None:
        raise MergeValidationError("Cluster not found or no longer exists.")

    member_ids = set(cluster["user_ids"])
    if survivor_user_id not in member_ids:
        raise MergeValidationError("Survivor is not a member of this cluster.")
    if survivor_user_id in absorbed_user_ids:
        raise MergeValidationError("Survivor cannot be in absorbed users.")
    if set(absorbed_user_ids) != member_ids - {survivor_user_id}:
        raise MergeValidationError("Must merge all other cluster members in v1.")

    survivor = User.objects.filter(id=survivor_user_id).first()
    if survivor is None or "student" not in (survivor.roles or []):
        raise MergeValidationError("Survivor must be a student.")

    absorbed_users = list(User.objects.filter(id__in=absorbed_user_ids))
    if len(absorbed_users) != len(absorbed_user_ids):
        raise MergeValidationError("One or more absorbed users not found.")

    cluster_emails = {
        (u.email or "").strip().lower() for u in [survivor, *absorbed_users]
    }
    if primary_email not in cluster_emails:
        raise MergeValidationError("Primary email must belong to a cluster member.")

    if User.objects.filter(email=primary_email).exclude(id=survivor_user_id).exclude(
        id__in=absorbed_user_ids
    ).exists():
        raise MergeValidationError("Primary email is already used by another user.")

    ms_ids = {
        u.microsoft_id for u in [survivor, *absorbed_users] if u.microsoft_id
    }
    if microsoft_id and microsoft_id not in ms_ids:
        raise MergeValidationError("Microsoft account must belong to a cluster member.")

    return (
        MergeRequest(
            cluster_id=cluster_id,
            survivor_user_id=survivor_user_id,
            primary_email=primary_email,
            microsoft_id=microsoft_id,
            absorbed_user_ids=absorbed_user_ids,
        ),
        cluster,
        survivor,
        absorbed_users,
    )


def _plan_user_course_conflicts(
    survivor: User, absorbed: User
) -> tuple[int, list[dict]]:
    """Read-only: counts events that would move and lists enrollment conflicts."""
    moved_events = 0
    conflicts: list[dict] = []
    absorbed_ucs = list(
        UserCourse.objects.filter(
            user=absorbed, assigned_as=UserCourse.AssignedAs.STUDENT
        )
    )
    for auc in absorbed_ucs:
        survivor_uc = UserCourse.objects.filter(
            user=survivor, course_id=auc.course_id
        ).first()
        if survivor_uc:
            conflicts.append(
                {
                    "course_id": auc.course_id,
                    "course_title": auc.course.title,
                    "resolution": "keep_survivor_roster",
                }
            )
            moved_events += UserEvent.all_objects.filter(
                user=absorbed, event__course_id=auc.course_id
            ).count()
    return moved_events, conflicts


def _apply_user_course_conflicts(survivor: User, absorbed: User) -> list[dict]:
    conflicts: list[dict] = []
    absorbed_ucs = list(
        UserCourse.objects.filter(
            user=absorbed, assigned_as=UserCourse.AssignedAs.STUDENT
        )
    )
    for auc in absorbed_ucs:
        survivor_uc = UserCourse.objects.filter(
            user=survivor, course_id=auc.course_id
        ).first()
        if survivor_uc:
            conflicts.append(
                {
                    "course_id": auc.course_id,
                    "course_title": auc.course.title,
                    "resolution": "keep_survivor_roster",
                }
            )
            for ue in UserEvent.all_objects.filter(
                user=absorbed, event__course_id=auc.course_id
            ):
                existing = UserEvent.all_objects.filter(
                    user=survivor, event_id=ue.event_id
                ).first()
                if existing:
                    ue.delete()
                else:
                    ue.user = survivor
                    ue.save(update_fields=["user"])
            auc.delete()
        else:
            auc.user = survivor
            auc.save(update_fields=["user"])
    return conflicts


def _count_reassignments(absorbed_ids: list[int]) -> dict[str, int]:
    return {
        "user_courses": UserCourse.objects.filter(user_id__in=absorbed_ids).count(),
        "user_events": UserEvent.all_objects.filter(user_id__in=absorbed_ids).count(),
        "user_payments": UserPayment.objects.filter(user_id__in=absorbed_ids).count(),
        "join_requests": CourseJoinRequest.objects.filter(
            user_id__in=absorbed_ids
        ).count(),
    }


def build_merge_preview(
    survivor: User, absorbed_users: list[User], request: MergeRequest
) -> dict:
    absorbed_ids = [u.id for u in absorbed_users]
    reassignments = _count_reassignments(absorbed_ids)
    enrollment_conflicts: list[dict] = []
    for absorbed in absorbed_users:
        _, conflicts = _plan_user_course_conflicts(survivor, absorbed)
        enrollment_conflicts.extend(conflicts)

    scalar_backfills = [
        f
        for f in SCALAR_BACKFILL_FIELDS
        if not getattr(survivor, f, None)
        and any(getattr(a, f, None) for a in absorbed_users)
    ]

    warnings: list[str] = []
    for absorbed in absorbed_users:
        if absorbed.microsoft_id and absorbed.microsoft_id != request.microsoft_id:
            warnings.append(
                f"MS account for user {absorbed.id} will be unlinked from Schedjuice."
            )

    return {
        "survivor_user_id": survivor.id,
        "absorbed_user_ids": absorbed_ids,
        "reassignments": reassignments,
        "enrollment_conflicts": enrollment_conflicts,
        "scalar_backfills": scalar_backfills,
        "warnings": warnings,
    }


def _backfill_scalars(survivor: User, absorbed_users: list[User]) -> list[str]:
    filled: list[str] = []
    for field in SCALAR_BACKFILL_FIELDS:
        if getattr(survivor, field, None):
            continue
        for absorbed in absorbed_users:
            val = getattr(absorbed, field, None)
            if val:
                setattr(survivor, field, val)
                filled.append(field)
                break
    return filled


def _reassign_simple_fk(model, field: str, survivor_id: int, absorbed_ids: list[int]):
    filt = {f"{field}__in": absorbed_ids}
    update = {field: survivor_id}
    return model.objects.filter(**filt).update(**update)


def _reassign_chat_participants(survivor_id: int, absorbed_ids: list[int]) -> int:
    ChatThreadParticipant = apps.get_model("app_chat", "ChatThreadParticipant")
    moved = 0
    for absorbed_id in absorbed_ids:
        for row in ChatThreadParticipant.objects.filter(user_id=absorbed_id):
            if ChatThreadParticipant.objects.filter(
                thread_id=row.thread_id, user_id=survivor_id
            ).exists():
                row.delete()
            else:
                row.user_id = survivor_id
                row.save(update_fields=["user"])
                moved += 1
    return moved


@transaction.atomic
def apply_user_merge(
    *,
    survivor: User,
    absorbed_users: list[User],
    request: MergeRequest,
    actor: User | None,
) -> dict:
    absorbed_ids = [u.id for u in absorbed_users]

    survivor.email = request.primary_email
    survivor.microsoft_id = request.microsoft_id
    scalar_backfills = _backfill_scalars(survivor, absorbed_users)
    survivor.save()

    enrollment_conflicts: list[dict] = []
    for absorbed in absorbed_users:
        enrollment_conflicts.extend(_apply_user_course_conflicts(survivor, absorbed))

    UserCourse.objects.filter(user_id__in=absorbed_ids).update(user_id=survivor.id)
    _reassign_simple_fk(CourseJoinRequest, "user_id", survivor.id, absorbed_ids)
    _reassign_simple_fk(CourseMembershipEvent, "user_id", survivor.id, absorbed_ids)
    for ue in UserEvent.all_objects.filter(user_id__in=absorbed_ids):
        if UserEvent.all_objects.filter(
            user_id=survivor.id, event_id=ue.event_id
        ).exists():
            ue.delete()
        else:
            ue.user_id = survivor.id
            ue.save(update_fields=["user"])

    _reassign_simple_fk(UserPayment, "user_id", survivor.id, absorbed_ids)
    _reassign_simple_fk(EnrollmentDiscount, "applied_by_id", survivor.id, absorbed_ids)

    QuizAttempt = apps.get_model("app_quiz_v3", "QuizAttempt")
    _reassign_simple_fk(QuizAttempt, "user_id", survivor.id, absorbed_ids)

    ResultCell = apps.get_model("app_grading_reports", "ResultCell")
    for cell in ResultCell.objects.filter(student_id__in=absorbed_ids):
        if ResultCell.objects.filter(
            column_id=cell.column_id, student_id=survivor.id
        ).exists():
            cell.delete()
        else:
            cell.student_id = survivor.id
            cell.save(update_fields=["student"])

    TelegramLinkToken = apps.get_model("app_telegram", "TelegramLinkToken")
    _reassign_simple_fk(TelegramLinkToken, "user_id", survivor.id, absorbed_ids)
    TelegramAIExchange = apps.get_model("app_telegram", "TelegramAIExchange")
    _reassign_simple_fk(TelegramAIExchange, "user_id", survivor.id, absorbed_ids)

    BuildingCheckin = apps.get_model("app_hr", "BuildingCheckin")
    _reassign_simple_fk(BuildingCheckin, "user_id", survivor.id, absorbed_ids)

    _reassign_chat_participants(survivor.id, absorbed_ids)

    for absorbed in absorbed_users:
        absorbed.delete()

    logger.info(
        "user_merge actor=%s survivor=%s absorbed=%s email=%s microsoft_id=%s",
        getattr(actor, "id", None),
        survivor.id,
        absorbed_ids,
        request.primary_email,
        request.microsoft_id,
    )

    return {
        "survivor_user_id": survivor.id,
        "absorbed_user_ids": absorbed_ids,
        "scalar_backfills": scalar_backfills,
        "enrollment_conflicts": enrollment_conflicts,
    }
