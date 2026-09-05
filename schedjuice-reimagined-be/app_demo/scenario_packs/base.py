from __future__ import annotations

from collections.abc import Callable
from typing import Any

from app_demo.config import ResolvedDemoConfig
from app_demo.scenario_packs.attendance_story import run_attendance_story_pack
from app_demo.scenario_packs.campus_staff_attendance import run_campus_staff_attendance_pack
from app_demo.scenario_packs.child_tuition_payments import run_child_tuition_payments_pack
from app_demo.scenario_packs.enrollment_pipeline import run_enrollment_pipeline_pack
from app_demo.scenario_packs.intake_launch import run_intake_launch_pack
from app_demo.scenario_packs.today_classes import run_today_classes_pack
from app_demo.scenario_packs.unpaid_students import run_unpaid_students_pack

PackRunner = Callable[..., dict[str, Any]]

RUNNERS: dict[str, PackRunner] = {
    "today-classes": run_today_classes_pack,
    "unpaid-students": run_unpaid_students_pack,
    "child-tuition-payments": run_child_tuition_payments_pack,
    "campus-staff-attendance": run_campus_staff_attendance_pack,
    "enrollment-pipeline": run_enrollment_pipeline_pack,
    "attendance-story": run_attendance_story_pack,
    "intake-launch": run_intake_launch_pack,
}


def run_pack(
    pack_id: str,
    *,
    schema_name: str,
    config: ResolvedDemoConfig,
    pack_ctx: dict[str, Any] | None = None,
) -> dict[str, Any]:
    runner = RUNNERS.get(pack_id)
    if runner is None:
        supported = ", ".join(sorted(RUNNERS))
        raise ValueError(f"Unknown scenario pack '{pack_id}'. Supported packs: {supported}")

    context = pack_ctx if pack_ctx is not None else {}
    result = runner(schema_name=schema_name, config=config, pack_ctx=context)
    context.setdefault("scenario_packs", {})[pack_id] = result
    return result
