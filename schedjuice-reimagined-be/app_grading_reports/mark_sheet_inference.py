"""Mark sheet import column inference helpers."""
from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation
from typing import Any

MAX_MARKS_RE = re.compile(r"\(\s*(\d+)\s*(?:M|marks?)\s*\)", re.IGNORECASE)
GRADE_VALUE_RE = re.compile(r"^[A-F][+-]?$", re.IGNORECASE)

_IDENTIFIER_ALIASES = {
    "name",
    "full name",
    "student name",
    "english name",
    "alternative name",
    "alt name",
    "email",
    "e mail",
}

ATTENDANCE_KEYWORDS = (
    "attendance",
    "present",
    "absent",
    "late",
    "tardy",
    "excused",
    "%",
    "pct",
    "percent",
    "days attended",
    "days absent",
    "sessions",
)


def normalize_column_title(title: str) -> str:
    return re.sub(r"\s+", " ", (title or "").strip().lower())


def _parse_decimal(value: Any) -> Decimal | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return Decimal(text)
    except InvalidOperation:
        return None


def _is_numeric_column(values: list[Any]) -> bool:
    non_empty = [v for v in values if v not in (None, "")]
    if not non_empty:
        return False
    numeric = sum(1 for v in non_empty if _parse_decimal(v) is not None)
    return numeric / len(non_empty) >= 0.5


def _slug_key(title: str, index: int) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", normalize_column_title(title)).strip("_")
    return slug or f"col_{index}"


def parse_max_marks_from_header(title: str) -> int | None:
    match = MAX_MARKS_RE.search(title or "")
    if not match:
        return None
    return int(match.group(1))


def is_grade_value(value: Any) -> bool:
    text = str(value).strip() if value is not None else ""
    if not text:
        return False
    return bool(GRADE_VALUE_RE.match(text))


def is_attendance_header(norm_title: str) -> bool:
    return any(keyword in norm_title for keyword in ATTENDANCE_KEYWORDS)


def column_is_grade_column(header: str, values: list[Any]) -> bool:
    norm = normalize_column_title(header)
    if "grade" in norm:
        return True
    non_empty = [v for v in values if v not in (None, "")]
    if not non_empty:
        return False
    grade_count = sum(1 for v in non_empty if is_grade_value(v))
    return grade_count / len(non_empty) >= 0.5


def column_is_burmese_name_candidate(values: list[Any]) -> bool:
    non_empty = [v for v in values if v not in (None, "")]
    if not non_empty:
        return False
    short_non_grade = 0
    for value in non_empty:
        text = str(value).strip()
        if not text or _parse_decimal(value) is not None:
            continue
        if is_grade_value(value):
            continue
        if len(text) <= 3:
            short_non_grade += 1
    return short_non_grade / len(non_empty) >= 0.5


def is_serial_number_header(norm: str) -> bool:
    return norm.rstrip(".") == "no" or norm in {"number", "#", "index"}


def _header_identifier_field(norm: str) -> str | None:
    if is_serial_number_header(norm):
        return None
    if norm in _IDENTIFIER_ALIASES or norm.startswith("no "):
        if "email" in norm or norm == "e mail":
            return "email"
        if "burmese" in norm or "alternative" in norm or norm == "alt name":
            return "alternative_name"
        if "english" in norm and "name" in norm:
            return "name"
        if norm in {"name", "full name", "student name"}:
            return "name"
        return None

    if "english" in norm and "name" in norm:
        return "name"
    if "burmese" in norm or "alternative" in norm or norm == "alt name":
        return "alternative_name"
    if "email" in norm or norm == "e mail":
        return "email"
    return None


def _column_values(rows: list[list[Any]], idx: int) -> list[Any]:
    return [row[idx] if idx < len(row) else None for row in rows]


def infer_import_columns(
    headers: list[str],
    rows: list[list[Any]],
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    columns: list[dict[str, Any]] = []
    column_mapping: dict[str, int] = {}
    burmese_candidate_idx: int | None = None

    for idx, header in enumerate(headers):
        norm = normalize_column_title(header)
        col_values = _column_values(rows, idx)
        identifier_field = _header_identifier_field(norm)
        kind: str

        if is_serial_number_header(norm):
            kind = "ignored"
        elif identifier_field:
            kind = "identifier"
        elif "total" in norm and _is_numeric_column(col_values):
            kind = "computed_total"
        elif is_attendance_header(norm):
            kind = "ignored"
        elif column_is_grade_column(header, col_values):
            kind = "ignored"
        elif _is_numeric_column(col_values):
            kind = "score"
        elif column_is_burmese_name_candidate(col_values):
            kind = "identifier"
            burmese_candidate_idx = idx
        else:
            kind = "ignored"

        col_def: dict[str, Any] = {
            "key": _slug_key(header, idx),
            "title": header.strip() or f"Column {idx + 1}",
            "kind": kind,
            "sort_order": idx,
        }

        if kind == "score":
            parsed_max = parse_max_marks_from_header(header)
            if parsed_max is not None:
                col_def["max_marks"] = parsed_max
            else:
                decimals = [_parse_decimal(v) for v in col_values]
                nums = [d for d in decimals if d is not None]
                if nums and all(n <= 5 for n in nums):
                    col_def["max_marks"] = 5

        columns.append(col_def)

        if kind == "identifier" and identifier_field:
            column_mapping[identifier_field] = idx

    if burmese_candidate_idx is not None and "alternative_name" not in column_mapping:
        column_mapping["alternative_name"] = burmese_candidate_idx

    return columns, column_mapping


def validate_section_max_marks(columns: list[dict[str, Any]]) -> list[str]:
    score_maxes = [
        c["max_marks"]
        for c in columns
        if c.get("kind") == "score" and c.get("max_marks") is not None
    ]
    if not score_maxes:
        return []

    section_sum = sum(score_maxes)
    grand_total: int | None = None
    for col in columns:
        if col.get("kind") != "computed_total":
            continue
        parsed = parse_max_marks_from_header(col.get("title", ""))
        if parsed is not None:
            grand_total = parsed
            break

    if grand_total is None or section_sum == grand_total:
        return []

    return [
        f"Section max marks sum to {section_sum} but grand total header says {grand_total}."
    ]


def rubric_columns_for_commit(columns: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Imported rubrics store score columns only."""
    return [c for c in columns if c.get("kind") == "score"]
