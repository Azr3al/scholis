import json
from dataclasses import dataclass, field

from rest_framework.request import Request

from app_announcement.announcement_create_helpers import (
    apply_upload_files_to_announcement,
    get_upload_files_from_request,
    parse_multipart_announcement_data,
)
from app_course.models import Course
from app_microsoft.announcement_helpers import schedule_announcement_teams_sync

MAX_BATCH_COURSE_IDS = 25


@dataclass
class BatchCreateRow:
    id: int
    course_id: int


@dataclass
class BatchCreateFailure:
    course_id: int
    error: str


@dataclass
class BatchCreateResult:
    created: list[BatchCreateRow] = field(default_factory=list)
    failed: list[BatchCreateFailure] = field(default_factory=list)


class BatchCreateValidationError(ValueError):
    """Raised when the batch request payload is invalid before per-course work."""


def _dedupe_preserve_order(course_ids: list[int]) -> list[int]:
    seen: set[int] = set()
    result: list[int] = []
    for course_id in course_ids:
        if course_id not in seen:
            seen.add(course_id)
            result.append(course_id)
    return result


def parse_course_ids(raw) -> list[int]:
    if raw in (None, ""):
        return []
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise BatchCreateValidationError(
                "course_ids must be a valid JSON array."
            ) from exc
    else:
        parsed = raw
    if not isinstance(parsed, list):
        raise BatchCreateValidationError("course_ids must be a JSON array.")
    result: list[int] = []
    for item in parsed:
        try:
            result.append(int(item))
        except (TypeError, ValueError) as exc:
            raise BatchCreateValidationError(
                "course_ids must contain integers only."
            ) from exc
    return _dedupe_preserve_order(result)


def _serializer_error_message(errors) -> str:
    if isinstance(errors, dict):
        parts = []
        for key, value in errors.items():
            if isinstance(value, list):
                parts.append(f"{key}: {', '.join(str(v) for v in value)}")
            else:
                parts.append(f"{key}: {value}")
        return "; ".join(parts) if parts else "Validation failed."
    return str(errors)


def create_announcements_batch(
    request: Request,
    serializer_class,
) -> BatchCreateResult:
    data = request.data
    parsed = parse_multipart_announcement_data(data)

    if data.get("course") not in (None, "") or parsed.get("course") is not None:
        raise BatchCreateValidationError(
            "Do not send course on batch create; use course_ids instead."
        )
    if data.get("course_filters") not in (None, "") or parsed.get("course_filters"):
        raise BatchCreateValidationError(
            "course_filters is not supported for batch create."
        )

    course_ids = parse_course_ids(data.get("course_ids"))
    if not course_ids:
        raise BatchCreateValidationError("course_ids must not be empty.")
    if len(course_ids) > MAX_BATCH_COURSE_IDS:
        raise BatchCreateValidationError(
            f"At most {MAX_BATCH_COURSE_IDS} courses per batch request."
        )

    base_data = {
        k: v
        for k, v in parsed.items()
        if k not in ("course", "course_filters")
    }
    upload_files = get_upload_files_from_request(request)
    courses_by_id = {
        course.id: course
        for course in Course.objects.filter(pk__in=course_ids)
    }
    tenant = getattr(request, "tenant", None)
    result = BatchCreateResult()

    for course_id in course_ids:
        if course_id not in courses_by_id:
            result.failed.append(
                BatchCreateFailure(course_id=course_id, error="Course not found.")
            )
            continue

        course_data = {**base_data, "course": course_id}
        ser = serializer_class(
            data=course_data,
            context={"skip_teams_schedule": True, "request": request},
        )
        if not ser.is_valid():
            result.failed.append(
                BatchCreateFailure(
                    course_id=course_id,
                    error=_serializer_error_message(ser.errors),
                )
            )
            continue

        instance = ser.save()
        apply_upload_files_to_announcement(instance, upload_files)
        if tenant and instance.send_to_microsoft:
            schedule_announcement_teams_sync(instance, tenant)
        result.created.append(BatchCreateRow(id=instance.id, course_id=course_id))

    return result


def batch_result_to_payload(result: BatchCreateResult) -> dict:
    return {
        "created": [
            {"id": row.id, "course_id": row.course_id} for row in result.created
        ],
        "failed": [
            {"course_id": row.course_id, "error": row.error}
            for row in result.failed
        ],
    }
