import datetime
import calendar
from zoneinfo import ZoneInfo

from django.db.models import Count, F, Q
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework.request import Request

from app_auth.models import User
from app_course.models import Course
from app_reports.models import Log
from app_reports.services import (
    get_payroll_report,
    get_course_data_sheet_rows,
    get_student_data_sheet_rows,
    get_staff_data_sheet_rows,
    iter_id_photo_users,
    stream_id_photos_zip,
    build_id_photos_pdf_response,
    get_excellent_choice_report,
)
from app_rbac.views import RBACView
from app_reports import analytics_services
from app_organization.models import Organization
from app_finance.excellent_choice_report import (
    ec_columns_meta,
    excellent_choice_rows,
    excellent_choice_summary_row,
)
from app_reports.teacher_courses import (
    get_teacher_courses_xlsx,
    teacher_courses_columns_meta,
    teacher_courses_rows,
)


HR_REPORT_TYPES = ["payroll"]


class HRReportView(RBACView):
    model = None
    serializer = None
    required_permissions = {"POST": "analytics.view"}

    def post(self, request, report_type: str):
        if report_type not in HR_REPORT_TYPES:
            return self.send_response(
                True,
                "Invalid report type.",
                {"message": "Invalid report type."},
                status=400,
            )
        if report_type == "payroll":
            start_date = request.data.get("startDate")
            end_date = request.data.get("endDate")
            if not start_date or not end_date:
                return self.send_response(
                    True,
                    "bad_request",
                    {"details": "Missing 'startDate' or 'endDate' in request body."},
                    status=400,
                )
            try:
                start_d = datetime.datetime.strptime(start_date, "%Y-%m-%d").date()
                end_d = datetime.datetime.strptime(end_date, "%Y-%m-%d").date()
            except ValueError:
                return self.send_response(
                    True,
                    "bad_request",
                    {"details": "Invalid date format. Use YYYY-MM-DD."},
                    status=400,
                )
            if start_d > end_d:
                return self.send_response(
                    True,
                    "bad_request",
                    {"details": "startDate must be before or equal to endDate."},
                    status=400,
                )
            user_id = request.data.get("userId")
            return get_payroll_report(start_d, end_d, user_id=user_id)


def range_group_by_to_sql(group_by):
    if group_by == "day":
        return ("created_at__month", "created_at__day")
    else:
        return ("created_at__year", "created_at__month")


class ChartsView(RBACView):
    model = None
    serializer = None
    required_permissions = {"GET": "analytics.view"}

    def get(self, request: Request):
        if request.query_params.get("range_group_by") and request.query_params.get(
                "range_group_by"
        ) not in ["day", "month"]:
            return self.send_response(
                True,
                "Invalid 'range_group_by' parameter in request query.",
                {"message": "Invalid 'range_group_by' parameter in request query."},
                status=400,
            )
        if request.query_params.get("range"):
            group_by_tuple = range_group_by_to_sql(
                request.query_params.get("range_group_by")
            )
            r = request.query_params.get("range").split(":")
            r_start = r[0]
            r_end = r[1]
            student_trend = (
                User.objects.filter(
                    created_at__gte=r_start,
                    created_at__lte=r_end,
                    roles__contains=[User.UserRole.STUDENT],
                )
                .values_list(*group_by_tuple)
                .annotate(count=Count("id"))
                .order_by(*group_by_tuple)
            )
            staff_trend = (
                User.objects.filter(
                    created_at__gte=r_start,
                    created_at__lte=r_end,
                    roles__contains=[User.UserRole.TEACHER, User.UserRole.ADMIN],
                )
                .values_list(*group_by_tuple)
                .annotate(count=Count("id"))
                .order_by(*group_by_tuple)
            )
            course_trend = (
                Course.objects.filter(created_at__gte=r_start, created_at__lte=r_end)
                .values_list(*group_by_tuple)
                .annotate(count=Count("id"))
                .order_by(*group_by_tuple)
            )
            course_categories = (
                Course.objects.filter(created_at__gte=r_start, created_at__lte=r_end)
                .values_list("category__name")
                .annotate(count=Count("id"))
                .order_by("category")
            )
            student_genders = (
                User.objects.filter(
                    created_at__gte=r_start,
                    created_at__lte=r_end,
                    roles__contains=[User.UserRole.STUDENT],
                )
                .values_list("gender")
                .annotate(count=Count("id"))
                .order_by("gender")
            )

            return self.send_response(
                False,
                "ok",
                {
                    "student_trend": student_trend,
                    "staff_trend": staff_trend,
                    "course_trend": course_trend,
                    "course_categories": course_categories,
                    "student_genders": student_genders,
                },
            )
        else:
            return self.send_response(
                True,
                "Missing 'range' parameter in request query.",
                {"message": "Missing 'range' parameter in request query."},
            )


