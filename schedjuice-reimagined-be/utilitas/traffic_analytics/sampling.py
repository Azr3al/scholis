from __future__ import annotations

SLOW_MS = 1000
HEAVY_DB_QUERIES = 20


def should_sample_event(
    dedupe_key: str,
    status_code: int,
    response_ms: float,
    db_query_count: int,
    sample_rate: float,
) -> bool:
    if status_code >= 400:
        return True
    if response_ms >= SLOW_MS:
        return True
    if db_query_count >= HEAVY_DB_QUERIES:
        return True
    bucket = hash(dedupe_key) % 10_000
    return bucket < int(sample_rate * 10_000)
