from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Any

from django.utils import timezone
from djmoney.money import Money
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import Category, Course, Program, UserCourse
from app_course.program_helpers import create_default_general_program
from app_demo.config import ResolvedDemoConfig
from app_finance.models import PaymentBank, PaymentMethod, PaymentPlan, UserPayment
from app_finance.payment_coverage import sync_user_payment_covered_months

_DEFAULT_PASSWORD = "Demo12345!"

_COURSE_SPECS: list[dict[str, Any]] = [
    {"title": "Montessori — Toddler", "category": "Montessori", "fee": 450_000},
    {"title": "Whole Brain", "category": "Whole Brain", "fee": 420_000},
    {"title": "Half Day", "category": "Half Day", "fee": 350_000},
    {"title": "Mom & Tots", "category": "Mom & Tots", "fee": 200_000},
]

_PAYMENT_METHODS: list[tuple[str, str]] = [
    ("Kpay", PaymentBank.KPAY),
    ("Cash", PaymentBank.CASH),
    ("AYA", PaymentBank.AYA),
    ("YOMA", PaymentBank.YOMA),
    ("Ko Aung Ko Kpay", PaymentBank.KPAY),
]

_CHILD_SPECS: list[dict[str, Any]] = [
    {
        "name": "Swan Ko Ko",
        "slug": "swan-ko-ko",
        "course": "Montessori — Toddler",
        "story": "verified_current",
        "method": "Kpay",
        "transaction_id": "01004166041607622401",
    },
    {
        "name": "Shine Min Khant",
        "slug": "shine-min-khant",
        "course": "Montessori — Toddler",
        "story": "verified_through_current",
        "method": "Kpay",
        "transaction_id": "01004166041607622402",
    },
    {
        "name": "Khay Khay",
        "slug": "khay-khay",
        "course": "Montessori — Toddler",
        "story": "pending_verification",
        "method": "Kpay",
        "transaction_id": "01004166041607622403",
    },
    {
        "name": "Sai Sint Hlaing Seng",
        "slug": "sai-sint-hlaing-seng",
        "course": "Whole Brain",
        "story": "verified_lag",
        "method": "YOMA",
        "transaction_id": "01004166041607622404",
    },
    {
        "name": "Thaw Nay Phone Khant",
        "slug": "thaw-nay-phone-khant",
        "course": "Montessori — Toddler",
        "story": "duplicated",
        "method": "Kpay",
        "transaction_id": "01004166041607622405",
    },
    {
        "name": "Shwe Yee Htoo Aung",
        "slug": "shwe-yee-htoo-aung",
        "course": "Montessori — Toddler",
        "story": "unpaid",
    },
    {
        "name": "Thaw Tar Shwe Sin",
        "slug": "thaw-tar-shwe-sin",
        "course": "Half Day",
        "story": "dropped",
        "method": "Cash",
        "transaction_id": "01004166041607622406",
    },
    {
        "name": "Thiri Htet San",
        "slug": "thiri-htet-san",
        "course": "Mom & Tots",
        "story": "awaiting_extraction",
        "method": "AYA",
    },
    {
        "name": "Cherry Oo",
        "slug": "cherry-oo",
        "course": "Whole Brain",
        "story": "pending_verification",
        "method": "Ko Aung Ko Kpay",
        "transaction_id": "01004166041607622407",
    },
]


def _month_start(demo_date: date, *, year: int, month: int) -> datetime:
    tz = timezone.get_current_timezone()
    return timezone.make_aware(datetime(year, month, 1, 9, 0, 0), tz)


def _upsert_child(*, email: str, name: str, code: str) -> User:
    defaults = {
        "name": name,
        "phone_number": "-",
        "communication_email": email,
        "date_of_birth": date(2018, 6, 1),
        "code": code,
        "roles": [User.UserRole.STUDENT],
        "is_active": True,
        "is_password_change_required": False,
    }
    user = User.objects.filter(email=email).first()
    if user is None:
        return User.objects.create_user(email=email, password=_DEFAULT_PASSWORD, **defaults)

    update_fields: list[str] = []
    for field, value in defaults.items():
        if getattr(user, field) != value:
            setattr(user, field, value)
            update_fields.append(field)
    if update_fields:
        update_fields.append("updated_at")
        user.save(update_fields=update_fields)
    return user


def _ensure_category(name: str) -> Category:
    category, _ = Category.objects.get_or_create(name=name, defaults={"sort_order": 0})
    return category


def _ensure_payment_methods() -> dict[str, PaymentMethod]:
    by_name: dict[str, PaymentMethod] = {}
    for name, bank in _PAYMENT_METHODS:
        method, _ = PaymentMethod.objects.get_or_create(
            name=name,
            defaults={"payment_bank": bank, "description": None},
        )
        by_name[name] = method
    return by_name


