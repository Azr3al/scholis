import csv
import io
from collections import defaultdict
from datetime import datetime
from typing import Dict, List, Tuple

from django.db import transaction
from django.utils import timezone
from rest_framework.views import Request
from rest_framework.response import Response

from app_rbac.views import RBACListView, RBACSearchView, RBACView
from app_auth.models import User
from app_hr.hr_scoping import check_payroll_calc_access
from app_hr.models import BuildingCheckin
from app_hr.serializers import BuildingCheckinSerializer


class BuildingCheckinListView(RBACListView):
    name = "BuildingCheckin list view"
    model = BuildingCheckin
    serializer = BuildingCheckinSerializer
    required_permissions = {"GET": "checkin.view_all"}


class BuildingCheckinSearchView(RBACSearchView):
    name = "BuildingCheckin search view"
    model = BuildingCheckin
    serializer = BuildingCheckinSerializer
    required_permissions = {"POST": "checkin.view_all"}

from dateutil import tz as dateutil_tz

from django.db import connection

from app_hr.payroll_funcs import (
    get_cash_flow_trphillips_for_course,
    get_session_based_payments,
    get_tr_payments_trphillips,
)
from app_hr.school_overview_query import build_school_overview_payload


def _is_month_ongoing_in_tenant_tz(month: int, year: int, timezone_code: str) -> bool:
    """True when the requested calendar month is the current month in the tenant timezone."""
    tzinfo = dateutil_tz.gettz(timezone_code)
    now = datetime.now(tzinfo)
    return now.year == year and now.month == month


class DahuaAccessLogParseView(RBACView):
    required_permissions = {"POST": "checkin.view_all"}

    def post(self, request: Request):
        uploaded = request.FILES.get("file")
        if not uploaded:
            return Response(
                {"isError": True, "message": "file_missing", "details": "Upload a CSV file with key 'file'"},
                status=400)

        try:
            raw = uploaded.read()
            text = raw.decode("utf-8-sig", errors="ignore")
        except Exception as e:
            return Response({"isError": True, "message": "decode_error", "details": str(e)}, status=400)

        try:
            dialect = csv.Sniffer().sniff("\n".join(text.splitlines()[:5]) or text)
            delimiter = dialect.delimiter
        except Exception:
            first = text.splitlines()[0] if text.splitlines() else ","
            delimiter = "," if ("," in first) else "\t"

        reader = csv.reader(io.StringIO(text), delimiter=delimiter)
        rows = list(reader)
        if not rows:
            return Response({"isError": True, "message": "empty_file", "details": "No data found"}, status=400)

        header = [h.strip() for h in rows[0]]

        def find_col(cands: List[str]) -> int:
            lc = [h.lower() for h in header]
            for c in cands:
                if c.lower() in lc:
                    return lc.index(c.lower())
            return -1

        idx_emp = find_col(["employee-no"])
        idx_time = find_col(["date"])
        idx_type = find_col(["record-type"])

        if idx_emp == -1 or idx_time == -1 or idx_type == -1:
            return Response({
                "isError": True,
                "message": "invalid_headers",
                "details": {
                    "header": header,
                    "required": ["employee-no", "date", "record-type"],
                },
            }, status=400)

        grouped: Dict[Tuple[str, datetime.date], Dict[str, datetime]] = defaultdict(lambda: {"in": None, "out": None})
        parse_errors = []
        ignored = 0

        for i, row in enumerate(rows[1:], start=2):
            try:
                emp = (row[idx_emp] or "").strip()
                rec_type = (row[idx_type] or "").strip().lower()
                if rec_type not in {"check in", "check out"}:
                    ignored += 1
                    continue
                ts_str = (row[idx_time] or "").strip()
                dt = None
                for fmt in (
                        "%Y/%m/%d %H:%M:%S", "%Y-%m-%d %H:%M:%S", "%d/%m/%Y %H:%M:%S", "%m/%d/%Y %H:%M:%S",
                        "%m/%d/%Y %H:%M",
                        "%d/%m/%Y %H:%M"):
                    try:
                        dt = datetime.strptime(ts_str, fmt)
                        # Make timezone-aware to match database records
                        dt = timezone.make_aware(dt)
                        break
                    except Exception:
                        continue
                if dt is None:
                    raise ValueError(f"Unrecognized datetime format: {ts_str}")
                key = (emp, dt.date())
                record = grouped[key]
                if rec_type == "check in":
                    record["in"] = dt if record["in"] is None or dt < record["in"] else record["in"]
                elif rec_type == "check out":
                    record["out"] = dt if record["out"] is None or dt > record["out"] else record["out"]
            except Exception as e:
                parse_errors.append({"row": i, "error": str(e)})
                continue

        employee_nos = {emp for (emp, d) in grouped.keys() if emp}
        users = User.objects.filter(access_log_name__in=list(employee_nos)).only("id", "access_log_name")
        user_by_emp = {u.access_log_name: u for u in users}

        unknown_users: List[str] = sorted(list(employee_nos.difference(set(user_by_emp.keys()))))

        key_tuples: List[Tuple[int, datetime.date]] = []
        for (emp, d), times in grouped.items():
            u = user_by_emp.get(emp)
            if not u:
                continue
            key_tuples.append((u.id, d))

        created = 0
        updated = 0
        skipped = 0

        if key_tuples:
            user_ids = list({uid for uid, _ in key_tuples})
            dates = list({dt for _, dt in key_tuples})
            existing_qs = BuildingCheckin.objects.filter(user_id__in=user_ids, date__in=dates).only("id", "user_id",
                                                                                                    "date",
                                                                                                    "actual_checkin_time",
                                                                                                    "actual_checkout_time")
        else:
            existing_qs = BuildingCheckin.objects.none()

        existing_map: Dict[Tuple[int, datetime.date], BuildingCheckin] = {
            (bc.user_id, bc.date): bc for bc in existing_qs
        }

        to_create: List[BuildingCheckin] = []
        to_update: List[BuildingCheckin] = []

        with transaction.atomic():
            for (emp, d), times in grouped.items():
                u = user_by_emp.get(emp)
                if not u:
                    continue
                key = (u.id, d)
                existing = existing_map.get(key)
                if existing:
                    if existing.actual_checkin_time == times["in"] and existing.actual_checkout_time == times["out"]:
                        skipped += 1
                        continue
                    new_in = existing.actual_checkin_time
                    new_out = existing.actual_checkout_time
                    if times["in"]:
                        new_in = times["in"] if (new_in is None or times["in"] < new_in) else new_in
                    if times["out"]:
                        new_out = times["out"] if (new_out is None or times["out"] > new_out) else new_out
                    if new_in != existing.actual_checkin_time or new_out != existing.actual_checkout_time:
                        existing.actual_checkin_time = new_in
                        existing.actual_checkout_time = new_out
                        to_update.append(existing)
                        updated += 1
                    else:
                        skipped += 1
                else:
                    obj = BuildingCheckin(user_id=u.id, date=d, actual_checkin_time=times["in"],
                                          actual_checkout_time=times["out"])
                    to_create.append(obj)
                    created += 1

            if to_create:
                BuildingCheckin.objects.bulk_create(to_create, ignore_conflicts=True)
            if to_update:
                BuildingCheckin.objects.bulk_update(to_update, ["actual_checkin_time", "actual_checkout_time"])

        return Response({
            "isError": False,
            "message": "parsed",
            "data": {
                "created": created,
                "updated": updated,
                "skipped": skipped,
                "ignored_non_check_rows": ignored,
                "unknown_users": unknown_users,
                "parse_errors": parse_errors,
                "records": len(grouped),
            },
        })


