from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any

from app_demo.artifacts import load_use_case
from app_demo.terminology import substitute


@dataclass
class ResolvedDemoConfig:
    school_name: str
    slug: str
    schema_name: str
    domain_url: str
    demo_date: date
    terminology: dict[str, str]
    org_toggles: dict[str, Any]
    academic_structure: dict[str, Any]
    scenario_pack_ids: list[str]
    demo_stops: list[dict[str, Any]]
    physical_campuses: list[dict[str, Any]]
    import_spec: dict[str, Any] | None = None


def _ordered_pain_points(blueprint: dict[str, Any], pain_points: list[str]) -> list[str]:
    ordered: list[str] = []
    seen: set[str] = set()

    for use_case_id in blueprint.get("use_case_order", []):
        if use_case_id in pain_points and use_case_id not in seen:
            seen.add(use_case_id)
            ordered.append(use_case_id)

    for use_case_id in pain_points:
        if use_case_id not in seen:
            seen.add(use_case_id)
            ordered.append(use_case_id)

    return ordered


def resolve_demo_config(
    blueprint: dict[str, Any], brief: dict[str, Any]
) -> ResolvedDemoConfig:
    terminology = {
        **blueprint.get("terminology", {}),
        **brief.get("terminology_overrides", {}),
    }
    pain_points = list(brief["pain_points"])
    ordered_use_case_ids = _ordered_pain_points(blueprint, pain_points)

    scenario_pack_ids = list(dict.fromkeys(blueprint.get("default_scenario_packs", [])))
    demo_stops: list[dict[str, Any]] = []
    seen_routes: set[str] = set()
    org_toggles = substitute(blueprint.get("org_toggles", {}), terminology)
    if brief.get("timezone"):
        org_toggles["timezone"] = brief["timezone"]

    if "staff_campus_attendance" in pain_points:
        campus_toggles = blueprint.get("org_toggles_campus") or {}
        if isinstance(campus_toggles, dict):
            org_toggles.update(substitute(campus_toggles, terminology))

    for use_case_id in ordered_use_case_ids:
        use_case = load_use_case(use_case_id)

        for pack_id in use_case.get("scenario_packs", []):
            if pack_id not in scenario_pack_ids:
                scenario_pack_ids.append(pack_id)

        for raw_stop in use_case.get("demo_stops", []):
            stop = substitute(raw_stop, terminology)
            stop.setdefault("use_case", use_case_id)
            route = stop.get("route")
            if route in seen_routes:
                continue
            seen_routes.add(route)
            demo_stops.append(stop)

    slug = brief["slug"]
    domain_url = brief.get("domain_url") or f"{slug}-demo.thiha.net"

    return ResolvedDemoConfig(
        school_name=brief["school_name"],
        slug=slug,
        schema_name=f"xdemo_{slug.replace('-', '_')}",
        domain_url=domain_url,
        demo_date=date.fromisoformat(brief["demo_date"]),
        terminology=terminology,
        org_toggles=org_toggles,
        academic_structure=substitute(
            blueprint.get("academic_structure", {}), terminology
        ),
        scenario_pack_ids=scenario_pack_ids,
        demo_stops=demo_stops,
        physical_campuses=list(blueprint.get("physical_campuses") or []),
        import_spec=brief.get("import"),
    )
