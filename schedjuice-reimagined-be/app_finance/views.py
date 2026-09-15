from datetime import date, datetime
from decimal import Decimal
from collections import Counter
import json
from uuid import uuid4

from django.core.exceptions import BadRequest, ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Q, Prefetch, Count
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.request import Request
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication
from app_course.models import UserCourse, Course
from app_finance import models, serializers
from app_finance.billing_api import (
    build_monthly_billing_payload,
    parse_billing_date_param,
)
from app_finance.discount_engine import estimate_billing_period_count
from app_finance.payment_coverage import (
    apply_month_scope,
    calendar_month_overlaps_course,
    compute_incremental_installment_months,
    furthest_covered_month_from_payments,
    resolve_suggested_payment_month,
    sync_user_payment_covered_months,
)
from app_finance.fee_lifecycle_services import (
    VALID_BREAKDOWNS,
    build_fee_lifecycle_payload,
)
from app_finance.homepage_services import (
    VALID_PERIODS,
    VALID_PIE_GROUP_BY,
    build_finance_homepage_payload,
)
from app_finance.payment_adjustment_totals import attach_adjustment_metadata
from app_finance.payment_context import attach_course_payment_context
from app_finance.payment_pair_context import PaymentPairContext, build_payment_pair_context


def course_payment_plan_report_payload(course: Course | None, *, user) -> dict | None:
    """Payment plan summary for admin-report course header (fee gated by permission)."""
    if course is None or not course.payment_plan_id:
        return None
    plan = course.payment_plan
    if plan is None:
        return None
    payload = {
        "id": plan.id,
        "name": plan.name,
        "billing_type": plan.billing_type,
    }
    if "payment.show_fee" in set(effective_permissions(user)) and plan.price is not None:
        payload["price"] = str(plan.price.amount)
    return payload
from app_finance.payment_group import (
    admin_report_payment_row,
    build_row_plan_fields_from_course_spec,
    create_multi_course_payment_group,
    create_shared_transaction_payment_groups,
    create_user_payment_group_with_parts,
    project_admin_report_rows,
)
from app_finance.unpaid_helpers import (
    MONTH_TYPE_FM,
    MONTH_TYPE_HM,
    course_ids_overlapping_range,
    date_bounds_from_issued_at_params,
    paid_until_by_user_course,
    payment_filter_params_for_unpaid,
    sort_unpaid_user_courses_by_paid_until,
    unpaid_course_summary_rows,
    unpaid_user_courses_queryset,
)
from app_auth.models import User
from app_finance.payment_scoping import (
    acting_user,
    check_payment_object_read,
    restrict_retired_payment_methods,
    check_payment_read,
    check_payment_record,
    check_payment_record_for_enrollment,
    check_unpaid_course_access,
    check_unpaid_read,
    filter_course_ids_for_unpaid,
    scope_payments_for_user,
)
from app_finance.payment_info_scoping import (
    check_payment_info_endpoint_access,
    check_payment_info_read,
    check_payment_info_write,
    has_payment_info_read_breadth,
    scope_payment_infos_for_user,
)
from app_finance.staff_payment_proofs import (
    collect_staff_payment_proof_files,
    validate_staff_payment_proof_files,
)
from app_finance.staff_payment_scoping import (
    check_staff_payment_confirm,
    check_staff_payment_endpoint_access,
    check_staff_payment_read,
    check_staff_payment_write,
    has_staff_payment_read_breadth,
    scope_staff_payments_for_user,
)
from app_rbac import scoping
from app_rbac.resolution import effective_permissions
from app_rbac.views import RBACDetailsView, RBACListView, RBACSearchView, RBACView
from utilitas.queryset_mixins import OptimizedSearchMixin
from app_finance.ocr_event_log import (
    resolve_ocr_correctness_on_create,
    schedule_ocr_payment_update_resolution,
)
from app_finance.services import (
    extract_receiver_ss_text_data,
    mark_receiver_side_screenshots_matched,
    preview_kpay_screenshot,
    schedule_user_payment_ocr_after_submit,
)
from app_finance.student_checkout import (
    StudentCheckoutError,
    parse_student_checkout_request,
    submit_student_checkout,
)
from djmoney.money import Money
from app_auth.serializers import UserSerializer


