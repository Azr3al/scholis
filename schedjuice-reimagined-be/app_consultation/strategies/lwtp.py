from __future__ import annotations

from django.db.models import TextChoices

from app_course.models import Course, Subject

STRATEGY_KEY = "lwtp"

LWTP_DETAIL_KEYS = frozenset(
    {
        "strategy",
        "myanmar_name",
        "phone",
        "telegram_username",
        "exam_target",
        "class_preference",
        "exam_board",
        "subject_ids",
        "subject_names",
        "subject_other",
    }
)

LWTP_INPUT_KEYS = frozenset(LWTP_DETAIL_KEYS - {"strategy", "subject_names"})


class ClassPreference(TextChoices):
    PREMIUM_ONE_ON_ONE = "premium_one_on_one", "Premium one on one special class"
    GROUP_CLASS = "group_class", "Group class"
    BOTH_OK = "both_ok", "Both is ok"


CLASS_PREFERENCE_LABELS = {
    ClassPreference.PREMIUM_ONE_ON_ONE: ClassPreference.PREMIUM_ONE_ON_ONE.label,
    ClassPreference.GROUP_CLASS: ClassPreference.GROUP_CLASS.label,
    ClassPreference.BOTH_OK: ClassPreference.BOTH_OK.label,
}

EXAM_BOARDS = [Course.ExamBoard.CIE, Course.ExamBoard.EDEXCEL]


class BookingDetailsValidationError(ValueError):
    pass


def subjects_for_exam_board(board: str):
    return Subject.objects.filter(exam_board=board).order_by("name")


def grouped_subject_options() -> dict[str, list[dict[str, object]]]:
    return {
        board: [
            {"id": subject.id, "name": subject.name}
            for subject in subjects_for_exam_board(board)
        ]
        for board in EXAM_BOARDS
    }


def _strip_optional(value: object) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _normalize_telegram_username(raw: str) -> str:
    value = raw.strip()
    if value.startswith("@"):
        return value[1:]
    return value


def _parse_subject_ids(raw: object) -> list[int]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise BookingDetailsValidationError("subject_ids must be a list.")
    ids: list[int] = []
    for item in raw:
        try:
            ids.append(int(item))
        except (TypeError, ValueError) as exc:
            raise BookingDetailsValidationError(
                "subject_ids must contain integers."
            ) from exc
    return ids


def parse_lwtp_details(raw: dict | None) -> dict:
    if not isinstance(raw, dict):
        raise BookingDetailsValidationError("details must be an object.")

    myanmar_name = _strip_optional(raw.get("myanmar_name"))
    if not myanmar_name:
        raise BookingDetailsValidationError("myanmar_name is required.")

    class_preference = _strip_optional(raw.get("class_preference"))
    if not class_preference:
        raise BookingDetailsValidationError("class_preference is required.")
    if class_preference not in ClassPreference.values:
        raise BookingDetailsValidationError("class_preference is invalid.")

    exam_board = _strip_optional(raw.get("exam_board"))
    if not exam_board:
        raise BookingDetailsValidationError("exam_board is required.")
    if exam_board not in EXAM_BOARDS:
        raise BookingDetailsValidationError("exam_board is invalid.")

    subject_ids = _parse_subject_ids(raw.get("subject_ids"))
    subject_other = _strip_optional(raw.get("subject_other"))
    if not subject_ids and not subject_other:
        raise BookingDetailsValidationError(
            "Select at least one subject or describe other subjects."
        )

    subject_names: list[str] = []
    if subject_ids:
        allowed_subjects = {
            subject.id: subject.name
            for subject in subjects_for_exam_board(exam_board)
        }
        for subject_id in subject_ids:
            name = allowed_subjects.get(subject_id)
            if name is None:
                raise BookingDetailsValidationError(
                    "One or more subjects are invalid for the selected exam board."
                )
            subject_names.append(name)

    details: dict = {
        "strategy": STRATEGY_KEY,
        "myanmar_name": myanmar_name,
        "class_preference": class_preference,
        "exam_board": exam_board,
        "subject_ids": subject_ids,
        "subject_names": subject_names,
    }

    phone = _strip_optional(raw.get("phone"))
    if phone:
        details["phone"] = phone

    telegram_username = _normalize_telegram_username(
        _strip_optional(raw.get("telegram_username"))
    )
    if telegram_username:
        details["telegram_username"] = telegram_username

    exam_target = _strip_optional(raw.get("exam_target"))
    if exam_target:
        details["exam_target"] = exam_target

    if subject_other:
        details["subject_other"] = subject_other

    return details


def lwtp_detail_rows(details: dict) -> list[tuple[str, str]]:
    rows: list[tuple[str, str]] = []

    myanmar_name = details.get("myanmar_name")
    if myanmar_name:
        rows.append(("Myanmar name", str(myanmar_name)))

    class_preference = details.get("class_preference")
    if class_preference:
        label = CLASS_PREFERENCE_LABELS.get(
            class_preference, str(class_preference).replace("_", " ").title()
        )
        rows.append(("Class preference", label))

    exam_board = details.get("exam_board")
    if exam_board:
        rows.append(("Exam board", str(exam_board)))

    subject_names = details.get("subject_names") or []
    subject_parts = [str(name) for name in subject_names if name]
    subject_other = details.get("subject_other")
    if subject_other:
        subject_parts.append(f"Other: {subject_other}")
    if subject_parts:
        rows.append(("Subjects", ", ".join(subject_parts)))

    exam_target = details.get("exam_target")
    if exam_target:
        rows.append(("Exam target", str(exam_target)))

    phone = details.get("phone")
    if phone:
        rows.append(("Phone", str(phone)))

    telegram_username = details.get("telegram_username")
    if telegram_username:
        rows.append(("Telegram", f"@{telegram_username}"))

    return rows


def format_lwtp_calendar_description(
    details: dict,
    *,
    student_name: str,
    student_email: str,
) -> str:
    lines = [f"Consultation with {student_name} ({student_email})"]
    for label, value in lwtp_detail_rows(details):
        lines.append(f"{label}: {value}")
    return "\n".join(lines)
