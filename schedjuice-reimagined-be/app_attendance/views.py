from datetime import datetime, date, timedelta, time as datetime_time
from django.utils import timezone
from django.db import transaction
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.db.models import Q
from rest_framework.views import Request
from rest_framework.exceptions import PermissionDenied, ValidationError

from app_course.rate_utils import (
    get_hourly_rate_for_teacher_course,
    get_per_hour_price_snapshot_for_course,
    is_session_based_payroll,
)
from app_attendance import models, serializers
from app_attendance.checkin_policy import (
    _tenant_tz,
    format_checkin_blocked_message,
    get_checkin_window,
    is_stale_open_session,
    resolve_checkout_time,
    select_next_checkin_user_event,
)
from app_course.event_overlap import event_local_date
from app_attendance.payroll_snapshots import (
    PayrollRateMissingError,
    _event_bounds_utc,
    payroll_rate_missing_message,
)
from app_attendance.userevent_sync import ensure_teacher_userevents_for_events
from app_attendance.userevent_lifecycle import soft_delete_userevents
from app_attendance.attendance_scoping import (
    acting_user,
    check_course_attendance_access,
    check_userevent_read,
    check_userevent_write,
    filter_monthly_report_for_user,
    require_teacher_checkin_history_correction_enabled,
    scope_userevents_for_user,
    teacher_can_bootstrap_checkin_history,
    user_can_read_monthly_attendance,
    user_can_access_course_attendance,
    user_needs_own_attendance_scope,
)
from app_attendance.self_correction import (
    apply_self_checkin_correction,
    can_view_attendance_corrections,
)
from app_attendance.cancel_checkin import cancel_open_checkin
from app_attendance.attendance_summary import (
    build_course_attendance_summary,
    build_monthly_attendance_matrix,
    list_course_students_for_attendance,
)
from app_attendance.marking_services import build_marking_roster
from app_attendance.removed_students import parse_include_removed_students
from app_auth.models import User
from app_course.course_status import compute_effective_status
from app_course.models import Event, Course, UserCourse
from app_course.course_search_queryset import build_event_queryset_with_optimized_course
from app_rbac import scoping
from app_rbac.resolution import effective_permissions
from app_rbac.views import RBACDetailsView, RBACListView, RBACSearchView, RBACView
from utilitas.queryset_mixins import ExpandPrefetchSpec, OptimizedSearchMixin
from django.http import HttpResponse
import csv

from app_attendance.god_view_services import (
    COURSE_MARKING_GAP_CSV_HEADERS,
    DAILY_ABSENCE_CSV_HEADERS,
    MONTHLY_STUDENT_CSV_HEADERS,
    SUMMARY_CSV_HEADERS,
    build_course_marking_gap_detail,
    build_course_marking_gap_rows,
    build_daily_absence_rows,
    build_god_view_detail,
    build_god_view_rows,
    build_monthly_student_detail,
    build_monthly_student_rows,
    hydrate_god_view_rows,
    god_view_course_marking_gap_detail_csv_response,
    god_view_csv_response,
    god_view_detail_csv_response,
    god_view_summary_csv_response,
    god_view_date_range_filename_suffix,
    paginate_rows,
    parse_god_view_filters,
    _parse_problem_status,
)


class CheckinStatus:
    NOT_CHECKED_IN = "not_checked_in"
    CHECKED_IN = "checked_in"
    CHECKED_OUT = "checked_out"
    NOT_TEACHER = "not_teacher"


def _session_checkin_allowed(user, tenant) -> tuple[bool, str]:
    if tenant is None:
        return True, ""
    if user.is_teacher() and tenant.use_teacher_session_checkin:
        return True, ""
    if user.is_student() and tenant.use_student_checkin:
        return True, ""
    if user.is_teacher() and not tenant.use_teacher_session_checkin:
        return False, "session_checkin_disabled"
    return False, "session_checkin_not_allowed"


def _get_event_end_utc(event, tenant):
    """Return event end datetime in UTC for comparison with timezone.now()."""
    tz_obj = _tenant_tz(tenant)
    date_part = event_local_date(event, tz_obj)
    end_naive = datetime.combine(date_part, event.time_to)
    if event.time_to <= event.time_from:
        end_naive += timedelta(days=1)
    local = end_naive.replace(tzinfo=tz_obj)
    return local.astimezone(timezone.utc)


