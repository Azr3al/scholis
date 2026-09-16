import json
from pathlib import Path
from typing import Any

import jsonschema
from jsonschema.exceptions import ValidationError
from ruamel.yaml import YAML
from ruamel.yaml.error import YAMLError

from app_demo.paths import SCHEMAS_DIR

_yaml = YAML(typ="safe")


def load_schema(name: str) -> dict[str, Any]:
    schema_path = SCHEMAS_DIR / name
    try:
        raw_schema = schema_path.read_text(encoding="utf-8")
    except OSError as exc:
        raise ValueError(f"Unable to read schema at {schema_path}") from exc

    try:
        schema = json.loads(raw_schema)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON schema at {schema_path}") from exc

    if not isinstance(schema, dict):
        raise ValueError(f"Schema at {schema_path} must be a JSON object")
    return schema


def load_yaml(path: Path | str) -> dict[str, Any]:
    yaml_path = Path(path)
    try:
        with yaml_path.open(encoding="utf-8") as yaml_file:
            data = _yaml.load(yaml_file)
    except OSError as exc:
        raise ValueError(f"Unable to read YAML at {yaml_path}") from exc
    except YAMLError as exc:
        raise ValueError(f"Invalid YAML in {yaml_path}") from exc

    if not isinstance(data, dict):
        raise ValueError(f"Expected mapping in {yaml_path}")
    return data


def _validate(data: dict[str, Any], schema_name: str, label: str) -> dict[str, Any]:
    try:
        jsonschema.validate(
            instance=data,
            schema=load_schema(schema_name),
            format_checker=jsonschema.Draft202012Validator.FORMAT_CHECKER,
        )
    except ValidationError as exc:
        raise ValueError(f"Invalid {label}: {exc.message}") from exc
    return data


def validate_brief(data: dict[str, Any]) -> dict[str, Any]:
    return _validate(data, "brief.schema.json", "brief")


def validate_blueprint(data: dict[str, Any]) -> dict[str, Any]:
    return _validate(data, "blueprint.schema.json", "blueprint")


def validate_use_case(data: dict[str, Any]) -> dict[str, Any]:
    return _validate(data, "use-case.schema.json", "use case")


def validate_scenario_pack(data: dict[str, Any]) -> dict[str, Any]:
    return _validate(data, "scenario-pack.schema.json", "scenario pack")