def _ensure_courses(
    *,
    config: ResolvedDemoConfig,
    program: Program,
    category_by_name: dict[str, Category],
) -> dict[str, Course]:
    course_by_title: dict[str, Course] = {}
    span_start = config.demo_date - timedelta(days=120)
    span_end = config.demo_date + timedelta(days=120)

    for spec in _COURSE_SPECS:
        category = category_by_name.get(spec["category"])
        if category is None:
            category = _ensure_category(spec["category"])
        fee = int(spec["fee"])
        plan_name = f"YMEC {spec['title']} Monthly"
        plan, _ = PaymentPlan.objects.get_or_create(
            name=plan_name,
            defaults={"price": Money(fee, "MMK")},
        )
        if int(plan.price.amount) != fee:
            plan.price = Money(fee, "MMK")
            plan.save(update_fields=["price", "updated_at"])

        course, _ = Course.objects.get_or_create(
            title=spec["title"],
            defaults={
                "category": category,
                "program": program,
                "payment_plan": plan,
                "start_date": span_start,
                "end_date": span_end,
            },
        )
        update_fields: list[str] = []
        if course.payment_plan_id != plan.id:
            course.payment_plan = plan
            update_fields.append("payment_plan")
        if course.category_id != category.id:
            course.category = category
            update_fields.append("category")
        if update_fields:
            update_fields.append("updated_at")
            course.save(update_fields=update_fields)
        course_by_title[spec["title"]] = course

    return course_by_title


def _create_payment_for_story(
    *,
    child: User,
    course: Course,
    config: ResolvedDemoConfig,
    story: str,
    method: PaymentMethod | None,
    transaction_id: str | None,
) -> UserPayment | None:
    if story == "unpaid":
        return None

    demo = config.demo_date
    current = (demo.year, demo.month)
    previous = (demo.year, demo.month - 1) if demo.month > 1 else (demo.year - 1, 12)
    fee = course.payment_plan.price if course.payment_plan else Money(450_000, "MMK")

    status = UserPayment.Status.PENDING_PAYMENT
    covered: list[dict[str, int]] | None = None
    issued_at = _month_start(demo, year=current[0], month=current[1])

    if story == "verified_current":
        status = UserPayment.Status.VERIFIED
        covered = [{"year": current[0], "month_index": current[1]}]
    elif story == "verified_through_current":
        status = UserPayment.Status.VERIFIED
        covered = [{"year": current[0], "month_index": current[1]}]
    elif story == "verified_lag":
        status = UserPayment.Status.VERIFIED
        covered = [{"year": previous[0], "month_index": previous[1]}]
        issued_at = _month_start(demo, year=previous[0], month=previous[1])
    elif story == "pending_verification":
        status = UserPayment.Status.PENDING_VERIFICATION
    elif story == "duplicated":
        status = UserPayment.Status.DUPLICATED
    elif story == "awaiting_extraction":
        status = UserPayment.Status.AWAITING_EXTRACTION
    elif story == "dropped":
        status = UserPayment.Status.PENDING_VERIFICATION

    payment = UserPayment.objects.create(
        user=child,
        course=course,
        payment_method=method,
        status=status,
        parsed_amount=fee,
        actual_amount=fee if status == UserPayment.Status.VERIFIED else None,
        transaction_id=transaction_id,
        issued_at=issued_at,
        description=f"Demo tuition — {child.name}",
    )
    if covered is not None:
        sync_user_payment_covered_months(payment, covered)
    return payment


def run_child_tuition_payments_pack(
    *,
    schema_name: str,
    config: ResolvedDemoConfig,
    pack_ctx: dict[str, Any] | None = None,
) -> dict[str, Any]:
    del pack_ctx

    with schema_context(schema_name):
        program = create_default_general_program()
        category_by_name: dict[str, Category] = {}
        for row in config.academic_structure.get("categories", []):
            name = str(row.get("name", "")).strip()
            if name:
                category_by_name[name] = _ensure_category(name)

        methods = _ensure_payment_methods()
        courses = _ensure_courses(
            config=config,
            program=program,
            category_by_name=category_by_name,
        )

        child_ids: list[int] = []
        payment_count = 0
        for spec in _CHILD_SPECS:
            email = f"demo-child-{spec['slug']}@{config.domain_url}"
            code = f"demo-child-{spec['slug']}"
            child = _upsert_child(email=email, name=spec["name"], code=code)
            child_ids.append(child.id)

            course = courses[spec["course"]]
            uc, _ = UserCourse.objects.get_or_create(
                user=child,
                course=course,
                defaults={"assigned_as": UserCourse.AssignedAs.STUDENT},
            )
            is_dropped = spec["story"] == "dropped"
            uc_updates: list[str] = []
            if uc.assigned_as != UserCourse.AssignedAs.STUDENT:
                uc.assigned_as = UserCourse.AssignedAs.STUDENT
                uc_updates.append("assigned_as")
            if uc_updates:
                uc_updates.append("updated_at")
                uc.save(update_fields=uc_updates)
            if is_dropped:
                from app_course.membership_history import record_membership_event
                from app_course.models import CourseMembershipEvent

                record_membership_event(
                    course_id=course.id,
                    user_id=child.id,
                    event_type=CourseMembershipEvent.EventType.REMOVED,
                    occurred_at=timezone.make_aware(
                        datetime.combine(config.demo_date, time(12, 0)),
                        timezone.get_current_timezone(),
                    ),
                )
                uc.delete()

            method_name = spec.get("method")
            method = methods.get(method_name) if method_name else None
            payment = _create_payment_for_story(
                child=child,
                course=course,
                config=config,
                story=spec["story"],
                method=method,
                transaction_id=spec.get("transaction_id"),
            )
            if payment is not None:
                payment_count += 1

    return {
        "id": "child-tuition-payments",
        "status": "applied",
        "message": "Seeded YMEC courses, payment channels, and child tuition mix.",
        "course_titles": [spec["title"] for spec in _COURSE_SPECS],
        "child_ids": child_ids,
        "payment_count": payment_count,
    }