class AttendanceListView(RBACListView):
    name = "Attendance list view"
    model = models.UserEvent
    serializer = serializers.UserEventSerializer
    required_permissions = {"GET": "attendance.mark", "PUT": "attendance.mark"}

    def get(self, request: Request, filter_ids=None):
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        held = set(effective_permissions(user))
        if scoping.has_read_breadth("attendance", held):
            return super().get(request, filter_ids)
        ids = list(scope_userevents_for_user(user).values_list("id", flat=True))
        return super().get(request, ids)

    def put(self, request: Request):
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        attendances = models.UserEvent.objects.filter(
            id__in=[i["id"] for i in request.data]
        ).select_related("event")
        attendance_by_id = {a.id: a for a in attendances}
        serialized_data = []
        errors = []
        for i in request.data:
            a = attendance_by_id.get(i["id"])
            if a:
                try:
                    check_userevent_write(user, a)
                except PermissionDenied:
                    return self.forbidden("Not allowed for one or more attendance records.")
                s = serializers.AttendanceBulkUpdateSerializer(i, data=i, partial=True)
                if s.is_valid():
                    serialized_data.append({"id": i["id"], **s.validated_data})
                else:
                    errors.append(s.errors)

        if len(errors) > 0:
            return self.send_response(
                True, "bad_request", {"details": errors}, status=400
            )

        update_fields: set[str] = set()
        for row in request.data:
            if "attendance_status" in row:
                update_fields.add("attendance_status")
            if "attendance_note" in row:
                update_fields.add("attendance_note")
            if "checkin_time" in row:
                update_fields.add("checkin_time")
            if "checkout_time" in row:
                update_fields.add("checkout_time")

        if not update_fields:
            return self.send_response(
                False,
                "bulk-updated",
                {"data": serialized_data},
                status=200,
            )

        instances = []
        for row in serialized_data:
            instance_data: dict = {"id": row["id"]}
            for field in update_fields:
                if field in row:
                    instance_data[field] = row[field]
            instances.append(models.UserEvent(**instance_data))

        models.UserEvent.objects.bulk_update(instances, sorted(update_fields))

        cashflow_fields = {
            "checkin_time",
            "checkout_time",
            "hourly_rate_at_calculation",
            "student_count_in_course_at_calculation",
            "per_hour_price_at_calculation",
            "student_bonus_rate_at_calculation",
        }
        if update_fields & cashflow_fields:
            try:
                from app_hr.school_overview_invalidation import (
                    invalidate_school_overview_for_user_event_ids,
                )

                invalidate_school_overview_for_user_event_ids(
                    [row["id"] for row in serialized_data]
                )
            except Exception:
                pass

        return self.send_response(
            False,
            "bulk-updated",
            {"data": serialized_data},
            status=200,
        )


class AttendanceDetailsView(RBACDetailsView):
    name = "Attendance details view"
    model = models.UserEvent
    serializer = serializers.UserEventSerializer
    required_permissions = {
        "GET": "attendance.mark",
        "PUT": "attendance.mark",
        "PATCH": "attendance.mark",
        "DELETE": "attendance.mark",
    }

    def get(self, request: Request, obj_id: int):
        self.request = request
        obj = self.get_object(
            obj_id, self.translate_expand_params(self.get_query_params(request).get("expand", []))
        )
        if obj is None:
            return self.send_not_found(obj_id)
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        try:
            check_userevent_read(user, obj)
        except PermissionDenied:
            return self.forbidden("Not allowed for this attendance record.")
        query_params = self.get_query_params(request)
        query_params.pop("sorts")
        serialized_data = self.get_serializer(obj, **query_params)
        return self.ok(serialized_data.data)

    def put(self, request: Request, obj_id: int):
        self.request = request
        obj = self.get_object(obj_id)
        if obj is None:
            return self.send_not_found(obj_id)
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        try:
            check_userevent_write(user, obj)
        except PermissionDenied:
            return self.forbidden("Not allowed for this attendance record.")
        serialized_data = self.get_serializer(obj, data=request.data, partial=True)
        serialized_data.is_valid(raise_exception=True)
        serialized_data.save()
        return self.updated(serialized_data.data)

    def delete(self, request: Request, obj_id: int):
        self.request = request
        obj = self.get_object(obj_id)
        if obj is None:
            return self.send_not_found(obj_id)
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        try:
            check_userevent_write(user, obj)
        except PermissionDenied:
            return self.forbidden("Not allowed for this attendance record.")
        if obj.checkin_time is not None:
            return self.send_response(
                True,
                "bad_request",
                {
                    "details": {
                        "message": (
                            "Cannot delete a check-in record. "
                            "Clear check-in times first or contact support."
                        ),
                    }
                },
                status=400,
            )
        serialized_data = self.get_serializer(obj)
        response_payload = serialized_data.data
        soft_delete_userevents(models.UserEvent.objects.filter(pk=obj.pk))
        return self.deleted(response_payload)


class AttendanceSearchView(OptimizedSearchMixin, RBACSearchView):
    name = "Attendance search view"
    model = models.UserEvent
    serializer = serializers.UserEventSerializer
    required_permissions = {"POST": "attendance.mark"}
    base_select_related = ("user",)
    expand_prefetch_specs = [
        ExpandPrefetchSpec(
            trigger_expand="event__course",
            replace_lookup="event",
            queryset_factory=build_event_queryset_with_optimized_course,
        ),
    ]

    def post(self, request: Request, filter_ids=None):
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        held = set(effective_permissions(user))
        if scoping.has_read_breadth("attendance", held):
            return super().post(request, filter_ids)
        ids = list(scope_userevents_for_user(user).values_list("id", flat=True))
        return super().post(request, ids)


