from tenant_schemas.utils import schema_context
from app_course.models import Course, UserCourse, Event
from app_finance.enrollment_anchor import (
    resolve_anchor_for_enrollment,
    resolve_first_session_date,
    resolve_course_first_session_date,
)
from app_finance.models import UserPayment

schema = "xtrphillipsschedjuicecom"
course_id = 1022

with schema_context(schema):
    course = Course.objects.get(id=course_id)
    print("course.title:", course.title)
    print("course.start_date:", course.start_date)
    print("course.end_date:", course.end_date)

    events = (
        Event.objects.filter(course_id=course_id, is_substitution_reserve=False)
        .order_by("date", "time_from")[:10]
    )
    print("event count:", events.count() if hasattr(events, "count") else len(list(events)))
    print("first events:")
    for e in events:
        print(" ", e.date.date() if hasattr(e.date, "date") else e.date, e.time_from)

    enrollments = UserCourse.objects.filter(
        course_id=course_id,
        assigned_as=UserCourse.AssignedAs.STUDENT,
    ).select_related("user")

    print("student enrollments:", enrollments.count())

    for uc in enrollments:
        print("\n--- student ---")
        print("user_id:", uc.user_id)
        print("email:", uc.user.email)
        print("joined_at:", uc.joined_at)
        print("billing_cycle_anchor_date:", uc.billing_cycle_anchor_date)

        course_first = resolve_course_first_session_date(course_id)
        first_for_student = resolve_first_session_date(course_id, uc.joined_at)
        anchor = resolve_anchor_for_enrollment(uc)

        print("course_first session:", course_first)
        print("first session on/after join:", first_for_student)
        print("resolved anchor:", anchor)

        payments = UserPayment.objects.filter(
            user_id=uc.user_id,
            course_id=course_id,
            status=UserPayment.Status.PENDING_PAYMENT,
        ).order_by("billing_start_date")

        print("pending payments:", payments.count())
        for p in payments:
            print(
                f"  payment {p.id}: "
                f"{p.billing_start_date.date()} -> {p.billing_end_date.date()} "
                f"amount={p.invoiced_amount}"
            )