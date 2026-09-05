from __future__ import annotations

import re
from typing import Any

_PLACEHOLDER = re.compile(r"\{\{(\w+)\}\}")


def substitute(value: Any, terms: dict[str, str]) -> Any:
    if isinstance(value, str):
        def replace(match: re.Match[str]) -> str:
            key = match.group(1)
            return terms.get(key, match.group(0))

        return _PLACEHOLDER.sub(replace, value)

    if isinstance(value, dict):
        return {key: substitute(item, terms) for key, item in value.items()}

    if isinstance(value, list):
        return [substitute(item, terms) for item in value]

    return value
