import logging

from datetime import datetime, timedelta

import pytz
from django.core.management.base import BaseCommand
from djmoney.money import Money

from app_course.course_status import effective_planned_or_active_course_sql
from app_course.models import UserCourse
from app_finance.enrollment_anchor import effective_invoice_start_date
from app_finance.models import UserPayment
from app_finance.payment_coverage import first_month_instant

logger = logging.getLogger(__name__)

# One invoice per enrollment per cron run; never skip ahead multiple cycles.
MAX_CATCHUP_CYCLES_PER_RUN = 1


def _get_current_org():
    from django.db import connection
    from tenant_schemas.utils import get_public_schema_name, schema_context
    from app_organization.models import Organization
    tenant_schema = connection.schema_name
    with schema_context(get_public_schema_name()):
        return Organization.objects.filter(schema_name=tenant_schema).first()


class Command(BaseCommand):
    def handle(self, *args, **options):
        logger.info("Running [generate_invoices]")

        org = _get_current_org()
        schema_name = org.schema_name if org else None

        if not schema_name:
            logger.warning("Skipping due to missing schema_name.")
            return
        if not org.invoice_generation_strategy:
            logger.info(f"Skipping organization in schema [{schema_name}] due to no invoice strategy.")
            return

        logger.info(f"Generating invoices for [{schema_name}]")

        from app_organization.models import Organization
        if org.invoice_generation_strategy == Organization.InvoiceGenerationStrategy.TR_PHILLIPS_STYLE:
            eligible_sql = effective_planned_or_active_course_sql("c")
            ucs = UserCourse.objects.raw(f"""
select
u.id as user_id,
c.id as course_id,
up.billing_start_date,
up.billing_end_date,
pp.price,
pp.discount_price,
pp.early_payment_days as epd,
c.start_date as course_start_date,
uc.billing_cycle_anchor_date,
1 as id
from app_course_usercourse uc
join app_course_course c on c.id = uc.course_id
join app_auth_user u on u.id = uc.user_id
join app_finance_paymentplan pp on c.payment_plan_id = pp.id

-- 🔑 get ONLY the latest payment per user+course
left join lateral (
    select up1.*
    from app_finance_userpayment up1
    where up1.course_id = c.id
      and up1.user_id = u.id
    order by up1.billing_end_date desc nulls last
    limit 1
) up on true

where {eligible_sql} and uc.assigned_as = 'student'
and (
    (
        up.id is null
        and now()::date >= (
            coalesce(uc.billing_cycle_anchor_date, c.start_date)
            - (pp.early_payment_days * interval '1 day')
        )
    )
    or
    (
        up.id is not null
        and now()::date >= (
            up.billing_end_date::date
            + interval '1 day'
            - (pp.early_payment_days * interval '1 day')
        )
    )
);

            """, [org.invoice_generation_interval_days])
            user_course_dict = {}
            for i in ucs:
                if i.user_id not in user_course_dict:
                    user_course_dict[i.user_id] = []
                user_course_dict[i.user_id].append({
                    "course_id": i.course_id,
                    "price": i.price,
                    "discount_price": i.discount_price,
                    "epd": i.epd,
                    "billing_start_date": i.billing_start_date,
                    "billing_end_date": i.billing_end_date,
                    "course_start_date": i.course_start_date,
                    "billing_cycle_anchor_date": i.billing_cycle_anchor_date,
                })
            user_payments = []
            enrollment_pairs = [
                (user_id, course["course_id"])
                for user_id, courses in user_course_dict.items()
                for course in courses
            ]
            user_ids = list(user_course_dict.keys())
            course_ids = {course_id for _, course_id in enrollment_pairs}
            from app_finance.discount_engine import (
                compute_invoiced_amount,
                consume_discount_state_after_invoice,
                course_months,
            )
            from app_finance.models import EnrollmentDiscount, PaymentPlan
            from django.db.models import Count, Prefetch

            enrollments = (
                UserCourse.objects.filter(
                    user_id__in=user_ids,
                    course_id__in=course_ids,
                    assigned_as=UserCourse.AssignedAs.STUDENT,
                )
                .select_related("course", "course__payment_plan")
                .prefetch_related(
                    Prefetch(
                        "enrollment_discounts",
                        queryset=EnrollmentDiscount.objects.filter(is_active=True),
                        to_attr="active_enrollment_discount_list",
                    )
                )
            )
            enrollment_map = {(uc.user_id, uc.course_id): uc for uc in enrollments}
            payment_counts = (
                UserPayment.objects.filter(user_id__in=user_ids, course_id__in=course_ids)
                .values("user_id", "course_id")
                .annotate(c=Count("id"))
            )
            payment_count_map = {
                (row["user_id"], row["course_id"]): row["c"] for row in payment_counts
            }
            invoice_meta = []

            for user_id, courses in user_course_dict.items():
                active_course_count = len(courses)
                for course in courses:
                    anchor = course.get("billing_cycle_anchor_date")
                    if course["billing_end_date"]:
                        prior_end = course["billing_end_date"]
                        if isinstance(prior_end, datetime):
                            start_period = prior_end.date() + timedelta(days=1)
                        else:
                            start_period = prior_end + timedelta(days=1)
                    else:
                        start_period = effective_invoice_start_date(
                            course_start_date=course["course_start_date"],
                            billing_cycle_anchor_date=anchor,
                        )
                    if anchor and start_period < anchor:
                        start_period = anchor

                    end_period = start_period + timedelta(
                        days=org.invoice_generation_interval_days - 1
                    )
                    utc = pytz.UTC
                    issued_at = first_month_instant(start_period.year, start_period.month)
                    start_period = utc.localize(
                        datetime.combine(start_period, datetime.min.time())
                    )
                    end_period = utc.localize(
                        datetime.combine(end_period, datetime.max.time())
                    )

                    user_course = enrollment_map.get((user_id, course["course_id"]))
                    payment_plan = user_course.course.payment_plan if user_course else None
                    is_whole_term = (
                        payment_plan is not None
                        and payment_plan.billing_type == PaymentPlan.BillingType.WHOLE_TERM
                    )
                    if is_whole_term and payment_count_map.get(
                        (user_id, course["course_id"]), 0
                    ) > 0:
                        continue
                    billing_period_index = payment_count_map.get((user_id, course["course_id"]), 0)
                    if user_course and payment_plan:
                        if is_whole_term:
                            result = compute_invoiced_amount(
                                user_course=user_course,
                                payment_plan=payment_plan,
                                covered_months=course_months(user_course.course),
                                org=org,
                                user_active_course_count=active_course_count,
                            )
                        else:
                            result = compute_invoiced_amount(
                                user_course=user_course,
                                payment_plan=payment_plan,
                                billing_period_index=billing_period_index,
                                org=org,
                                user_active_course_count=active_course_count,
                            )
                        invoiced = result.invoiced_amount
                        discount_amount = result.discount_amount
                        discount_lines = result.lines
                    else:
                        price = course["price"]
                        discount_price = course["discount_price"]
                        is_discount_applicable = active_course_count >= 2 and discount_price is not None
                        amount = discount_price if is_discount_applicable else price
                        currency = getattr(amount, "currency", "USD")
                        invoiced = Money(amount=amount, currency=currency)
                        discount_amount = Money(0, invoiced.currency)
                        discount_lines = ()

                    user_payment = UserPayment(
                        invoiced_amount=invoiced,
                        status=UserPayment.Status.PENDING_PAYMENT,
                        user_id=user_id,
                        course_id=course["course_id"],
                        issued_at=issued_at,
                        billing_start_date=start_period,
                        billing_end_date=end_period,
                    )
                    user_payments.append(user_payment)
                    invoice_meta.append(
                        {
                            "user_course": user_course,
                            "billing_period_index": billing_period_index,
                            "discount_amount": discount_amount,
                            "discount_lines": discount_lines,
                        }
                    )

            logger.info(f"Creating {len(user_payments)} user payments in schema [{schema_name}]")
            created = UserPayment.objects.bulk_create(user_payments)
            for payment, meta in zip(created, invoice_meta):
                user_course = meta["user_course"]
                if not user_course:
                    continue
                from app_finance.discount_engine import (
                    get_active_enrollment_discounts,
                )
                from app_finance.payment_discount_apply import (
                    persist_payment_discount_lines,
                )

                lines = meta.get("discount_lines") or ()
                if lines:
                    persist_payment_discount_lines(user_payment=payment, lines=lines)
                    eds_by_id = {
                        ed.id: ed for ed in get_active_enrollment_discounts(user_course)
                    }
                    for ln in lines:
                        ed = eds_by_id.get(ln.enrollment_discount_id)
                        if ed is None:
                            continue
                        consume_discount_state_after_invoice(
                            enrollment_discount=ed,
                            billing_period_index=meta["billing_period_index"],
                            discount_amount=ln.amount,
                        )
