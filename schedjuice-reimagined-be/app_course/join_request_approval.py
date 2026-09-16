from django.db import transaction
from django_q.tasks import async_task

from app_auth.models import User
from app_course.course_member_counts import refresh_course_member_counts_now
from app_course.membership_history import record_membership_event
from app_course.models import CourseJoinRequest, CourseMembershipEvent, UserCourse


def _ensure_user_activated(user: User) -> None:
    if user.is_active and not user.is_waiting_for_activation:
        return
    user.is_active = True
    user.is_waiting_for_activation = False
    user.save(update_fields=["is_active", "is_waiting_for_activation"])


def _send_activation_email(user: User, tenant) -> None:
    async_task(
        "app_microsoft.mail.send_generic_mail",
        user.email,
        "Your account has been activated",
        (
            "This is to inform you that your account has been activated. "
            "You can now log in using your credentials. "
            f"<br> https://{tenant.domain_url}<br>"
        ),
        tenant,
        user.name,
    )


@transaction.atomic
def approve_course_join_request(
    join_request: CourseJoinRequest,
    *,
    actor: User,
    tenant,
    send_activation_email: bool = True,
    activate_user: bool = True,
) -> CourseJoinRequest:
    requested_user = User.objects.filter(id=join_request.user_id).first()
    if requested_user is None:
        return join_request

    if activate_user:
        _ensure_user_activated(requested_user)

    _, created = UserCourse.objects.get_or_create(
        user_id=join_request.user_id,
        course_id=join_request.course_id,
        defaults={"assigned_as": UserCourse.AssignedAs.STUDENT},
    )
    if created:
        record_membership_event(
            course_id=join_request.course_id,
            user_id=join_request.user_id,
            event_type=CourseMembershipEvent.EventType.JOINED,
            actor_id=actor.id,
            source=CourseMembershipEvent.Source.API,
        )
        refresh_course_member_counts_now([join_request.course_id])

    join_request.status = CourseJoinRequest.Status.APPROVED
    join_request.save(update_fields=["status"])

    if send_activation_email:
        transaction.on_commit(
            lambda u=requested_user, t=tenant: _send_activation_email(u, t)
        )

    return join_request


@transaction.atomic
def approve_all_pending_join_requests_for_user(
    user: User,
    *,
    actor: User,
    tenant,
    send_activation_email: bool = True,
) -> None:
    pending_join_requests = list(
        CourseJoinRequest.objects.filter(
            user_id=user.id,
            status=CourseJoinRequest.Status.PENDING,
        )
    )
    if user.is_active and not pending_join_requests:
        return

    _ensure_user_activated(user)
    for join_request in pending_join_requests:
        approve_course_join_request(
            join_request,
            actor=actor,
            tenant=tenant,
            send_activation_email=False,
            activate_user=False,
        )

    if send_activation_email:
        transaction.on_commit(lambda u=user, t=tenant: _send_activation_email(u, t))