# PostgreSQL's tz data omits some deprecated IANA aliases; TruncDate passes the zone name to the DB.
_TZ_NAME_FOR_POSTGRES = {
    "Asia/Rangoon": "Asia/Yangon",
}


def _user_activity_tz(request: Request) -> ZoneInfo:
    raw = getattr(request.tenant, "timezone", None) or "UTC"
    name = _TZ_NAME_FOR_POSTGRES.get(str(raw), str(raw))
    try:
        return ZoneInfo(name)
    except Exception:
        return ZoneInfo("UTC")


def _parse_ymd(s: str) -> datetime.date:
    return datetime.datetime.strptime(s.strip(), "%Y-%m-%d").date()


class UserActivityLoginTrendsView(RBACView):
    """Daily login counts from Log (category=LOGIN); bucketed by tenant timezone calendar day."""

    model = None
    serializer = None
    required_permissions = {"GET": "analytics.view"}

    MAX_RANGE_DAYS = 400

    def get(self, request: Request):
        start_s = request.query_params.get("start")
        end_s = request.query_params.get("end")
        if not start_s or not end_s:
            return self.send_response(
                True,
                "bad_request",
                {"message": "Missing 'start' or 'end' (YYYY-MM-DD)."},
                status=400,
            )
        try:
            start_d = _parse_ymd(start_s)
            end_d = _parse_ymd(end_s)
        except ValueError:
            return self.send_response(
                True,
                "bad_request",
                {"message": "Invalid date format. Use YYYY-MM-DD."},
                status=400,
            )
        if start_d > end_d:
            return self.send_response(
                True,
                "bad_request",
                {"message": "'start' must be on or before 'end'."},
                status=400,
            )
        if (end_d - start_d).days > self.MAX_RANGE_DAYS:
            return self.send_response(
                True,
                "bad_request",
                {
                    "message": f"Range must be at most {self.MAX_RANGE_DAYS} days.",
                },
                status=400,
            )

        tz = _user_activity_tz(request)
        start_dt = datetime.datetime.combine(start_d, datetime.time.min, tzinfo=tz)
        end_dt = datetime.datetime.combine(end_d, datetime.time.max, tzinfo=tz)

        trunc = TruncDate("created_at", tzinfo=tz)
        rows = (
            Log.objects.filter(
                category="LOGIN",
                entity="user",
                created_at__gte=start_dt,
                created_at__lte=end_dt,
            )
            .annotate(day=trunc)
            .values("day")
            .annotate(
                total_logins=Count("id"),
                unique_users=Count("entity_id", distinct=True),
            )
            .order_by("day")
        )
        by_day = {}
        for r in rows:
            d = r["day"]
            if d is None:
                continue
            if isinstance(d, datetime.datetime):
                d = d.date()
            by_day[d] = r

        series = []
        total_logins = 0
        total_unique_estimate = 0  # sum of daily uniques (not global DAU)
        cur = start_d
        delta = datetime.timedelta(days=1)
        while cur <= end_d:
            r = by_day.get(cur)
            tl = int(r["total_logins"]) if r else 0
            uu = int(r["unique_users"]) if r else 0
            series.append(
                {
                    "date": cur.isoformat(),
                    "total_logins": tl,
                    "unique_users": uu,
                }
            )
            total_logins += tl
            total_unique_estimate += uu
            cur += delta

        return self.send_response(
            False,
            "ok",
            {
                "series": series,
                "totals": {
                    "total_logins": total_logins,
                    "sum_unique_users_per_day": total_unique_estimate,
                },
                "timezone": str(tz),
            },
        )


