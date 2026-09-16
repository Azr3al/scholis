"""Schema binders for subject-analytics tools."""
from __future__ import annotations

from copy import deepcopy
from dataclasses import replace
from typing import TYPE_CHECKING

from app_ai.tools.base import Tool

if TYPE_CHECKING:
    from app_organization.models import Organization

SUBJECT_ENUM_CAP = 100


def bind_subject_analytics_tools(
    org: Organization | None, tools: list[Tool]
) -> list[Tool]:
    out: list[Tool] = []
    for tool in tools:
        if tool.name != "count_courses_by_subject":
            out.append(tool)
            continue
        try:
            from app_course.models import Subject

            names = list(
                Subject.objects.order_by("name").values_list("name", flat=True)
            )[: SUBJECT_ENUM_CAP + 1]
        except Exception:
            out.append(tool)
            continue

        params = deepcopy(tool.parameters)
        prop = params["properties"]["subject"]
        if len(names) <= SUBJECT_ENUM_CAP and names:
            prop["enum"] = names
            prop["description"] = "Exact subject name from the school catalog."
        else:
            prop.pop("enum", None)
            prop["description"] = (
                "Exact subject name from the school catalog "
                f"(large catalog; {SUBJECT_ENUM_CAP}+ subjects)."
            )
        out.append(replace(tool, parameters=params))
    return out
