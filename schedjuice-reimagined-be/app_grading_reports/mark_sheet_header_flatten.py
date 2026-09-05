"""Flatten two-row mark sheet headers (merged parent + Mark/Grade sub-columns)."""
from __future__ import annotations

import re
from typing import Any

_SUBHEADER_PATTERN = re.compile(r"^(mark|grade|score)s?$", re.IGNORECASE)


def _cell_str(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def forward_fill_row(cells: list[Any]) -> list[str]:
    filled: list[str] = []
    last = ""
    for cell in cells:
        text = _cell_str(cell)
        if text:
            last = text
        filled.append(last if last else text)
    return filled


def _is_small_integer(value: Any) -> bool:
    text = _cell_str(value)
    if not text:
        return False
    try:
        num = int(text)
        return 1 <= num <= 9999
    except ValueError:
        return False


def looks_like_subheader_row(parent_headers: list[str], sub_row: list[Any]) -> bool:
    if not sub_row:
        return False

    if _cell_str(sub_row[0]):
        if _is_small_integer(sub_row[0]):
            return False
        return False

    width = max(len(parent_headers), len(sub_row))
    parent_cells = [
        parent_headers[i] if i < len(parent_headers) else "" for i in range(width)
    ]
    sub_cells = [sub_row[i] if i < len(sub_row) else None for i in range(width)]

    subheader_matches = sum(
        1 for sub in sub_cells if _SUBHEADER_PATTERN.match(_cell_str(sub))
    )
    return subheader_matches >= 2


def flatten_two_row_headers(
    headers: list[str],
    rows: list[list[Any]],
) -> tuple[list[str], list[list[Any]]]:
    if not rows:
        return headers, rows

    sub_row = rows[0]
    if not looks_like_subheader_row(headers, sub_row):
        return headers, rows

    width = max(len(headers), len(sub_row), max((len(r) for r in rows), default=0))
    filled_parents = forward_fill_row(
        [headers[i] if i < len(headers) else "" for i in range(width)]
    )
    sub_cells = [sub_row[i] if i < len(sub_row) else None for i in range(width)]

    new_headers: list[str] = []
    for i in range(width):
        parent = filled_parents[i]
        sub = _cell_str(sub_cells[i])
        if sub and _SUBHEADER_PATTERN.match(sub):
            new_headers.append(f"{parent} {sub}".strip() if parent else sub)
        else:
            new_headers.append(parent or sub)

    return new_headers, rows[1:]
