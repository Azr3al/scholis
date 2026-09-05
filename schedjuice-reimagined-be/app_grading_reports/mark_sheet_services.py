from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation
from typing import Any

from django.conf import settings
from django.db import transaction
from rapidfuzz import fuzz

from app_auth.import_resolve import USER_REF_FIELDS
from app_auth.import_user_match import match_users
from app_auth.models import User
from app_course.models import UserCourse
from app_grading_reports.models import CourseRubric, MarkSheet, MarkSheetCell
from app_grading_reports.mark_sheet_inference import infer_import_columns, rubric_columns_for_commit

_IDENTIFIER_ALIASES = {
    "no",
    "number",
    "#",
    "index",
    "name",
    "full name",
    "student name",
    "english name",
    "alternative name",
    "alt name",
    "email",
    "e mail",
}


def normalize_column_title(title: str) -> str:
    return re.sub(r"\s+", " ", (title or "").strip().lower())


def normalize_rubric_title(title: str) -> str:
    return normalize_column_title(title)


def rubric_signature(columns: list[dict[str, Any]]) -> frozenset[str]:
    return frozenset(
        normalize_column_title(c["title"])
        for c in columns
        if c.get("kind") == "score"
    )


def jaccard_similarity(a: frozenset[str], b: frozenset[str]) -> float:
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    inter = len(a & b)
    union = len(a | b)
    return inter / union if union else 0.0


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


def infer_rubric_columns(headers: list[str], rows: list[list[Any]]) -> list[dict[str, Any]]:
    columns, _column_mapping = infer_import_columns(headers, rows)
    return columns


def score_column_keys(columns: list[dict[str, Any]]) -> list[str]:
    return [c["key"] for c in columns if c.get("kind") == "score"]


def computed_column_keys(columns: list[dict[str, Any]]) -> list[str]:
    return [c["key"] for c in columns if c.get("kind") == "computed_total"]


def compute_sheet_totals(
    rubric_columns: list[dict[str, Any]],
    cells: dict[tuple[int, str], Decimal | None],
) -> dict[str, Decimal]:
    score_keys = score_column_keys(rubric_columns)
    total_keys = computed_column_keys(rubric_columns)
    if not total_keys:
        return {}

    student_ids = {sid for sid, _ in cells.keys()}

    out: dict[str, Decimal] = {}
    for sid in student_ids:
        total = Decimal("0")
        has_any = False
        for key in score_keys:
            val = cells.get((sid, key))
            if val is not None:
                total += val
                has_any = True
        if has_any:
            for total_key in total_keys:
                out[f"{sid}:{total_key}"] = total
    return out


def suggest_rubrics(
    course_id: int,
    columns: list[dict[str, Any]],
    *,
    threshold: float = 0.8,
) -> list[dict[str, Any]]:
    target = rubric_signature(columns)
    suggestions: list[dict[str, Any]] = []
    for rubric in CourseRubric.objects.filter(course_id=course_id):
        sim = jaccard_similarity(target, rubric_signature(rubric.columns))
        if sim >= threshold:
            suggestions.append({"rubric": rubric, "similarity": sim})
    suggestions.sort(key=lambda item: item["similarity"], reverse=True)
    return suggestions


def find_rubric_title_conflict(course_id: int, title: str) -> CourseRubric | None:
    norm = normalize_rubric_title(title)
    for rubric in CourseRubric.objects.filter(course_id=course_id):
        if normalize_rubric_title(rubric.title) == norm:
            return rubric
    return None


def roster_user_ids(course_id: int) -> set[int]:
    return set(
        UserCourse.objects.filter(
            course_id=course_id,
            assigned_as=UserCourse.AssignedAs.STUDENT,
        ).values_list("user_id", flat=True)
    )