class TrPhillipsPayrollCalculationView(RBACView):
    required_permissions = {"POST": "payroll.view_all"}

    def check_permissions(self, request):
        if request.method != "POST":
            super().check_permissions(request)
            return
        try:
            target_user_id = int(request.data.get("user_id"))
        except (TypeError, ValueError):
            super().check_permissions(request)
            return
        check_payroll_calc_access(request, target_user_id)

    def post(self, request):
        month = int(request.data.get("month"))
        year = int(request.data.get("year"))
        user_id = int(request.data.get("user_id"))
        if not month or month < 1 or month > 12:
            return self.send_response(True, "invalid_month", {
                "details": "Month must be an integer between 1 and 12",
            })
        if not year or year < 1900 or year > 2100:
            return self.send_response(True, "invalid_year", {
                "details": "Year must be a valid integer year",
            })
        if not user_id:
            return self.send_response(True, "invalid_user_id", {
                "details": "User ID must be provided",
            })
        user = User.objects.filter(id=user_id).first()
        if not user:
            return self.send_response(True, "user_not_found", {
                "details": f"User with ID {user_id} not found",
            }, status=404)
        result = get_tr_payments_trphillips(user, month, year, request.tenant.timezone)
        return self.send_response(False, "calculation_done", {
            "data": result["data"],
            "aggregate": result["aggregate"],
        })