# The frontend client will use this view to get attendances. Not RESTful, but, fast and easy.
class AttendanceByEvent(RBACView):
    model = models.UserEvent
    serializer = serializers.UserEventSerializer
    required_permissions = {"GET": "attendance.mark"}

    def get(self, request: Request, event_id: int):
        event = Event.objects.filter(id=event_id).only("id", "course_id").first()
        if event is None:
            return self.send_response(
                True,
                "not_found",
                {"message": "No such event exist with the given id"},
                status=404,
            )
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        try:
            check_course_attendance_access(user, event.course_id)
        except PermissionDenied:
            return self.forbidden("Not allowed for this course.")
        student_user_ids = set(
            UserCourse.objects.filter(
                course_id=event.course_id,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            ).values_list("user_id", flat=True)
        )
        existing_user_ids = set(
            models.UserEvent.objects.filter(event_id=event_id).values_list(
                "user_id", flat=True
            )
        )
        attendance_models_to_create = [
            models.UserEvent(user_id=user_id, event_id=event_id)
            for user_id in student_user_ids - existing_user_ids
        ]
        if attendance_models_to_create:
            models.UserEvent.objects.bulk_create(
                attendance_models_to_create, ignore_conflicts=True
            )
        query_params = self.get_query_params(request)
        serialized_attendances = self.get_serializer(
            self.paginate_queryset(
                self.model.objects.filter(
                    event_id=event_id,
                    user_id__in=student_user_ids,
                    user__roles__contained_by=[User.UserRole.STUDENT],
                )
                .prefetch_related(
                    *self.translate_expand_params(query_params.get("expand"))
                )
                .all(),
                request,
            ),
            many=True,
            fields=query_params.get("fields"),
            expand=query_params.get("expand"),
            context={"model": self.model},
        )
        return self.send_response(
            False,
            "success",
            {**self.get_paginated_response(), "data": serialized_attendances.data},
        )


class AttendanceMarkingRosterView(RBACView):
    """Slim roster for the course attendance marking page."""

    required_permissions = {"GET": "attendance.mark"}

    def get(self, request: Request, event_id: int):
        event = Event.objects.filter(id=event_id).only("id", "course_id").first()
        if event is None:
            return self.not_found("Event not found.")
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        try:
            check_course_attendance_access(user, event.course_id)
        except PermissionDenied:
            return self.forbidden("Not allowed for this course.")
        try:
            include_removed = parse_include_removed_students(request, user)
        except PermissionDenied as exc:
            return self.forbidden(str(exc))
        try:
            roster = build_marking_roster(
                event_id,
                include_removed=include_removed,
                tenant=request.tenant,
            )
        except Event.DoesNotExist:
            return self.not_found("Event not found.")
        return self.ok({"event_id": event_id, "roster": roster})


class MonthlyAttendanceView(RBACView):
    model = None
    serializer = None
    required_permissions = {"GET": "attendance.mark"}

    def check_permissions(self, request):
        user = acting_user(request)
        if user is None:
            raise PermissionDenied("Authentication credentials were not provided.")
        held = set(effective_permissions(user))
        if user_can_read_monthly_attendance(held):
            return
        super().check_permissions(request)

    def get(self, request: Request, course_id: int, date: str):
        course = Course.objects.filter(id=course_id).first()
        if course is None:
            return self.send_response(
                True,
                "not_found",
                {"message": "No such course exist with the given id"},
                status=404,
            )
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        try:
            check_course_attendance_access(user, course_id)
        except PermissionDenied:
            return self.forbidden("Not allowed for this course.")
        try:
            include_removed = parse_include_removed_students(request, user)
        except PermissionDenied as exc:
            return self.forbidden(str(exc))
        all_months = date == "all"
        year = month = None
        if not all_months:
            date = "-".join(date.split("-")[0:2])
            parsed = datetime.strptime(date, "%Y-%m")
            year, month = parsed.year, parsed.month

        table = build_monthly_attendance_matrix(
            course_id,
            year=year,
            month=month,
            all_months=all_months,
            include_removed=include_removed,
        )
        if table is None:
            return self.send_response(False, "success", {"data": {}, "students": []})
        held = set(effective_permissions(user))
        students = list_course_students_for_attendance(
            course_id, include_removed=include_removed
        )
        if user_needs_own_attendance_scope(held):
            table, students = filter_monthly_report_for_user(table, students, user.id)
        if request.query_params.get("csv") == "true":
            response = HttpResponse(
                content_type="text/csv",
                headers={
                    "Content-Disposition": f"attachment; filename='{course.title}-attendance-report.csv'"
                },
            )
            writer = csv.writer(response)
            writer.writerows(table)
            return response

        return self.send_response(
            False,
            "success",
            {"data": table, "students": students},
        )