def _filter_match_results_to_roster(
    results: dict[str, dict[str, dict]],
    roster_ids: set[int],
) -> dict[str, dict[str, dict]]:
    filtered: dict[str, dict[str, dict]] = {}
    for field_key, by_value in results.items():
        filtered[field_key] = {}
        for value, result in by_value.items():
            if result.get("kind") == "exact" and result.get("user"):
                if result["user"]["id"] not in roster_ids:
                    result = {
                        "kind": "none",
                        "user": None,
                        "field": None,
                        "score": None,
                        "candidates": [],
                    }
            if result.get("kind") == "fuzzy":
                cands = [
                    c
                    for c in result.get("candidates", [])
                    if c["user"]["id"] in roster_ids
                ]
                if len(cands) == 1 and cands[0].get("score", 0) >= 95:
                    result = {
                        "kind": "exact",
                        "user": cands[0]["user"],
                        "field": result.get("field"),
                        "score": cands[0].get("score"),
                        "candidates": [],
                    }
                else:
                    result = {**result, "candidates": cands}
                    if not cands:
                        result = {
                            "kind": "none",
                            "user": None,
                            "field": None,
                            "score": None,
                            "candidates": [],
                        }
            filtered[field_key][value] = result
    return filtered


def roster_user_refs(course_id: int) -> list[dict]:
    user_ids = UserCourse.objects.filter(
        course_id=course_id,
        assigned_as=UserCourse.AssignedAs.STUDENT,
    ).values_list("user_id", flat=True)
    refs: list[dict] = []
    for row in (
        User.objects.filter(id__in=user_ids)
        .order_by("name", "id")
        .values(*USER_REF_FIELDS, "alternative_name")
    ):
        refs.append(
            {
                **{k: row[k] for k in USER_REF_FIELDS},
                "alternative_name": row.get("alternative_name") or "",
            }
        )
    return refs


def _none_match() -> dict:
    return {
        "kind": "none",
        "user": None,
        "field": None,
        "score": None,
        "candidates": [],
    }


MIN_FUZZY_NAME_LEN = 8


def _match_roster_names(
    values: list[str],
    roster_refs: list[dict],
    *,
    field: str,
    fuzzy: bool,
) -> dict[str, dict]:
    out = {value: _none_match() for value in values}
    if not roster_refs:
        return out

    def norm(text: str) -> str:
        return re.sub(r"\s+", " ", (text or "").strip().lower())

    for value in values:
        nvalue = norm(value)
        if not nvalue:
            continue
        exact_ref = None
        matched_field = field
        for ref in roster_refs:
            for compare_field in ("name", "alternative_name"):
                candidate = norm(ref.get(compare_field) or "")
                if candidate and candidate == nvalue:
                    exact_ref = ref
                    matched_field = compare_field
                    break
            if exact_ref:
                break
        if exact_ref:
            out[value] = {
                "kind": "exact",
                "user": {k: exact_ref[k] for k in USER_REF_FIELDS if k in exact_ref},
                "field": matched_field,
                "score": 100.0,
                "candidates": [],
            }
            continue
        if not fuzzy:
            continue
        if len(nvalue.replace(" ", "")) < MIN_FUZZY_NAME_LEN:
            continue
        floor = settings.IMPORT_USER_MATCH_FUZZY_MIN
        limit = settings.IMPORT_USER_MATCH_CANDIDATE_LIMIT
        scored: list[dict] = []
        for ref in roster_refs:
            for compare_field in (field, "name", "alternative_name"):
                candidate = norm(ref.get(compare_field) or "")
                if not candidate:
                    continue
                score = float(fuzz.WRatio(nvalue, candidate))
                if score >= floor:
                    scored.append(
                        {
                            "user": {k: ref[k] for k in USER_REF_FIELDS if k in ref},
                            "score": round(score, 1),
                            "field": compare_field,
                        }
                    )
        if not scored:
            continue
        scored.sort(key=lambda item: item["score"], reverse=True)
        top = scored[0]
        if top["score"] >= 95:
            out[value] = {
                "kind": "exact",
                "user": top["user"],
                "field": top["field"],
                "score": top["score"],
                "candidates": [],
            }
        else:
            out[value] = {
                "kind": "fuzzy",
                "user": None,
                "field": None,
                "score": top["score"],
                "candidates": scored[:limit],
            }
    return out