class UserActivityInactiveUsersView(RBACView):
    """Active users with old accounts and stale or missing last_login (after backfill + JWT updates)."""

    model = None
    serializer = None
    required_permissions = {"GET": "analytics.view"}

    DEFAULT_MIN_ACCOUNT_AGE_DAYS = 5
    DEFAULT_INACTIVE_THRESHOLD_DAYS = 30
    MAX_PAGE_SIZE = 100

    def get(self, request: Request):
        try:
            min_age = int(
                request.query_params.get(
                    "min_account_age_days", self.DEFAULT_MIN_ACCOUNT_AGE_DAYS
                )
            )
            inactive_days = int(
                request.query_params.get(
                    "inactive_threshold_days", self.DEFAULT_INACTIVE_THRESHOLD_DAYS
                )
            )
            page = int(request.query_params.get("page", "1"))
            page_size = int(request.query_params.get("page_size", "25"))
        except ValueError:
            return self.send_response(
                True,
                "bad_request",
                {"message": "Invalid numeric query parameter."},
                status=400,
            )

        if min_age < 0 or inactive_days < 1:
            return self.send_response(
                True,
                "bad_request",
                {"message": "min_account_age_days must be >= 0 and inactive_threshold_days >= 1."},
                status=400,
            )
        if page < 1 or page_size < 1 or page_size > self.MAX_PAGE_SIZE:
            return self.send_response(
                True,
                "bad_request",
                {"message": f"Invalid page or page_size (max {self.MAX_PAGE_SIZE})."},
                status=400,
            )

        exclude_students_raw = (request.query_params.get("exclude_students") or "").lower()
        exclude_students = exclude_students_raw in ("1", "true", "yes")

        now = timezone.now()
        account_cutoff = now - datetime.timedelta(days=min_age)
        login_cutoff = now - datetime.timedelta(days=inactive_days)

        base = (
            User.objects.filter(is_active=True)
            .filter(created_at__lte=account_cutoff)
            .filter(Q(last_login__isnull=True) | Q(last_login__lt=login_cutoff))
        )
        if exclude_students:
            # Same as User.is_student(): exactly one role and it is student.
            base = base.exclude(roles=[User.UserRole.STUDENT])
        total = base.count()
        start = (page - 1) * page_size
        users = base.order_by(F("last_login").asc(nulls_first=True), "id")[
            start : start + page_size
        ]

        def role_labels(u: User) -> str:
            order = [
                User.UserRole.SUPERADMIN,
                User.UserRole.ADMIN,
                User.UserRole.MANAGER,
                User.UserRole.TEACHER,
                User.UserRole.FINANCE,
                User.UserRole.HR,
                User.UserRole.STUDENT,
            ]
            sorted_roles = sorted(u.roles, key=lambda x: order.index(x) if x in order else 99)
            return ", ".join(sorted_roles)

        payload_users = [
            {
                "id": u.id,
                "name": u.name,
                "email": u.email,
                "roles": role_labels(u),
                "created_at": u.created_at.isoformat() if u.created_at else None,
                "last_login": u.last_login.isoformat() if u.last_login else None,
                "is_student_only": u.is_student(),
                "is_active": u.is_active,
            }
            for u in users
        ]

        return self.send_response(
            False,
            "ok",
            {
                "results": payload_users,
                "count": total,
                "page": page,
                "page_size": page_size,
            },
        )


