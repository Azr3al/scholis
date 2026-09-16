from __future__ import annotations

from datetime import date, datetime

from django.utils.dateparse import parse_date
from rest_framework import status

from app_consultation.availability import (
    ConsultationAvailabilityError,
    get_dates_with_slots,
    get_open_slots,
)
from app_consultation.booking_service import (
    BookingConflictError,
    BookingNotPendingError,
    BookingServiceError,
    approve_booking,
    cancel_booking,
    cancel_booking_by_token,
    create_booking,
    ensure_booking_manage_link,
    get_booking_by_token,
    parse_scheduled_at,
)
from app_consultation.consultant_helpers import (
    build_booking_manage_url,
    build_booking_url,
    compute_readiness,
    get_google_calendar_connection,
    ensure_consultation_booking_slug,
    get_consultant_from_request,
    get_organization_for_current_schema,
    resolve_bookable_consultant_by_slug,
    resolve_consultant_by_slug,
    rotate_consultation_booking_slug,
)
from app_consultation.booking_fields import (
    BookingDetailsValidationError,
    grouped_subject_options_for_strategy,
    parse_booking_details,
)
from app_consultation.models import ConsultationBooking, ConsultationWeeklyWhitelist
from app_consultation.presets import apply_lwtp_preset
from app_consultation.serializers import (
    ConsultationBookingSerializer,
    ConsultationWeeklyWhitelistSerializer,
)
from app_consultation.constants import SLOT_DURATION_MINUTES
from app_organization.models import Organization
from app_rbac.views import RBACPermission, RBACView
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication

_AUTH = [TenantBoundJWTStatelessAuthentication]


def _org_timezone_name() -> str:
    org = get_organization_for_current_schema()
    return getattr(org, "timezone", None) or "UTC"


def _parse_month_param(raw: str | None) -> date | None:
    if not raw:
        return None
    raw = raw.strip()
    if len(raw) == 7 and raw[4] == "-":
        try:
            year, month = raw.split("-", 1)
            return date(int(year), int(month), 1)
        except ValueError:
            return None
    parsed = parse_date(raw)
    if parsed is None:
        return None
    return date(parsed.year, parsed.month, 1)


def _parse_date_param(raw: str | None) -> date | None:
    if not raw:
        return None
    return parse_date(raw.strip())


def _serialize_slot(slot: dict) -> dict:
    scheduled_at = slot["scheduled_at"]
    if isinstance(scheduled_at, datetime):
        scheduled_at = scheduled_at.isoformat().replace("+00:00", "Z")
    return {
        "slot_time": slot["slot_time"],
        "scheduled_at": scheduled_at,
    }


def _org_consultation_strategy() -> str:
    org = get_organization_for_current_schema()
    if org is None:
        return Organization.ConsultationStrategy.LWTP
    return org.consultation_strategy or Organization.ConsultationStrategy.LWTP


class ConsultationPublicConfigView(RBACView):
    authentication_classes = []
    permission_classes = [RBACPermission]
    rbac_decision = "public"

    def get(self, request, slug: str):
        consultant = resolve_bookable_consultant_by_slug(slug)
        if consultant is None:
            return self.not_found("Consultant not found.")
        return self.ok(
            {
                "name": consultant.name,
                "timezone": _org_timezone_name(),
                "slot_duration_minutes": SLOT_DURATION_MINUTES,
                "consultation_strategy": _org_consultation_strategy(),
            }
        )


class ConsultationPublicBookingOptionsView(RBACView):
    authentication_classes = []
    permission_classes = [RBACPermission]
    rbac_decision = "public"

    def get(self, request, slug: str):
        consultant = resolve_bookable_consultant_by_slug(slug)
        if consultant is None:
            return self.not_found("Consultant not found.")

        strategy = _org_consultation_strategy()
        if strategy != Organization.ConsultationStrategy.LWTP:
            return self.ok(
                {
                    "consultation_strategy": strategy,
                    "exam_boards": [],
                    "subjects_by_board": {},
                }
            )

        from app_consultation.strategies.lwtp import EXAM_BOARDS

        return self.ok(
            {
                "consultation_strategy": strategy,
                "exam_boards": list(EXAM_BOARDS),
                "subjects_by_board": grouped_subject_options_for_strategy(strategy),
            }
        )


