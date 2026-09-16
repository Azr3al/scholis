from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class HeuristicVerdict(str, Enum):
    REJECT = "reject"
    ALLOW = "allow"
    UNCERTAIN = "uncertain"


@dataclass(frozen=True)
class GuardrailResult:
    allowed: bool
    reason: str
    message: str | None = None
    retry_after_seconds: int | None = None
