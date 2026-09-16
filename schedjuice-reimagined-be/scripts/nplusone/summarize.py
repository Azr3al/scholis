#!/usr/bin/env python3
"""Group and dedupe nplusone JSONL capture files into summary JSON for AI analysis."""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def normalize_expand(expand: str | None) -> str:
    if not expand:
        return ""
    parts = [p.strip() for p in str(expand).replace(".", "__").split(",") if p.strip()]
    return ",".join(sorted(set(parts)))


def group_key(event: dict[str, Any]) -> tuple:
    return (
        event.get("method") or "",
        event.get("path") or "",
        event.get("view") or "",
        event.get("model") or "",
        event.get("field") or "",
        event.get("schema_name") or "",
        normalize_expand(event.get("expand")),
    )


def load_events(paths: list[Path], run_id: str | None) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for path in paths:
        if not path.exists():
            continue
        with path.open(encoding="utf-8") as fh:
            for line_no, line in enumerate(fh, start=1):
                line = line.strip()
                if not line:
                    continue
                try:
                    event = json.loads(line)
                except json.JSONDecodeError as exc:
                    raise ValueError(f"{path}:{line_no}: invalid JSON: {exc}") from exc
                if run_id and event.get("run_id") != run_id:
                    continue
                events.append(event)
    return events


def summarize(events: list[dict[str, Any]], source_files: list[str]) -> dict[str, Any]:
    groups: dict[tuple, dict[str, Any]] = {}

    for event in events:
        key = group_key(event)
        if key not in groups:
            method, path, view, model, field, schema_name, expand = key
            groups[key] = {
                "method": method,
                "path": path,
                "view": view,
                "model": model,
                "field": field,
                "schema_name": schema_name,
                "expand": expand,
                "count": 0,
                "max_query_count": 0,
                "first_seen": event.get("ts"),
                "last_seen": event.get("ts"),
                "run_ids": set(),
                "sample_message": event.get("message"),
            }
        group = groups[key]
        group["count"] += 1
        ts = event.get("ts")
        if ts and (group["first_seen"] is None or ts < group["first_seen"]):
            group["first_seen"] = ts
        if ts and (group["last_seen"] is None or ts > group["last_seen"]):
            group["last_seen"] = ts
        qc = event.get("query_count")
        if isinstance(qc, int) and qc > group["max_query_count"]:
            group["max_query_count"] = qc
        if event.get("run_id"):
            group["run_ids"].add(event["run_id"])
        if not group.get("sample_message") and event.get("message"):
            group["sample_message"] = event["message"]

    grouped = []
    for group in groups.values():
        group["run_ids"] = sorted(group["run_ids"])
        grouped.append(group)

    grouped.sort(key=lambda g: (-g["count"], -g["max_query_count"], g["path"], g["view"]))

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_files": source_files,
        "total_events": len(events),
        "unique_groups": len(grouped),
        "groups": grouped,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Summarize nplusone JSONL logs")
    parser.add_argument(
        "inputs",
        nargs="+",
        help="One or more .jsonl capture files",
    )
    parser.add_argument(
        "--output",
        "-o",
        default="logs/nplusone/reports/summary.json",
        help="Output summary JSON path",
    )
    parser.add_argument(
        "--run-id",
        help="Only include events with this run_id",
    )
    args = parser.parse_args()

    paths = [Path(p) for p in args.inputs]
    source_files = [str(p) for p in paths if p.exists()]
    events = load_events(paths, args.run_id)
    summary = summarize(events, source_files)

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as fh:
        json.dump(summary, fh, indent=2, ensure_ascii=False)
        fh.write("\n")

    print(
        f"Wrote {summary['unique_groups']} groups "
        f"({summary['total_events']} events) to {output_path}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
