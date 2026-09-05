from decimal import Decimal

import io
import os
import re
import tempfile
import zipfile
from datetime import datetime

import xlsxwriter
from django.db import connection
from django.http import HttpResponse, StreamingHttpResponse
from PIL import Image as PilImage
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from app_auth.models import User
from app_course.models import Course, UserAttendance, UserCourse
from app_finance.excellent_choice_report import (
    EC_COLUMNS,
    excellent_choice_rows,
    excellent_choice_summary_row,
)
from app_reports.analytics_services import _tz_for_tenant
from app_reports.sql_strings import course_data_sheet_sql
from schedjuice_backend.storages import PrivateMediaStorage


def create_formats(workbook):
    return {
        "header": workbook.add_format({
            "bold": True,
            "border": 1,
            "align": "center",
            "valign": "vcenter"
        }),
        "cell": workbook.add_format({
            "border": 1,
            "valign": "top"
        }),
        "center": workbook.add_format({
            "border": 1,
            "align": "center",
            "valign": "vcenter"
        }),
    }


def dictfetchall(cursor):
    """
    Return all rows from a cursor as a dict.
    Assume the column names are unique.
    """
    columns = [col[0] for col in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


def get_course_type(course: Course):
    # if the course's events are on weekends, it's a weekend course
    if any(e.date.weekday() in [5, 6] for e in course.events.all()):
        return "WE"
    # if there are no events: return "no data"
    if course.events.count() == 0:
        return "OTHER"
    # if the course's events are on weekdays, it's a weekday course
    return "WD"


def _payroll_decimal_display(d: Decimal) -> str:
    """Human-readable decimal for Excel cells (strip trailing zeros)."""
    t = d.normalize()
    s = format(t, "f")
    if "." in s:
        s = s.rstrip("0").rstrip(".")
    return s or "0"


def _payroll_rate_segment(rates_non_null: set, has_null_rate: bool) -> str:
    """
    One course's hourly_rate_at_creation summary.
    Null rates (sessions with no rate) are shown as em dash, consistent with zero earnings for those rows.
    """
    parts = []
    if rates_non_null:
        parts.extend(_payroll_decimal_display(r) for r in sorted(rates_non_null))
    if has_null_rate:
        parts.append("—")
    return "\n".join(parts) if parts else "—"


def _payroll_per_course_strings(by_course: dict, hours_dp: int = 2) -> tuple[str, str, str]:
    """Build newline-separated per-course strings (one course per line in Excel) sorted by title."""
    items = sorted(by_course.values(), key=lambda x: x["title"])
    hours_parts = []
    sess_parts = []
    rate_parts = []
    for c in items:
        title = c["title"]
        h = round(c["duration_seconds"] / 3600, hours_dp)
        hours_parts.append(f"{title}: {h}hr")
        sess_parts.append(f"{title}: {c['sessions']}s")
        seg = _payroll_rate_segment(c["rates_non_null"], c["has_null_rate"])
        rate_parts.append(f"{title}: {seg}")
    sep = "\n"
    return sep.join(hours_parts), sep.join(sess_parts), sep.join(rate_parts)


def get_payroll_report(start_date, end_date, user_id=None):
    """
    Generate payroll Excel report from UserAttendance.
    Filters by join_datetime between start_date and end_date.
    Optional user_id filters to a specific teacher.
    """
    qs = UserAttendance.objects.filter(
        join_datetime__date__gte=start_date,
        join_datetime__date__lte=end_date,
    ).select_related("user", "course")

    if user_id:
        qs = qs.filter(user_id=user_id)

    # Aggregate by user and per (user, course)
    user_totals = {}

    for att in qs:
        duration_seconds = max(0, int((att.leave_datetime - att.join_datetime).total_seconds()))
        rate = att.hourly_rate_at_creation
        if rate is not None:
            hours = Decimal(duration_seconds) / Decimal("3600")
            earning = (hours * rate).quantize(Decimal("0.01"))
        else:
            earning = Decimal("0")

        if att.user_id not in user_totals:
            user_totals[att.user_id] = {
                "user": att.user,
                "sessions": 0,
                "duration_seconds": 0,
                "earnings": Decimal("0"),
                "by_course": {},
            }
        u = user_totals[att.user_id]
        u["sessions"] += 1
        u["duration_seconds"] += duration_seconds
        u["earnings"] += earning

        by_course = u["by_course"]
        cid = att.course_id
        if cid not in by_course:
            by_course[cid] = {
                "title": att.course.title,
                "sessions": 0,
                "duration_seconds": 0,
                "rates_non_null": set(),
                "has_null_rate": False,
            }
        bc = by_course[cid]
        bc["sessions"] += 1
        bc["duration_seconds"] += duration_seconds
        if rate is None:
            bc["has_null_rate"] = True
        else:
            bc["rates_non_null"].add(rate)

    rows = []
    for u in user_totals.values():
        hours_pc, sess_pc, rate_pc = _payroll_per_course_strings(u["by_course"])
        usr = u["user"]
        rows.append({
            "name": usr.name,
            "alternative_name": usr.alternative_name or "",
            "email": usr.email,
            "total_hours": round(u["duration_seconds"] / 3600, 2),
            "total_sessions": u["sessions"],
            "hours_per_course": hours_pc,
            "sessions_per_course": sess_pc,
            "rate_per_course": rate_pc,
            "earnings": u["earnings"],
        })

    # Build Excel
    output = io.BytesIO()
    workbook = xlsxwriter.Workbook(output, {"in_memory": True})
    fmts = create_formats(workbook)

    money_fmt = workbook.add_format({
        "num_format": "#,##0.00",
        "align": "right",
    })

    cell_wrap = workbook.add_format({
        "border": 1,
        "valign": "top",
        "text_wrap": True,
    })

    ws = workbook.add_worksheet("Payroll Report")
    ws.set_column("A:A", 28)
    ws.set_column("B:B", 22)
    ws.set_column("C:C", 36)
    ws.set_column("D:D", 14)
    ws.set_column("E:E", 14)
    ws.set_column("F:F", 55)
    ws.set_column("G:G", 55)
    ws.set_column("H:H", 55)
    ws.set_column("I:I", 16)

    row = 0

    headers = [
        "Name",
        "Alternative name",
        "Email",
        "Total hours",
        "Total sessions",
        "Total hours (per course)",
        "Total sessions (per course)",
        "Hourly rate at session (per course)",
        "Total earnings",
    ]
    for col, h in enumerate(headers):
        ws.write(row, col, h, fmts["header"])
    row += 1

    for r in sorted(rows, key=lambda x: x["name"]):
        ws.write(row, 0, r["name"], fmts["cell"])
        ws.write(row, 1, r["alternative_name"], fmts["cell"])
        ws.write(row, 2, r["email"], fmts["cell"])
        ws.write(row, 3, r["total_hours"], fmts["center"])
        ws.write(row, 4, r["total_sessions"], fmts["center"])
        ws.write(row, 5, r["hours_per_course"], cell_wrap)
        ws.write(row, 6, r["sessions_per_course"], cell_wrap)
        ws.write(row, 7, r["rate_per_course"], cell_wrap)
        ws.write(row, 8, float(r["earnings"]), money_fmt)
        row += 1

    workbook.close()
    output.seek(0)

    filename = f"payroll_report_{start_date}_{end_date}_{datetime.now().strftime('%Y%m%d_%H%M')}.xlsx"

    response = HttpResponse(
        output,
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    response["Content-Disposition"] = f'attachment; filename="{filename}"'

    return response


STUDENT_SHEET_FIELDS = [
    "id",
    "name",
    "alternative_name",
    "code",
    "id_card_class_name",
    "phone_number",
    "communication_email",
    "gender",
    "date_of_birth",
    "nrc_passport",
    "city",
    "township",
    "region",
    "facebook_account_link",
    "house_number",
    "street",
    "country",
    "delivery_address",
    "emergency_contact_name",
    "emergency_contact_phone_number",
    "emergency_contact_relationship",
]


def get_course_data_sheet_rows(month_start, month_end, tenant=None):
    """Return flat course rows overlapping [month_start, month_end] for the sheet."""
    with connection.cursor() as cur:
        cur.execute(course_data_sheet_sql, [month_end, month_start])
        rows = dictfetchall(cur)
    tz = _tz_for_tenant(tenant) if tenant is not None else None
    for r in rows:
        if r.get("start_date"):
            r["start_date"] = r["start_date"].isoformat()
        if r.get("end_date"):
            r["end_date"] = r["end_date"].isoformat()
        if r.get("start_time"):
            r["start_time"] = r["start_time"].strftime("%H:%M")
        if r.get("end_time"):
            r["end_time"] = r["end_time"].strftime("%H:%M")
        updated_at = r.pop("current_unit_updated_at", None)
        if updated_at is None:
            r["current_unit_updated_at"] = None
        elif tz is not None:
            r["current_unit_updated_at"] = updated_at.astimezone(tz).date().isoformat()
        else:
            r["current_unit_updated_at"] = updated_at.date().isoformat()
    return rows


def _student_sheet_user_fields():
    return STUDENT_SHEET_FIELDS + ["custom_data", "id_photo", "blood_type"]


def _student_data_sheet_course_options(active_courses):
    """Active courses with at least one non-dropped student enrollment (filter-independent)."""
    from django.db.models import Exists, OuterRef

    enrolled = UserCourse.objects.filter(
        course_id=OuterRef("pk"),
        assigned_as=UserCourse.AssignedAs.STUDENT,
    )
    return (
        active_courses.filter(Exists(enrolled))
        .order_by("title")
        .values("id", "title")
    )


def _parse_course_id_param(request) -> int | None:
    if request is None:
        return None
    raw = request.query_params.get("course_id")
    if not raw:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def get_student_data_sheet_rows(request=None):
    """Active student-role users who have at least one non-dropped enrollment in an active course."""
    from django.db.models import Exists, OuterRef, Prefetch

    from app_auth.student_enrollment import (
        active_student_enrollments_qs,
        actively_enrolled_students_qs,
        effectively_active_courses_qs,
    )
    from app_auth.user_search import (
        STUDENT_DATA_SHEET_SEARCH_KEY,
        get_search_q,
    )
    from app_custom_fields.constants import ENTITY_TYPE_USER
    from app_custom_fields.validation import representation_custom_data
    from utilitas.search import apply_entity_search

    active_courses = effectively_active_courses_qs()
    course_options = [
        {"id": row["id"], "title": row["title"]}
        for row in _student_data_sheet_course_options(active_courses)
    ]
    active_enrollments = active_student_enrollments_qs(active_courses)
    students = actively_enrolled_students_qs().only(*_student_sheet_user_fields()).prefetch_related(
        Prefetch(
            "user_courses",
            queryset=active_enrollments,
            to_attr="active_student_courses",
        )
    )
    course_id = _parse_course_id_param(request)
    if course_id is not None:
        course_enrollment_exists = UserCourse.objects.filter(
            user_id=OuterRef("pk"),
            assigned_as=UserCourse.AssignedAs.STUDENT,
            course__in=active_courses,
            course_id=course_id,
        )
        students = students.filter(Exists(course_enrollment_exists))

    q = get_search_q(request)
    if q:
        students, _ = apply_entity_search(STUDENT_DATA_SHEET_SEARCH_KEY, students, q)
    else:
        students = students.order_by("name")

    from app_auth.id_card_class import resolve_id_card_class_names
    from app_auth.id_card_expiry import resolve_id_card_expiry_dates

    student_list = list(students)
    class_displays = resolve_id_card_class_names(student_list)
    tenant = getattr(request, "tenant", None) if request else None
    expiry_displays = resolve_id_card_expiry_dates(
        student_list,
        course_id=course_id,
        tenant=tenant,
    )

    storage = PrivateMediaStorage()
    out = []
    for s in student_list:
        row = {f: getattr(s, f) for f in STUDENT_SHEET_FIELDS}
        if row["date_of_birth"]:
            row["date_of_birth"] = row["date_of_birth"].isoformat()
        row["custom_data"] = representation_custom_data(
            ENTITY_TYPE_USER, s.custom_data or {}, request=request
        )
        row["courses"] = [
            {"id": uc.course_id, "title": uc.course.title}
            for uc in getattr(s, "active_student_courses", [])
        ]
        row["has_id_photo"] = bool(s.id_photo)
        _enrich_data_sheet_user_row(
            s,
            row,
            storage=storage,
            id_card_class_display=class_displays.get(s.pk),
            id_card_expiry_display=expiry_displays.get(s.pk),
        )
        out.append(row)
    return out, course_options


def _id_photo_url_for_user(
    user: User, *, storage: PrivateMediaStorage | None = None
) -> str | None:
    if not user.id_photo:
        return None
    try:
        media = storage or PrivateMediaStorage()
        return media.url(user.id_photo.name, expire=3600)
    except Exception:
        return None


def _id_verify_token_for_user(user: User) -> str | None:
    from django.db import connection

    from app_auth.id_card_tokens import encode_id_verify_token

    try:
        return encode_id_verify_token(uid=user.pk, schema=connection.schema_name)
    except Exception:
        return None


def _id_verify_code_for_user(user: User) -> str | None:
    from app_auth.id_verify_code import ensure_id_verify_code

    try:
        return ensure_id_verify_code(user)
    except Exception:
        return None


def _enrich_data_sheet_user_row(
    user: User,
    row: dict,
    *,
    storage: PrivateMediaStorage | None = None,
    id_card_class_display: str | None = None,
    id_card_expiry_display: str | None = None,
) -> dict:
    row["id_photo_url"] = _id_photo_url_for_user(user, storage=storage)
    row["blood_type"] = user.blood_type or None
    row["id_verify_token"] = _id_verify_token_for_user(user)
    row["id_verify_code"] = _id_verify_code_for_user(user)
    row["id_card_class_display"] = id_card_class_display
    row["id_card_expiry_display"] = id_card_expiry_display
    return row


def get_staff_data_sheet_rows(request=None):
    """Active non-student users for the staff data spreadsheet."""
    from app_auth.user_search import (
        STAFF_DATA_SHEET_SEARCH_KEY,
        get_search_q,
    )
    from utilitas.search import apply_entity_search

    staff = (
        User.objects.filter(is_active=True)
        .exclude(roles__contains=[User.UserRole.STUDENT])
        .only(*(_student_sheet_user_fields() + ["roles"]))
    )
    q = get_search_q(request)
    if q:
        staff, _ = apply_entity_search(STAFF_DATA_SHEET_SEARCH_KEY, staff, q)
    else:
        staff = staff.order_by("name")

    from app_auth.id_card_class import resolve_id_card_class_names

    staff_list = list(staff)
    class_displays = resolve_id_card_class_names(staff_list)

    storage = PrivateMediaStorage()
    out = []
    for s in staff_list:
        row = {f: getattr(s, f) for f in STUDENT_SHEET_FIELDS}
        if row["date_of_birth"]:
            row["date_of_birth"] = row["date_of_birth"].isoformat()
        row["roles"] = list(s.roles or [])
        row["has_id_photo"] = bool(s.id_photo)
        _enrich_data_sheet_user_row(
            s,
            row,
            storage=storage,
            id_card_class_display=class_displays.get(s.pk),
        )
        out.append(row)
    return out


def iter_id_photo_users(audience: str, category_id: int | None = None):
    """Users with an id_photo for bulk export (students optionally scoped by course category)."""
    qs = (
        User.objects.filter(is_active=True)
        .exclude(id_photo="")
        .filter(id_photo__isnull=False)
        .order_by("name")
    )
    if audience == "student":
        qs = qs.filter(roles__contains=[User.UserRole.STUDENT])
        if category_id is not None:
            qs = qs.filter(
                user_courses__assigned_as=UserCourse.AssignedAs.STUDENT,
                user_courses__user_courses__course__status=Course.CourseStatus.ACTIVE,
                user_courses__course__category_id=category_id,
            ).distinct()
    elif audience == "staff":
        qs = qs.exclude(roles__contains=[User.UserRole.STUDENT])
    else:
        raise ValueError(f"Invalid audience: {audience}")
    return qs


def _slug_for_filename(value: str | None, fallback: str) -> str:
    cleaned = re.sub(r"[^\w\s-]", "", (value or "").strip())
    slug = re.sub(r"[-\s]+", "-", cleaned).strip("-")
    return (slug[:50] or fallback)


def _id_photo_zip_entry_name(user: User, used_names: set[str]) -> str:
    base = user.code or str(user.id)
    slug = _slug_for_filename(user.name, str(user.id))
    ext = os.path.splitext(user.id_photo.name or "")[1].lower()
    if ext not in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
        ext = ".jpg"
    name = f"{base}-{slug}{ext}"
    if name in used_names:
        suffix = 2
        while f"{base}-{slug}-{suffix}{ext}" in used_names:
            suffix += 1
        name = f"{base}-{slug}-{suffix}{ext}"
    used_names.add(name)
    return name


def _export_filename(audience: str, format: str, category_id: int | None) -> str:
    parts = [audience, "id-photos"]
    if category_id is not None:
        parts.append(f"cat-{category_id}")
    ext = "zip" if format == "zip" else "pdf"
    return "-".join(parts) + f".{ext}"


def stream_id_photos_zip(users, audience: str, category_id: int | None) -> StreamingHttpResponse:
    """Build a ZIP on disk then stream it (keeps RAM flat for large exports)."""
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".zip")
    tmp_path = tmp.name
    tmp.close()

    used_names: set[str] = set()
    try:
        with zipfile.ZipFile(tmp_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for user in users.iterator(chunk_size=200):
                if not user.id_photo:
                    continue
                entry_name = _id_photo_zip_entry_name(user, used_names)
                try:
                    with user.id_photo.open("rb") as photo_file:
                        zf.writestr(entry_name, photo_file.read())
                except Exception:
                    continue
    except Exception:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        raise

    filename = _export_filename(audience, "zip", category_id)

    def file_iterator():
        try:
            with open(tmp_path, "rb") as f:
                while True:
                    chunk = f.read(8192)
                    if not chunk:
                        break
                    yield chunk
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

    response = StreamingHttpResponse(file_iterator(), content_type="application/zip")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


def build_id_photos_pdf_response(
    users, audience: str, category_id: int | None
) -> HttpResponse:
    """PDF contact sheet: grid of ID photos with name and code labels."""
    page_w, page_h = A4
    cols, rows_per_page = 4, 5
    margin_x, margin_y = 36, 36
    cell_w = (page_w - 2 * margin_x) / cols
    cell_h = (page_h - 2 * margin_y) / rows_per_page
    photo_h = cell_h * 0.72
    label_h = cell_h - photo_h

    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    index = 0

    for user in users.iterator(chunk_size=200):
        if not user.id_photo:
            continue
        col = index % cols
        row = (index % (cols * rows_per_page)) // cols
        if index > 0 and index % (cols * rows_per_page) == 0:
            pdf.showPage()

        x = margin_x + col * cell_w
        y = page_h - margin_y - (row + 1) * cell_h

        try:
            with user.id_photo.open("rb") as photo_file:
                pil_img = PilImage.open(photo_file)
                pil_img.load()
            img_reader = ImageReader(pil_img)
            pdf.drawImage(
                img_reader,
                x + 4,
                y + label_h + 2,
                width=cell_w - 8,
                height=photo_h - 4,
                preserveAspectRatio=True,
                anchor="c",
            )
        except Exception:
            pdf.setFont("Helvetica", 8)
            pdf.drawString(x + 4, y + label_h + photo_h / 2, "No image")

        label = user.name or "—"
        code = user.code or str(user.id)
        pdf.setFont("Helvetica-Bold", 7)
        pdf.drawString(x + 4, y + label_h - 2, label[:40])
        pdf.setFont("Helvetica", 7)
        pdf.drawString(x + 4, y + 4, code[:24])
        index += 1

    if index == 0:
        pdf.setFont("Helvetica", 12)
        pdf.drawString(margin_x, page_h / 2, "No ID photos found for this export.")

    pdf.save()
    buffer.seek(0)
    filename = _export_filename(audience, "pdf", category_id)
    response = HttpResponse(buffer.getvalue(), content_type="application/pdf")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


def get_excellent_choice_report(date_from, date_to, org=None):
    rows = excellent_choice_rows(date_from, date_to, org=org)
    summary = excellent_choice_summary_row(rows)

    output = io.BytesIO()
    workbook = xlsxwriter.Workbook(output, {"in_memory": True})
    fmts = create_formats(workbook)
    cell_wrap = workbook.add_format({
        "border": 1,
        "valign": "top",
        "text_wrap": True,
    })
    summary_label_fmt = workbook.add_format({
        "border": 1,
        "valign": "top",
        "bold": True,
    })
    summary_total_fmt = workbook.add_format({
        "border": 1,
        "valign": "top",
        "bold": True,
        "align": "right",
    })

    ws = workbook.add_worksheet("Excellent Choice")
    for col_index, (_, header, width) in enumerate(EC_COLUMNS):
        ws.set_column(col_index, col_index, width)

    row_index = 0
    for col_index, (_, header, _width) in enumerate(EC_COLUMNS):
        ws.write(row_index, col_index, header, fmts["header"])
    ws.freeze_panes(1, 0)
    row_index += 1

    multiline_keys = {
        "sub",
        "series",
        "discount_type",
        "bank_ac",
        "transaction_id",
    }

    for row in rows:
        max_lines = 1
        for key, _header, _width in EC_COLUMNS:
            value = row.get(key, "")
            if key in multiline_keys and value:
                max_lines = max(max_lines, value.count("\n") + 1)
        ws.set_row(row_index, 15 * max_lines)

        for col_index, (key, _header, _width) in enumerate(EC_COLUMNS):
            value = row.get(key, "")
            fmt = cell_wrap if key in multiline_keys else fmts["cell"]
            ws.write(row_index, col_index, value, fmt)
        row_index += 1

    ws.write(row_index, 0, summary["date"], summary_label_fmt)
    ws.write(row_index, 1, summary["voucher_no"], summary_total_fmt)
    for col_index in range(2, len(EC_COLUMNS)):
        ws.write(row_index, col_index, "", fmts["cell"])

    workbook.close()
    output.seek(0)

    filename = (
        f"excellent_choice_{date_from.isoformat()}_{date_to.isoformat()}.xlsx"
    )
    response = HttpResponse(
        output,
        content_type=(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ),
    )
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response
