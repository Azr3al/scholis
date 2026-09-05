from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any

from app_demo.paths import ARTIFACTS_ROOT
from app_demo.validation import load_yaml


def safe_artifact_path(relative: str, *, root: Path | None = None) -> Path:
    base = (root or ARTIFACTS_ROOT).resolve()
    if relative.startswith("/") or ".." in Path(relative).parts:
        raise ValueError("Path must be relative and stay under artifacts root")
    resolved = (base / relative).resolve()
    if not str(resolved).startswith(str(base)):
        raise ValueError("Path escapes artifacts root")
    return resolved


def _yaml_files(directory: Path) -> list[Path]:
    if not directory.is_dir():
        return []
    return sorted(directory.glob("*.yaml"))


def list_blueprint_ids(*, root: Path | None = None) -> list[str]:
    base = root or ARTIFACTS_ROOT
    return [path.stem for path in _yaml_files(base / "blueprints")]


def list_scenario_pack_ids(*, root: Path | None = None) -> list[str]:
    base = root or ARTIFACTS_ROOT
    return [path.stem for path in _yaml_files(base / "scenario-packs")]


def list_use_case_ids(*, root: Path | None = None) -> list[str]:
    base = root or ARTIFACTS_ROOT
    return [path.stem for path in _yaml_files(base / "use-cases")]


def list_brief_entries(*, root: Path | None = None) -> list[dict[str, Any]]:
    base = root or ARTIFACTS_ROOT
    entries: list[dict[str, Any]] = []
    for path in _yaml_files(base / "briefs"):
        relative = f"briefs/{path.name}"
        try:
            data = load_yaml(path)
            slug = data["slug"]
            entries.append(
                {
                    "id": slug,
                    "relative_path": relative,
                    "school_name": data.get("school_name", slug),
                    "niche": data.get("niche"),
                    "demo_date": data.get("demo_date"),
                    "valid": True,
                    "validation_error": None,
                }
            )
        except Exception as exc:  # noqa: BLE001 — list must not fail wholesale
            entries.append(
                {
                    "id": path.stem,
                    "relative_path": relative,
                    "school_name": path.stem,
                    "niche": None,
                    "demo_date": None,
                    "valid": False,
                    "validation_error": str(exc),
                }
            )
    return entries


def find_brief_path_by_slug(slug: str, *, root: Path | None = None) -> Path | None:
    base = root or ARTIFACTS_ROOT
    for path in _yaml_files(base / "briefs"):
        try:
            if load_yaml(path).get("slug") == slug:
                return path
        except Exception:
            continue
    return None


def list_import_filenames(*, root: Path | None = None) -> list[str]:
    base = root or ARTIFACTS_ROOT
    imports_dir = base / "imports"
    if not imports_dir.is_dir():
        return []
    names: set[str] = set()
    for path in imports_dir.iterdir():
        if path.is_file() and path.suffix.lower() in {".csv", ".xlsx"}:
            names.add(path.name)
    return sorted(names)


def linked_briefs_for_import(filename: str, *, root: Path | None = None) -> list[str]:
    base = root or ARTIFACTS_ROOT
    linked: list[str] = []
    for path in _yaml_files(base / "briefs"):
        try:
            brief = load_yaml(path)
            import_spec = brief.get("import") or {}
            import_file = import_spec.get("file")
            if not import_file:
                continue
            if Path(str(import_file)).name == filename:
                linked.append(brief["slug"])
        except Exception:
            continue
    return linked


def read_source(relative: str, *, root: Path | None = None) -> dict[str, str]:
    path = safe_artifact_path(relative, root=root or ARTIFACTS_ROOT)
    fmt = "yaml" if path.suffix.lower() in {".yaml", ".yml"} else "text"
    return {"format": fmt, "content": path.read_text(encoding="utf-8")}


def read_generated_script(slug: str, *, root: Path | None = None) -> dict[str, Any]:
    base = root or ARTIFACTS_ROOT
    scripts_dir = base / "demo-scripts"
    json_path = scripts_dir / f"{slug}.json"
    md_path = scripts_dir / f"{slug}.md"
    has_json = json_path.is_file()
    has_md = md_path.is_file()
    if not has_json and not has_md:
        return {"available": False}
    payload: dict[str, Any] = {
        "available": True,
        "partial": has_json != has_md,
    }
    if has_json:
        payload["json"] = json.loads(json_path.read_text(encoding="utf-8"))
    if has_md:
        payload["markdown"] = md_path.read_text(encoding="utf-8")
    return payload


def csv_preview(
    filename: str, *, max_rows: int = 20, root: Path | None = None
) -> dict[str, Any]:
    path = safe_artifact_path(f"imports/{filename}", root=root or ARTIFACTS_ROOT)
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.reader(handle)
        rows = list(reader)
    if not rows:
        return {"headers": [], "rows": [], "truncated": False, "total_rows": 0}
    headers = rows[0]
    data_rows = rows[1:]
    truncated = len(data_rows) > max_rows
    return {
        "headers": headers,
        "rows": data_rows[:max_rows],
        "truncated": truncated,
        "total_rows": len(data_rows),
    }


def hub_index(*, root: Path | None = None) -> dict[str, Any]:
    base = root or ARTIFACTS_ROOT
    briefs = list_brief_entries(root=base)
    with_script = sum(
        1
        for brief in briefs
        if brief.get("valid")
        and read_generated_script(brief["id"], root=base).get("available")
    )
    return {
        "counts": {
            "blueprints": len(list_blueprint_ids(root=base)),
            "briefs": len(briefs),
            "briefs_with_generated_script": with_script,
            "scenario_packs": len(list_scenario_pack_ids(root=base)),
            "use_cases": len(list_use_case_ids(root=base)),
            "imports": len(list_import_filenames(root=base)),
        },
        "briefs": [
            {
                "slug": brief["id"],
                "school_name": brief["school_name"],
                "has_generated_script": read_generated_script(
                    brief["id"], root=base
                ).get("available", False),
            }
            for brief in briefs
            if brief.get("valid")
        ],
    }