class CourseAttendanceSummaryView(RBACView):
    model = None
    serializer = None
    required_permissions = {"GET": "attendance.mark"}

    def get(self, request: Request, course_id: int):
        course = Course.objects.filter(id=course_id).first()
        if course is None:
            return self.send_response(
                True,
                "not_found",
                {"message": "No such course exist with the given id"},
                status=404,
            )
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        try:
            check_course_attendance_access(user, course_id)
        except PermissionDenied:
            return self.forbidden("Not allowed for this course.")
        try:
            include_removed = parse_include_removed_students(request, user)
        except PermissionDenied as exc:
            return self.forbidden(str(exc))

        summary = build_course_attendance_summary(
            course_id, course=course, include_removed=include_removed
        )
        return self.send_response(False, "success", {"data": summary})


class UserCheckinView(RBACView):
    required_permissions = {
        "GET": "attendance.mark",
        "POST": "attendance.mark",
        "PUT": "attendance.mark",
    }

    def check_permissions(self, request):
        user = acting_user(request)
        if user is None:
            raise PermissionDenied("Authentication credentials were not provided.")
        held = set(effective_permissions(user))
        if "attendance.mark" in held:
            return
        course_id = request.parser_context.get("kwargs", {}).get("course_id")
        if course_id is not None and user_can_access_course_attendance(user, int(course_id)):
            return
        super().check_permissions(request)

    def _tenant_local_day_bounds_utc(self):
        """Return UTC datetimes for [start_of_local_day, start_of_next_local_day)."""
        tenant = getattr(self.request, "tenant", None)
        tenant_timezone = getattr(tenant, "timezone", "UTC") or "UTC"
        try:
            tenant_tz = ZoneInfo(tenant_timezone)
        except ZoneInfoNotFoundError:
            tenant_tz = ZoneInfo("UTC")

        local_today = timezone.now().astimezone(tenant_tz).date()
        local_start = datetime.combine(local_today, datetime_time.min, tenant_tz)
        local_end_exclusive = local_start + timedelta(days=1)
        return local_start.astimezone(timezone.utc), local_end_exclusive.astimezone(timezone.utc)

    def _course_event_ids_on_local_today(self, course_id: int) -> list[int]:
        """Event IDs whose teaching day is today in tenant local time."""
        tz_obj = _tenant_tz(getattr(self.request, "tenant", None))
        local_day = timezone.now().astimezone(tz_obj).date()
        start_of_day, end_of_day_exclusive = self._tenant_local_day_bounds_utc()
        wide_start = start_of_day - timedelta(days=1)
        wide_end = end_of_day_exclusive + timedelta(days=1)
        candidates = Event.objects.filter(
            course_id=course_id,
            date__gte=wide_start,
            date__lt=wide_end,
        )
        return [
            event.id
            for event in candidates
            if event_local_date(event, tz_obj) == local_day
        ]

    def is_user_in_course(self, user, course_id):
        """check if user is assigned to this course."""
        return UserCourse.objects.filter(user=user, course_id=course_id).exists()

    def _gate_session_checkin(self, user):
        tenant = getattr(self.request, "tenant", None)
        allowed, message = _session_checkin_allowed(user, tenant)
        if not allowed:
            return self.send_response(True, message, {}, status=403)
        return None

    def no_event_response(self):
        """response when no events today"""
        return self.send_response(
            False,
            "success",
            {"data": {"has_events_today": False, "checkin_status": None, "button_disabled": True}},
            status=200
        )

    def respond_with_event(self, user_course, status_label):
        """response with user event data."""
        serialized_data = serializers.UserEventSerializer(
            user_course,
            expand=['event']
        ).data
        return self.send_response(False, status_label, {"data": serialized_data}, status=200)

    # get user events for today (plus any open checked-in sessions from prior days)
    def get_user_event(self, user, course_id):
        local_event_ids = self._course_event_ids_on_local_today(course_id)
        today_q = Q(event_id__in=local_event_ids) if local_event_ids else Q(pk__in=[])
        open_q = Q(checkin_time__isnull=False, checkout_time__isnull=True)
        base_qs = models.UserEvent.objects.filter(
            event__course_id=course_id,
            user=user,
        ).filter(today_q | open_q)

        if local_event_ids:
            if user.is_student():
                existing_event_ids = set(
                    models.UserEvent.objects.filter(
                        user=user,
                        event_id__in=local_event_ids,
                    ).values_list("event_id", flat=True)
                )
                missing_ids = [
                    eid for eid in local_event_ids if eid not in existing_event_ids
                ]
                if missing_ids:
                    to_create = [
                        models.UserEvent(user=user, event_id=event_id)
                        for event_id in missing_ids
                    ]
                    models.UserEvent.objects.bulk_create(to_create, ignore_conflicts=True)

            if user.is_teacher():
                ensure_teacher_userevents_for_events(
                    course_id=course_id,
                    event_ids=local_event_ids,
                    user_ids=[user.id],
                )

        return base_qs.select_related("event", "event__course").order_by(
            "event__date", "event__time_from"
        )

    def get_open_checkin_session(self, user):
        """Earliest open check-in for the user across all courses."""
        return (
            models.UserEvent.objects.filter(
                user=user,
                checkin_time__isnull=False,
                checkout_time__isnull=True,
            )
            .select_related("event", "event__course")
            .order_by("event__date", "event__time_from")
            .first()
        )

    def serialize_open_checkin_session(self, user_event, tenant):
        if user_event is None:
            return None
        stale = is_stale_open_session(user_event, tenant, timezone.now())
        return {
            "course_id": user_event.event.course_id,
            "course_title": user_event.event.course.title,
            "course_effective_status": compute_effective_status(
                user_event.event.course
            ),
            "user_event": serializers.UserEventSerializer(
                user_event,
                expand=["event"],
            ).data,
            "has_stale_open_session": stale,
        }

    def post(self, request: Request, course_id: int):
        """
        Check in for teachers
        """
        user: User = User.get_user_from_request(request)
        if not self.is_user_in_course(user, course_id):
            return self.send_response(
                True,
                "forbidden",
                {"message": "User is not in this course"},
                status=403
            )
        if denied := self._gate_session_checkin(user):
            return denied

        checkin_image = request.data.get('checkin_image')
        if not checkin_image:
            return self.send_response(
                True,
                "bad_request",
                {"message": "Check-in image is required"},
                status=400
            )

        user_events = self.get_user_event(user, course_id)
        unchecked_events = user_events.filter(checkin_time__isnull=True)

        if not unchecked_events.exists():
            return self.send_response(
                True,
                "bad_request",
                {"details": {"message": "No more events to check in for today"}},
                status=400,
            )

        tenant = getattr(self.request, "tenant", None)
        grace = getattr(tenant, "checkin_grace_period_minute", 0) or 0
        js_bool = request.data.get('is_extra_class', False)
        is_extra_class = js_bool == 'true'

        with transaction.atomic():
            locked_unchecked = list(
                unchecked_events.select_related("event", "event__course").select_for_update(
                    of=("self",)
                )
            )
            user_event, window = select_next_checkin_user_event(
                unchecked_user_events=locked_unchecked,
                tenant=tenant,
                now=timezone.now(),
                grace_minutes=grace,
            )
            if user_event is None:
                return self.send_response(
                    True,
                    "bad_request",
                    {"details": {"message": "No more events to check in for today"}},
                    status=400,
                )
            if user_event.checkin_time:
                return self.send_response(
                    True,
                    "bad_request",
                    {"message": "Already checked in for this event"},
                    status=400
                )

            if not window["allowed"]:
                return self.send_response(
                    True,
                    window["block_reason"],
                    {
                        "details": {
                            "message": format_checkin_blocked_message(
                                block_reason=window["block_reason"],
                                opens_at=window["opens_at"],
                                tenant=tenant,
                                grace_minutes=grace,
                                user=user,
                            )
                        }
                    },
                    status=400,
                )

            user_event.is_extra_class = is_extra_class

            if user.is_teacher() and not is_session_based_payroll(tenant):
                # when a teacher checks-in, we freeze necessary columns to later be used during payroll calculation
                course = user_event.event.course
                rate = get_hourly_rate_for_teacher_course(
                    user, course, tenant
                )
                if rate is None:
                    return self.send_response(
                        True,
                        "payroll_rate_missing",
                        {
                            "details": {
                                "message": payroll_rate_missing_message(user),
                            }
                        },
                        status=400,
                    )
                user_event.hourly_rate_at_calculation = rate
                if user.student_bonus_hourly_rate:
                    user_event.student_bonus_rate_at_calculation = user.student_bonus_hourly_rate
                student_count = UserCourse.objects.filter(course_id=user_event.event.course_id,
                                                          assigned_as=UserCourse.AssignedAs.STUDENT).count()
                user_event.student_count_in_course_at_calculation = student_count
                ph = get_per_hour_price_snapshot_for_course(course)
                if ph is not None:
                    user_event.per_hour_price_at_calculation = ph

            if user.is_teacher():
                if (
                    user_event.event_time_from_at_calculation is None
                    or user_event.event_time_to_at_calculation is None
                ):
                    start_utc, end_utc = _event_bounds_utc(user_event.event, tenant)
                    user_event.event_time_from_at_calculation = start_utc
                    user_event.event_time_to_at_calculation = end_utc

            user_event.checkin_time = timezone.now()
            user_event.checkin_image = checkin_image
            user_event.save()

        return self.respond_with_event(user_event, CheckinStatus.CHECKED_IN)

    def put(self, request: Request, course_id: int):
        """
        Check out for users
        """
        user = User.get_user_from_request(request)

        if not self.is_user_in_course(user, course_id):
            return self.send_response(
                True,
                "forbidden",
                {"message": "User is not in this course"},
                status=403
            )
        if denied := self._gate_session_checkin(user):
            return denied

        # find the closest checked-in event that hasn't been checked out
        user_events = self.get_user_event(user, course_id)
        checked_in_events = user_events.filter(
            checkin_time__isnull=False,
            checkout_time__isnull=True
        )

        if not checked_in_events.exists():
            return self.send_response(
                True,
                "bad_request",
                {"message": "No events to check out for today"},
                status=400
            )

        user_event = checked_in_events.first()

        if not user_event.checkin_time:
            return self.send_response(
                True,
                "bad_request",
                {"message": "Must check-in before checking out"},
                status=400
            )

        if user_event.checkout_time:
            return self.send_response(
                True,
                "bad_request",
                {"message": "Already checked out for this event"},
                status=400
            )

        tenant = getattr(self.request, "tenant", None)
        user_event.checkout_time = resolve_checkout_time(
            checkin_time=user_event.checkin_time,
            proposed_checkout=timezone.now(),
            event=user_event.event,
            tenant=tenant,
        )

        today_activities = request.data.get('today_activities')
        if today_activities is not None:
            stripped = str(today_activities).strip()
            user_event.today_activities = stripped if stripped else None

        user_event.save(update_fields=["checkout_time", "today_activities"])
        return self.respond_with_event(user_event, CheckinStatus.CHECKED_OUT)

    def get(self, request: Request, course_id: int):
        """
        Today check in / check out status
        """
        user = User.get_user_from_request(request)

        if not self.is_user_in_course(user, course_id):
            return self.send_response(
                True,
                "forbidden",
                {"message": "User is not in this course"},
                status=403
            )
        if denied := self._gate_session_checkin(user):
            return denied

        # check for events today
        user_events = self.get_user_event(user, course_id)
        if not user_events.exists():
            return self.no_event_response()

        # find the current event to work with (nearest unchecked or checked-in)
        unchecked_events = user_events.filter(checkin_time__isnull=True)
        checked_in_events = user_events.filter(
            checkin_time__isnull=False,
            checkout_time__isnull=True
        )

        tenant = getattr(self.request, "tenant", None)
        grace = getattr(tenant, "checkin_grace_period_minute", 0) or 0
        checkin_opens_at = None
        checkin_closes_at = None
        checkin_block_reason = None
        checkin_block_message = None
        window = None

        if checked_in_events.exists():
            # user can check out
            current_event = checked_in_events.first()
            checkin_status = CheckinStatus.CHECKED_IN
            can_check_in = False
            can_check_out = True
        elif unchecked_events.exists():
            # user can check in to the next actionable event when within the time window
            current_event, window = select_next_checkin_user_event(
                unchecked_user_events=unchecked_events,
                tenant=tenant,
                now=timezone.now(),
                grace_minutes=grace,
            )
            checkin_status = CheckinStatus.NOT_CHECKED_IN
            can_check_out = False
            can_check_in = window["allowed"]
            checkin_opens_at = window["opens_at"].isoformat()
            checkin_closes_at = window["closes_at"].isoformat()
            checkin_block_reason = window["block_reason"]
            if (
                can_check_in
                and user.is_teacher()
                and current_event is not None
                and not is_session_based_payroll(tenant)
            ):
                course = current_event.event.course
                rate = get_hourly_rate_for_teacher_course(user, course, tenant)
                if rate is None:
                    can_check_in = False
                    checkin_block_reason = "payroll_rate_missing"
                    checkin_block_message = payroll_rate_missing_message(user)
        else:
            # all events are done, button disabled
            checkin_status = CheckinStatus.CHECKED_OUT
            current_event = None
            can_check_in = False
            can_check_out = False

        if checkin_block_message is None and checkin_block_reason:
            checkin_block_message = format_checkin_blocked_message(
                block_reason=checkin_block_reason,
                opens_at=window["opens_at"] if window else None,
                tenant=tenant,
                grace_minutes=grace,
                user=user,
            )

        current_event_data = None
        if current_event:
            current_event_data = serializers.UserEventSerializer(
                current_event,
                expand=['event']
            ).data
        stale_open = False
        if current_event and can_check_out:
            stale_open = is_stale_open_session(current_event, tenant, timezone.now())

        local_event_ids = self._course_event_ids_on_local_today(course_id)
        total_events = len(local_event_ids)
        completed_events = user_events.filter(
            event_id__in=local_event_ids,
            checkout_time__isnull=False,
        ).count()

        open_checkin_session = self.serialize_open_checkin_session(
            self.get_open_checkin_session(user),
            tenant,
        )

        return self.send_response(
            False,
            "success",
            {"data": {
                "has_events_today": True,
                "checkin_status": checkin_status,
                "can_check_in": can_check_in,
                "can_check_out": can_check_out,
                "current_event": current_event_data,
                "has_stale_open_session": stale_open,
                "open_checkin_session": open_checkin_session,
                "total_events": total_events,
                "completed_events": completed_events,
                "checkin_opens_at": checkin_opens_at,
                "checkin_closes_at": checkin_closes_at,
                "checkin_block_reason": checkin_block_reason,
                "checkin_block_message": checkin_block_message,
            }},
            status=200
        )