def match_roster_students(course_id: int, specs: list[dict]) -> dict[str, dict[str, dict]]:
    roster_ids = roster_user_ids(course_id)
    roster_refs = roster_user_refs(course_id)
    results: dict[str, dict[str, dict]] = {}

    email_phone_specs = []
    for spec in specs:
        spec_type = spec.get("type")
        if spec_type in {"email", "phone"}:
            email_phone_specs.append(spec)
            continue
        if spec_type == "name":
            key = spec["key"]
            values = [str(v) for v in spec.get("values", []) if str(v).strip()]
            field = spec.get("key") if spec.get("key") in {"name", "alternative_name"} else "name"
            results[key] = _match_roster_names(
                values,
                roster_refs,
                field=field,
                fuzzy=bool(spec.get("fuzzy", True)),
            )

    if email_phone_specs:
        raw = match_users(email_phone_specs)
        filtered = _filter_match_results_to_roster(raw, roster_ids)
        results.update(filtered)

    return results


def build_grid_payload(sheet: MarkSheet) -> dict[str, Any]:
    from app_grading_reports.services import course_roster_students

    students = course_roster_students(sheet.course_id)
    rubric_columns = sheet.rubric.columns
    cell_qs = MarkSheetCell.objects.filter(sheet=sheet)
    cells_flat: dict[str, float | None] = {}
    cells_typed: dict[tuple[int, str], Decimal | None] = {}
    for cell in cell_qs:
        key = f"{cell.student_id}:{cell.column_key}"
        cells_flat[key] = float(cell.marks) if cell.marks is not None else None
        cells_typed[(cell.student_id, cell.column_key)] = cell.marks

    computed = compute_sheet_totals(rubric_columns, cells_typed)
    computed_flat = {k: float(v) for k, v in computed.items()}

    return {
        "sheet": sheet,
        "rubric": sheet.rubric,
        "students": students,
        "cells": cells_flat,
        "computed": computed_flat,
    }


@transaction.atomic
def commit_mark_sheet_import(
    *,
    course,
    created_by,
    title: str,
    year: int,
    month: int,
    exam_date,
    rubric_payload: dict | None,
    rubric_id: int | None,
    rows: list[dict],
) -> MarkSheet:
    if not rows:
        raise ValueError("No rows to import.")
    if any(not row.get("student_id") for row in rows):
        raise ValueError("All rows must have a resolved student before import.")

    if rubric_id:
        rubric = CourseRubric.objects.filter(pk=rubric_id, course=course).first()
        if rubric is None:
            raise ValueError("Rubric not found for this course.")
    else:
        if not rubric_payload or not rubric_payload.get("title"):
            raise ValueError("Rubric title is required.")
        conflict = find_rubric_title_conflict(course.id, rubric_payload["title"])
        if conflict:
            raise ValueError("A rubric with this title already exists for the course.")
        rubric = CourseRubric.objects.create(
            course=course,
            title=rubric_payload["title"],
            columns=rubric_columns_for_commit(rubric_payload.get("columns") or []),
            source=CourseRubric.Source.IMPORT_INFERRED,
            created_by=created_by,
        )

    sheet = MarkSheet.objects.create(
        course=course,
        rubric=rubric,
        title=title or rubric.title,
        year=year,
        month=month,
        exam_date=exam_date,
        created_by=created_by,
    )

    score_keys = set(score_column_keys(rubric.columns))
    to_create: list[MarkSheetCell] = []
    for row in rows:
        student_id = row["student_id"]
        marks_by_key = row.get("marks") or {}
        for column_key, raw_marks in marks_by_key.items():
            if column_key not in score_keys:
                continue
            marks = _parse_decimal(raw_marks)
            if marks is None:
                continue
            to_create.append(
                MarkSheetCell(
                    sheet=sheet,
                    student_id=student_id,
                    column_key=column_key,
                    marks=marks,
                )
            )
    if to_create:
        MarkSheetCell.objects.bulk_create(to_create)
    return sheet
