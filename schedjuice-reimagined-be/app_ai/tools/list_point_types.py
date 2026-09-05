"""List active staff point types."""
from __future__ import annotations

from typing import Any

from app_ai.tools.base import Tool, strict_object_schema
from app_ai.tools.points_rbac import require_points_view
from app_auth.models import User
from app_points import models as point_models

LIST_POINT_TYPES_SCHEMA = strict_object_schema(properties={}, required=[])


def run_list_point_types(args: dict[str, Any], user: User) -> list[dict[str, Any]]:
    denied = require_points_view(actor=user, subject=user)
    if denied:
        return [denied]

    rows = point_models.PointType.objects.filter(is_active=True).order_by(
        "sort_order", "id"
    )
    return [
        {
            "id": pt.id,
            "name": pt.name,
            "description": pt.description,
            "color": pt.color,
        }
        for pt in rows
    ]


LIST_POINT_TYPES_TOOL = Tool(
    name="list_point_types",
    description=(
        "List active staff point types (id, name, description). Use before "
        "adjust_staff_points when the point type name is unknown."
    ),
    parameters=LIST_POINT_TYPES_SCHEMA,
    run=run_list_point_types,
    exposure="read",
    requires_feature="staff_points",
)