class UserCheckinCancelView(UserCheckinView):
    """Cancel an open teacher session check-in (student no-show)."""

    required_permissions = {"POST": "attendance.mark"}

    def post(self, request: Request, course_id: int):
        user = User.get_user_from_request(request)

        if not self.is_user_in_course(user, course_id):
            return self.send_response(
                True,
                "forbidden",
                {"message": "User is not in this course"},
                status=403,
            )
        if denied := self._gate_session_checkin(user):
            return denied

        if not user.is_teacher():
            return self.send_response(
                True,
                "forbidden",
                {"message": "Only teachers can cancel session check-in."},
                status=403,
            )

        serializer = serializers.CancelCheckinSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        user_events = self.get_user_event(user, course_id)
        checked_in_events = user_events.filter(
            checkin_time__isnull=False,
            checkout_time__isnull=True,
        )

        if not checked_in_events.exists():
            return self.send_response(
                True,
                "bad_request",
                {"details": {"message": "No open check-in to cancel."}},
                status=400,
            )

        user_event = checked_in_events.first()

        try:
            updated = cancel_open_checkin(
                user_event=user_event,
                actor=user,
                tenant=getattr(request, "tenant", None),
                reason_code=data["reason_code"],
                note=data.get("note"),
            )
        except PermissionDenied as exc:
            return self.forbidden(str(exc))
        except ValidationError as exc:
            return self.send_response(
                True,
                "bad_request",
                {"details": exc.detail},
                status=400,
            )

        return self.respond_with_event(updated, "checkin_cancelled")