class SessionBasedPayrollCalculationView(RBACView):
    required_permissions = {"POST": "payroll.view_all"}

    def check_permissions(self, request):
        if request.method != "POST":
            super().check_permissions(request)
            return
        try:
            target_user_id = int(request.data.get("user_id"))
        except (TypeError, ValueError):
            super().check_permissions(request)
            return
        check_payroll_calc_access(request, target_user_id)

    def post(self, request):
        month = int(request.data.get("month"))
        year = int(request.data.get("year"))
        user_id = int(request.data.get("user_id"))
        if not month or month < 1 or month > 12:
            return self.send_response(True, "invalid_month", {
                "details": "Month must be an integer between 1 and 12",
            })
        if not year or year < 1900 or year > 2100:
            return self.send_response(True, "invalid_year", {
                "details": "Year must be a valid integer year",
            })
        if not user_id:
            return self.send_response(True, "invalid_user_id", {
                "details": "User ID must be provided",
            })
        user = User.objects.filter(id=user_id).first()
        if not user:
            return self.send_response(True, "user_not_found", {
                "details": f"User with ID {user_id} not found",
            }, status=404)
        result = get_session_based_payments(user, month, year, request.tenant.timezone)
        return self.send_response(False, "calculation_done", {
            "data": result["data"],
            "aggregate": result["aggregate"],
        })


class CashFlowTrPhillipsView(RBACView):
    required_permissions = {"POST": "analytics.view"}
    """
    Cash flow for tr.phillips (tenant-scoped via django-tenant middleware / HTTP_X_DTS_SCHEMA).

    POST /api/v1/cash-flow/trphillips
    Body JSON: month (1–12), year, course_id (aggregates that course across all teachers).

    Response envelope: { isError, message, rows, aggregate, is_ongoing_month }.
    Rows are sorted by event date; columns include date, student_count, hours, income (per_hour_price
    * student_count * hours), expense (hours-weighted share of per-course tr.phillips payroll), profit.
    Aggregate: total_income, total_expense, total_profit, regular_hours, extra_hours, total_teacher_payroll, currency.
    ``is_ongoing_month`` is true when the selected month/year is the current month in the tenant timezone
    (totals and per-row payroll allocation may still change until the month closes).
    Monetary values are decimal strings (USD).
    """

    def post(self, request):
        month = int(request.data.get("month"))
        year = int(request.data.get("year"))
        course_raw = request.data.get("course_id")
        if course_raw in (None, ""):
            return self.send_response(
                True,
                "invalid_course_id",
                {"details": "course_id is required"},
                status=400,
            )
        try:
            course_id = int(course_raw)
        except (TypeError, ValueError):
            return self.send_response(
                True,
                "invalid_course_id",
                {"details": "course_id must be an integer"},
                status=400,
            )
        if not month or month < 1 or month > 12:
            return self.send_response(
                True,
                "invalid_month",
                {"details": "Month must be an integer between 1 and 12"},
            )
        if not year or year < 1900 or year > 2100:
            return self.send_response(
                True,
                "invalid_year",
                {"details": "Year must be a valid integer year"},
            )
        result = get_cash_flow_trphillips_for_course(
            course_id,
            month,
            year,
            request.tenant.timezone,
        )
        return self.send_response(False, "cash_flow_done", {
            "rows": result["rows"],
            "aggregate": result["aggregate"],
            "is_ongoing_month": _is_month_ongoing_in_tenant_tz(
                month,
                year,
                request.tenant.timezone,
            ),
        })


class SchoolOverviewTrPhillipsView(RBACView):
    required_permissions = {"POST": "analytics.view"}
    """
    School-wide tr.phillips cash flow summary per course for a month.

    POST /api/v1/cash-flow/trphillips/school-overview
    Body JSON: month (1–12), year, optional q/page/size/sorts.

    Response: courses (page), count, grand_aggregate (full month), is_ongoing_month.
    """

    def post(self, request):
        month = int(request.data.get("month"))
        year = int(request.data.get("year"))
        if not month or month < 1 or month > 12:
            return self.send_response(
                True,
                "invalid_month",
                {"details": "Month must be an integer between 1 and 12"},
            )
        if not year or year < 1900 or year > 2100:
            return self.send_response(
                True,
                "invalid_year",
                {"details": "Year must be a valid integer year"},
            )

        q = request.data.get("q") or ""
        if not isinstance(q, str):
            q = str(q)

        try:
            page = int(request.data.get("page") or 1)
        except (TypeError, ValueError):
            page = 1
        try:
            size = int(request.data.get("size") or 20)
        except (TypeError, ValueError):
            size = 20

        sorts = request.data.get("sorts")
        if isinstance(sorts, str):
            sorts = [s.strip() for s in sorts.split(",") if s.strip()]
        elif not isinstance(sorts, list):
            sorts = None
        else:
            sorts = [str(s) for s in sorts if s]

        schema_name = getattr(request.tenant, "schema_name", None) or connection.schema_name
        result = build_school_overview_payload(
            schema_name=schema_name,
            timezone_code=request.tenant.timezone,
            month=month,
            year=year,
            q=q,
            page=page,
            size=size,
            sorts=sorts,
        )
        return self.send_response(False, "school_overview_done", {
            "courses": result["courses"],
            "count": result["count"],
            "grand_aggregate": result["grand_aggregate"],
            "is_ongoing_month": _is_month_ongoing_in_tenant_tz(
                month,
                year,
                request.tenant.timezone,
            ),
        })
