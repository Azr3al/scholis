"""Tenant AI capability packs — tool membership + prompt snippets."""
from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app_ai.tools.base import Tool
    from app_organization.models import Organization

CORE_PACK_ID = "core"
SUBJECT_ANALYTICS_PACK_ID = "subject_analytics"

# Today's tool surface minus subject_analytics (new / opt-in).
LEGACY_FULL_PACK_IDS: tuple[str, ...] = (
    "course_counts",
    "course_queries",
    "roster_read",
    "roster_write",
    "finance",
    "staff_points",
)


@dataclass(frozen=True)
class Pack:
    id: str
    title: str
    description: str
    tool_names: tuple[str, ...]
    prompt_snippet: str = ""


PACK_REGISTRY: dict[str, Pack] = {
    CORE_PACK_ID: Pack(
        id=CORE_PACK_ID,
        title="Core",
        description="Search users/courses and AI preferences.",
        tool_names=("search_users", "search_courses", "set_ai_preferences"),
        prompt_snippet="",
    ),
    "course_counts": Pack(
        id="course_counts",
        title="Course counts",
        description="Organization, teacher, and roster headcounts.",
        tool_names=(
            "count_organization",
            "count_teacher_courses",
            "count_course_roster",
        ),
        prompt_snippet=(
            "Course counts pack: use count_* tools for headcounts. "
            "Do not invent totals."
        ),
    ),
    "course_queries": Pack(
        id="course_queries",
        title="Course queries",
        description="Month-based course lists and per-user courses.",
        tool_names=(
            "query_courses",
            "query_courses_starting",
            "list_user_courses",
        ),
        prompt_snippet=(
            "Course queries pack: query_courses = active/overlap in a month; "
            "query_courses_starting = start_date in that month."
        ),
    ),
    "roster_read": Pack(
        id="roster_read",
        title="Roster read",
        description="List people on a course roster.",
        tool_names=("get_course_roster",),
        prompt_snippet=(
            "Roster read pack: use get_course_roster for names on a course."
        ),
    ),
    "roster_write": Pack(
        id="roster_write",
        title="Roster write",
        description="Enroll/remove students; assign/remove staff.",
        tool_names=(
            "enroll_student_in_course",
            "remove_student_from_course",
            "assign_staff_to_course",
            "remove_staff_from_course",
        ),
        prompt_snippet=(
            "Roster write pack: mutating roster tools require write intent "
            "and confirmation where configured."
        ),
    ),
    "finance": Pack(
        id="finance",
        title="Finance",
        description="Unpaid student lookups.",
        tool_names=("get_unpaid_students",),
        prompt_snippet=(
            "Finance pack: use get_unpaid_students for unpaid counts/names."
        ),
    ),
    "staff_points": Pack(
        id="staff_points",
        title="Staff points",
        description="Point types, balances, and adjustments.",
        tool_names=(
            "list_point_types",
            "get_staff_point_balances",
            "adjust_staff_points",
        ),
        prompt_snippet=(
            "Staff points pack: only when the school has staff points enabled."
        ),
    ),
    SUBJECT_ANALYTICS_PACK_ID: Pack(
        id=SUBJECT_ANALYTICS_PACK_ID,
        title="Subject analytics",
        description="Count courses by subject.",
        tool_names=("count_courses_by_subject",),
        prompt_snippet=(
            "Subject analytics pack: use count_courses_by_subject with an exact "
            "subject name from the school catalog."
        ),
    ),
}


def resolve_enabled_pack_ids(org: Organization | None) -> list[str]:
    """Return staff-enabled pack ids (never includes core).

    None org or missing/None field → legacy full set (safe default for tests /
    pre-migration). Explicit [] → core only.
    """
    if org is None:
        return list(LEGACY_FULL_PACK_IDS)
    raw = getattr(org, "ai_enabled_packs", None)
    if raw is None or not isinstance(raw, (list, tuple)):
        return list(LEGACY_FULL_PACK_IDS)
    return [str(x) for x in raw]


def _tool_pack_id(tool_name: str) -> str | None:
    for pack in PACK_REGISTRY.values():
        if tool_name in pack.tool_names:
            return pack.id
    return None


def resolve_tools_for_org(org: Organization | None) -> list[Tool]:
    """Core ∪ enabled packs. Feature flags and turn intent applied in registry."""
    from app_ai.tools.registry import TOOL_REGISTRY
    from app_ai.tools.subject_binder import bind_subject_analytics_tools

    enabled = set(resolve_enabled_pack_ids(org))
    allowed_names: set[str] = set(PACK_REGISTRY[CORE_PACK_ID].tool_names)
    for pack_id in enabled:
        pack = PACK_REGISTRY.get(pack_id)
        if pack is None or pack.id == CORE_PACK_ID:
            continue
        allowed_names.update(pack.tool_names)

    tools = []
    for name in allowed_names:
        tool = TOOL_REGISTRY.get(name)
        if tool is not None:
            tools.append(tool)

    return bind_subject_analytics_tools(org, tools)


def iter_pack_prompt_snippets(org: Organization | None) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    for pack_id in resolve_enabled_pack_ids(org):
        pack = PACK_REGISTRY.get(pack_id)
        if not pack:
            continue
        snippet = (pack.prompt_snippet or "").strip()
        if snippet:
            out.append((pack.id, snippet))
    return out


def list_available_packs() -> list[dict[str, Any]]:
    return [
        {
            "id": p.id,
            "title": p.title,
            "description": p.description,
            "tool_names": list(p.tool_names),
        }
        for p in PACK_REGISTRY.values()
        if p.id != CORE_PACK_ID
    ]


def list_available_tools_for_org(org: Organization | None) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for tool in resolve_tools_for_org(org):
        rows.append(
            {
                "name": tool.name,
                "description": tool.description,
                "pack_id": _tool_pack_id(tool.name) or CORE_PACK_ID,
                "exposure": tool.exposure,
            }
        )
    rows.sort(key=lambda r: (r["pack_id"], r["name"]))
    return rows