ANALYTICS_MAX_RANGE_DAYS = 800

def _parse_date_or_400(s: str) -> "datetime.date | None":
    try:
        return _parse_ymd(s)
    except ValueError:
        return None


class AnalyticsTimeSeriesView(RBACView):
    """Panel 1: daily series for course starts/ends, payments, enrollments, dropouts."""

    model = None
    serializer = None
    required_permissions = {"GET": "analytics.view"}

    def get(self, request: Request):
        start_s = request.query_params.get("start")
        end_s = request.query_params.get("end")
        if not start_s or not end_s:
            return self.send_response(
                True,
                "bad_request",
                {"message": "Missing 'start' or 'end' (YYYY-MM-DD)."},
                status=400,
            )
        start_d = _parse_date_or_400(start_s)
        end_d = _parse_date_or_400(end_s)
        if start_d is None or end_d is None:
            return self.send_response(
                True,
                "bad_request",
                {"message": "Invalid date format. Use YYYY-MM-DD."},
                status=400,
            )
        if start_d > end_d:
            return self.send_response(
                True,
                "bad_request",
                {"message": "'start' must be on or before 'end'."},
                status=400,
            )
        if (end_d - start_d).days > ANALYTICS_MAX_RANGE_DAYS:
            return self.send_response(
                True,
                "bad_request",
                {
                    "message": f"Range must be at most {ANALYTICS_MAX_RANGE_DAYS} days.",
                },
                status=400,
            )
        org = request.tenant
        series = analytics_services.build_time_series(start_d, end_d, org)
        return self.send_response(
            False,
            "ok",
            {
                "series": series,
                "timezone": analytics_services.tenant_timezone_for_response(org),
            },
        )


class AnalyticsActiveBreakdownView(RBACView):
    """Panel 2: active courses and student seat rows by category (snapshot)."""

    model = None
    serializer = None
    required_permissions = {"GET": "analytics.view"}

    def get(self, request: Request):
        org = request.tenant
        data = analytics_services.build_active_breakdown(org)
        data["is_fm_hm_breakdown_enabled"] = bool(
            getattr(org, "is_fm_hm_course_display_enabled", False)
        )
        return self.send_response(False, "ok", data)


class AnalyticsRevenueView(RBACView):
    """Panel 3: verified revenue by week or month (delta = change vs previous bucket)."""

    model = None
    serializer = None
    required_permissions = {"GET": "analytics.view"}

    def get(self, request: Request):
        start_s = request.query_params.get("start")
        end_s = request.query_params.get("end")
        interval = (request.query_params.get("interval") or "month").lower()
        if interval not in ("week", "month"):
            return self.send_response(
                True,
                "bad_request",
                {"message": "Invalid 'interval'. Use 'week' or 'month'."},
                status=400,
            )
        if not start_s or not end_s:
            return self.send_response(
                True,
                "bad_request",
                {"message": "Missing 'start' or 'end' (YYYY-MM-DD)."},
                status=400,
            )
        start_d = _parse_date_or_400(start_s)
        end_d = _parse_date_or_400(end_s)
        if start_d is None or end_d is None:
            return self.send_response(
                True,
                "bad_request",
                {"message": "Invalid date format. Use YYYY-MM-DD."},
                status=400,
            )
        if start_d > end_d:
            return self.send_response(
                True,
                "bad_request",
                {"message": "'start' must be on or before 'end'."},
                status=400,
            )
        if (end_d - start_d).days > ANALYTICS_MAX_RANGE_DAYS:
            return self.send_response(
                True,
                "bad_request",
                {
                    "message": f"Range must be at most {ANALYTICS_MAX_RANGE_DAYS} days.",
                },
                status=400,
            )
        org = request.tenant
        series = analytics_services.build_revenue_series(start_d, end_d, org, interval)
        return self.send_response(
            False,
            "ok",
            {
                "series": series,
                "interval": interval,
                "timezone": analytics_services.tenant_timezone_for_response(org),
            },
        )


