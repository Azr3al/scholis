from __future__ import annotations

from typing import Any

from app_demo.config import ResolvedDemoConfig


def resolved_config_to_dict(config: ResolvedDemoConfig) -> dict[str, Any]:
    stops = []
    for index, stop in enumerate(config.demo_stops, start=1):
        row = dict(stop)
        row["order"] = index
        stops.append(row)
    return {
        "slug": config.slug,
        "school_name": config.school_name,
        "schema_name": config.schema_name,
        "domain_url": config.domain_url,
        "demo_date": config.demo_date.isoformat(),
        "scenario_pack_ids": config.scenario_pack_ids,
        "demo_stops": stops,
        "terminology": config.terminology,
        "org_toggles": config.org_toggles,
        "physical_campuses": config.physical_campuses,
        "import_spec": config.import_spec,
    }
