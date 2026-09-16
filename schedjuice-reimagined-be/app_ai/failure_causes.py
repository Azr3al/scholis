from __future__ import annotations

from collections import defaultdict

LIKELY_CAUSE_TOOL_DESCRIPTIONS = "tool_descriptions"
LIKELY_CAUSE_COMPLEX_TASK = "complex_task"
LIKELY_CAUSE_MODEL_LOOP = "model_loop"
LIKELY_CAUSE_UNKNOWN = "unknown"
LIKELY_CAUSE_UNCATEGORIZED = "uncategorized"

VALID_LIKELY_CAUSES = frozenset(
    {
        LIKELY_CAUSE_TOOL_DESCRIPTIONS,
        LIKELY_CAUSE_COMPLEX_TASK,
        LIKELY_CAUSE_MODEL_LOOP,
        LIKELY_CAUSE_UNKNOWN,
        LIKELY_CAUSE_UNCATEGORIZED,
    }
)


def classify_tool_limit_causes(tool_calls: list[dict]) -> list[str]:
    if not tool_calls:
        return [LIKELY_CAUSE_UNKNOWN]

    counts: dict[str, int] = defaultdict(int)
    has_failure: dict[str, bool] = defaultdict(bool)

    for entry in tool_calls:
        name = entry.get("name")
        if not name:
            continue
        counts[name] += 1
        if not entry.get("ok", False):
            has_failure[name] = True

    causes: list[str] = []
    if any(counts[n] >= 2 and has_failure[n] for n in counts):
        causes.append(LIKELY_CAUSE_TOOL_DESCRIPTIONS)
    if any(counts[n] >= 3 for n in counts):
        causes.append(LIKELY_CAUSE_MODEL_LOOP)
    if len(counts) >= 3:
        causes.append(LIKELY_CAUSE_COMPLEX_TASK)
    return causes