class UserOpenCheckinSessionView(RBACView):
    """Return the user's earliest open check-in across all courses."""

    required_permissions = {"GET": "attendance.mark"}

    def get(self, request: Request):
        user = User.get_user_from_request(request)
        allowed, message = _session_checkin_allowed(user, getattr(request, "tenant", None))
        if not allowed:
            return self.send_response(True, message, {}, status=403)

        tenant = getattr(request, "tenant", None)
        helper = UserCheckinView()
        open_checkin_session = helper.serialize_open_checkin_session(
            helper.get_open_checkin_session(user),
            tenant,
        )
        return self.send_response(
            False,
            "success",
            {"data": {"open_checkin_session": open_checkin_session}},
            status=200,
        )


class AttendanceGodViewSearchView(RBACView):
    """Staff: student attendance intervention dashboard (summary rows + cards)."""

    required_permissions = {"POST": "attendance.view_all"}

    def post(self, request: Request):
        body = request.data if isinstance(request.data, dict) else {}
        filters = parse_god_view_filters(body, request.query_params)
        mode = str(body.get("mode") or request.query_params.get("mode") or "risk")
        if mode == "daily_absences":
            summary, rows = build_daily_absence_rows(filters)
            csv_headers = DAILY_ABSENCE_CSV_HEADERS
            csv_filename = f"attendance-daily-absences-{filters.date_from.isoformat()}.csv"
            hydrate_rows = False
        elif mode == "monthly_students":
            summary, rows = build_monthly_student_rows(filters)
            csv_headers = MONTHLY_STUDENT_CSV_HEADERS
            csv_filename = (
                f"attendance-monthly-summary-{filters.date_from.strftime('%Y-%m')}.csv"
            )
            hydrate_rows = False
        elif mode == "course_marking_gaps":
            summary, rows = build_course_marking_gap_rows(filters)
            csv_headers = COURSE_MARKING_GAP_CSV_HEADERS
            csv_filename = (
                f"attendance-course-marking-gaps-"
                f"{god_view_date_range_filename_suffix(filters.date_from, filters.date_to)}.csv"
            )
            hydrate_rows = False
        else:
            summary, rows = build_god_view_rows(filters, hydrate=False)
            csv_headers = SUMMARY_CSV_HEADERS
            csv_filename = "attendance-god-view-summary.csv"
            hydrate_rows = True

        if request.query_params.get("csv") == "true":
            if hydrate_rows:
                rows = hydrate_god_view_rows(rows)
            return god_view_csv_response(rows, csv_headers, filename=csv_filename)

        page_rows, count = paginate_rows(rows, filters.page, filters.size)
        if hydrate_rows:
            page_rows = hydrate_god_view_rows(page_rows)
        return self.send_response(
            False,
            "success",
            {
                "data": {
                    "summary": summary,
                    "results": page_rows,
                },
                "page": filters.page,
                "size": filters.size,
                "count": count,
            },
            status=200,
        )


