"""Shared types for pending confirm/disambiguation turns."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class PendingTurnResult:
    executed: bool = False
    cancelled: bool = False
    reminder: str = ""
    payload: dict[str, Any] | None = None
