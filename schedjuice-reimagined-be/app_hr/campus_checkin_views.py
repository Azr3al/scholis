from datetime import date
from decimal import Decimal, InvalidOperation
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.db import transaction
from django.utils import timezone
from rest_framework.views import Request

from app_course.course_scoping import acting_user
from app_course.models import Campus
from app_hr.campus_checkin_verification import VerificationOutcome, resolve_verification
from app_hr.models import BuildingCheckin
from app_rbac.views import RBACView


def _tenant_local_today(tenant) -> date:
    tz_name = (getattr(tenant, "timezone", "UTC") or "UTC").strip() or "UTC"
    try:
        tenant_tz = ZoneInfo(tz_name)
    except ZoneInfoNotFoundError:
        tenant_tz = ZoneInfo("UTC")
    return timezone.now().astimezone(tenant_tz).date()


def _parse_decimal(value):
    if value in (None, ""):
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return None


def _error_message_for_outcome(outcome: VerificationOutcome):
    mapping = {
        VerificationOutcome.REQUIRE_SELFIE: "image_required",
        VerificationOutcome.REJECT_OUTSIDE_GEOFENCE: "outside_geofence",
        VerificationOutcome.REJECT_LOCATION_REQUIRED: "location_required",
        VerificationOutcome.REJECT_CAMPUS_NOT_CONFIGURED: "campus_not_configured",
    }
    return mapping.get(outcome)


def _verification_method_from_result(result_method: str | None):
    if result_method == "selfie":
        return BuildingCheckin.VerificationMethod.SELFIE
    return BuildingCheckin.VerificationMethod.GEO


class _CampusCheckinBaseView(RBACView):
    def _guard(self, request: Request):
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required."), None
        if not user.is_teacher():
            return self.forbidden("Teacher role required."), None
        tenant = request.tenant
        if not getattr(tenant, "is_building_checkin_enabled", False):
            return (
                self.send_response(
                    True,
                    "campus_checkin_disabled",
                    {"details": "Campus check-in is disabled."},
                    status=403,
                ),
                None,
            )
        return None, user

    @staticmethod
    def _extract_coords(request: Request):
        lat_raw = request.data.get("lat", request.data.get("latitude"))
        lng_raw = request.data.get("lng", request.data.get("longitude"))
        return _parse_decimal(lat_raw), _parse_decimal(lng_raw)

    @staticmethod
    def _serialize_record(record: BuildingCheckin):
        if not record:
            return None
        return {
            "id": record.id,
            "campus_id": record.campus_id,
            "date": record.date.isoformat(),
            "actual_checkin_time": record.actual_checkin_time,
            "actual_checkout_time": record.actual_checkout_time,
            "checkin_verification_method": record.checkin_verification_method,
            "checkout_verification_method": record.checkout_verification_method,
        }


class CampusCheckinStatusView(_CampusCheckinBaseView):
    required_permissions = {"GET": "attendance.mark"}

    def get(self, request: Request):
        guard_response, user = self._guard(request)
        if guard_response:
            return guard_response

        local_today = _tenant_local_today(request.tenant)
        today_record = (
            BuildingCheckin.objects.filter(user=user, date=local_today)
            .select_related("campus")
            .first()
        )
        has_checked_in = bool(today_record and today_record.actual_checkin_time)
        has_checked_out = bool(today_record and today_record.actual_checkout_time)
        campuses = Campus.objects.filter(is_online=False).order_by("id")
        return self.send_response(
            False,
            "success",
            {
                "data": {
                    "has_checked_in": has_checked_in,
                    "has_checked_out": has_checked_out,
                    "can_check_in": not has_checked_in,
                    "can_check_out": has_checked_in and not has_checked_out,
                    "verification_mode": request.tenant.campus_checkin_verification_mode,
                    "campuses": [
                        {
                            "id": campus.id,
                            "name": campus.name,
                            "has_geofence": campus.has_geofence,
                        }
                        for campus in campuses
                    ],
                    "today_record": self._serialize_record(today_record),
                }
            },
            status=200,
        )