class UserPaymentDetailsView(RBACDetailsView):
    model = models.UserPayment
    serializer = serializers.UserPaymentSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {
        "GET": "payment.view",
        "PUT": "payment.record",
        "DELETE": "payment.record",
    }

    _GROUP_COVERAGE_FIELDS = {
        "covered_months",
        "issued_at",
        "billing_start_date",
        "billing_end_date",
        "is_installment",
        "installment_percent",
        "installment_through_month",
    }

    def check_permissions(self, request):
        if request.method == "GET":
            user = acting_user(request)
            if user is None:
                raise PermissionDenied("Authentication credentials were not provided.")
            check_payment_read(user)
            return
        super().check_permissions(request)

    def get(self, request: Request, obj_id: int):
        obj = self.get_object(obj_id)
        if obj is None:
            return self.send_not_found(obj_id)
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        check_payment_object_read(user, obj)
        response = super().get(request, obj_id)
        if response.status_code == 200:
            payload = response.data
            if isinstance(payload, dict) and isinstance(payload.get("data"), dict):
                row = payload["data"]
                attach_course_payment_context([row])
                attach_adjustment_metadata([row])
        return response

    def put(self, request: Request, obj_id: int):
        obj = self.get_object(obj_id)
        if obj is None:
            return self.send_not_found(obj_id)
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        check_payment_record(user, obj.course_id)
        if obj.group_id is not None and any(
            field in request.data for field in self._GROUP_COVERAGE_FIELDS
        ):
            return self.send_response(
                True,
                "validation_error",
                {
                    "errors": {
                        "group": (
                            "Coverage and plan fields for grouped payments must be "
                            "updated through the payment group endpoint."
                        )
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if "status" in request.data:
            new_status = request.data.get("status")
            if new_status is not None and new_status != obj.status:
                if "payment.verify" not in effective_permissions(user):
                    raise PermissionDenied(
                        "You don't have permission to change payment status."
                    )
        previous_status = obj.status
        previous_transaction_id = obj.transaction_id
        previous_parsed_amount = (
            obj.parsed_amount.amount if obj.parsed_amount is not None else None
        )
        serialized_data = self.get_serializer(obj, data=request.data, partial=True)
        serialized_data.is_valid(raise_exception=True)
        saved = serialized_data.save()
        if (
            saved.status == models.UserPayment.Status.VERIFIED
            and previous_status != models.UserPayment.Status.VERIFIED
            and saved.verified_by_id is None
        ):
            saved.verified_by = user
            saved.save(update_fields=["verified_by"])
        if saved.transaction_id:
            mark_receiver_side_screenshots_matched(
                saved.transaction_id, saved, actor=user
            )
        current_parsed_amount = (
            saved.parsed_amount.amount if saved.parsed_amount is not None else None
        )
        if saved.ocr_event_id and (
            saved.status != previous_status
            or saved.transaction_id != previous_transaction_id
            or current_parsed_amount != previous_parsed_amount
        ):
            schedule_ocr_payment_update_resolution(saved)
        return self.send_response(
            False, "updated", {"data": serialized_data.data}, status=status.HTTP_200_OK
        )

    def delete(self, request: Request, obj_id: int):
        obj = self.get_object(obj_id)
        if obj is None:
            return self.send_not_found(obj_id)
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        check_payment_record(user, obj.course_id)
        serialized_data = self.get_serializer(obj)
        response_payload = serialized_data.data
        with transaction.atomic():
            from app_finance.payment_delete_cleanup import (
                cleanup_discounts_on_user_payment_delete,
            )

            cleanup_discounts_on_user_payment_delete(obj, removed_by=user)
            obj.delete()
        return self.deleted(response_payload)


class UserPaymentGroupDetailsView(RBACView):
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {
        "GET": "payment.view",
        "PUT": "payment.record",
        "DELETE": "payment.record",
    }

    _PLAN_FIELDS = {
        "issued_at",
        "billing_start_date",
        "billing_end_date",
        "is_installment",
        "installment_percent",
    }
    _ALLOWED_PUT_FIELDS = _PLAN_FIELDS | {"covered_months", "installment_through_month"}

    def check_permissions(self, request):
        if request.method == "GET":
            user = acting_user(request)
            if user is None:
                raise PermissionDenied("Authentication credentials were not provided.")
            check_payment_read(user)
            return
        super().check_permissions(request)

    def _group_parts_queryset(self, group_id: int):
        return (
            models.UserPayment.objects.filter(group_id=group_id)
            .select_related(
                "course",
                "user",
                "created_by",
                "verified_by",
                "receipt",
                "payment_method",
                "group",
                "group__created_by",
                "enrollment_discount",
                "enrollment_discount__discount",
            )
            .prefetch_related(
                Prefetch(
                    "covered_months",
                    queryset=models.UserPaymentCoveredMonth.objects.only(
                        "year", "month_index", "user_payment_id"
                    ),
                ),
                Prefetch(
                    "group__parts",
                    queryset=models.UserPayment.objects.select_related("course").only(
                        "id", "group_id", "course_id", "transaction_id"
                    ),
                ),
                "payment_discounts",
            )
            .order_by("id")
        )

    def _visible_group_parts(self, user, group_id: int):
        group = models.UserPaymentGroup.objects.filter(id=group_id).first()
        if group is None:
            return None, None

        parts = list(self._group_parts_queryset(group_id))
        if not parts:
            return group, []

        visible_part_ids = set(
            scope_payments_for_user(
                user,
                models.UserPayment.objects.filter(group_id=group_id),
            ).values_list("id", flat=True)
        )
        if any(part.id not in visible_part_ids for part in parts):
            raise PermissionDenied("You do not have access to this payment group.")
        return group, parts

    @staticmethod
    def _group_row(parts: list[models.UserPayment]) -> dict:
        return project_admin_report_rows(parts)[0]

    def get(self, request: Request, obj_id: int):
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        group, parts = self._visible_group_parts(user, obj_id)
        if group is None or not parts:
            return self._not_found(obj_id)
        row = self._group_row(parts)
        attach_course_payment_context([row])
        attach_adjustment_metadata([row])
        return self.send_response(
            False,
            "ok",
            {"data": row},
            status=status.HTTP_200_OK,
        )

    def put(self, request: Request, obj_id: int):
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")

        unexpected_fields = set(request.data) - self._ALLOWED_PUT_FIELDS
        if unexpected_fields:
            return self._validation_error(
                {
                    "fields": (
                        "Only coverage and plan fields can be updated on a "
                        "payment group."
                    )
                }
            )

        group, parts = self._visible_group_parts(user, obj_id)
        if group is None or not parts:
            return self._not_found(obj_id)

        try:
            check_payment_record(user, parts[0].course_id)
        except PermissionDenied as e:
            return self.forbidden(str(e))

        if any(part.status == models.UserPayment.Status.VERIFIED for part in parts):
            return self._validation_error(
                {"group": "Verified payment groups cannot have coverage changed."}
            )

        plan_fields, plan_errors = self._parse_partial_plan_fields(request)
        if plan_errors:
            return self._validation_error(plan_errors)

        coverage, coverage_errors = self._resolve_group_coverage(request, parts)
        if coverage_errors:
            return self._validation_error(coverage_errors)

        try:
            with transaction.atomic():
                for field, value in plan_fields.items():
                    setattr(group, field, value)
                if plan_fields:
                    group.save(update_fields=list(plan_fields.keys()))

                for part in parts:
                    for field, value in plan_fields.items():
                        setattr(part, field, value)
                    if plan_fields:
                        part.save(update_fields=list(plan_fields.keys()))
                    if coverage is not None:
                        sync_user_payment_covered_months(part, coverage)

                if coverage is not None:
                    first_part = models.UserPayment.objects.get(
                        id=min(part.id for part in parts)
                    )
                    from app_finance.payment_discount_apply import (
                        reprice_user_payment_from_coverage,
                    )

                    reprice_user_payment_from_coverage(
                        first_part, org=_get_current_org()
                    )
                    group.issued_at = first_part.issued_at
                    group.save(update_fields=["issued_at"])
        except (ValueError, ValidationError) as e:
            return self._validation_error({"covered_months": str(e)})

        refreshed_parts = list(self._group_parts_queryset(obj_id))
        return self.send_response(
            False,
            "updated",
            {"data": self._group_row(refreshed_parts)},
            status=status.HTTP_200_OK,
        )

    def delete(self, request: Request, obj_id: int):
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")

        group, parts = self._visible_group_parts(user, obj_id)
        if group is None or not parts:
            return self._not_found(obj_id)

        for part in parts:
            try:
                check_payment_record(user, part.course_id)
            except PermissionDenied as e:
                return self.forbidden(str(e))

        response_payload = self._group_row(parts)
        with transaction.atomic():
            from app_finance.payment_delete_cleanup import (
                cleanup_discounts_on_user_payment_delete,
            )

            for part in parts:
                cleanup_discounts_on_user_payment_delete(part, removed_by=user)
            group.delete()

        return self.deleted(response_payload)

    def _validation_error(self, errors: dict):
        return self.send_response(
            True,
            "validation_error",
            {"errors": errors},
            status=status.HTTP_400_BAD_REQUEST,
        )

    def _not_found(self, obj_id: int):
        return self.send_response(
            True,
            "not_found",
            {"errors": f"Payment group {obj_id} not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    def _parse_partial_plan_fields(self, request: Request) -> tuple[dict, dict]:
        helper = AdminUploadScreenshotView()
        errors: dict = {}
        out: dict = {}
        for field in ("issued_at", "billing_start_date", "billing_end_date"):
            if field in request.data:
                out[field] = helper._parse_datetime_field(
                    request.data.get(field),
                    field,
                    errors,
                )
        if "is_installment" in request.data:
            out["is_installment"] = helper._parse_bool(
                request.data.get("is_installment")
            )
        if "installment_percent" in request.data:
            raw = request.data.get("installment_percent")
            if raw in (None, ""):
                out["installment_percent"] = None
            else:
                out["installment_percent"] = helper._parse_decimal_field(
                    raw,
                    "installment_percent",
                    errors,
                )
        return out, errors

    def _resolve_group_coverage(
        self,
        request: Request,
        parts: list[models.UserPayment],
    ) -> tuple[list[dict] | None, dict]:
        helper = AdminUploadScreenshotView()
        if "covered_months" in request.data:
            return helper._parse_covered_months(request.data.get("covered_months"))

        if "installment_through_month" not in request.data:
            return None, {}
        through_raw = request.data.get("installment_through_month")
        if through_raw in (None, ""):
            return None, {}

        through, errors = helper._parse_json_month_object(
            through_raw,
            "installment_through_month",
        )
        if errors:
            return None, errors
        try:
            return (
                compute_incremental_installment_months(
                    user_id=parts[0].user_id,
                    course_id=parts[0].course_id,
                    target_year=through["year"],
                    target_month=through["month_index"],
                ),
                {},
            )
        except Exception as e:
            return None, {"installment_through_month": str(e)}


class UserPaymentSearchView(OptimizedSearchMixin, RBACSearchView):
    model = models.UserPayment
    serializer = serializers.UserPaymentSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"POST": "payment.view"}
    base_select_related = (
        "user",
        "course",
        "payment_method",
        "created_by",
        "verified_by",
        "receipt",
        "enrollment_discount",
        "enrollment_discount__discount",
    )
    base_prefetch_related = (
        Prefetch(
            "covered_months",
            queryset=models.UserPaymentCoveredMonth.objects.only(
                "year", "month_index", "user_payment_id"
            ),
        ),
        # Feeds shared_screenshot_courses; course__title is required or each
        # sibling triggers its own query.
        Prefetch(
            "group__parts",
            queryset=models.UserPayment.objects.select_related("course").only(
                "id",
                "group_id",
                "course_id",
                "transaction_id",
                "course__id",
                "course__title",
            ),
        ),
        "payment_discounts",
    )

    def check_permissions(self, request):
        user = acting_user(request)
        if user is None:
            raise PermissionDenied("Authentication credentials were not provided.")
        check_payment_read(user)

    def post(self, request: Request, filter_ids=None):
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        held = set(effective_permissions(user))
        if not scoping.has_read_breadth("payment", held):
            own_ids = list(scope_payments_for_user(user).values_list("id", flat=True))
            if filter_ids is not None:
                return super().post(request, filter_ids=own_ids)
            return super().post(request, filter_ids=own_ids)
        return super().post(request, filter_ids=filter_ids)

    def get_queryset(
        self,
        request,
        filter_params=None,
        exclude_params=None,
        is_csv=False,
        fields=None,
        sorts=None,
        expand=None,
        filter_ids=None,
        chained_filter_params=None,
    ):
        if filter_params is None:
            filter_params = {}
        q = (request.query_params.get("q") or "").strip()
        if q:
            filter_params = {**filter_params, "user__name__icontains": q}
        return super().get_queryset(
            request,
            filter_params,
            exclude_params,
            is_csv,
            fields=fields,
            sorts=sorts,
            expand=expand,
            filter_ids=filter_ids,
            chained_filter_params=chained_filter_params,
        )


class UserPaymentAdminReportView(RBACSearchView):
    model = models.UserPayment
    serializer = serializers.UserPaymentSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"POST": "payment.view_all"}
    # Exact transaction_id lookup is search-like; never dump unbounded matches.
    TXN_LOOKUP_MAX_ROWS = 50

    def check_permissions(self, request):
        user = acting_user(request)
        if user is None:
            raise PermissionDenied("Authentication credentials were not provided.")
        held = set(effective_permissions(user))
        if "payment.view_all" in held:
            return
        if "payment.view" in held and "payment.record" in held:
            return
        raise PermissionDenied("You don't have permission to perform this action.")

    @staticmethod
    def _admin_report_row(i: models.UserPayment) -> dict:
        return admin_report_payment_row(i)

    @classmethod
    def _attach_enrollment_metadata(
        cls, rows: list[dict], *, ctx: PaymentPairContext
    ) -> None:
        """Set is_removed when the student is no longer enrolled (UserCourse missing)."""
        for r in rows:
            u = r.get("user") or {}
            c = r.get("course") or {}
            uid = u.get("id")
            cid = c.get("id")
            uc = (
                ctx.enrollments.get((int(uid), int(cid)))
                if uid is not None and cid is not None
                else None
            )
            r["is_removed"] = uc is None

    @classmethod
    def _attach_installment_cumulative_metadata(
        cls, rows: list[dict], *, ctx: PaymentPairContext
    ) -> None:
        """Per student–course: cumulative verified installment % and furthest covered month."""
        if not ctx.pairs:
            return

        by_pair: dict[tuple[int, int], list] = {}
        for key, payments in ctx.payments_by_pair.items():
            installment_payments = [p for p in payments if p.is_installment]
            if installment_payments:
                by_pair[key] = installment_payments

        cumulative: dict[tuple[int, int], dict] = {}
        st = models.UserPayment.Status
        for key, payments in by_pair.items():
            verified = [p for p in payments if p.status == st.VERIFIED]
            percent_sum = Decimal("0")
            for p in verified:
                if p.installment_percent is not None:
                    percent_sum += Decimal(str(p.installment_percent))
            furthest = furthest_covered_month_from_payments(verified or payments)
            cumulative[key] = {
                "installment_cumulative_percent": (
                    str(percent_sum) if percent_sum > 0 else None
                ),
                "installment_covered_through": (
                    {"year": furthest[0], "month_index": furthest[1]}
                    if furthest is not None
                    else None
                ),
            }

        for r in rows:
            u = r.get("user") or {}
            c = r.get("course") or {}
            uid = u.get("id")
            cid = c.get("id")
            meta = (
                cumulative.get((int(uid), int(cid)))
                if uid is not None and cid is not None
                else None
            )
            if meta:
                r["installment_cumulative_percent"] = meta[
                    "installment_cumulative_percent"
                ]
                r["installment_covered_through"] = meta["installment_covered_through"]
            else:
                r["installment_cumulative_percent"] = None
                r["installment_covered_through"] = None

    @classmethod
    def _attach_remaining_amount_metadata(
        cls, rows: list[dict], *, ctx: PaymentPairContext
    ) -> None:
        """Per student–course: discounted term total minus verified payments."""
        _ = ctx
        if not rows:
            return

        remaining_by_pair: dict[tuple[int, int], str | None] = {}
        for r in rows:
            u = r.get("user") or {}
            c = r.get("course") or {}
            uid = u.get("id")
            cid = c.get("id")
            if uid is None or cid is None:
                continue
            key = (int(uid), int(cid))
            if key in remaining_by_pair:
                continue
            term_total_raw = r.get("term_total")
            if term_total_raw is None:
                remaining_by_pair[key] = None
                continue
            term_total = Decimal(str(term_total_raw))
            paid = Decimal(str(r.get("paid_to_date") or "0"))
            remaining = max(Decimal("0"), term_total - paid)
            remaining_by_pair[key] = str(remaining)

        for r in rows:
            u = r.get("user") or {}
            c = r.get("course") or {}
            uid = u.get("id")
            cid = c.get("id")
            if uid is not None and cid is not None:
                r["remaining_amount"] = remaining_by_pair.get((int(uid), int(cid)))
            else:
                r["remaining_amount"] = None

    @classmethod
    def _attach_adjustment_metadata(cls, rows: list[dict]) -> None:
        attach_adjustment_metadata(rows)

    @staticmethod
    def _distinct_active_student_count_from_rows(rows: list[dict]) -> int:
        seen: set[int] = set()
        for r in rows:
            if r.get("is_removed"):
                continue
            u = r.get("user") or {}
            uid = u.get("id")
            if uid is not None:
                seen.add(int(uid))
        return len(seen)

    @staticmethod
    def _admin_report_summary(
        rows: list[dict],
        *,
        course_id_exact=None,
    ) -> dict:
        verified_total = Decimal("0")
        unuploaded = 0
        uploaded = 0
        verified_count = 0
        removed_count = 0
        st = models.UserPayment.Status
        for r in rows:
            removed = bool(r.get("is_removed"))
            status = r["status"]
            if removed:
                removed_count += 1
            exempt_from_unuploaded = removed
            if status == st.PENDING_PAYMENT and not exempt_from_unuploaded:
                unuploaded += 1
            else:
                uploaded += 1
            if status == st.VERIFIED:
                verified_count += 1
                amt = r.get("parsed_amount")
                if amt is not None:
                    verified_total += Decimal(str(amt))

        active_student_row_count: int
        if course_id_exact is not None:
            try:
                cid = int(course_id_exact)
            except (TypeError, ValueError):
                active_student_row_count = (
                    UserPaymentAdminReportView._distinct_active_student_count_from_rows(
                        rows
                    )
                )
            else:
                active_student_row_count = UserCourse.objects.filter(
                    course_id=cid,
                    assigned_as=UserCourse.AssignedAs.STUDENT,
                ).count()
        else:
            active_student_row_count = (
                UserPaymentAdminReportView._distinct_active_student_count_from_rows(
                    rows
                )
            )

        return {
            "verified_total": str(verified_total),
            "unuploaded_count": unuploaded,
            "uploaded_count": uploaded,
            "verified_count": verified_count,
            "row_count": len(rows),
            "removed_count": removed_count,
            "active_student_row_count": active_student_row_count,
        }

    @staticmethod
    def _empty_admin_report_payload(
        *,
        suggested_month: tuple[int, int] | None,
        course_payment_plan: dict | None = None,
    ) -> dict:
        payload = {
            "data": [],
            "summary": {
                "verified_total": "0",
                "unuploaded_count": 0,
                "uploaded_count": 0,
                "verified_count": 0,
                "row_count": 0,
                "removed_count": 0,
                "active_student_row_count": 0,
            },
            "month_applicable": False,
        }
        if suggested_month is not None:
            y, m = suggested_month
            payload["suggested_month"] = {"year": y, "month": m}
        if course_payment_plan is not None:
            payload["course_payment_plan"] = course_payment_plan
        return payload

    def post(self, request: Request, filter_ids=None):
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")

        filter_params = self.get_filter_params(request)
        course_id_exact = filter_params.get("course_id__exact")
        txn_exact_lookup = any(
            k.startswith("transaction_id__exact") for k in filter_params
        )

        fp = dict(filter_params)
        gte = fp.pop("issued_at__gte", None)
        fp.pop("issued_at__lte", None)
        if gte is None:
            gte = fp.pop("billing_start_date__gte", None)
            fp.pop("billing_start_date__lte", None)

        year_month = None
        if gte is not None:
            dt = parse_datetime(str(gte)) if isinstance(gte, str) else gte
            if dt is not None:
                year_month = (dt.year, dt.month)

        # Unbounded org-wide dumps starve Daphne on large tenants. Require
        # course + month except for global transaction-id exact lookup.
        if not txn_exact_lookup:
            if course_id_exact is None:
                return self.bad_request({"course_id": "course_id filter is required."})
            if year_month is None:
                return self.bad_request(
                    {
                        "month": (
                            "Month filter is required "
                            "(issued_at or billing_start_date gte)."
                        )
                    }
                )

        held = set(effective_permissions(user))
        if not scoping.has_read_breadth("payment", held):
            if course_id_exact is None:
                return self.forbidden("course_id filter is required.")
            try:
                scoped_course_id = int(course_id_exact)
            except (TypeError, ValueError):
                return self.forbidden("Invalid course_id filter.")
            try:
                check_payment_record(user, scoped_course_id)
            except PermissionDenied as e:
                return self.forbidden(str(e))

        filter_has_transaction_id = any(
            k.startswith("transaction_id__") for k in filter_params
        )
        filter_has_status = any(k.startswith("status__") for k in filter_params)
        filter_has_user_id = any(k.startswith("user_id__") for k in filter_params)
        should_check_month_applicable = (
            not txn_exact_lookup
            and course_id_exact is not None
            and year_month is not None
            and not filter_has_transaction_id
            and not filter_has_status
            and not filter_has_user_id
        )
        if should_check_month_applicable:
            course = (
                Course.objects.filter(id=int(course_id_exact))
                .select_related("payment_plan")
                .only(
                    "id",
                    "start_date",
                    "end_date",
                    "payment_plan_id",
                    "payment_plan__id",
                    "payment_plan__name",
                    "payment_plan__billing_type",
                    "payment_plan__price",
                    "payment_plan__price_currency",
                )
                .first()
            )
            y, m = year_month
            if course and not calendar_month_overlaps_course(course, y, m):
                suggested = resolve_suggested_payment_month(course)
                return self.send_response(
                    False,
                    "ok",
                    self._empty_admin_report_payload(
                        suggested_month=suggested,
                        course_payment_plan=course_payment_plan_report_payload(
                            course, user=user
                        ),
                    ),
                )

        qs = scope_payments_for_user(user, models.UserPayment.objects.all())
        if year_month is not None:
            y, m = year_month
            qs = apply_month_scope(qs, y, m)

        user_payment_query = (
            qs.filter(**fp)
            .select_related(
                "course",
                "user",
                "created_by",
                "verified_by",
                "receipt",
                "payment_method",
                "group",
                "group__created_by",
                "enrollment_discount",
                "enrollment_discount__discount",
            )
            .prefetch_related(
                Prefetch(
                    "covered_months",
                    queryset=models.UserPaymentCoveredMonth.objects.only(
                        "year", "month_index", "user_payment_id"
                    ),
                ),
                Prefetch(
                    "group__parts",
                    queryset=models.UserPayment.objects.select_related("course").only(
                        "id", "group_id", "course_id", "transaction_id"
                    ),
                ),
                "payment_discounts",
            )
        )

        truncated = False
        if txn_exact_lookup:
            # Fetch one extra to detect truncation without a separate COUNT.
            capped = list(
                user_payment_query.order_by("id")[: self.TXN_LOOKUP_MAX_ROWS + 1]
            )
            if len(capped) > self.TXN_LOOKUP_MAX_ROWS:
                truncated = True
                capped = capped[: self.TXN_LOOKUP_MAX_ROWS]
            user_payment_rows = capped
        else:
            user_payment_rows = list(user_payment_query)
        user_payments = project_admin_report_rows(user_payment_rows)

        include_unpaid_users = (
            course_id_exact is not None
            and not (filter_has_transaction_id or filter_has_status)
            and not filter_has_user_id
        )

        if include_unpaid_users:
            unpaid_users = (
                UserCourse.objects.filter(
                    assigned_as=UserCourse.AssignedAs.STUDENT,
                    course_id=course_id_exact,
                )
                .exclude(user_id__in=[i.user_id for i in user_payment_rows])
                .prefetch_related("user", "course")
                .all()
            )
            if year_month is not None:
                y, m = year_month
                unpaid_users = unpaid_users.filter(
                    Q(billing_cycle_anchor_date__isnull=True)
                    | Q(billing_cycle_anchor_date__year__lt=y)
                    | Q(
                        billing_cycle_anchor_date__year=y,
                        billing_cycle_anchor_date__month__lte=m,
                    )
                )
            for idx, uc in enumerate(unpaid_users):
                user_payments.append(
                    {
                        "id": f"{idx}{uc.user.id}new",
                        "issued_at": None,
                        "covered_months": [],
                        "user": {
                            "id": uc.user.id,
                            "name": uc.user.name,
                        },
                        "course": {
                            "id": uc.course.id,
                            "title": uc.course.title,
                            "start_date": uc.course.start_date.isoformat()
                            if uc.course.start_date
                            else None,
                            "end_date": uc.course.end_date.isoformat()
                            if uc.course.end_date
                            else None,
                        },
                        "transaction_id": None,
                        "status": models.UserPayment.Status.PENDING_PAYMENT,
                        "description": None,
                        "remarks": None,
                        "created_by": None,
                        "verified_by": None,
                        "billing_start_date": None,
                        "billing_end_date": None,
                        "date_on_screenshot": None,
                        "payment_method": None,
                        "parsed_amount": None,
                        "screenshot": None,
                        "microsoft_submission_id": None,
                    }
                )

        pair_ctx = build_payment_pair_context(
            user_payments,
            include_courses=True,
            include_coverage=True,
        )
        self._attach_enrollment_metadata(user_payments, ctx=pair_ctx)
        self._attach_installment_cumulative_metadata(user_payments, ctx=pair_ctx)
        attach_course_payment_context(user_payments, ctx=pair_ctx)
        self._attach_remaining_amount_metadata(user_payments, ctx=pair_ctx)
        self._attach_adjustment_metadata(user_payments)

        peer_counts = Counter()
        for r in user_payments:
            rid = r.get("id")
            if isinstance(rid, str) and "new" in rid:
                continue
            peer_counts[(r["user"]["id"], r["course"]["id"])] += 1

        for r in user_payments:
            rid = r.get("id")
            if isinstance(rid, str) and "new" in rid:
                r["month_overlap_peer_count"] = 0
                r["month_overlap_duplicate_coverage"] = False
            else:
                c = peer_counts[(r["user"]["id"], r["course"]["id"])]
                r["month_overlap_peer_count"] = c
                r["month_overlap_duplicate_coverage"] = c > 1

        summary = self._admin_report_summary(
            user_payments,
            course_id_exact=course_id_exact,
        )
        user_payments.sort(key=lambda x: x["user"]["name"].lower())
        payload = {
            "data": user_payments,
            "summary": summary,
            "month_applicable": True,
        }
        if course_id_exact is not None:
            course_for_plan = (
                Course.objects.filter(id=int(course_id_exact))
                .select_related("payment_plan")
                .only(
                    "id",
                    "payment_plan_id",
                    "payment_plan__id",
                    "payment_plan__name",
                    "payment_plan__billing_type",
                    "payment_plan__price",
                    "payment_plan__price_currency",
                )
                .first()
            )
            plan_payload = course_payment_plan_report_payload(
                course_for_plan, user=user
            )
            if plan_payload is not None:
                payload["course_payment_plan"] = plan_payload
        if truncated:
            payload["truncated"] = True
        return self.send_response(
            False,
            "ok",
            payload,
        )


class StudentPaymentsCoverageReviewView(RBACView):
    """
    Lists UserPayments with explicit coverage across 2+ calendar months.
    Optional ?course_id= scopes the list to one course.
    """

    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"GET": "payment.view_all"}

    def get(self, request: Request):
        raw = request.query_params.get("course_id")
        course_id: int | None = None
        if raw is not None and str(raw).strip() != "":
            try:
                course_id = int(raw)
            except ValueError:
                return self.send_response(
                    True,
                    "validation_error",
                    {"details": "course_id must be an integer"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        multi_qs = (
            models.UserPayment.objects.annotate(_cm_count=Count("covered_months"))
            .filter(_cm_count__gte=2)
            .select_related("user", "course")
            .prefetch_related(
                Prefetch(
                    "covered_months",
                    queryset=models.UserPaymentCoveredMonth.objects.only(
                        "year", "month_index", "user_payment_id"
                    ).order_by("year", "month_index"),
                )
            )
            .order_by("course__title", "user__name", "id")
        )
        if course_id is not None:
            multi_qs = multi_qs.filter(course_id=course_id)

        multi_month_payments = []
        for p in multi_qs:
            cms = list(p.covered_months.all())
            co = p.course
            multi_month_payments.append(
                {
                    "id": p.id,
                    "status": p.status,
                    "issued_at": p.issued_at.isoformat() if p.issued_at else None,
                    "user": {"id": p.user_id, "name": p.user.name},
                    "course": {
                        "id": p.course_id,
                        "title": co.title,
                        "start_date": co.start_date.isoformat(),
                        "end_date": co.end_date.isoformat(),
                    },
                    "covered_months": [
                        {"year": c.year, "month_index": c.month_index} for c in cms
                    ],
                }
            )

        return self.send_response(
            False,
            "success",
            {
                "data": {
                    "multi_month_payments": multi_month_payments,
                }
            },
            status=status.HTTP_200_OK,
        )


class StudentMakePaymentView(RBACView):
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"POST": "payment.make"}

    def post(self, request: Request):
        checkout_flag = request.data.get("checkout")
        if checkout_flag in ("1", "true", True):
            payment_ids, screenshots, errors = parse_student_checkout_request(request)
            if errors:
                return self.send_response(
                    True,
                    "validation_error",
                    {"errors": errors},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                saved_parts = submit_student_checkout(
                    actor=acting_user(request),
                    tenant_schema=request.tenant.schema_name,
                    payment_ids=payment_ids,
                    screenshots=screenshots,
                    request=request,
                )
            except StudentCheckoutError as exc:
                status_code = status.HTTP_400_BAD_REQUEST
                if exc.code == "forbidden":
                    status_code = status.HTTP_403_FORBIDDEN
                elif exc.code == "not_found":
                    status_code = status.HTTP_404_NOT_FOUND
                return self.send_response(
                    True,
                    exc.code,
                    {"errors": exc.errors or exc.message},
                    status=status_code,
                )

            response_data = [
                serializers.UserPaymentSerializer(part, context={"request": request}).data
                for part in saved_parts
            ]
            return self.send_response(
                False,
                "success",
                {"data": response_data},
            )

        original_user_payment = models.UserPayment.objects.filter(
            id=request.data.get("id")
        ).first()
        if not original_user_payment:
            return self.send_response(
                True, "not_found", {"errors": "UserPayment not found"}, status=404
            )

        user = acting_user(request)
        held = set(effective_permissions(user)) if user else set()
        if not scoping.has_read_breadth("payment", held):
            if user is None or original_user_payment.user_id != user.id:
                return self.send_response(
                    True,
                    "forbidden",
                    {"errors": "You can only submit payments for your own account."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if original_user_payment.status == models.UserPayment.Status.VERIFIED:
                return self.send_response(
                    True,
                    "forbidden",
                    {"errors": "Verified payments cannot be changed."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        user_payment = serializers.StudentPaymentSubmitSerializer(
            original_user_payment,
            data=request.data,
            context={"request": request},
        )
        if user_payment.is_valid():
            with transaction.atomic():
                saved = user_payment.save()
                if saved and saved.transaction_id:
                    mark_receiver_side_screenshots_matched(
                        saved.transaction_id, saved, actor=user
                    )
                schedule_user_payment_ocr_after_submit(
                    saved,
                    request.tenant.schema_name,
                    ocr_event_id=request.data.get("ocr_event_id"),
                )

            response_serializer = serializers.UserPaymentSerializer(
                saved, context={"request": request}
            )
            return self.send_response(
                False, "success", {"data": response_serializer.data}
            )
        else:
            return self.send_response(
                True, "validation_error", {"errors": user_payment.errors}, status=400
            )


class RetryUserPaymentExtractionView(RBACView):
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"POST": "payment.record"}

    def post(self, request: Request, obj_id: int):
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")

        user_payment = models.UserPayment.objects.filter(id=obj_id).first()
        if not user_payment:
            return self.send_response(
                True,
                "not_found",
                {"errors": "UserPayment not found"},
                status=status.HTTP_404_NOT_FOUND,
            )
        try:
            check_payment_record(user, user_payment.course_id)
        except PermissionDenied as e:
            return self.forbidden(str(e))
        if user_payment.status != models.UserPayment.Status.CANNOT_EXTRACT:
            return self.send_response(
                True,
                "validation_error",
                {"errors": "Payment status must be cannot_extract."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not user_payment.screenshot:
            return self.send_response(
                True,
                "validation_error",
                {"errors": "Payment has no screenshot."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user_payment.status = models.UserPayment.Status.AWAITING_EXTRACTION
        user_payment.save(update_fields=["status"])
        extract_receiver_ss_text_data.delay(
            user_payment.id,
            request.tenant.schema_name,
        )
        return self.send_response(
            False,
            "success",
            {
                "data": {
                    "id": user_payment.id,
                    "status": models.UserPayment.Status.AWAITING_EXTRACTION,
                }
            },
            status=status.HTTP_200_OK,
        )


class VerifyScreenshotsView(RBACView):
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"POST": "payment.verify"}

    def post(self, request):
        serialized = serializers.VerifyScreenshotSerializer(
            data=request.data, many=True
        )
        if not serialized.is_valid():
            return self.send_response(
                True, "validation_error", {"errors": serialized.errors}, status=400
            )
        from app_finance.payment_verify import verify_screenshots_from_rows

        actor = acting_user(request)
        verify_screenshots_from_rows(
            data_list=list(serialized.data), actor=actor
        )
        return self.send_response(False, "verification completed", {}, status=201)


class EnsurePaymentEnrollmentsView(RBACView):
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"POST": "payment.record"}

    def post(self, request: Request):
        from app_finance.payment_enrollment import (
            PaymentEnrollmentError,
            ensure_student_enrolled_for_payment,
        )

        actor = acting_user(request)
        if actor is None:
            return self.forbidden("Authentication required.")

        try:
            student_id = int(request.data.get("user_id"))
        except (TypeError, ValueError):
            return self.bad_request({"user_id": "Must be an integer."})

        raw_course_ids = request.data.get("course_ids")
        if not isinstance(raw_course_ids, list) or len(raw_course_ids) == 0:
            return self.bad_request({"course_ids": "Must be a non-empty list."})

        student = User.objects.filter(id=student_id).first()
        if student is None:
            return self.not_found("No such user with the given id.")
        if not student.is_student():
            return self.bad_request({"user_id": "User is not a student."})

        course_ids: list[int] = []
        for raw_id in raw_course_ids:
            try:
                course_ids.append(int(raw_id))
            except (TypeError, ValueError):
                return self.bad_request({"course_ids": "Each course id must be an integer."})

        enrollments: list[dict] = []
        errors: dict[str, str] = {}
        for course_id in course_ids:
            course = Course.objects.filter(id=course_id).first()
            if course is None:
                errors[str(course_id)] = "No such course."
                continue
            try:
                user_course = ensure_student_enrolled_for_payment(
                    actor=actor,
                    student=student,
                    course=course,
                    tenant=request.tenant,
                )
                enrollments.append(
                    {
                        "course_id": course_id,
                        "user_course_id": user_course.id,
                    }
                )
            except PaymentEnrollmentError as exc:
                errors[str(course_id)] = exc.message
            except PermissionDenied as exc:
                errors[str(course_id)] = str(exc)

        if errors:
            return self.send_response(
                True,
                "bad_request",
                {"errors": errors, "enrollments": enrollments},
                status=400,
            )

        return self.send_response(
            False,
            "ok",
            {"enrollments": enrollments},
        )


class AdminUploadScreenshotView(RBACView):
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"POST": "payment.record"}

    def post(self, request: Request):
        courses_count_raw = request.data.get("courses_count")
        if courses_count_raw is not None:
            try:
                courses_count = int(courses_count_raw)
            except (TypeError, ValueError):
                return self._validation_error(
                    {"courses_count": "Must be an integer."}
                )
            allocations_count_raw = request.data.get("allocations_count")
            try:
                allocations_count = int(allocations_count_raw)
            except (TypeError, ValueError):
                return self._validation_error(
                    {"allocations_count": "Must be an integer."}
                )
            if courses_count >= 2 or allocations_count >= 2:
                return self._post_multi_course_group(
                    request, courses_count, allocations_count
                )
            return self._post_single_from_multi_course_body(request)

        parts_count_raw = request.data.get("parts_count")
        if parts_count_raw is not None:
            try:
                parts_count = int(parts_count_raw)
            except (TypeError, ValueError):
                return self.send_response(
                    True,
                    "validation_error",
                    {"errors": {"parts_count": "Must be an integer."}},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if parts_count >= 2:
                return self._post_multipart_group(request, parts_count)

        ss = serializers.UserPaymentSerializer(
            data=request.data, context={"request": request}
        )
        if not ss.is_valid():
            return self.send_response(
                True,
                "validation_error",
                {"errors": ss.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        validated = ss.validated_data
        course = validated.get("course")
        student = validated.get("user")
        course_id = getattr(course, "id", course)
        student_id = getattr(student, "id", student)
        try:
            check_payment_record_for_enrollment(user, course_id, student_id)
        except PermissionDenied as e:
            return self.forbidden(str(e))

        saved = ss.save()
        has_prefilled_ocr = bool(
            saved.transaction_id and saved.parsed_amount is not None
        )
        if saved.transaction_id:
            mark_receiver_side_screenshots_matched(
                saved.transaction_id, saved, actor=user
            )
        ocr_event_id = request.data.get("ocr_event_id")
        if ocr_event_id and has_prefilled_ocr:
            parsed_amount = (
                saved.parsed_amount.amount if saved.parsed_amount is not None else None
            )
            resolve_ocr_correctness_on_create.delay(
                event_id=str(ocr_event_id),
                schema_name=request.tenant.schema_name,
                user_payment_id=saved.id,
                submitted_transaction_id=saved.transaction_id,
                submitted_amount=parsed_amount,
            )
        elif saved.screenshot and not has_prefilled_ocr:
            extract_receiver_ss_text_data.delay(saved.id, request.tenant.schema_name)

        return self.send_response(
            False,
            "success",
            {
                "data": {
                    "id": saved.id,
                    "group_id": None,
                    "message": "Screenshots are being processed",
                }
            },
        )

    def _post_multipart_group(self, request: Request, parts_count: int):
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")

        errors: dict = {}
        student = self._get_required_model(
            User, request.data.get("user"), "user", errors
        )
        course = self._get_required_model(
            Course, request.data.get("course"), "course", errors
        )
        if errors:
            return self._validation_error(errors)

        try:
            check_payment_record_for_enrollment(user, course.id, student.id)
        except PermissionDenied as e:
            return self.forbidden(str(e))

        plan_fields, plan_errors = self._parse_plan_fields(request)
        if plan_errors:
            return self._validation_error(plan_errors)

        coverage, coverage_errors = self._parse_multipart_coverage(
            request,
            student.id,
            course.id,
        )
        if coverage_errors:
            return self._validation_error(coverage_errors)

        parts, part_errors = self._parse_multipart_parts(request, parts_count)
        if part_errors:
            return self._validation_error(part_errors)

        amount_fields = {}
        try:
            from app_finance.payment_discount_apply import (
                apply_discount_and_amount_fields,
            )

            discount_raw = request.data.get("discount_id")
            clear_discount = self._parse_bool(request.data.get("clear_discount"))
            discount_ids_provided = "discount_ids" in request.data
            discount_ids = None
            if discount_ids_provided:
                raw_ids = request.data.getlist("discount_ids")
                if len(raw_ids) == 1 and isinstance(raw_ids[0], str) and "," in raw_ids[0]:
                    raw_ids = [x.strip() for x in raw_ids[0].split(",") if x.strip()]
                discount_ids = [int(x) for x in raw_ids if x not in (None, "")]
            discount_id = None
            if discount_raw not in (None, ""):
                discount_id = int(discount_raw)
            amount_fields = apply_discount_and_amount_fields(
                user=student,
                course=course,
                request_user=user,
                org=_get_current_org(),
                discount_id=discount_id if discount_raw not in (None, "") else None,
                discount_ids=discount_ids if discount_ids_provided else None,
                clear_discount=clear_discount,
                covered_months=self._coverage_to_tuples(coverage),
            )
        except (TypeError, ValueError) as e:
            return self._validation_error({"discount_ids": str(e)})

        try:
            group = create_user_payment_group_with_parts(
                actor=user,
                user=student,
                course=course,
                plan_fields=plan_fields,
                coverage=coverage,
                parts=parts,
                amount_fields=amount_fields,
            )
        except ValueError as e:
            return self._validation_error({"parts": str(e)})

        part_ids = list(group.parts.order_by("id").values_list("id", flat=True))
        created_parts = list(group.parts.order_by("id"))
        for index, part in enumerate(created_parts):
            source_part = parts[index] if index < len(parts) else {}
            ocr_event_id = source_part.get("ocr_event_id")
            if ocr_event_id:
                parsed_amount = (
                    part.parsed_amount.amount if part.parsed_amount is not None else None
                )
                resolve_ocr_correctness_on_create.delay(
                    event_id=str(ocr_event_id),
                    schema_name=request.tenant.schema_name,
                    user_payment_id=part.id,
                    submitted_transaction_id=part.transaction_id,
                    submitted_amount=parsed_amount,
                )
            elif part.screenshot and part.parsed_amount is None:
                extract_receiver_ss_text_data.delay(part.id, request.tenant.schema_name)

        return self.send_response(
            False,
            "success",
            {
                "data": {
                    "group_id": group.id,
                    "part_ids": part_ids,
                    "message": "Screenshots are being processed",
                }
            },
        )

    def _validation_error(self, errors: dict):
        return self.send_response(
            True,
            "validation_error",
            {"errors": errors},
            status=status.HTTP_400_BAD_REQUEST,
        )

    @staticmethod
    def _get_required_model(model, raw_id, field_name: str, errors: dict):
        if raw_id in (None, ""):
            errors[field_name] = "This field is required."
            return None
        try:
            obj = model.objects.filter(id=int(raw_id)).first()
        except (TypeError, ValueError):
            errors[field_name] = "Invalid id."
            return None
        if obj is None:
            errors[field_name] = "Invalid id."
        return obj

    @staticmethod
    def _parse_bool(raw) -> bool:
        if isinstance(raw, bool):
            return raw
        if raw in (None, ""):
            return False
        return str(raw).strip().lower() in {"1", "true", "yes", "on"}

    @staticmethod
    def _parse_datetime_field(raw, field_name: str, errors: dict):
        if raw in (None, ""):
            return None
        if isinstance(raw, datetime):
            return raw
        parsed = parse_datetime(str(raw))
        if parsed is None:
            errors[field_name] = "Invalid datetime."
        return parsed

    @staticmethod
    def _parse_decimal_field(raw, field_name: str, errors: dict):
        if raw in (None, ""):
            errors[field_name] = "This field is required."
            return None
        try:
            return Decimal(str(raw))
        except Exception:
            errors[field_name] = "Invalid decimal."
            return None

    def _parse_plan_fields(self, request: Request) -> tuple[dict, dict]:
        errors: dict = {}
        plan_fields = {
            "issued_at": self._parse_datetime_field(
                request.data.get("issued_at"), "issued_at", errors
            ),
            "billing_start_date": self._parse_datetime_field(
                request.data.get("billing_start_date"),
                "billing_start_date",
                errors,
            ),
            "billing_end_date": self._parse_datetime_field(
                request.data.get("billing_end_date"),
                "billing_end_date",
                errors,
            ),
            "is_installment": self._parse_bool(request.data.get("is_installment")),
            "installment_percent": None,
        }
        if request.data.get("installment_percent") not in (None, ""):
            plan_fields["installment_percent"] = self._parse_decimal_field(
                request.data.get("installment_percent"),
                "installment_percent",
                errors,
            )
        return plan_fields, errors

    def _parse_multipart_coverage(
        self,
        request: Request,
        user_id: int,
        course_id: int,
    ) -> tuple[list[dict] | None, dict]:
        if "covered_months" in request.data:
            return self._parse_covered_months(request.data.get("covered_months"))

        if not self._parse_bool(request.data.get("is_installment")):
            return None, {}

        through_raw = request.data.get("installment_through_month")
        if through_raw in (None, ""):
            return None, {}

        through, errors = self._parse_json_month_object(
            through_raw,
            "installment_through_month",
        )
        if errors:
            return None, errors
        try:
            return (
                compute_incremental_installment_months(
                    user_id=user_id,
                    course_id=course_id,
                    target_year=through["year"],
                    target_month=through["month_index"],
                ),
                {},
            )
        except Exception as e:
            return None, {"installment_through_month": str(e)}

    def _parse_covered_months(self, raw) -> tuple[list[dict], dict]:
        if raw in (None, ""):
            return [], {}
        if isinstance(raw, str):
            try:
                parsed = json.loads(raw)
            except json.JSONDecodeError as e:
                return [], {"covered_months": f"Invalid JSON: {e}"}
        else:
            parsed = raw
        if not isinstance(parsed, list):
            return [], {"covered_months": "Expected a JSON array or list."}
        months: list[dict] = []
        for entry in parsed:
            if not isinstance(entry, dict):
                return [], {
                    "covered_months": (
                        "Each entry must be an object with year and month_index."
                    )
                }
            try:
                months.append(
                    {
                        "year": int(entry["year"]),
                        "month_index": int(entry["month_index"]),
                    }
                )
            except (KeyError, TypeError, ValueError) as e:
                return [], {"covered_months": f"Invalid entry: {e}"}
        return months, {}

    def _parse_json_month_object(
        self, raw, field_name: str
    ) -> tuple[dict | None, dict]:
        if isinstance(raw, str):
            try:
                parsed = json.loads(raw)
            except json.JSONDecodeError as e:
                return None, {field_name: f"Invalid JSON: {e}"}
        else:
            parsed = raw
        if not isinstance(parsed, dict):
            return None, {field_name: "Expected a JSON object."}
        try:
            return {
                "year": int(parsed["year"]),
                "month_index": int(parsed["month_index"]),
            }, {}
        except (KeyError, TypeError, ValueError) as e:
            return None, {field_name: f"Invalid entry: {e}"}

    def _parse_multipart_parts(
        self,
        request: Request,
        parts_count: int,
    ) -> tuple[list[dict], dict]:
        parts: list[dict] = []
        errors: dict = {}
        for index in range(parts_count):
            prefix = f"part_{index}_"
            payment_method = self._get_required_model(
                models.PaymentMethod,
                request.data.get(f"{prefix}payment_method"),
                f"{prefix}payment_method",
                errors,
            )
            parsed_amount = self._parse_decimal_field(
                request.data.get(f"{prefix}parsed_amount"),
                f"{prefix}parsed_amount",
                errors,
            )
            screenshot = request.FILES.get(f"{prefix}screenshot") or request.data.get(
                f"{prefix}screenshot"
            )
            if screenshot in (None, ""):
                errors[f"{prefix}screenshot"] = "This field is required."

            parts.append(
                {
                    "screenshot": screenshot,
                    "parsed_amount": parsed_amount,
                    "payment_method": payment_method,
                    "transaction_id": request.data.get(f"{prefix}transaction_id")
                    or None,
                    "date_on_screenshot": request.data.get(
                        f"{prefix}date_on_screenshot"
                    )
                    or None,
                    "payment_date": self._parse_datetime_field(
                        request.data.get(f"{prefix}payment_date"),
                        f"{prefix}payment_date",
                        errors,
                    ),
                    "description": request.data.get(f"{prefix}description") or None,
                    "remarks": request.data.get(f"{prefix}remarks") or None,
                    "ocr_event_id": request.data.get(f"{prefix}ocr_event_id") or None,
                }
            )
        return parts, errors

    def _parse_screenshots(
        self, request: Request, screenshots_count: int
    ) -> tuple[list[dict], dict]:
        screenshots: list[dict] = []
        errors: dict = {}
        for index in range(screenshots_count):
            prefix = f"screenshot_{index}_"
            payment_method = self._get_required_model(
                models.PaymentMethod,
                request.data.get(f"{prefix}payment_method"),
                f"{prefix}payment_method",
                errors,
            )
            parsed_amount = self._parse_decimal_field(
                request.data.get(f"{prefix}parsed_amount"),
                f"{prefix}parsed_amount",
                errors,
            )
            screenshot = request.FILES.get(f"{prefix}screenshot") or request.data.get(
                f"{prefix}screenshot"
            )
            if screenshot in (None, ""):
                screenshot = None

            screenshots.append(
                {
                    "screenshot": screenshot,
                    "parsed_amount": parsed_amount,
                    "payment_method": payment_method,
                    "transaction_id": request.data.get(f"{prefix}transaction_id")
                    or None,
                    "date_on_screenshot": request.data.get(
                        f"{prefix}date_on_screenshot"
                    )
                    or None,
                    "payment_date": self._parse_datetime_field(
                        request.data.get(f"{prefix}payment_date"),
                        f"{prefix}payment_date",
                        errors,
                    ),
                    "description": request.data.get(f"{prefix}description") or None,
                    "remarks": request.data.get(f"{prefix}remarks") or None,
                }
            )
        return screenshots, errors

    def _parse_course_specs(
        self,
        request: Request,
        courses_count: int,
        *,
        default_student=None,
    ) -> tuple[list[dict], dict]:
        specs: list[dict] = []
        errors: dict = {}
        for index in range(courses_count):
            prefix = f"course_{index}_"
            course = self._get_required_model(
                Course, request.data.get(f"{prefix}id"), f"{prefix}id", errors
            )
            student = default_student
            user_key = f"{prefix}user"
            if user_key in request.data:
                student = self._get_required_model(
                    User, request.data.get(user_key), user_key, errors
                )
            discount_ids = None
            key = f"{prefix}discount_ids"
            if key in request.data:
                raw_ids = request.data.getlist(key)
                if (
                    len(raw_ids) == 1
                    and isinstance(raw_ids[0], str)
                    and "," in raw_ids[0]
                ):
                    raw_ids = [x.strip() for x in raw_ids[0].split(",") if x.strip()]
                try:
                    discount_ids = [int(x) for x in raw_ids if x not in (None, "")]
                except (TypeError, ValueError):
                    errors[key] = "Must be a list of integers."
            is_installment = self._parse_bool(
                request.data.get(f"{prefix}is_installment")
            )
            installment_percent = None
            installment_percent_raw = request.data.get(f"{prefix}installment_percent")
            if installment_percent_raw not in (None, ""):
                try:
                    installment_percent = Decimal(str(installment_percent_raw))
                except (TypeError, ValueError):
                    errors[f"{prefix}installment_percent"] = "Must be a decimal."

            coverage = None
            coverage_key = f"{prefix}covered_months"
            if coverage_key in request.data:
                coverage, coverage_errors = self._parse_covered_months(
                    request.data.get(coverage_key)
                )
                if coverage_errors:
                    errors[coverage_key] = coverage_errors.get("covered_months")
            elif is_installment and student is not None and course is not None:
                through_raw = request.data.get(f"{prefix}installment_through_month")
                if through_raw in (None, ""):
                    errors[f"{prefix}installment_through_month"] = (
                        "Required for installment."
                    )
                else:
                    through, through_errors = self._parse_json_month_object(
                        through_raw,
                        f"{prefix}installment_through_month",
                    )
                    if through_errors:
                        errors.update(through_errors)
                    else:
                        try:
                            coverage = compute_incremental_installment_months(
                                user_id=student.id,
                                course_id=course.id,
                                target_year=through["year"],
                                target_month=through["month_index"],
                            )
                        except Exception as e:
                            from rest_framework.exceptions import ValidationError

                            if isinstance(e, ValidationError):
                                detail = e.detail
                                if isinstance(detail, dict):
                                    for field, message in detail.items():
                                        errors[f"{prefix}{field}"] = message
                                else:
                                    errors[f"{prefix}installment_through_month"] = (
                                        str(detail)
                                    )
                            else:
                                errors[f"{prefix}installment_through_month"] = str(e)
            specs.append(
                {
                    "course": course,
                    "student": student,
                    "discount_ids": discount_ids,
                    "clear_discount": self._parse_bool(
                        request.data.get(f"{prefix}clear_discount")
                    ),
                    "auto_enroll": self._parse_bool(
                        request.data.get(f"{prefix}auto_enroll")
                    ),
                    "coverage": coverage,
                    "is_installment": is_installment,
                    "installment_percent": installment_percent,
                }
            )
        return specs, errors

    def _parse_allocations(
        self,
        request: Request,
        allocations_count: int,
        screenshots: list[dict],
        courses_by_key: dict[tuple[int, int], object],
        *,
        default_student=None,
    ) -> tuple[list[dict], dict]:
        allocations: list[dict] = []
        errors: dict = {}
        for index in range(allocations_count):
            prefix = f"alloc_{index}_"
            amount = self._parse_decimal_field(
                request.data.get(f"{prefix}amount"), f"{prefix}amount", errors
            )
            try:
                screenshot_index = int(request.data.get(f"{prefix}screenshot_index"))
            except (TypeError, ValueError):
                errors[f"{prefix}screenshot_index"] = "Must be an integer."
                screenshot_index = None
            if screenshot_index is not None and not (
                0 <= screenshot_index < len(screenshots)
            ):
                errors[f"{prefix}screenshot_index"] = "Unknown screenshot."
                screenshot_index = None
            try:
                course_id = int(request.data.get(f"{prefix}course_id"))
            except (TypeError, ValueError):
                errors[f"{prefix}course_id"] = "Must be an integer."
                course_id = None
            student = default_student
            user_key = f"{prefix}user"
            if user_key in request.data:
                student = self._get_required_model(
                    User, request.data.get(user_key), user_key, errors
                )
            lookup_key = None
            if course_id is not None and student is not None:
                lookup_key = (student.id, course_id)
            if lookup_key is not None and lookup_key not in courses_by_key:
                errors[f"{prefix}course_id"] = "Course is not part of this payment."
                lookup_key = None
            if (
                screenshot_index is None
                or lookup_key is None
                or amount is None
                or student is None
            ):
                continue
            screenshot = screenshots[screenshot_index]
            allocations.append(
                {
                    "course": courses_by_key[lookup_key],
                    "user": student,
                    "screenshot_index": screenshot_index,
                    "screenshot": screenshot["screenshot"],
                    "parsed_amount": amount,
                    "payment_method": screenshot["payment_method"],
                    "transaction_id": screenshot["transaction_id"],
                    "date_on_screenshot": screenshot["date_on_screenshot"],
                    "payment_date": screenshot["payment_date"],
                    "description": screenshot["description"],
                    "remarks": screenshot["remarks"],
                }
            )
        return allocations, errors

    @staticmethod
    def _validate_allocation_balance(
        screenshots: list[dict], allocations: list[dict]
    ) -> dict:
        """Every screenshot must be fully spent, so no money is invented or lost."""
        allocated: dict[int, Decimal] = {}
        for alloc in allocations:
            key = alloc["screenshot_index"]
            allocated[key] = allocated.get(key, Decimal("0")) + alloc["parsed_amount"]
        for index, screenshot in enumerate(screenshots):
            expected = screenshot["parsed_amount"]
            actual = allocated.get(index, Decimal("0"))
            if expected is None or actual == expected:
                continue
            return {
                f"screenshot_{index}_parsed_amount": (
                    f"Allocated {actual} does not match the screenshot amount "
                    f"{expected}."
                )
            }
        return {}

    @staticmethod
    def _coverage_to_tuples(coverage: list[dict] | None):
        if not coverage:
            return None
        return [(int(m["year"]), int(m["month_index"])) for m in coverage]

    def _post_multi_course_group(
        self, request: Request, courses_count: int, allocations_count: int
    ):
        actor = acting_user(request)
        if actor is None:
            return self.forbidden("Authentication required.")

        errors: dict = {}
        default_student = self._get_required_model(
            User, request.data.get("user"), "user", errors
        )
        if errors:
            return self._validation_error(errors)

        course_specs, course_errors = self._parse_course_specs(
            request, courses_count, default_student=default_student
        )
        if course_errors:
            return self._validation_error(course_errors)

        from app_finance.payment_enrollment import (
            PaymentEnrollmentError,
            ensure_student_enrolled_for_payment,
        )

        for spec in course_specs:
            course = spec["course"]
            if course is None:
                continue
            spec_student = spec.get("student") or default_student
            if spec_student is None:
                continue
            try:
                if spec.get("auto_enroll"):
                    ensure_student_enrolled_for_payment(
                        actor=actor,
                        student=spec_student,
                        course=course,
                        tenant=request.tenant,
                    )
                else:
                    check_payment_record_for_enrollment(
                        actor, course.id, spec_student.id
                    )
            except PaymentEnrollmentError as e:
                return self._validation_error(
                    {f"course_{course.id}_auto_enroll": e.message}
                )
            except PermissionDenied as e:
                return self.forbidden(str(e))

        plan_fields, plan_errors = self._parse_plan_fields(request)
        if plan_errors:
            return self._validation_error(plan_errors)

        try:
            screenshots_count = int(request.data.get("screenshots_count"))
        except (TypeError, ValueError):
            return self._validation_error(
                {"screenshots_count": "Must be an integer."}
            )
        screenshots, screenshot_errors = self._parse_screenshots(
            request, screenshots_count
        )
        if screenshot_errors:
            return self._validation_error(screenshot_errors)

        courses_by_key: dict[tuple[int, int], object] = {}
        for spec in course_specs:
            course = spec["course"]
            spec_student = spec.get("student") or default_student
            if course is None or spec_student is None:
                continue
            courses_by_key[(spec_student.id, course.id)] = course

        allocations, alloc_errors = self._parse_allocations(
            request,
            allocations_count,
            screenshots,
            courses_by_key,
            default_student=default_student,
        )
        if alloc_errors:
            return self._validation_error(alloc_errors)

        balance_errors = self._validate_allocation_balance(screenshots, allocations)
        if balance_errors:
            return self._validation_error(balance_errors)

        allocated_keys = {
            (alloc["user"].id, alloc["course"].id) for alloc in allocations
        }
        missing = set(courses_by_key) - allocated_keys
        if missing:
            return self._validation_error(
                {"allocations": "Every selected course needs an allocated amount."}
            )

        from app_finance.payment_discount_apply import (
            apply_discount_and_amount_fields,
        )

        amount_fields_by_course: dict[tuple[int, int], dict] = {}
        coverage_by_course: dict[tuple[int, int], list[dict] | None] = {}
        plan_fields_by_course: dict[tuple[int, int], dict] = {}
        for spec in course_specs:
            course = spec["course"]
            spec_student = spec.get("student") or default_student
            if course is None or spec_student is None:
                continue
            course_key = (spec_student.id, course.id)
            coverage_by_course[course_key] = spec["coverage"]
            plan_fields_by_course[course_key] = build_row_plan_fields_from_course_spec(
                base_plan_fields=plan_fields,
                coverage=spec["coverage"],
                is_installment=spec.get("is_installment", False),
                installment_percent=spec.get("installment_percent"),
            )
            try:
                amount_fields_by_course[course_key] = apply_discount_and_amount_fields(
                    user=spec_student,
                    course=course,
                    request_user=actor,
                    org=_get_current_org(),
                    discount_ids=spec["discount_ids"],
                    clear_discount=spec["clear_discount"],
                    covered_months=self._coverage_to_tuples(spec["coverage"]),
                )
            except (TypeError, ValueError) as e:
                return self._validation_error(
                    {f"course_{course.id}_discount_ids": str(e)}
                )

        student_ids = {alloc["user"].id for alloc in allocations}
        is_multi_student = len(student_ids) > 1

        try:
            if is_multi_student:
                allocations_by_user: dict[int, list[dict]] = {}
                for alloc in allocations:
                    user_id = alloc["user"].id
                    row = dict(alloc)
                    row.pop("user", None)
                    allocations_by_user.setdefault(user_id, []).append(row)
                student_allocations = []
                for spec_student_id in sorted(allocations_by_user):
                    spec_student = User.objects.get(id=spec_student_id)
                    student_allocations.append(
                        {
                            "user": spec_student,
                            "allocations": allocations_by_user[spec_student_id],
                        }
                    )
                groups = create_shared_transaction_payment_groups(
                    actor=actor,
                    plan_fields=plan_fields,
                    student_allocations=student_allocations,
                    coverage_by_course=coverage_by_course,
                    amount_fields_by_course=amount_fields_by_course,
                    plan_fields_by_course=plan_fields_by_course,
                )
                group = groups[0]
            else:
                student = default_student
                for spec in course_specs:
                    if spec.get("student") is not None:
                        student = spec["student"]
                        break
                single_allocations = []
                for alloc in allocations:
                    row = dict(alloc)
                    row.pop("user", None)
                    single_allocations.append(row)
                group = create_multi_course_payment_group(
                    actor=actor,
                    user=student,
                    plan_fields=plan_fields,
                    allocations=single_allocations,
                    coverage_by_course=coverage_by_course,
                    amount_fields_by_course=amount_fields_by_course,
                    plan_fields_by_course=plan_fields_by_course,
                )
                groups = [group]
        except ValueError as e:
            return self._validation_error({"allocations": str(e)})

        all_part_ids: list[int] = []
        groups_payload: list[dict] = []
        for g in groups:
            part_ids = list(g.parts.order_by("id").values_list("id", flat=True))
            all_part_ids.extend(part_ids)
            groups_payload.append(
                {
                    "user_id": g.user_id,
                    "group_id": g.id,
                    "part_ids": part_ids,
                }
            )
            for part in g.parts.all():
                if part.screenshot and part.parsed_amount is None:
                    extract_receiver_ss_text_data.delay(
                        part.id, request.tenant.schema_name
                    )

        return self.send_response(
            False,
            "success",
            {
                "data": {
                    "group_id": group.id,
                    "part_ids": all_part_ids,
                    "groups": groups_payload,
                    "message": "Payment recorded",
                }
            },
        )

    def _post_single_from_multi_course_body(self, request: Request):
        """One course + one screenshot needs no group; reuse the serializer path."""
        from django.http import QueryDict

        flat = QueryDict(mutable=True)
        for key in request.data:
            if key.startswith(("course_", "screenshot_", "alloc_")):
                continue
            if key in ("courses_count", "screenshots_count", "allocations_count"):
                continue
            for value in request.data.getlist(key):
                flat.appendlist(key, value)

        flat["course"] = request.data.get("course_0_id")
        flat["parsed_amount"] = request.data.get("alloc_0_amount")
        flat["payment_method"] = request.data.get("screenshot_0_payment_method")
        for source, target in (
            ("screenshot_0_transaction_id", "transaction_id"),
            ("screenshot_0_date_on_screenshot", "date_on_screenshot"),
            ("screenshot_0_payment_date", "payment_date"),
            ("screenshot_0_description", "description"),
            ("screenshot_0_remarks", "remarks"),
        ):
            if request.data.get(source) not in (None, ""):
                flat[target] = request.data.get(source)
        if "course_0_discount_ids" in request.data:
            flat.setlist("discount_ids", request.data.getlist("course_0_discount_ids"))
        if request.data.get("course_0_clear_discount") not in (None, ""):
            flat["clear_discount"] = request.data.get("course_0_clear_discount")
        if request.data.get("course_0_covered_months") not in (None, ""):
            flat["covered_months"] = request.data.get("course_0_covered_months")
        screenshot = request.FILES.get("screenshot_0_screenshot")
        if screenshot is not None:
            flat["screenshot"] = screenshot

        ss = serializers.UserPaymentSerializer(
            data=flat, context={"request": request}
        )
        if not ss.is_valid():
            return self.send_response(
                True,
                "validation_error",
                {"errors": ss.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        actor = acting_user(request)
        if actor is None:
            return self.forbidden("Authentication required.")
        validated = ss.validated_data
        course = validated.get("course")
        student = validated.get("user")
        course_id = getattr(course, "id", course)
        student_id = getattr(student, "id", student)
        try:
            check_payment_record_for_enrollment(actor, course_id, student_id)
        except PermissionDenied as e:
            return self.forbidden(str(e))

        saved = ss.save()
        has_prefilled_ocr = bool(
            saved.transaction_id and saved.parsed_amount is not None
        )
        if saved.transaction_id:
            mark_receiver_side_screenshots_matched(
                saved.transaction_id, saved, actor=actor
            )
        if saved.screenshot and not has_prefilled_ocr:
            extract_receiver_ss_text_data.delay(saved.id, request.tenant.schema_name)

        return self.send_response(
            False,
            "success",
            {
                "data": {
                    "id": saved.id,
                    "group_id": None,
                    "message": "Screenshots are being processed",
                }
            },
        )


class OcrPaymentScreenshotView(RBACView):
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"POST": "payment.record"}

    def check_permissions(self, request):
        user = acting_user(request)
        if user is None:
            raise PermissionDenied("Authentication credentials were not provided.")
        held = set(effective_permissions(user))
        if "payment.record" in held or "payroll.manage" in held:
            return
        raise PermissionDenied("You don't have permission to perform this action.")

    def post(self, request: Request):
        screenshot = request.FILES.get("screenshot")
        if screenshot is None:
            return self.bad_request("screenshot is required.")

        payment_kind = (request.data.get("payment_kind") or "student").strip().lower()
        if payment_kind not in ("student", "staff"):
            return self.bad_request("payment_kind must be student or staff.")

        course_id_raw = request.data.get("course_id")
        course_id = None
        if course_id_raw not in (None, ""):
            try:
                course_id = int(course_id_raw)
            except (TypeError, ValueError):
                return self.bad_request("course_id must be an integer.")
            from app_course.models import Course

            if not Course.objects.filter(id=course_id).exists():
                return self.bad_request("course_id is invalid.")

        event_id = str(uuid4())
        result = preview_kpay_screenshot(
            screenshot,
            filename=getattr(screenshot, "name", "screenshot.jpg"),
            payment_kind=payment_kind,
            ocr_event_id=event_id,
            schema_name=request.tenant.schema_name,
            course_id=course_id,
        )
        result["ocr_event_id"] = event_id
        if not result.get("ok"):
            return self.send_response(
                True,
                "validation_error",
                {"data": result},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        return self.ok(result)


class PaymentPlanListView(RBACListView):
    model = models.PaymentPlan
    serializer = serializers.PaymentPlanSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"GET": "payment.view_all", "POST": "payment.configure"}


class PaymentPlanDetailsView(RBACDetailsView):
    model = models.PaymentPlan
    serializer = serializers.PaymentPlanSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {
        "GET": "payment.view_all",
        "PUT": "payment.configure",
        "PATCH": "payment.configure",
        "DELETE": "payment.configure",
    }


class PaymentPlanSearchView(RBACSearchView):
    model = models.PaymentPlan
    serializer = serializers.PaymentPlanSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"POST": "payment.view_all"}


class ReceiverSideScreenshotListView(RBACListView):
    model = models.ReceiverSideScreenshot
    serializer = serializers.ReceiverSideScreenshotSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"GET": "payment.view_all", "POST": "payment.view_all"}


class ReceiverSideScreenshotDetailsView(RBACDetailsView):
    model = models.ReceiverSideScreenshot
    serializer = serializers.ReceiverSideScreenshotSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {
        "GET": "payment.view_all",
        "PUT": "payment.view_all",
        "PATCH": "payment.view_all",
        "DELETE": "payment.view_all",
    }


class ReceiverSideScreenshotSearchView(RBACSearchView):
    model = models.ReceiverSideScreenshot
    serializer = serializers.ReceiverSideScreenshotSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"POST": "payment.view_all"}


class PaymentMethodListView(RBACListView):
    model = models.PaymentMethod
    serializer = serializers.PaymentMethodSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"GET": "payment.view_all", "POST": "payment.configure"}

    def get_queryset(self, request, filter_params=None, *args, **kwargs):
        filter_params = restrict_retired_payment_methods(request, filter_params)
        return super().get_queryset(request, filter_params, *args, **kwargs)

    def check_permissions(self, request):
        if request.method == "POST":
            super().check_permissions(request)
            return
        user = acting_user(request)
        if user is None:
            raise PermissionDenied("Authentication credentials were not provided.")
        held = set(effective_permissions(user))
        if any(
            c in held
            for c in (
                "payment.view_all",
                "payment.configure",
                "payment.record",
                "payment.make",
            )
        ):
            return
        raise PermissionDenied("You don't have permission to perform this action.")


class PaymentMethodDetailsView(RBACDetailsView):
    model = models.PaymentMethod
    serializer = serializers.PaymentMethodSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {
        "GET": "payment.view_all",
        "PUT": "payment.configure",
        "PATCH": "payment.configure",
        "DELETE": "payment.configure",
    }


class PaymentMethodSearchView(RBACSearchView):
    model = models.PaymentMethod
    serializer = serializers.PaymentMethodSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"POST": "payment.view_all"}

    def get_queryset(self, request, filter_params=None, *args, **kwargs):
        filter_params = restrict_retired_payment_methods(request, filter_params)
        return super().get_queryset(request, filter_params, *args, **kwargs)

    def check_permissions(self, request):
        user = acting_user(request)
        if user is None:
            raise PermissionDenied("Authentication credentials were not provided.")
        held = set(effective_permissions(user))
        if any(
            c in held
            for c in (
                "payment.view_all",
                "payment.configure",
                "payment.record",
                "payment.make",
            )
        ):
            return
        raise PermissionDenied("You don't have permission to perform this action.")


class PaymentInfoListView(RBACListView):
    model = models.PaymentInfo
    serializer = serializers.PaymentInfoSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    rbac_decision = "authenticated_only"

    def get(self, request: Request, filter_ids=None):
        user = check_payment_info_endpoint_access(request)
        held = set(effective_permissions(user))
        if has_payment_info_read_breadth(held):
            return super().get(request, filter_ids)
        ids = list(scope_payment_infos_for_user(user).values_list("id", flat=True))
        return super().get(request, ids)

    def post(self, request: Request):
        check_payment_info_endpoint_access(request, for_write=True)
        return super().post(request)


class PaymentInfoDetailsView(RBACDetailsView):
    model = models.PaymentInfo
    serializer = serializers.PaymentInfoSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    rbac_decision = "authenticated_only"

    def get(self, request: Request, obj_id: int):
        user = check_payment_info_endpoint_access(request)
        obj = self.get_object(obj_id)
        if obj is None:
            return self.send_not_found(obj_id)
        try:
            check_payment_info_read(user, obj)
        except PermissionDenied:
            return self.forbidden("You don't have permission to view this payment info.")
        return super().get(request, obj_id)

    def put(self, request: Request, obj_id: int):
        user = check_payment_info_endpoint_access(request, for_write=True)
        obj = self.get_object(obj_id)
        if obj is None:
            return self.send_not_found(obj_id)
        try:
            check_payment_info_write(user, obj)
        except PermissionDenied:
            return self.forbidden("You don't have permission to change this payment info.")
        return super().put(request, obj_id)

    def delete(self, request: Request, obj_id: int):
        user = check_payment_info_endpoint_access(request, for_write=True)
        obj = self.get_object(obj_id)
        if obj is None:
            return self.send_not_found(obj_id)
        try:
            check_payment_info_write(user, obj)
        except PermissionDenied:
            return self.forbidden("You don't have permission to change this payment info.")
        return super().delete(request, obj_id)


class PaymentInfoSearchView(RBACSearchView):
    model = models.PaymentInfo
    serializer = serializers.PaymentInfoSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    rbac_decision = "authenticated_only"

    def post(self, request: Request, filter_ids=None):
        user = check_payment_info_endpoint_access(request)
        held = set(effective_permissions(user))
        if has_payment_info_read_breadth(held):
            return super().post(request, filter_ids)
        ids = list(scope_payment_infos_for_user(user).values_list("id", flat=True))
        return super().post(request, ids)


class StaffPaymentListView(RBACListView):
    model = models.StaffPayment
    serializer = serializers.StaffPaymentSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    rbac_decision = "authenticated_only"

    def get(self, request: Request, filter_ids=None):
        user = check_staff_payment_endpoint_access(request)
        held = set(effective_permissions(user))
        if has_staff_payment_read_breadth(held):
            return super().get(request, filter_ids)
        ids = list(scope_staff_payments_for_user(user).values_list("id", flat=True))
        return super().get(request, ids)

    def post(self, request: Request):
        check_staff_payment_endpoint_access(request, for_write=True)
        try:
            proof_files = validate_staff_payment_proof_files(
                collect_staff_payment_proof_files(request)
            )
        except ValidationError as exc:
            return self.bad_request(exc.detail)
        except DjangoValidationError as exc:
            return self.bad_request(getattr(exc, "message_dict", None) or exc.messages)

        serializer = self.get_serializer(
            data=request.data,
            context={**self.get_serializer_context(), "proof_files": proof_files},
        )
        if serializer.is_valid():
            serializer.save()
            return self.created(serializer.data)
        return self.bad_request(serializer.errors)


class StaffPaymentDetailsView(RBACDetailsView):
    model = models.StaffPayment
    serializer = serializers.StaffPaymentSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    rbac_decision = "authenticated_only"

    def get(self, request: Request, obj_id: int):
        user = check_staff_payment_endpoint_access(request)
        obj = self.get_object(obj_id)
        if obj is None:
            return self.send_not_found(obj_id)
        try:
            check_staff_payment_read(user, obj)
        except PermissionDenied:
            return self.forbidden("You don't have permission to view this staff payment.")
        return super().get(request, obj_id)

    def put(self, request: Request, obj_id: int):
        user = check_staff_payment_endpoint_access(request, for_write=True)
        obj = self.get_object(obj_id)
        if obj is None:
            return self.send_not_found(obj_id)
        try:
            check_staff_payment_write(user, obj)
        except PermissionDenied:
            return self.forbidden("You don't have permission to change this staff payment.")
        return super().put(request, obj_id)

    def delete(self, request: Request, obj_id: int):
        user = check_staff_payment_endpoint_access(request, for_write=True)
        obj = self.get_object(obj_id)
        if obj is None:
            return self.send_not_found(obj_id)
        try:
            check_staff_payment_write(user, obj)
        except PermissionDenied:
            return self.forbidden("You don't have permission to change this staff payment.")
        return super().delete(request, obj_id)


class StaffPaymentConfirmView(RBACView):
    model = models.StaffPayment
    serializer = serializers.StaffPaymentSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    rbac_decision = "authenticated_only"

    def post(self, request: Request, obj_id: int):
        user = check_staff_payment_endpoint_access(request)
        obj = models.StaffPayment.objects.filter(pk=obj_id).first()
        if obj is None:
            return self.not_found(
                f"{models.StaffPayment.__name__} with id {obj_id} does not exist."
            )
        try:
            check_staff_payment_read(user, obj)
            check_staff_payment_confirm(user, obj)
        except PermissionDenied as exc:
            return self.forbidden(str(exc))
        obj.confirmed_at = timezone.now()
        obj.save(update_fields=["confirmed_at", "updated_at"])
        serializer = self.get_serializer(obj)
        return self.send_response(False, "staff_payment_confirmed", serializer.data)


class StaffPaymentSearchView(RBACSearchView):
    model = models.StaffPayment
    serializer = serializers.StaffPaymentSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    rbac_decision = "authenticated_only"

    def post(self, request: Request, filter_ids=None):
        user = check_staff_payment_endpoint_access(request)
        held = set(effective_permissions(user))
        if has_staff_payment_read_breadth(held):
            return super().post(request, filter_ids)
        ids = list(scope_staff_payments_for_user(user).values_list("id", flat=True))
        return super().post(request, ids)


def _unpaid_paid_until_key(user_course):
    """Paid-until is a per-(course, student) fact, so rows key on both."""
    return (user_course.course_id, user_course.user_id)


class UnpaidUserPaymentView(RBACView):
    """
    This is for admin-upload payment flow where the invoices
    are not generated by a cron job, but by admins. So, if a student
    has not made a payment, its UserPayment row will not exist.
    We solve this by diffing the set of user-payments.user_id with
    each classes' user_id set.

    Exclusion is based on the existence of any UserPayment row for the
    course that covers the report month, regardless of payment status.

    Without a `course_id` filter the report spans every course overlapping the
    report month, which only users with school-wide unpaid breadth may request
    (enforced by `check_unpaid_course_access`).
    """

    model = User
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"POST": "payment.view_unpaid_all"}

    def check_permissions(self, request):
        user = acting_user(request)
        if user is None:
            raise PermissionDenied("Authentication credentials were not provided.")
        check_unpaid_read(user)

    @staticmethod
    def _report_course_ids(course_id, payment_params) -> list[int]:
        """Courses the report covers. Raises ValueError if the month is unusable."""
        if course_id is not None:
            return [course_id]
        first_day, last_day = date_bounds_from_issued_at_params(payment_params)
        return course_ids_overlapping_range(first_day, last_day)

    def post(self, request):
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        try:
            filter_params = self.get_filter_params(request)
            query_params = self.get_query_params(request)
        except BadRequest as e:
            return self.send_response(
                True, "bad_request", {"details": str(e)}, status=400
            )
        raw_course_id = filter_params.pop("course_id__exact", None)
        course_id = None
        if raw_course_id not in (None, ""):
            try:
                course_id = int(raw_course_id)
            except (TypeError, ValueError):
                return self.send_response(
                    True,
                    "bad_request",
                    {"details": "course_id must be a number."},
                    status=400,
                )
        try:
            check_unpaid_course_access(user, course_id)
        except PermissionDenied as e:
            return self.forbidden(str(e))
        payment_params = payment_filter_params_for_unpaid(filter_params)
        sorts = query_params.get("sorts", [])
        try:
            course_ids = self._report_course_ids(course_id, payment_params)
        except ValueError as e:
            return self.send_response(
                True, "bad_request", {"details": str(e)}, status=400
            )
        try:
            user_courses_qs = unpaid_user_courses_queryset(
                course_ids, payment_params, sorts
            )
        except BadRequest as e:
            return self.send_response(
                True, "bad_request", {"details": str(e)}, status=400
            )
        q = (request.query_params.get("q") or "").strip()
        if q:
            user_courses_qs = user_courses_qs.filter(user__name__icontains=q)
        user_courses_list = list(user_courses_qs)
        paid_until_map = paid_until_by_user_course(
            course_ids,
            [uc.user_id for uc in user_courses_list],
        )
        explicit_sorts = [s for s in sorts if s != "is_fully_paid"]
        if not explicit_sorts:
            user_courses_list = sort_unpaid_user_courses_by_paid_until(
                user_courses_list,
                paid_until_map,
                key=_unpaid_paid_until_key,
            )
        paginated_ucs = self.paginate_queryset(user_courses_list, request)
        page_ucs = (
            list(paginated_ucs) if paginated_ucs is not None else user_courses_list
        )
        users = [uc.user for uc in page_ucs]
        serialized_users = UserSerializer(
            users, many=True, context={"model": self.model}
        )
        for i, user_data in enumerate(serialized_users.data):
            uc = page_ucs[i]
            user_data["is_removed"] = False
            user_data["user_course_id"] = uc.id
            user_data["course_id"] = uc.course_id
            user_data["course_title"] = uc.course.title
            paid_until = paid_until_map.get(_unpaid_paid_until_key(uc))
            user_data["paid_until"] = (
                {"year": paid_until[0], "month_index": paid_until[1]}
                if paid_until is not None
                else None
            )
            user_data["payment_status"] = (
                "never_paid" if paid_until is None else "behind"
            )
        return self.send_response(False, "success", {"data": serialized_users.data})


class UnpaidCourseSummaryView(RBACView):
    """Per-course unpaid counts for courses overlapping the unpaid-report month."""

    model = models.UserPayment
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"POST": "payment.view_unpaid_all"}

    def check_permissions(self, request):
        user = acting_user(request)
        if user is None:
            raise PermissionDenied("Authentication credentials were not provided.")
        check_unpaid_read(user)

    def post(self, request):
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        try:
            filter_params = self.get_filter_params(request)
        except BadRequest as e:
            return self.send_response(
                True, "bad_request", {"details": str(e)}, status=400
            )
        filter_params.pop("course_id__exact", None)
        payment_params = payment_filter_params_for_unpaid(filter_params)
        raw_month_type = request.data.get("course_month_type")
        if raw_month_type in (None, ""):
            course_month_type = None
        elif raw_month_type in (MONTH_TYPE_FM, MONTH_TYPE_HM):
            course_month_type = raw_month_type
        else:
            return self.send_response(
                True,
                "validation_error",
                {"details": "course_month_type must be FM, HM, or omitted"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            data = unpaid_course_summary_rows(
                payment_params, course_month_type=course_month_type
            )
        except ValueError as e:
            return self.send_response(
                True,
                "validation_error",
                {"details": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        allowed_ids = set(
            filter_course_ids_for_unpaid(user, [row["course_id"] for row in data])
        )
        data = [row for row in data if row["course_id"] in allowed_ids]
        return self.send_response(False, "success", {"data": data})


class StudentPaymentMonthlyAggregateView(RBACView):
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"POST": "payment.view_all"}

    def post(self, request):
        course_id = request.data.get("course_id")
        date_from = request.data.get("date_from")
        date_to = request.data.get("date_to")
        if not course_id or not date_from or not date_to:
            return self.send_response(
                True,
                "validation_error",
                {"details": "course_id, date_from and date_to are required"},
                status=400,
            )

        course: Course = Course.objects.filter(id=course_id).first()
        if not course:
            return self.send_response(
                True, "not_found", {"details": "Course not found"}, status=404
            )

        user_payments = models.UserPayment.objects.filter(
            course_id=course_id,
            issued_at__gte=date_from,
            issued_at__lte=date_to,
        ).all()
        total_receivable = None
        if course.payment_plan:
            total_receivable = 0
            for up in user_payments:
                if up.invoiced_amount is not None:
                    total_receivable += up.invoiced_amount.amount
                else:
                    total_receivable += course.payment_plan.price.amount
        total_received = 0
        for up in user_payments:
            if up.status == models.UserPayment.Status.VERIFIED:
                if up.actual_amount:
                    total_received += up.actual_amount.amount
                elif up.parsed_amount:
                    total_received += up.parsed_amount.amount

        return self.send_response(
            False,
            "success",
            {
                "total_receivable": total_receivable,
                "total_received": total_received,
                "total_pending": total_receivable - total_received
                if total_receivable is not None
                else None,
            },
        )


class BillingMonthlyView(RBACView):
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"GET": "billing.manage"}

    def get(self, request: Request):
        date_str = request.query_params.get("date")
        parsed_date, error = parse_billing_date_param(date_str)
        if error:
            return self.send_response(
                True,
                "bad_request",
                {"details": error},
                status=400,
            )

        payload = build_monthly_billing_payload(
            request.tenant.schema_name,
            parsed_date,
            date_str,
            request,
        )
        return self.send_response(False, "success", payload, status=200)


class DiscountListView(RBACListView):
    model = models.Discount
    serializer = serializers.DiscountSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"GET": "payment.configure", "POST": "payment.configure"}


class DiscountDetailsView(RBACDetailsView):
    model = models.Discount
    serializer = serializers.DiscountSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {
        "GET": "payment.configure",
        "PUT": "payment.configure",
        "PATCH": "payment.configure",
        "DELETE": "payment.configure",
    }

    def delete(self, request, obj_id=None, *args, **kwargs):
        discount = models.Discount.objects.filter(id=obj_id).first()
        if not discount:
            return self.send_response(
                True, "not_found", {"details": "Not found"}, status=404
            )
        discount.is_active = False
        discount.save(update_fields=["is_active", "updated_at"])
        return self.send_response(
            False, "success", {"data": serializers.DiscountSerializer(discount).data}
        )


class DiscountSearchView(RBACSearchView):
    model = models.Discount
    serializer = serializers.DiscountSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"POST": "payment.configure"}


def _get_current_org():
    from django.db import connection
    from tenant_schemas.utils import get_public_schema_name, schema_context
    from app_organization.models import Organization

    tenant_schema = connection.schema_name
    with schema_context(get_public_schema_name()):
        return Organization.objects.filter(schema_name=tenant_schema).first()


def _student_active_course_count(user_id: int) -> int:
    from app_finance.discount_eligibility import student_active_course_count

    return student_active_course_count(user_id)


class EligibleDiscountsView(RBACView):
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"GET": "payment.configure"}

    def get(self, request, user_course_id: int):
        user_course = (
            UserCourse.objects.select_related(
                "course", "course__payment_plan", "user"
            )
            .filter(id=user_course_id, assigned_as=UserCourse.AssignedAs.STUDENT)
            .first()
        )
        if not user_course:
            return self.send_response(
                True, "not_found", {"details": "Enrollment not found"}, status=404
            )
        if not user_course.course.payment_plan_id:
            return self.send_response(
                True,
                "validation_error",
                {"details": "Course has no payment plan"},
                status=400,
            )

        from datetime import date

        from app_finance.discount_eligibility import filter_selectable_discounts
        from app_finance.discount_engine import get_active_enrollment_discounts

        as_of_raw = request.query_params.get("as_of")
        try:
            as_of = date.fromisoformat(as_of_raw) if as_of_raw else date.today()
        except ValueError:
            return self.send_response(
                True,
                "validation_error",
                {"details": "as_of must be YYYY-MM-DD"},
                status=400,
            )

        currents = get_active_enrollment_discounts(user_course)
        applied_template_ids = {ed.discount_id for ed in currents if ed.discount_id}
        tenant = getattr(request, "tenant", None)
        eligibility_enabled = getattr(tenant, "is_discount_eligibility_enabled", True)
        active_discounts = list(
            models.Discount.objects.filter(is_active=True).order_by("name")
        )
        selectable_discounts = filter_selectable_discounts(
            discounts=active_discounts,
            user=user_course.user,
            course=user_course.course,
            user_course=user_course,
            as_of=as_of,
            applied_template_ids=applied_template_ids,
            eligibility_enabled=eligibility_enabled,
        )
        selectable = [
            serializers.DiscountSerializer(d).data for d in selectable_discounts
        ]

        return self.send_response(
            False,
            "success",
            {
                "data": {
                    "current": [
                        serializers.EnrollmentDiscountSerializer(ed).data
                        for ed in currents
                    ],
                    "discounts": selectable,
                }
            },
        )


class EnrollmentDiscountView(RBACView):
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {
        "GET": "payment.view_all",
        "POST": "payment.configure",
        "DELETE": "payment.configure",
    }

    def _get_user_course(self, user_course_id: int):
        return (
            UserCourse.objects.select_related("course", "course__payment_plan", "user")
            .filter(id=user_course_id, assigned_as=UserCourse.AssignedAs.STUDENT)
            .first()
        )

    def get(self, request, user_course_id: int):
        user_course = self._get_user_course(user_course_id)
        if not user_course:
            return self.send_response(
                True, "not_found", {"details": "Enrollment not found"}, status=404
            )
        from app_finance.discount_engine import get_active_enrollment_discounts

        eds = get_active_enrollment_discounts(user_course)
        return self.send_response(
            False,
            "success",
            {
                "data": [
                    serializers.EnrollmentDiscountSerializer(ed).data for ed in eds
                ]
            },
        )

    def post(self, request, user_course_id: int):
        actor = acting_user(request)
        if actor is None:
            return self.forbidden("Authentication required.")
        user_course = self._get_user_course(user_course_id)
        if not user_course:
            return self.send_response(
                True, "not_found", {"details": "Enrollment not found"}, status=404
            )
        if not user_course.course.payment_plan_id:
            return self.send_response(
                True,
                "validation_error",
                {"details": "Course has no payment plan"},
                status=400,
            )
        discount_id = request.data.get("discount_id")
        if not discount_id:
            return self.send_response(
                True,
                "validation_error",
                {"details": "discount_id is required"},
                status=400,
            )
        discount = models.Discount.objects.filter(
            id=discount_id, is_active=True
        ).first()
        if not discount:
            return self.send_response(
                True,
                "validation_error",
                {"details": "Discount not found or inactive"},
                status=400,
            )
        from app_finance.discount_engine import apply_enrollment_discount
        from datetime import date

        org = _get_current_org()
        as_of = None
        as_of_raw = request.data.get("as_of")
        if as_of_raw:
            try:
                as_of = date.fromisoformat(str(as_of_raw))
            except ValueError:
                return self.send_response(
                    True,
                    "validation_error",
                    {"details": "as_of must be YYYY-MM-DD"},
                    status=400,
                )
        try:
            ed = apply_enrollment_discount(
                user_course=user_course,
                discount=discount,
                applied_by=actor,
                org=org,
                reason=str(request.data.get("reason") or ""),
                as_of=as_of,
            )
        except ValueError as exc:
            return self.send_response(
                True, "validation_error", {"details": str(exc)}, status=400
            )
        return self.send_response(
            False,
            "success",
            {"data": serializers.EnrollmentDiscountSerializer(ed).data},
            status=201,
        )

    def delete(self, request, user_course_id: int):
        actor = acting_user(request)
        if actor is None:
            return self.forbidden("Authentication required.")
        user_course = self._get_user_course(user_course_id)
        if not user_course:
            return self.send_response(
                True, "not_found", {"details": "Enrollment not found"}, status=404
            )
        from app_finance.discount_engine import remove_enrollment_discount

        remove_enrollment_discount(user_course=user_course, removed_by=actor)
        return self.send_response(False, "success", {"data": None})


class EnrollmentDiscountDetailView(RBACView):
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"DELETE": "payment.configure"}

    def delete(self, request, user_course_id: int, enrollment_discount_id: int):
        actor = acting_user(request)
        if actor is None:
            return self.forbidden("Authentication required.")
        user_course = (
            UserCourse.objects.select_related("course", "course__payment_plan", "user")
            .filter(id=user_course_id, assigned_as=UserCourse.AssignedAs.STUDENT)
            .first()
        )
        if not user_course:
            return self.send_response(
                True, "not_found", {"details": "Enrollment not found"}, status=404
            )
        from app_finance.discount_engine import remove_enrollment_discount_by_id

        try:
            remove_enrollment_discount_by_id(
                user_course=user_course,
                enrollment_discount_id=enrollment_discount_id,
                removed_by=actor,
            )
        except LookupError:
            return self.send_response(
                True,
                "not_found",
                {"details": "Enrollment discount not found"},
                status=404,
            )
        return self.send_response(False, "success", {"data": None})


class EnrollmentDiscountPreviewView(RBACView):
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"GET": "payment.view_all"}

    def get(self, request, user_course_id: int):
        user_course = (
            UserCourse.objects.select_related("course", "course__payment_plan", "user")
            .filter(id=user_course_id, assigned_as=UserCourse.AssignedAs.STUDENT)
            .first()
        )
        if not user_course:
            return self.send_response(
                True, "not_found", {"details": "Enrollment not found"}, status=404
            )
        payment_plan = user_course.course.payment_plan
        if not payment_plan:
            return self.send_response(
                True,
                "validation_error",
                {"details": "Course has no payment plan"},
                status=400,
            )
        from app_finance.discount_engine import preview_invoiced_amounts

        org = _get_current_org()
        active_count = _student_active_course_count(user_course.user_id)
        periods = preview_invoiced_amounts(
            user_course=user_course,
            payment_plan=payment_plan,
            org=org,
            user_active_course_count=active_count,
            period_count=int(request.query_params.get("period_count", 3)),
        )
        return self.send_response(False, "success", {"data": {"periods": periods}})


def _collect_payment_adjustment_files(request: Request) -> list:
    files = []
    if hasattr(request.FILES, "getlist"):
        files.extend(request.FILES.getlist("images") or [])
        files.extend(request.FILES.getlist("files") or [])
    index = 0
    while True:
        key = f"image_{index}"
        if key not in request.FILES:
            break
        files.append(request.FILES[key])
        index += 1
    return files


class PaymentAdjustmentListCreateView(RBACView):
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"GET": "payment.view", "POST": "payment.refund"}

    def _get_payment(self, payment_id: int):
        return (
            models.UserPayment.objects.select_related("course")
            .filter(id=payment_id)
            .first()
        )

    def get(self, request: Request, obj_id: int):
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")

        payment = self._get_payment(obj_id)
        if payment is None:
            return self.send_not_found(obj_id)

        check_payment_object_read(user, payment)
        adjustments = (
            models.PaymentAdjustment.objects.filter(user_payment_id=payment.id)
            .select_related("created_by")
            .prefetch_related("images")
            .order_by("-occurred_at", "-id")
        )
        data = serializers.PaymentAdjustmentSerializer(adjustments, many=True).data
        return self.send_response(False, "ok", {"data": data}, status=status.HTTP_200_OK)

    def post(self, request: Request, obj_id: int):
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")

        payment = self._get_payment(obj_id)
        if payment is None:
            return self.send_not_found(obj_id)

        try:
            check_payment_record(user, payment.course_id)
        except PermissionDenied as e:
            return self.forbidden(str(e))

        kind = request.data.get("kind")
        if kind not in {
            models.PaymentAdjustment.Kind.REFUND,
            models.PaymentAdjustment.Kind.RE_TRANSFER,
        }:
            return self.send_response(
                True,
                "validation_error",
                {"errors": {"kind": "Must be refund or re_transfer."}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        amount_raw = request.data.get("amount")
        if amount_raw in (None, ""):
            return self.send_response(
                True,
                "validation_error",
                {"errors": {"amount": "Amount is required."}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            amount = Money(Decimal(str(amount_raw)), "USD")
        except (TypeError, ValueError, ArithmeticError):
            return self.send_response(
                True,
                "validation_error",
                {"errors": {"amount": "Invalid amount."}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        occurred_raw = request.data.get("occurred_at")
        if occurred_raw in (None, ""):
            return self.send_response(
                True,
                "validation_error",
                {"errors": {"occurred_at": "Date is required."}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        occurred_at = parse_datetime(str(occurred_raw))
        if occurred_at is None:
            return self.send_response(
                True,
                "validation_error",
                {"errors": {"occurred_at": "Invalid datetime."}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if timezone.is_naive(occurred_at):
            occurred_at = timezone.make_aware(occurred_at, timezone.get_current_timezone())

        files = _collect_payment_adjustment_files(request)
        if not files:
            return self.send_response(
                True,
                "validation_error",
                {"errors": {"images": "At least one image is required."}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        note = request.data.get("note")
        note = str(note).strip() if note not in (None, "") else None

        with transaction.atomic():
            adjustment = models.PaymentAdjustment.objects.create(
                user_payment=payment,
                kind=kind,
                amount=amount,
                occurred_at=occurred_at,
                note=note,
                created_by=user,
            )
            for uploaded in files:
                models.PaymentAdjustmentImage.objects.create(
                    adjustment=adjustment,
                    image=uploaded,
                    filename=uploaded.name or "unnamed",
                )

        adjustment = (
            models.PaymentAdjustment.objects.filter(id=adjustment.id)
            .select_related("created_by")
            .prefetch_related("images")
            .first()
        )
        data = serializers.PaymentAdjustmentSerializer(adjustment).data
        return self.send_response(
            False,
            "created",
            {"data": data},
            status=status.HTTP_201_CREATED,
        )


class PaymentAdjustmentDetailsView(RBACView):
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"DELETE": "payment.refund"}

    def delete(self, request: Request, obj_id: int):
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")

        adjustment = (
            models.PaymentAdjustment.objects.select_related(
                "user_payment", "user_payment__course"
            )
            .filter(id=obj_id)
            .first()
        )
        if adjustment is None:
            return self.send_not_found(obj_id)

        try:
            check_payment_record(user, adjustment.user_payment.course_id)
        except PermissionDenied as e:
            return self.forbidden(str(e))

        adjustment.delete()
        return self.send_response(
            False,
            "deleted",
            {"data": None},
            status=status.HTTP_200_OK,
        )


_HOMEPAGE_PERMS = frozenset(
    {
        "payment.view_all",
        "payment.view",
        "payment.record",
        "payment.view_unpaid",
        "payment.view_unpaid_all",
        "analytics.view",
    }
)


class FinanceHomepageView(RBACView):
    authentication_classes = [TenantBoundJWTStatelessAuthentication]

    def check_permissions(self, request):
        user = acting_user(request)
        if user is None:
            raise PermissionDenied("Authentication credentials were not provided.")
        held = set(effective_permissions(user))
        if not held.intersection(_HOMEPAGE_PERMS):
            raise PermissionDenied("You don't have permission to perform this action.")

    def post(self, request: Request):
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")

        program_id = request.data.get("program_id")
        if program_id in (None, ""):
            return self.send_response(
                True,
                "validation_error",
                {"details": "program_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        period = request.data.get("period") or "single_month"
        if period not in VALID_PERIODS:
            return self.send_response(
                True,
                "validation_error",
                {"details": f"period must be one of: {', '.join(sorted(VALID_PERIODS))}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        pie_group_by = request.data.get("pie_group_by") or "payment_status"
        if pie_group_by not in VALID_PIE_GROUP_BY:
            return self.send_response(
                True,
                "validation_error",
                {"details": "Invalid pie_group_by"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        intake_raw = request.data.get("intake_id")
        intake_id = int(intake_raw) if intake_raw not in (None, "") else None

        date_from = _parse_finance_homepage_date(request.data.get("date_from"))
        date_to = _parse_finance_homepage_date(request.data.get("date_to"))

        try:
            payload = build_finance_homepage_payload(
                program_id=int(program_id),
                intake_id=intake_id,
                period=period,
                date_from=date_from,
                date_to=date_to,
                pie_group_by=pie_group_by,
                user=user,
                org=request.tenant,
            )
        except ValueError as exc:
            msg = str(exc)
            status_code = (
                status.HTTP_404_NOT_FOUND
                if "not found" in msg.lower()
                else status.HTTP_400_BAD_REQUEST
            )
            return self.send_response(
                True,
                "validation_error" if status_code == 400 else "not_found",
                {"details": msg},
                status=status_code,
            )

        return self.send_response(False, "success", {"data": payload})


_FEE_LIFECYCLE_PERMS = frozenset({"payment.view_all", "analytics.view"})


class FeeLifecycleView(RBACView):
    authentication_classes = [TenantBoundJWTStatelessAuthentication]

    def check_permissions(self, request):
        user = acting_user(request)
        if user is None:
            raise PermissionDenied("Authentication credentials were not provided.")
        held = set(effective_permissions(user))
        if not held.intersection(_FEE_LIFECYCLE_PERMS):
            raise PermissionDenied("You don't have permission to perform this action.")

    def post(self, request: Request):
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        del user

        program_id = request.data.get("program_id")
        if program_id in (None, ""):
            return self.send_response(
                True,
                "validation_error",
                {"details": "program_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        period = request.data.get("period") or "single_month"
        if period not in VALID_PERIODS:
            return self.send_response(
                True,
                "validation_error",
                {"details": f"period must be one of: {', '.join(sorted(VALID_PERIODS))}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        breakdown = request.data.get("breakdown") or "none"
        if breakdown not in VALID_BREAKDOWNS:
            return self.send_response(
                True,
                "validation_error",
                {
                    "details": (
                        "breakdown must be one of: "
                        f"{', '.join(sorted(VALID_BREAKDOWNS))}"
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        intake_raw = request.data.get("intake_id")
        intake_id = int(intake_raw) if intake_raw not in (None, "") else None
        date_from = _parse_finance_homepage_date(request.data.get("date_from"))
        date_to = _parse_finance_homepage_date(request.data.get("date_to"))

        try:
            payload = build_fee_lifecycle_payload(
                program_id=int(program_id),
                intake_id=intake_id,
                period=period,
                date_from=date_from,
                date_to=date_to,
                breakdown=breakdown,
                org=request.tenant,
            )
        except ValueError as exc:
            msg = str(exc)
            status_code = (
                status.HTTP_404_NOT_FOUND
                if "not found" in msg.lower()
                else status.HTTP_400_BAD_REQUEST
            )
            return self.send_response(
                True,
                "validation_error" if status_code == 400 else "not_found",
                {"details": msg},
                status=status_code,
            )
        return self.send_response(False, "success", {"data": payload})


_FEE_LIFECYCLE_PERMS = frozenset({"payment.view_all", "analytics.view"})


class FeeLifecycleView(RBACView):
    authentication_classes = [TenantBoundJWTStatelessAuthentication]

    def check_permissions(self, request):
        user = acting_user(request)
        if user is None:
            raise PermissionDenied("Authentication credentials were not provided.")
        held = set(effective_permissions(user))
        if not held.intersection(_FEE_LIFECYCLE_PERMS):
            raise PermissionDenied("You don't have permission to perform this action.")

    def post(self, request: Request):
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        del user

        program_id = request.data.get("program_id")
        if program_id in (None, ""):
            return self.send_response(
                True,
                "validation_error",
                {"details": "program_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        period = request.data.get("period") or "single_month"
        if period not in VALID_PERIODS:
            return self.send_response(
                True,
                "validation_error",
                {"details": f"period must be one of: {', '.join(sorted(VALID_PERIODS))}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        breakdown = request.data.get("breakdown") or "none"
        if breakdown not in VALID_BREAKDOWNS:
            return self.send_response(
                True,
                "validation_error",
                {
                    "details": (
                        "breakdown must be one of: "
                        f"{', '.join(sorted(VALID_BREAKDOWNS))}"
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        intake_raw = request.data.get("intake_id")
        intake_id = int(intake_raw) if intake_raw not in (None, "") else None
        date_from = _parse_finance_homepage_date(request.data.get("date_from"))
        date_to = _parse_finance_homepage_date(request.data.get("date_to"))

        try:
            payload = build_fee_lifecycle_payload(
                program_id=int(program_id),
                intake_id=intake_id,
                period=period,
                date_from=date_from,
                date_to=date_to,
                breakdown=breakdown,
                org=request.tenant,
            )
        except ValueError as exc:
            msg = str(exc)
            status_code = (
                status.HTTP_404_NOT_FOUND
                if "not found" in msg.lower()
                else status.HTTP_400_BAD_REQUEST
            )
            return self.send_response(
                True,
                "validation_error" if status_code == 400 else "not_found",
                {"details": msg},
                status=status_code,
            )
        return self.send_response(False, "success", {"data": payload})


_FEE_LIFECYCLE_PERMS = frozenset({"payment.view_all", "analytics.view"})


class FeeLifecycleView(RBACView):
    authentication_classes = [TenantBoundJWTStatelessAuthentication]

    def check_permissions(self, request):
        user = acting_user(request)
        if user is None:
            raise PermissionDenied("Authentication credentials were not provided.")
        held = set(effective_permissions(user))
        if not held.intersection(_FEE_LIFECYCLE_PERMS):
            raise PermissionDenied("You don't have permission to perform this action.")

    def post(self, request: Request):
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        del user

        program_id = request.data.get("program_id")
        if program_id in (None, ""):
            return self.send_response(
                True,
                "validation_error",
                {"details": "program_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        period = request.data.get("period") or "single_month"
        if period not in VALID_PERIODS:
            return self.send_response(
                True,
                "validation_error",
                {"details": f"period must be one of: {', '.join(sorted(VALID_PERIODS))}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        breakdown = request.data.get("breakdown") or "none"
        if breakdown not in VALID_BREAKDOWNS:
            return self.send_response(
                True,
                "validation_error",
                {
                    "details": (
                        "breakdown must be one of: "
                        f"{', '.join(sorted(VALID_BREAKDOWNS))}"
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        intake_raw = request.data.get("intake_id")
        intake_id = int(intake_raw) if intake_raw not in (None, "") else None
        date_from = _parse_finance_homepage_date(request.data.get("date_from"))
        date_to = _parse_finance_homepage_date(request.data.get("date_to"))

        try:
            payload = build_fee_lifecycle_payload(
                program_id=int(program_id),
                intake_id=intake_id,
                period=period,
                date_from=date_from,
                date_to=date_to,
                breakdown=breakdown,
                org=request.tenant,
            )
        except ValueError as exc:
            msg = str(exc)
            status_code = (
                status.HTTP_404_NOT_FOUND
                if "not found" in msg.lower()
                else status.HTTP_400_BAD_REQUEST
            )
            return self.send_response(
                True,
                "validation_error" if status_code == 400 else "not_found",
                {"details": msg},
                status=status_code,
            )
        return self.send_response(False, "success", {"data": payload})


def _parse_finance_homepage_date(value) -> date | None:
    if value in (None, ""):
        return None
    if isinstance(value, date):
        return value
    text = str(value)
    try:
        return date.fromisoformat(text[:10])
    except ValueError:
        return None