class ConsultationPublicAvailabilityDatesView(RBACView):
    authentication_classes = []
    permission_classes = [RBACPermission]
    rbac_decision = "public"

    def get(self, request, slug: str):
        consultant = resolve_bookable_consultant_by_slug(slug)
        if consultant is None:
            return self.not_found("Consultant not found.")

        month = _parse_month_param(request.query_params.get("month"))
        if month is None:
            return self.bad_request("month query parameter is required (YYYY-MM).")

        try:
            dates = get_dates_with_slots(consultant, month, _org_timezone_name())
        except ConsultationAvailabilityError as exc:
            return self.send_response(
                True,
                "availability_unavailable",
                {"details": str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return self.ok({"dates": [d.isoformat() for d in dates]})


class ConsultationPublicAvailabilityView(RBACView):
    authentication_classes = []
    permission_classes = [RBACPermission]
    rbac_decision = "public"

    def get(self, request, slug: str):
        consultant = resolve_bookable_consultant_by_slug(slug)
        if consultant is None:
            return self.not_found("Consultant not found.")

        target_date = _parse_date_param(request.query_params.get("date"))
        if target_date is None:
            return self.bad_request("date query parameter is required (YYYY-MM-DD).")

        try:
            slots = get_open_slots(consultant, target_date, _org_timezone_name())
        except ConsultationAvailabilityError as exc:
            return self.send_response(
                True,
                "availability_unavailable",
                {"details": str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return self.ok({"slots": [_serialize_slot(slot) for slot in slots]})


class ConsultationPublicBookingCreateView(RBACView):
    authentication_classes = []
    permission_classes = [RBACPermission]
    rbac_decision = "public"

    def post(self, request, slug: str):
        consultant = resolve_bookable_consultant_by_slug(slug)
        if consultant is None:
            return self.not_found("Consultant not found.")

        data = request.data or {}
        scheduled_at_raw = data.get("scheduled_at")
        student_name = (data.get("student_name") or "").strip()
        student_email = (data.get("student_email") or "").strip()

        if not scheduled_at_raw:
            return self.bad_request("scheduled_at is required.")
        if not student_name:
            return self.bad_request("student_name is required.")
        if not student_email:
            return self.bad_request("student_email is required.")

        try:
            scheduled_at = parse_scheduled_at(str(scheduled_at_raw))
        except ValueError as exc:
            return self.bad_request(str(exc))

        strategy = _org_consultation_strategy()
        raw_details = data.get("details")
        if raw_details is None:
            raw_details = {}
        if not isinstance(raw_details, dict):
            return self.bad_request("details must be an object.")

        try:
            details = parse_booking_details(raw_details, strategy=strategy)
        except BookingDetailsValidationError as exc:
            return self.bad_request(str(exc))

        try:
            booking, cancel_token = create_booking(
                consultant,
                scheduled_at=scheduled_at,
                student_name=student_name,
                student_email=student_email,
                details=details,
            )
        except BookingConflictError as exc:
            return self.send_response(
                True,
                "slot_unavailable",
                {"details": str(exc)},
                status=status.HTTP_409_CONFLICT,
            )
        except BookingServiceError as exc:
            return self.send_response(
                True,
                "booking_failed",
                {"details": str(exc)},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return self.created(
            {
                "id": booking.id,
                "status": booking.status,
                "meeting_link": booking.meeting_link or "",
                "booking_url": build_booking_manage_url(cancel_token),
                "scheduled_at": booking.scheduled_at.isoformat().replace("+00:00", "Z"),
            }
        )


class ConsultationPublicBookingByTokenView(RBACView):
    authentication_classes = []
    permission_classes = [RBACPermission]
    rbac_decision = "public"

    def get(self, request):
        token = (request.query_params.get("token") or "").strip()
        if not token:
            return self.bad_request("token query parameter is required.")

        booking = get_booking_by_token(token)
        if booking is None:
            return self.not_found("Booking not found.")

        can_cancel = booking.status in (
            ConsultationBooking.Status.PENDING,
            ConsultationBooking.Status.CONFIRMED,
        )
        return self.ok(
            {
                "status": booking.status,
                "scheduled_at": booking.scheduled_at.isoformat().replace("+00:00", "Z"),
                "meeting_link": booking.meeting_link or "",
                "consultant_name": booking.consultant.name,
                "student_name": booking.student_name,
                "student_email": booking.student_email,
                "details": booking.details or {},
                "can_cancel": can_cancel,
            }
        )


class ConsultationPublicCancelView(RBACView):
    authentication_classes = []
    permission_classes = [RBACPermission]
    rbac_decision = "public"

    def post(self, request):
        cancel_token = (request.data or {}).get("cancel_token")
        if not cancel_token:
            return self.bad_request("cancel_token is required.")

        booking = cancel_booking_by_token(str(cancel_token))
        if booking is None:
            return self.not_found("Booking not found.")

        return self.ok(
            {
                "id": booking.id,
                "status": booking.status,
                "cancelled_at": booking.cancelled_at.isoformat().replace("+00:00", "Z")
                if booking.cancelled_at
                else None,
            }
        )


class ConsultationMeBookingLinkView(RBACView):
    authentication_classes = _AUTH
    required_permissions = {"GET": "consultation.view"}

    def get(self, request):
        consultant = get_consultant_from_request(request)
        if consultant is None:
            return self.forbidden("Consultant role required.")

        ensure_consultation_booking_slug(consultant)
        consultant.refresh_from_db(fields=["consultation_booking_slug"])
        slug = consultant.consultation_booking_slug or ""
        readiness = compute_readiness(consultant)
        return self.ok(
            {
                "url": build_booking_url(slug) if slug else "",
                "slug": slug,
                "readiness": readiness,
                "google_calendar": get_google_calendar_connection(consultant),
            }
        )


class ConsultationMeBookingLinkRotateView(RBACView):
    authentication_classes = _AUTH
    required_permissions = {"POST": "consultation.view"}

    def post(self, request):
        consultant = get_consultant_from_request(request)
        if consultant is None:
            return self.forbidden("Consultant role required.")

        slug = rotate_consultation_booking_slug(consultant)
        readiness = compute_readiness(consultant)
        return self.ok(
            {
                "url": build_booking_url(slug),
                "slug": slug,
                "readiness": readiness,
                "google_calendar": get_google_calendar_connection(consultant),
            }
        )


class ConsultationMeWhitelistView(RBACView):
    authentication_classes = _AUTH
    required_permissions = {
        "GET": "consultation.manage_schedule",
        "PATCH": "consultation.manage_schedule",
    }

    def get(self, request):
        consultant = get_consultant_from_request(request)
        if consultant is None:
            return self.forbidden("Consultant role required.")

        whitelist, _created = ConsultationWeeklyWhitelist.objects.get_or_create(
            consultant=consultant,
            defaults={"schedule": {}},
        )
        return self.ok(ConsultationWeeklyWhitelistSerializer(whitelist).data)

    def patch(self, request):
        consultant = get_consultant_from_request(request)
        if consultant is None:
            return self.forbidden("Consultant role required.")

        whitelist, _created = ConsultationWeeklyWhitelist.objects.get_or_create(
            consultant=consultant,
            defaults={"schedule": {}},
        )
        serializer = ConsultationWeeklyWhitelistSerializer(
            whitelist,
            data=request.data,
            partial=True,
        )
        if not serializer.is_valid():
            return self.validation_error(serializer.errors)
        serializer.save()
        return self.updated(serializer.data)


class ConsultationMeWhitelistApplyPresetView(RBACView):
    authentication_classes = _AUTH
    required_permissions = {"POST": "consultation.manage_schedule"}

    def post(self, request):
        consultant = get_consultant_from_request(request)
        if consultant is None:
            return self.forbidden("Consultant role required.")

        whitelist = apply_lwtp_preset(consultant)
        return self.ok(ConsultationWeeklyWhitelistSerializer(whitelist).data)


class ConsultationMeBookingsView(RBACView):
    authentication_classes = _AUTH
    required_permissions = {"GET": "consultation.view"}

    def get(self, request):
        consultant = get_consultant_from_request(request)
        if consultant is None:
            return self.forbidden("Consultant role required.")

        status_filter = (request.query_params.get("status") or "confirmed").strip()
        queryset = ConsultationBooking.objects.filter(consultant=consultant).order_by(
            "scheduled_at"
        )
        if status_filter and status_filter.lower() != "all":
            queryset = queryset.filter(status=status_filter)

        return self.ok(ConsultationBookingSerializer(queryset, many=True).data)


class ConsultationBookingCancelView(RBACView):
    authentication_classes = _AUTH
    required_permissions = {"POST": "consultation.update"}

    def post(self, request, booking_id: int):
        consultant = get_consultant_from_request(request)
        if consultant is None:
            return self.forbidden("Consultant role required.")

        booking = ConsultationBooking.objects.filter(pk=booking_id).first()
        if booking is None:
            return self.not_found("Booking not found.")
        if booking.consultant_id != consultant.id:
            return self.forbidden("Not allowed for this booking.")

        booking = cancel_booking(
            booking,
            cancelled_by=ConsultationBooking.CancelledBy.CONSULTANT,
        )
        return self.ok(ConsultationBookingSerializer(booking).data)


class ConsultationBookingApproveView(RBACView):
    authentication_classes = _AUTH
    required_permissions = {"POST": "consultation.update"}

    def post(self, request, booking_id: int):
        consultant = get_consultant_from_request(request)
        if consultant is None:
            return self.forbidden("Consultant role required.")

        booking = ConsultationBooking.objects.filter(pk=booking_id).first()
        if booking is None:
            return self.not_found("Booking not found.")
        if booking.consultant_id != consultant.id:
            return self.forbidden("Not allowed for this booking.")

        try:
            booking = approve_booking(booking)
        except BookingNotPendingError as exc:
            return self.send_response(
                True,
                "invalid_status",
                {"details": str(exc)},
                status=status.HTTP_409_CONFLICT,
            )
        except BookingServiceError as exc:
            return self.send_response(
                True,
                "approval_failed",
                {"details": str(exc)},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return self.ok(ConsultationBookingSerializer(booking).data)


class ConsultationBookingManageLinkView(RBACView):
    authentication_classes = _AUTH
    required_permissions = {"POST": "consultation.view"}

    def post(self, request, booking_id: int):
        consultant = get_consultant_from_request(request)
        if consultant is None:
            return self.forbidden("Consultant role required.")

        booking = ConsultationBooking.objects.filter(pk=booking_id).first()
        if booking is None:
            return self.not_found("Booking not found.")
        if booking.consultant_id != consultant.id:
            return self.forbidden("Not allowed for this booking.")
        if booking.status == ConsultationBooking.Status.CANCELLED:
            return self.bad_request("Cancelled bookings do not have a student link.")

        booking_url = ensure_booking_manage_link(booking)
        return self.ok({"booking_url": booking_url})
