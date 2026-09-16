from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app_demo.config import ResolvedDemoConfig
from app_demo.paths import ARTIFACTS_ROOT


def _build_stops(config: ResolvedDemoConfig) -> list[dict[str, Any]]:
    stops: list[dict[str, Any]] = []
    for index, stop in enumerate(config.demo_stops, start=1):
        row: dict[str, Any] = {
            "order": index,
            "use_case": stop.get("use_case"),
            "route": stop.get("route"),
            "role": stop.get("role"),
            "talk_track": stop.get("talk_track"),
        }
        if stop.get("look_for"):
            row["look_for"] = stop["look_for"]
        if stop.get("deep_link"):
            row["deep_link"] = stop["deep_link"]
        stops.append(row)
    return stops


def _build_markdown(script: dict[str, Any]) -> str:
    lines: list[str] = [
        f"# Demo Script: {script['school_name']}",
        "",
        f"- Domain: `{script['domain_url']}`",
        f"- Demo date: `{script['demo_date']}`",
        "- Scenario packs: "
        + (
            ", ".join(f"`{pack_id}`" for pack_id in script["scenario_pack_ids"])
            if script["scenario_pack_ids"]
            else "_none_"
        ),
        "",
    ]

    accounts_ctx = script.get("pack_ctx", {}).get("demo_accounts")
    if isinstance(accounts_ctx, dict) and accounts_ctx.get("accounts"):
        lines.extend(["## Demo Accounts", ""])
        password = accounts_ctx.get("password", "<hidden>")
        for account in accounts_ctx["accounts"]:
            lines.append(
                f"- `{account['email']}` / `{password}` ({account['role']})"
            )
        lines.append("")

    lines.extend(["## Demo Stops", ""])
    if not script["stops"]:
        lines.append("- No demo stops configured.")
        lines.append("")
        return "\n".join(lines)

    for stop in script["stops"]:
        lines.append(f"### {stop['order']}. {stop.get('route') or '(missing route)'}")
        lines.append(f"- Role: `{stop.get('role') or 'demo-admin'}`")
        if stop.get("talk_track"):
            lines.append(f"- Talk track: {stop['talk_track']}")
        if stop.get("look_for"):
            lines.append(f"- Look for: {stop['look_for']}")
        if stop.get("deep_link"):
            lines.append(f"- Deep link: {stop['deep_link']}")
        lines.append("")

    return "\n".join(lines)


def generate_demo_script(
    *,
    config: ResolvedDemoConfig,
    pack_ctx: dict[str, Any] | None = None,
    artifacts_root: Path | None = None,
) -> dict[str, Any]:
    root = artifacts_root or ARTIFACTS_ROOT
    scripts_dir = root / "demo-scripts"
    scripts_dir.mkdir(parents=True, exist_ok=True)

    stops = _build_stops(config)
    start_routes = [
        stop.get("route")
        for stop in stops
        if stop.get("route")
    ]
    script_payload = {
        "slug": config.slug,
        "school_name": config.school_name,
        "schema_name": config.schema_name,
        "domain_url": config.domain_url,
        "demo_date": config.demo_date.isoformat(),
        "scenario_pack_ids": config.scenario_pack_ids,
        "stops": stops,
        "handoff": {"start_routes": start_routes},
        "pack_ctx": pack_ctx or {},
    }

    markdown_path = scripts_dir / f"{config.slug}.md"
    json_path = scripts_dir / f"{config.slug}.json"

    markdown_path.write_text(_build_markdown(script_payload), encoding="utf-8")
    json_path.write_text(
        json.dumps(script_payload, indent=2, ensure_ascii=True) + "\n",
        encoding="utf-8",
    )

    return {
        "markdown_path": markdown_path,
        "json_path": json_path,
        "script": script_payload,
    }
