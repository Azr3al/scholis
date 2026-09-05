from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class CapabilityGapResult:
    is_gap: bool
    capability_gaps: list[str] = field(default_factory=list)
    user_intent_summary: str = ""
    gap_reason: str = ""
    suggested_surface: str = ""
    domain: str = ""

    @classmethod
    def none(cls) -> CapabilityGapResult:
        return cls(is_gap=False)
