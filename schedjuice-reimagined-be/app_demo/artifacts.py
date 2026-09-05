from pathlib import Path
from typing import Any

from app_demo.paths import ARTIFACTS_ROOT
from app_demo.validation import (
    load_yaml,
    validate_blueprint,
    validate_brief,
    validate_scenario_pack,
    validate_use_case,
)


def _assert_matching_id(data: dict[str, Any], expected_id: str, label: str) -> None:
    actual_id = data.get("id")
    if actual_id != expected_id:
        raise ValueError(
            f"{label} id mismatch: expected '{expected_id}', got '{actual_id}'"
        )


def load_brief(path: Path | str) -> dict[str, Any]:
    return validate_brief(load_yaml(path))


def load_blueprint(blueprint_id: str) -> dict[str, Any]:
    path = ARTIFACTS_ROOT / "blueprints" / f"{blueprint_id}.yaml"
    data = validate_blueprint(load_yaml(path))
    _assert_matching_id(data, blueprint_id, "Blueprint")
    return data


def load_use_case(use_case_id: str) -> dict[str, Any]:
    path = ARTIFACTS_ROOT / "use-cases" / f"{use_case_id}.yaml"
    data = validate_use_case(load_yaml(path))
    _assert_matching_id(data, use_case_id, "Use-case")
    return data


def load_scenario_pack(pack_id: str) -> dict[str, Any]:
    path = ARTIFACTS_ROOT / "scenario-packs" / f"{pack_id}.yaml"
    data = validate_scenario_pack(load_yaml(path))
    _assert_matching_id(data, pack_id, "Scenario pack")
    return data