class AttendanceGodViewDetailView(RBACView):
    """Staff: per-event attendance drill-down for one student + course."""

    required_permissions = {"GET": "attendance.view_all"}

    def get(self, request: Request):
        mode = request.query_params.get("mode")
        filters = parse_god_view_filters({}, request.query_params)

        if mode == "course_marking_gaps":
            try:
                course_id = int(request.query_params.get("course_id", ""))
            except ValueError:
                return self.bad_request("course_id is required.")
            problem_status = _parse_problem_status(
                request.query_params.get("problem_status")
            )
            records = build_course_marking_gap_detail(
                course_id,
                filters,
                problem_status,
            )
            if request.query_params.get("csv") == "true":
                return god_view_course_marking_gap_detail_csv_response(
                    course_id,
                    records,
                    filename=(
                        f"attendance-course-marking-gaps-detail-"
                        f"{course_id}-"
                        f"{god_view_date_range_filename_suffix(filters.date_from, filters.date_to)}.csv"
                    ),
                )
            return self.ok(
                {
                    "course_id": course_id,
                    "date_from": filters.date_from.isoformat(),
                    "date_to": filters.date_to.isoformat(),
                    "problem_status": problem_status.value,
                    "records": records,
                }
            )

        try:
            student_id = int(request.query_params.get("student_id", ""))
        except ValueError:
            return self.bad_request("student_id is required.")

        if mode == "monthly_students":
            return self.ok(build_monthly_student_detail(student_id, filters))

        try:
            course_id = int(request.query_params.get("course_id", ""))
        except ValueError:
            return self.bad_request("student_id and course_id are required integers.")

        records = build_god_view_detail(
            student_id, course_id, filters.date_from, filters.date_to
        )

        if request.query_params.get("csv") == "true":
            return god_view_detail_csv_response(
                student_id,
                course_id,
                records,
                filename=f"attendance-detail-{student_id}-{course_id}.csv",
            )

        return self.ok(
            {
                "student_id": student_id,
                "course_id": course_id,
                "date_from": filters.date_from.isoformat(),
                "date_to": filters.date_to.isoformat(),
                "records": records,
            }
        )