class AnalyticsTeachingLoadView(RBACView):
    """Panel 4: teacher UserCourse rows (active courses, qualifying roles) by category."""

    model = None
    serializer = None
    required_permissions = {"GET": "analytics.view"}

    def get(self, request: Request):
        org = request.tenant
        return self.send_response(
            False, "ok", analytics_services.build_teaching_load(org)
        )


class CourseDataSheetView(RBACView):
    model = None
    serializer = None
    required_permissions = {"GET": "course.view_data_sheet"}

    def get(self, request: Request):
        raw = request.query_params.get("date")
        try:
            d = (
                datetime.datetime.strptime(raw, "%Y-%m-%d").date()
                if raw
                else timezone.now().date()
            )
        except ValueError:
            return self.send_response(
                True,
                "bad_request",
                {"details": "Invalid 'date'. Use YYYY-MM-DD."},
                status=400,
            )
        month_start = d.replace(day=1)
        last = calendar.monthrange(d.year, d.month)[1]
        month_end = d.replace(day=last)
        rows = get_course_data_sheet_rows(month_start, month_end, tenant=request.tenant)
        return self.ok(rows, message="ok")


class StudentDataSheetView(RBACView):
    model = None
    serializer = None
    required_permissions = {"GET": "user.view_data_sheet"}

    def get(self, request: Request):
        rows, courses = get_student_data_sheet_rows(request)
        return self.ok(rows, message="ok", courses=courses)


class StaffDataSheetView(RBACView):
    model = None
    serializer = None
    required_permissions = {"GET": "user.view_data_sheet"}

    def get(self, request: Request):
        rows = get_staff_data_sheet_rows(request)
        return self.ok(rows, message="ok")


class IdPhotosExportView(RBACView):
    model = None
    serializer = None
    required_permissions = {"GET": "user.view_data_sheet"}

    def get(self, request: Request):
        audience = request.query_params.get("audience", "student")
        export_format = request.query_params.get("format", "zip")
        raw_category_id = request.query_params.get("category_id")

        if audience not in ("student", "staff"):
            return self.send_response(
                True,
                "bad_request",
                {"details": "Invalid 'audience'. Use student or staff."},
                status=400,
            )
        if export_format not in ("zip", "pdf"):
            return self.send_response(
                True,
                "bad_request",
                {"details": "Invalid 'format'. Use zip or pdf."},
                status=400,
            )

        category_id = None
        if raw_category_id:
            if audience == "staff":
                return self.send_response(
                    True,
                    "bad_request",
                    {"details": "category_id is only supported for student exports."},
                    status=400,
                )
            try:
                category_id = int(raw_category_id)
            except ValueError:
                return self.send_response(
                    True,
                    "bad_request",
                    {"details": "Invalid 'category_id'."},
                    status=400,
                )

        users = iter_id_photo_users(audience, category_id)
        if export_format == "zip":
            return stream_id_photos_zip(users, audience, category_id)
        return build_id_photos_pdf_response(users, audience, category_id)


