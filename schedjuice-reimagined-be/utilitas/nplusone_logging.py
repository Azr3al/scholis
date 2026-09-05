"""JSONL logging handler for nplusone warnings."""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path

from utilitas.nplusone_context import get_context

_NPLUSONE_PATTERN = re.compile(
    r"Potential n\+1 query detected on `?(\w+)\.(\w+)`?",
    re.IGNORECASE,
)


def parse_nplusone_message(message: str) -> dict[str, str]:
    match = _NPLUSONE_PATTERN.search(message or "")
    if not match:
        return {}
    return {
        "model": match.group(1),
        "field": match.group(2),
        "message": message,
    }


class NPlusOneJsonlHandler(logging.Handler):
    """Append one JSON object per nplusone warning to a daily JSONL file."""

    def __init__(self, log_dir: str | Path):
        super().__init__()
        self.log_dir = Path(log_dir)

    def emit(self, record: logging.LogRecord) -> None:
        try:
            parsed = parse_nplusone_message(record.getMessage())
            if not parsed:
                return

            ctx = get_context()
            event = {
                "ts": datetime.now(timezone.utc).isoformat(),
                "run_id": ctx.get("run_id"),
                "method": ctx.get("method"),
                "path": ctx.get("path"),
                "schema_name": ctx.get("schema_name"),
                "view": ctx.get("view"),
                "expand": ctx.get("expand"),
                "query_count": ctx.get("query_count"),
                "status_code": ctx.get("status_code"),
                "model": parsed.get("model"),
                "field": parsed.get("field"),
                "message": parsed.get("message"),
            }
            self.log_dir.mkdir(parents=True, exist_ok=True)
            log_path = self.log_dir / f"{datetime.now(timezone.utc):%Y-%m-%d}.jsonl"
            with log_path.open("a", encoding="utf-8") as fh:
                fh.write(json.dumps(event, ensure_ascii=False) + "\n")
        except Exception:
            self.handleError(record)
