"""
Map legacy IANA names still stored on tenants to forms PostgreSQL accepts.

Some zones were renamed or dropped from newer tzdata; Python's tzdata often
still resolves the old alias, while Postgres `AT TIME ZONE '...'` rejects it.
"""


def normalize_iana_tz_for_postgres(name: str | None) -> str:
    """Return a timezone string safe for Postgres `AT TIME ZONE`."""
    n = (name or "").strip() or "UTC"
    return _POSTGRES_LEGACY_IANA_TO_CURRENT.get(n, n)


# Keys: values as commonly stored historically; values: Postgres-recognized ids.
_POSTGRES_LEGACY_IANA_TO_CURRENT: dict[str, str] = {
    # Myanmar — IANA uses Asia/Yangon; Rangoon dropped from many PG builds.
    "Asia/Rangoon": "Asia/Yangon",
    # Europe canonical renames occasionally seen on older configs.
    "Europe/Kiev": "Europe/Kyiv",
}