class ExcellentChoiceReportView(RBACView):
    model = None
    serializer = None
    required_permissions = {
        "GET": "payment.view_all",
        "POST": "payment.export",
    }

    def _parse_date_range(self, request: Request, *, from_body: bool):
        if from_body:
            raw_from = request.data.get("date_from")
            raw_to = request.data.get("date_to")
        else:
            raw_from = request.query_params.get("date_from")
            raw_to = request.query_params.get("date_to")

        if not raw_from or not raw_to:
            return None, self.send_response(
                True,
                "bad_request",
                {
                    "details": (
                        "Missing 'date_from' or 'date_to' "
                        + ("in request body." if from_body else "query parameters.")
                    )
                },
                status=400,
            )

        try:
            date_from = datetime.datetime.strptime(raw_from, "%Y-%m-%d").date()
            date_to = datetime.datetime.strptime(raw_to, "%Y-%m-%d").date()
        except ValueError:
            return None, self.send_response(
                True,
                "bad_request",
                {"details": "Invalid date format. Use YYYY-MM-DD."},
                status=400,
            )

        if date_from > date_to:
            return None, self.send_response(
                True,
                "bad_request",
                {"details": "date_from must be before or equal to date_to."},
                status=400,
            )

        return (date_from, date_to), None

    def _ensure_excellent_choice_style(self, request: Request):
        if request.tenant.report_style != Organization.ReportStyle.EXCELLENT_CHOICE_STYLE:
            return self.forbidden(
                "This report is only available for Excellent Choice Style organizations."
            )
        return None

    def get(self, request: Request):
        denied = self._ensure_excellent_choice_style(request)
        if denied is not None:
            return denied

        parsed, error = self._parse_date_range(request, from_body=False)
        if error is not None:
            return error
        date_from, date_to = parsed
        rows = excellent_choice_rows(date_from, date_to, org=request.tenant)
        return self.ok(
            rows,
            message="ok",
            columns=ec_columns_meta(),
            summary=excellent_choice_summary_row(rows),
        )

    def post(self, request: Request):
        denied = self._ensure_excellent_choice_style(request)
        if denied is not None:
            return denied

        parsed, error = self._parse_date_range(request, from_body=True)
        if error is not None:
            return error
        date_from, date_to = parsed
        return get_excellent_choice_report(date_from, date_to, org=request.tenant)


class TeacherCoursesReportView(RBACView):
    model = None
    serializer = None
    required_permissions = {
        "GET": "analytics.view",
        "POST": "analytics.view",
    }

    def _parse_date_range(self, request: Request, *, from_body: bool):
        if from_body:
            raw_from = request.data.get("date_from")
            raw_to = request.data.get("date_to")
        else:
            raw_from = request.query_params.get("date_from")
            raw_to = request.query_params.get("date_to")

        if not raw_from or not raw_to:
            return None, self.send_response(
                True,
                "bad_request",
                {
                    "details": (
                        "Missing 'date_from' or 'date_to' "
                        + ("in request body." if from_body else "query parameters.")
                    )
                },
                status=400,
            )

        try:
            date_from = datetime.datetime.strptime(raw_from, "%Y-%m-%d").date()
            date_to = datetime.datetime.strptime(raw_to, "%Y-%m-%d").date()
        except ValueError:
            return None, self.send_response(
                True,
                "bad_request",
                {"details": "Invalid date format. Use YYYY-MM-DD."},
                status=400,
            )

        if date_from > date_to:
            return None, self.send_response(
                True,
                "bad_request",
                {"details": "date_from must be before or equal to date_to."},
                status=400,
            )

        return (date_from, date_to), None

    def _ensure_tr_su_style(self, request: Request):
        if request.tenant.report_style != Organization.ReportStyle.TR_SU_STYLE:
            return self.forbidden(
                "This report is only available for Teacher Su organizations."
            )
        return None

    def get(self, request: Request):
        denied = self._ensure_tr_su_style(request)
        if denied is not None:
            return denied

        parsed, error = self._parse_date_range(request, from_body=False)
        if error is not None:
            return error
        date_from, date_to = parsed
        rows = teacher_courses_rows(date_from, date_to, org=request.tenant)
        return self.ok(
            rows,
            message="ok",
            columns=teacher_courses_columns_meta(),
        )

    def post(self, request: Request):
        denied = self._ensure_tr_su_style(request)
        if denied is not None:
            return denied

        parsed, error = self._parse_date_range(request, from_body=True)
        if error is not None:
            return error
        date_from, date_to = parsed
        return get_teacher_courses_xlsx(date_from, date_to, org=request.tenant)