class AttendanceSelfCorrectionView(RBACView):
    name = "Attendance self-correction view"
    rbac_decision = "authenticated_only"

    def patch(self, request: Request, obj_id: int):
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")

        held = set(effective_permissions(user))
        if not (
            "attendance.correct_own_checkin" in held
            or "attendance.manage_all" in held
        ):
            return self.forbidden("Not allowed to correct check-in history.")

        user_event = (
            models.UserEvent.objects.filter(id=obj_id, is_deleted=False)
            .select_related("event", "event__course", "user")
            .first()
        )
        if user_event is None:
            return self.send_not_found(obj_id)

        serializer = serializers.SelfCheckinCorrectionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        correction_kwargs = {
            "user_event": user_event,
            "actor": user,
            "tenant": request.tenant,
            "checkin_time": data.get("checkin_time"),
            "checkout_time": data.get("checkout_time"),
            "checkin_image": data.get("checkin_image"),
            "correction_reason": data["correction_reason"],
        }
        if "today_activities" in data:
            correction_kwargs["today_activities"] = data.get("today_activities")

        try:
            updated = apply_self_checkin_correction(**correction_kwargs)
        except PermissionDenied as exc:
            return self.forbidden(str(exc))
        except PayrollRateMissingError:
            return self.send_response(
                True,
                "payroll_rate_missing",
                {
                    "details": {
                        "message": payroll_rate_missing_message(user),
                    }
                },
                status=400,
            )
        except ValidationError as exc:
            return self.send_response(
                True,
                "bad_request",
                {"details": exc.detail},
                status=400,
            )

        out = serializers.UserEventSerializer(updated, context={"request": request})
        return self.updated(out.data)


class AttendanceCorrectionsView(RBACView):
    name = "Attendance corrections history view"
    rbac_decision = "authenticated_only"

    def get(self, request: Request, obj_id: int):
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")

        user_event = (
            models.UserEvent.objects.filter(id=obj_id, is_deleted=False)
            .select_related("event")
            .first()
        )
        if user_event is None:
            return self.send_not_found(obj_id)

        if not can_view_attendance_corrections(user, user_event):
            return self.forbidden("Not allowed to view correction history.")

        events = (
            models.AttendanceChangeEvent.objects.filter(user_event_id=obj_id)
            .select_related("actor")
            .order_by("-occurred_at", "-id")
        )
        data = serializers.AttendanceChangeEventSerializer(
            events, many=True, context={"request": request}
        ).data
        return self.ok(data)


class CheckinHistoryBootstrapView(RBACView):
    name = "Check-in history bootstrap view"
    required_permissions = {"POST": "attendance.mark"}

    def post(self, request: Request, course_id: int):
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")

        try:
            check_course_attendance_access(user, course_id)
        except PermissionDenied:
            return self.forbidden("Not allowed for this course.")

        if not teacher_can_bootstrap_checkin_history(user, request.tenant):
            return self.forbidden("Not allowed to bootstrap check-in history.")

        try:
            require_teacher_checkin_history_correction_enabled(request.tenant)
        except PermissionDenied as exc:
            return self.forbidden(str(exc))

        if not user.is_teacher():
            return self.forbidden("Only teachers can bootstrap their check-in rows.")

        raw_event_ids = request.data.get("event_ids") or []
        if not isinstance(raw_event_ids, list) or not raw_event_ids:
            return self.bad_request("event_ids must be a non-empty list.")

        try:
            event_ids = [int(eid) for eid in raw_event_ids]
        except (TypeError, ValueError):
            return self.bad_request("event_ids must contain integers.")

        valid_event_ids = list(
            Event.objects.filter(course_id=course_id, id__in=event_ids).values_list(
                "id", flat=True
            )
        )
        if not valid_event_ids:
            return self.bad_request("No valid events for this course.")

        created = ensure_teacher_userevents_for_events(
            course_id=course_id,
            event_ids=valid_event_ids,
            user_ids=[user.id],
        )
        return self.ok({"created_or_restored": created, "event_ids": valid_event_ids})