class CampusCheckinView(_CampusCheckinBaseView):
    required_permissions = {"POST": "attendance.mark", "PUT": "attendance.mark"}

    def post(self, request: Request):
        guard_response, user = self._guard(request)
        if guard_response:
            return guard_response

        campus_raw = request.data.get("campus_id")
        try:
            campus_id = int(campus_raw)
        except (TypeError, ValueError):
            return self.send_response(True, "invalid_campus", {"details": "Invalid campus_id."}, status=400)

        campus = Campus.objects.filter(id=campus_id, is_online=False).first()
        if not campus:
            return self.send_response(True, "invalid_campus", {"details": "Invalid campus_id."}, status=400)

        local_today = _tenant_local_today(request.tenant)
        existing = BuildingCheckin.objects.filter(user=user, date=local_today).first()
        if existing and existing.actual_checkin_time:
            return self.send_response(
                True,
                "already_checked_in",
                {"details": "You have already checked in today."},
                status=400,
            )

        lat, lng = self._extract_coords(request)
        checkin_image = request.data.get("checkin_image")
        verification = resolve_verification(
            mode=request.tenant.campus_checkin_verification_mode,
            campus_lat=campus.latitude,
            campus_lng=campus.longitude,
            radius_meters=campus.geofence_radius_meters,
            client_lat=lat,
            client_lng=lng,
            has_image=bool(checkin_image),
        )
        error_message = _error_message_for_outcome(verification.result)
        if error_message:
            return self.send_response(True, error_message, {"details": error_message}, status=400)

        with transaction.atomic():
            row, _ = BuildingCheckin.objects.get_or_create(
                user=user,
                date=local_today,
                defaults={"campus": campus},
            )
            row.campus = campus
            row.actual_checkin_time = timezone.now()
            row.checkin_latitude = lat
            row.checkin_longitude = lng
            row.checkin_verification_method = _verification_method_from_result(verification.method)
            if checkin_image:
                row.checkin_image = checkin_image
            row.save()

        return self.send_response(
            False,
            "checked_in",
            {"data": self._serialize_record(row)},
            status=200,
        )

    def put(self, request: Request):
        guard_response, user = self._guard(request)
        if guard_response:
            return guard_response

        local_today = _tenant_local_today(request.tenant)
        row = (
            BuildingCheckin.objects.filter(user=user, date=local_today)
            .select_related("campus")
            .first()
        )
        if not row or not row.actual_checkin_time:
            return self.send_response(
                True,
                "not_checked_in",
                {"details": "You have not checked in today."},
                status=400,
            )
        if row.actual_checkout_time:
            return self.send_response(
                True,
                "already_checked_out",
                {"details": "You have already checked out today."},
                status=400,
            )
        if not row.campus_id or row.campus.is_online:
            return self.send_response(True, "invalid_campus", {"details": "Invalid campus_id."}, status=400)

        lat, lng = self._extract_coords(request)
        checkout_image = request.data.get("checkout_image")
        verification = resolve_verification(
            mode=request.tenant.campus_checkin_verification_mode,
            campus_lat=row.campus.latitude,
            campus_lng=row.campus.longitude,
            radius_meters=row.campus.geofence_radius_meters,
            client_lat=lat,
            client_lng=lng,
            has_image=bool(checkout_image),
        )
        error_message = _error_message_for_outcome(verification.result)
        if error_message:
            return self.send_response(True, error_message, {"details": error_message}, status=400)

        row.actual_checkout_time = timezone.now()
        row.checkout_latitude = lat
        row.checkout_longitude = lng
        row.checkout_verification_method = _verification_method_from_result(verification.method)
        if checkout_image:
            row.checkout_image = checkout_image
        row.save()

        return self.send_response(
            False,
            "checked_out",
            {"data": self._serialize_record(row)},
            status=200,
        )
