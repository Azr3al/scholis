"""Shared id/query resolution for AI count tools."""
from __future__ import annotations

from typing import Any

from app_ai.links import compact_user_for_ai, get_current_org, with_course_link
from app_ai.tools.self_reference import is_self_reference_query
from app_auth.assistant_user_lookup import (
    apply_assistant_user_lookup_filters,
    is_assistant_user_lookup_eligible,
)
from app_auth.models import User
from app_auth.shortcuts_availability_helpers import filter_active_staff_users
from app_auth.user_scoping import scope_users_for_user, user_can_access_user
from app_auth.user_search import apply_user_search_q_with_meta
from app_course.category_search import apply_category_search_q_with_meta
from app_course.course_scoping import scope_courses_for_user, user_can_access_course
from app_course.course_search import apply_course_search_q_with_meta
from app_course.models import Category
from app_points.services import is_staff_user


def _compact_user(user: User, *, org) -> dict[str, Any]:
    return compact_user_for_ai(user, org=org)


def _with_letter_keys(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    out: list[dict[str, Any]] = []
    for index, row in enumerate(candidates):
        keyed = dict(row)
        keyed["key"] = letters[index]
        out.append(keyed)
    return out


def _ambiguous_payload(*, message: str, query: str, candidates: list[dict]) -> dict[str, Any]:
    return {
        "status": "ambiguous",
        "message": message,
        "query": query,
        "candidates": _with_letter_keys(candidates),
    }


def _staff_qs():
    return filter_active_staff_users(User.objects.all())


def resolve_user(
    *,
    actor: User,
    user_id: int | None,
    query: str | None,
    limit: int = 5,
    role: str | None = None,
) -> dict[str, Any]:
    if user_id is not None:
        user = User.objects.filter(id=user_id).first()
        if user is None:
            return {"status": "not_found", "message": "User not found."}
        if user.id != actor.id and not is_assistant_user_lookup_eligible(user):
            return {"status": "not_found", "message": "User not found."}
        if not user_can_access_user(actor, user):
            return {
                "status": "permission_denied",
                "message": "You do not have access to this user.",
            }
        return {"status": "ok", "user": user}

    q = (query or "").strip()
    if not q:
        return {"status": "not_found", "message": "Query is empty."}
    if is_self_reference_query(q):
        return {"status": "ok", "user": actor}

    qs = apply_assistant_user_lookup_filters(scope_users_for_user(actor))
    if role == "student":
        qs = qs.filter(roles__contains=[User.UserRole.STUDENT])
    elif role == "staff":
        qs = filter_active_staff_users(qs)
    qs, _ = apply_user_search_q_with_meta(qs, q)
    matches = list(qs[: limit + 1])
    if not matches:
        return {"status": "not_found", "message": f"No user match for {q!r}."}
    if len(matches) > 1:
        org = get_current_org()
        return _ambiguous_payload(
            message=f"Multiple users match {q!r}.",
            query=q,
            candidates=[_compact_user(u, org=org) for u in matches[:limit]],
        )
    return {"status": "ok", "user": matches[0]}


def resolve_staff_user(
    *,
    user_id: int | None = None,
    query: str | None = None,
    limit: int = 5,
) -> dict[str, Any]:
    if user_id is not None:
        user = _staff_qs().filter(id=user_id).first()
        if user is None:
            return {"status": "not_found", "message": "Staff user not found."}
        return {"status": "ok", "user": user}

    q = (query or "").strip()
    if not q:
        return {"status": "not_found", "message": "Query is empty."}

    qs, _ = apply_user_search_q_with_meta(_staff_qs(), q)
    matches = list(qs[: limit + 1])
    if not matches:
        return {"status": "not_found", "message": f"No staff match for {q!r}."}
    if len(matches) > 1:
        org = get_current_org()
        return _ambiguous_payload(
            message=f"Multiple staff match {q!r}.",
            query=q,
            candidates=[_compact_user(u, org=org) for u in matches[:limit]],
        )
    return {"status": "ok", "user": matches[0]}


def enrich_staff_resolve_failure(
    *,
    resolved: dict[str, Any],
    query: str | None,
) -> dict[str, Any]:
    """
    When staff resolution fails, distinguish student-only matches from true not-found.
    Prevents the model from guessing that a known person must be a student.
    """
    if resolved.get("status") == "ok":
        return resolved
    if resolved.get("status") != "not_found":
        return {
            "error": resolved["status"],
            **{k: v for k, v in resolved.items() if k != "status"},
        }

    q = (query or "").strip()
    if not q:
        return {
            "error": "not_found",
            **{k: v for k, v in resolved.items() if k != "status"},
        }

    qs, _ = apply_user_search_q_with_meta(
        User.objects.filter(is_active=True, resigned_at__isnull=True),
        q,
    )
    matches = list(qs[:2])
    if len(matches) != 1:
        return {
            "error": "not_found",
            **{k: v for k, v in resolved.items() if k != "status"},
        }

    subject = matches[0]
    org = get_current_org()
    compact = compact_user_for_ai(subject, org=org)
    if not is_staff_user(subject):
        return {
            "error": "subject_not_staff",
            "message": (
                f"{subject.name} is registered as a student; "
                "staff points apply to staff only."
            ),
            "subject": compact,
        }
    return {
        "error": "staff_lookup_failed",
        "message": (
            f"Found {subject.name} but could not resolve them for staff points. "
            "Try their full name or email."
        ),
        "subject": compact,
    }


def resolve_category(
    *,
    category_id: int | None = None,
    query: str | None = None,
    limit: int = 5,
) -> dict[str, Any]:
    if category_id is not None:
        category = Category.objects.filter(id=category_id).first()
        if category is None:
            return {"status": "not_found", "message": "Category not found."}
        return {"status": "ok", "category": category}

    q = (query or "").strip()
    if not q:
        return {"status": "not_found", "message": "Query is empty."}

    qs, _ = apply_category_search_q_with_meta(Category.objects.all(), q)
    matches = list(qs[: limit + 1])
    if not matches:
        return {"status": "not_found", "message": f"No category match for {q!r}."}
    if len(matches) > 1:
        return _ambiguous_payload(
            message=f"Multiple categories match {q!r}.",
            query=q,
            candidates=[{"id": c.id, "name": c.name} for c in matches[:limit]],
        )
    return {"status": "ok", "category": matches[0]}


def resolve_accessible_course(
    *,
    user: User,
    course_id: int | None,
    query: str | None,
    limit: int = 5,
) -> dict[str, Any]:
    base = scope_courses_for_user(user)

    if course_id is not None:
        course = base.filter(id=course_id).first()
        if course is None:
            return {
                "status": "not_found",
                "message": "Course not found or not accessible.",
            }
        if not user_can_access_course(user, course):
            return {
                "status": "permission_denied",
                "message": "You do not have access to this course.",
            }
        return {"status": "ok", "course": course}

    q = (query or "").strip()
    if not q:
        return {"status": "not_found", "message": "Query is empty."}

    qs, _ = apply_course_search_q_with_meta(base, q)
    matches = list(qs[: limit + 1])
    if not matches:
        return {"status": "not_found", "message": f"No course match for {q!r}."}
    if len(matches) > 1:
        org = get_current_org()
        return _ambiguous_payload(
            message=f"Multiple courses match {q!r}.",
            query=q,
            candidates=[
                with_course_link(
                    {"id": c.id, "title": c.title, "code": c.code},
                    org=org,
                )
                for c in matches[:limit]
            ],
        )
    course = matches[0]
    if not user_can_access_course(user, course):
        return {
            "status": "permission_denied",
            "message": "You do not have access to this course.",
        }
    return {"status": "ok", "course": course}


def resolve_point_type(
    *,
    point_type_id: int | None = None,
    query: str | None = None,
    limit: int = 5,
    active_only: bool = True,
) -> dict[str, Any]:
    from app_points import models as point_models

    if point_type_id is not None:
        point_type = point_models.PointType.objects.filter(pk=point_type_id).first()
        if point_type is None or (active_only and not point_type.is_active):
            return {"status": "not_found", "message": "Point type not found."}
        return {"status": "ok", "point_type": point_type}

    q = (query or "").strip()
    if not q:
        return {"status": "not_found", "message": "Query is empty."}

    qs = point_models.PointType.objects.all().order_by("sort_order", "id")
    if active_only:
        qs = qs.filter(is_active=True)
    qs = qs.filter(name__icontains=q)
    matches = list(qs[: limit + 1])
    if not matches:
        return {"status": "not_found", "message": f"No point type match for {q!r}."}
    if len(matches) > 1:
        compact = [
            {"id": pt.id, "name": pt.name, "description": pt.description}
            for pt in matches[:limit]
        ]
        return _ambiguous_payload(
            message=f"Multiple point types match {q!r}.",
            query=q,
            candidates=compact,
        )
    return {"status": "ok", "point_type": matches[0]}


def list_assignable_course_roles(*, limit: int = 26) -> list[dict]:
    from app_course.models import AssignedAsRole

    qs = AssignedAsRole.objects.all().order_by("seniority", "name")[:limit]
    rows = [
        {"id": role.id, "name": role.name, "seniority": role.seniority}
        for role in qs
    ]
    return _with_letter_keys(rows)


def resolve_course_role(
    *,
    role_seniority: str | None = None,
    course_role_query: str | None = None,
    course_role_id: int | None = None,
    limit: int = 5,
) -> dict[str, Any]:
    from app_course.models import AssignedAsRole

    if course_role_id is not None:
        role = AssignedAsRole.objects.filter(id=course_role_id).first()
        if role is None:
            return {"status": "not_found", "message": "Course role not found."}
        return {"status": "ok", "role": role}

    seniority = None
    if role_seniority:
        key = role_seniority.strip().upper().replace(" ", "_")
        if key in {"MT", "MAIN_TEACHER", "MAIN"}:
            seniority = AssignedAsRole.Seniority.MAIN_TEACHER
        elif key in {"AT", "ASSISTANT_TEACHER", "ASSISTANT"}:
            seniority = AssignedAsRole.Seniority.ASSISTANT_TEACHER

    qs = AssignedAsRole.objects.all()
    if seniority:
        qs = qs.filter(seniority=seniority)
    elif course_role_query:
        qs = qs.filter(name__icontains=course_role_query.strip())
    else:
        return {
            "status": "validation_error",
            "message": "Provide role_seniority (MT/AT) or course_role_query.",
        }

    matches = list(qs.order_by("id")[: limit + 1])
    if not matches:
        return {"status": "not_found", "message": "No matching course role."}
    if len(matches) > 1:
        return _ambiguous_payload(
            message="Multiple course roles match.",
            query=course_role_query or role_seniority or "",
            candidates=[
                {"id": role.id, "name": role.name, "seniority": role.seniority}
                for role in matches[:limit]
            ],
        )
    return {"status": "ok", "role": matches[0]}
